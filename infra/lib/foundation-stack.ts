// The parts that must exist before the game can deploy: the image registry,
// the budget alarm, the daily spend email and the GitHub deploy role (GDD
// section 11, rollout phase 0).
// It is its own stack so the first image can be pushed before the service
// that runs it is created.

import { Annotations, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import type { Construct } from "constructs";
import { deployRoleName, type Settings } from "./config.js";

export interface FoundationStackProps extends StackProps {
  settings: Settings;
}

export class FoundationStack extends Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
    super(scope, id, props);
    const { settings } = props;

    this.repository = new ecr.Repository(this, "ServerRepository", {
      repositoryName: `long-boil-${settings.envName}/server`,
      imageScanOnPush: true,
      // The workflow tags by commit SHA and never rewrites one, but a hand
      // push of `latest` (the synth default) must be able to move.
      imageTagMutability: ecr.TagMutability.MUTABLE,
      removalPolicy: settings.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      emptyOnDelete: !settings.retainData,
      lifecycleRules: [
        { description: "Drop untagged layers after a day", tagStatus: ecr.TagStatus.UNTAGGED, maxImageAge: Duration.days(1), rulePriority: 1 },
        // A few images is enough to roll back; ECR storage is the "S3, ECR, Athena" line in the cost table.
        { description: "Keep the ten newest images", tagStatus: ecr.TagStatus.ANY, maxImageCount: 10, rulePriority: 2 },
      ],
    });

    new CfnOutput(this, "EcrRepositoryUri", { value: this.repository.repositoryUri });

    this.addBudget(settings);
    this.addDailySpendEmail(settings);
    this.addGitHubDeployRole(settings);
  }

  // GDD section 11: "budget alarms live" is part of the phase 0 exit gate.
  // A budget watches the whole account, not just this stack. $100 a month
  // (Jeremy, 24 October 2026), a little under the GDD's $106 build phase.
  private addBudget(settings: Settings): void {
    if (!settings.alertEmail) {
      Annotations.of(this).addWarning(
        "No budget alarm: pass -c alertEmail=you@example.com to create the monthly cost budget (GDD section 11, phase 0 exit gate).",
      );
      return;
    }
    const subscribers = [{ subscriptionType: "EMAIL", address: settings.alertEmail }];
    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetName: `long-boil-${settings.envName}-monthly`,
        budgetType: "COST",
        timeUnit: "MONTHLY",
        budgetLimit: { amount: MONTHLY_BUDGET_USD, unit: "USD" },
      },
      notificationsWithSubscribers: [
        {
          notification: { notificationType: "ACTUAL", comparisonOperator: "GREATER_THAN", threshold: 80, thresholdType: "PERCENTAGE" },
          subscribers,
        },
        {
          notification: { notificationType: "FORECASTED", comparisonOperator: "GREATER_THAN", threshold: 100, thresholdType: "PERCENTAGE" },
          subscribers,
        },
      ],
    });
  }

  // An email every morning with what the account spent (Jeremy, 24 October
  // 2026). Budgets only email on a threshold, so a small function reads Cost
  // Explorer once a day and sends the figures through SNS. Each Cost Explorer
  // call costs $0.01, about $0.30 a month. Its figures lag by up to a day.
  private addDailySpendEmail(settings: Settings): void {
    if (!settings.alertEmail) return;
    const topic = new sns.Topic(this, "DailySpendTopic", { displayName: "The Long Boil spend" });
    // AWS emails a confirmation link first; nothing arrives until it is clicked.
    topic.addSubscription(new subscriptions.EmailSubscription(settings.alertEmail));

    const report = new lambda.Function(this, "DailySpendReport", {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: "index.handler",
      timeout: Duration.seconds(30),
      environment: { TOPIC_ARN: topic.topicArn, BUDGET_USD: String(MONTHLY_BUDGET_USD) },
      code: lambda.Code.fromInline(DAILY_SPEND_CODE),
    });
    topic.grantPublish(report);
    report.addToRolePolicy(new iam.PolicyStatement({ actions: ["ce:GetCostAndUsage"], resources: ["*"] }));

    // 15:00 UTC is 8 in the morning in Oregon in summer, 7 in winter.
    new events.Rule(this, "DailySpendSchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "15" }),
      targets: [new targets.LambdaFunction(report)],
    });
  }

  // GDD section 11: "GitHub Actions deploys through OIDC, so no long-lived AWS
  // keys exist anywhere." The role may only be assumed from the main branch of
  // one repository. It deploys by assuming the CDK bootstrap roles, pushes the
  // server image here, and gets the site bucket and invalidation rights from
  // the app stack (see AppStack.grantDeployRole).
  private addGitHubDeployRole(settings: Settings): void {
    if (!settings.githubRepo) {
      Annotations.of(this).addInfo("No GitHub deploy role: pass -c githubRepo=owner/the-long-boil to create it.");
      return;
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(settings.githubRepo)) {
      throw new Error(`githubRepo must look like owner/name, not "${settings.githubRepo}".`);
    }

    // One provider per account and URL. If a second environment ever shares
    // this account, import the provider there instead of creating another.
    const provider = new iam.OidcProviderNative(this, "GitHubOidc", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const role = new iam.Role(this, "GitHubDeployRole", {
      roleName: deployRoleName(settings.envName),
      description: `Deploys The Long Boil ${settings.envName} from ${settings.githubRepo} main`,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(provider.oidcProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          // The workflow must not set `environment:`, which would change the subject.
          "token.actions.githubusercontent.com:sub": `repo:${settings.githubRepo}:ref:refs/heads/main`,
        },
      }),
    });

    // cdk deploy works through the bootstrap roles (default qualifier
    // hnb659fds), in us-west-2 and, for the certificate stack, us-east-1.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole", "sts:TagSession"],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );
    this.repository.grantPullPush(role);

    new CfnOutput(this, "GitHubDeployRoleArn", {
      value: role.roleArn,
      description: "Set as the AWS_DEPLOY_ROLE_ARN repository variable to switch the deploy workflow on",
    });
  }
}

