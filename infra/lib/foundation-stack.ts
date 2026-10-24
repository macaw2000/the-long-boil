// The parts that must exist before the game can deploy: the image registry,
// the budget alarm and the GitHub deploy role (GDD section 11, rollout phase 0).
// It is its own stack so the first image can be pushed before the service
// that runs it is created.

import { Annotations, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
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
    this.addGitHubDeployRole(settings);
  }

  // GDD section 11: "budget alarms live" is part of the phase 0 exit gate.
  // A budget watches the whole account, not just this stack.
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
        budgetLimit: { amount: settings.monthlyBudgetUsd, unit: "USD" },
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
