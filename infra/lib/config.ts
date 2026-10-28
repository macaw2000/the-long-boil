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
  /** The dev clock (LONG_BOIL_DEV) for admins. Never in prod: a skip moves time for every player. */
  devTools: boolean;
}

const SHAPES: Record<string, EnvironmentShape> = {
  dev: { auroraMinAcu: 0, auroraMaxAcu: 2, retainData: false, desiredCount: 1, logRetentionDays: 14, devTools: true },
  // prod: { auroraMinAcu: 0.5, auroraMaxAcu: 4, retainData: true, desiredCount: 2, logRetentionDays: 90, devTools: false },
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
  /**
   * Names that redirect to domainName: www.<domain> when the site is the
   * zone's apex. One canonical address, because sign-in tokens are kept per
   * address and Cognito returns players only to addresses it knows.
   */
  redirectDomains: string[];
  cognitoDomainPrefix: string;
  /**
   * Cognito's custom sign-in domain, auth.<domain>, made alongside the prefix
   * domain so Google and Discord show the game's own address. The client uses
   * it only with useAuthDomain, once both providers list its
   * /oauth2/idpresponse redirect (infra/README.md).
   */
  authDomain: string | undefined;
  useAuthDomain: boolean;
  googleClientId: string | undefined;
  /** Discord application id; its secret is in Secrets Manager, like Google's. */
  discordClientId: string | undefined;
  /** Stripe Checkout for Cog Crates: its keys are read from the long-boil/<env>/stripe secret, which must exist first. */
  stripe: boolean;
  /** Google accounts that are admins (dev tools, no trading gate), comma-separated. */
  adminEmails: string;
  alertEmail: string | undefined;
  /** owner/name of the GitHub repository allowed to deploy. */
  githubRepo: string | undefined;
  /** "<owner id>/<repository id>": GitHub's immutable OIDC subject names the repository by these as well as by name. */
  githubRepoIds: string | undefined;
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

  const desired = text("desiredCount");

  return {
    ...shape,
    ...(desired !== undefined ? { desiredCount: Number(desired) } : {}),
    envName,
    account: text("account") ?? process.env.CDK_DEFAULT_ACCOUNT,
    domainName,
    hostedZoneId,
    hostedZoneName: text("hostedZoneName") ?? domainName,
    redirectDomains: domainName && (text("hostedZoneName") ?? domainName) === domainName ? [`www.${domainName}`] : [],
    cognitoDomainPrefix: text("cognitoDomainPrefix") ?? `long-boil-${envName}`,
    authDomain: domainName ? `auth.${domainName}` : undefined,
    useAuthDomain: text("useAuthDomain") === "1",
    googleClientId: text("googleClientId"),
    discordClientId: text("discordClientId"),
    stripe: text("stripe") === "1",
    adminEmails: text("adminEmails") ?? "",
    alertEmail: text("alertEmail"),
    githubRepo: text("githubRepo"),
    githubRepoIds: text("githubRepoIds"),
    imageTag: text("imageTag") ?? "latest",
    cloudFrontPrefixListId: text("cloudFrontPrefixListId") ?? CLOUDFRONT_PREFIX_LIST_US_WEST_2,
  };
}

/** The deploy role's fixed name, so the app stack can grant it rights without a cross-stack reference. */
export function deployRoleName(envName: string): string {
  return `long-boil-${envName}-github-deploy`;
}
