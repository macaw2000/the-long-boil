// Reads the CDK context into one settings object per environment.
// Every value has a default, so `cdk synth` works with no context at all.
// The context keys are listed in infra/README.md.

import type { App } from "aws-cdk-lib";

/** The region every environment runs in (GDD section 11: us-west-2, Oregon). */
export const REGION = "us-west-2";

/** Sizing and safety that differ between environments. Only dev exists today. */
interface EnvironmentShape {
  /** Aurora's floor. Dev pauses at 0 ACU; prod keeps 0.5 so no player waits ~15 s for a resume (GDD section 11, decision 3). */
  auroraMinAcu: number;
  auroraMaxAcu: number;
  /** Whether stateful resources (user pool, site bucket) survive a stack deletion. */
  retainData: boolean;
  desiredCount: number;
  logRetentionDays: number;
}

const SHAPES: Record<string, EnvironmentShape> = {
  dev: { auroraMinAcu: 0, auroraMaxAcu: 2, retainData: false, desiredCount: 1, logRetentionDays: 14 },
  // prod: { auroraMinAcu: 0.5, auroraMaxAcu: 4, retainData: true, desiredCount: 2, logRetentionDays: 90 },
};

export interface Settings extends EnvironmentShape {
  envName: string;
  /** Undefined when synthesising without credentials or `-c account=`; stacks are then environment-agnostic on account. */
  account: string | undefined;
  /** The site's own domain, e.g. play.thelongboil.com. Needs hostedZoneId too. */
  domainName: string | undefined;
  hostedZoneId: string | undefined;
  /** The hosted zone's name, when the site is a subdomain of it. Defaults to domainName. */
  hostedZoneName: string | undefined;
  cognitoDomainPrefix: string;
  googleClientId: string | undefined;
  alertEmail: string | undefined;
  monthlyBudgetUsd: number;
  /** owner/name of the GitHub repository allowed to deploy. */
  githubRepo: string | undefined;
  imageTag: string;
  /** The CloudFront origin-facing managed prefix list in REGION. */
  cloudFrontPrefixListId: string;
}

// com.amazonaws.global.cloudfront.origin-facing has a different id in every
// region. This is the us-west-2 one; check it with
// `aws ec2 describe-managed-prefix-lists --region us-west-2` once the account
// exists, and override with -c cloudFrontPrefixListId=... if it differs.
const CLOUDFRONT_PREFIX_LIST_US_WEST_2 = "pl-82a045eb";

export function readSettings(app: App): Settings {
  const text = (key: string): string | undefined => {
    const value: unknown = app.node.tryGetContext(key);
    if (value === undefined || value === null || value === "") return undefined;
    return String(value);
  };

  const envName = text("env") ?? "dev";
  const shape = SHAPES[envName];
  if (!shape) throw new Error(`Unknown environment "${envName}". Known: ${Object.keys(SHAPES).join(", ")}.`);

  const domainName = text("domainName");
  const hostedZoneId = text("hostedZoneId");
  if ((domainName === undefined) !== (hostedZoneId === undefined)) {
    throw new Error("domainName and hostedZoneId go together: give both or neither.");
  }

  const budget = Number(text("monthlyBudgetUsd") ?? 110);
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("monthlyBudgetUsd must be a positive number.");

  const desired = text("desiredCount");

  return {
    ...shape,
    ...(desired !== undefined ? { desiredCount: Number(desired) } : {}),
    envName,
    account: text("account") ?? process.env.CDK_DEFAULT_ACCOUNT,
    domainName,
    hostedZoneId,
    hostedZoneName: text("hostedZoneName") ?? domainName,
    cognitoDomainPrefix: text("cognitoDomainPrefix") ?? `long-boil-${envName}`,
    googleClientId: text("googleClientId"),
    alertEmail: text("alertEmail"),
    // GDD section 11 puts the build phase at about $106 a month.
    monthlyBudgetUsd: budget,
    githubRepo: text("githubRepo"),
    imageTag: text("imageTag") ?? "latest",
    cloudFrontPrefixListId: text("cloudFrontPrefixListId") ?? CLOUDFRONT_PREFIX_LIST_US_WEST_2,
  };
}

/** The deploy role's fixed name, so the app stack can grant it rights without a cross-stack reference. */
export function deployRoleName(envName: string): string {
  return `long-boil-${envName}-github-deploy`;
}