const MONTHLY_BUDGET_USD = 100;

// Runs in Lambda's Node 22 runtime, which ships the AWS SDK v3. Cost Explorer
// answers only in us-east-1. Dates are UTC days; the end date is exclusive.
const DAILY_SPEND_CODE = `
const { CostExplorerClient, GetCostAndUsageCommand } = require("@aws-sdk/client-cost-explorer");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const ce = new CostExplorerClient({ region: "us-east-1" });
const sns = new SNSClient({});
const day = (date) => date.toISOString().slice(0, 10);
const dollars = (n) => "$" + n.toFixed(2);

exports.handler = async () => {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const monthStart = new Date(Date.UTC(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), 1));
  const result = await ce.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: day(monthStart), End: day(today) },
    Granularity: "DAILY",
    Metrics: ["UnblendedCost"],
    GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
  }));
  const days = result.ResultsByTime ?? [];
  const total = (period) => (period?.Groups ?? []).reduce((sum, g) => sum + Number(g.Metrics.UnblendedCost.Amount), 0);
  const last = days[days.length - 1];
  const month = days.reduce((sum, period) => sum + total(period), 0);
  const services = (last?.Groups ?? [])
    .map((g) => [g.Keys[0], Number(g.Metrics.UnblendedCost.Amount)])
    .filter(([, amount]) => amount >= 0.005)
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => "  " + dollars(amount) + "  " + name);
  const budget = Number(process.env.BUDGET_USD);
  const lines = [
    "Spent on " + day(yesterday) + ": " + dollars(total(last)),
    "Month to date: " + dollars(month) + " of the " + dollars(budget) + " budget",
    "",
    services.length ? "By service:" : "No spend by service yesterday.",
    ...services,
    "",
    "Cost Explorer figures can lag by up to a day.",
  ];
  await sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Subject: "The Long Boil: " + dollars(total(last)) + " yesterday, " + dollars(month) + " this month",
    Message: lines.join("\\n"),
  }));
};
`;
