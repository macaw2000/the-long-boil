// The CDK app for The Long Boil (GDD section 11). One environment per
// synth, chosen with -c env=dev; only dev exists so far. See infra/README.md.

import { App, Tags } from "aws-cdk-lib";
import { AppStack } from "../lib/app-stack.js";
import { CertificateStack } from "../lib/certificate-stack.js";
import { REGION, readSettings } from "../lib/config.js";
import { FoundationStack } from "../lib/foundation-stack.js";

const app = new App();
const settings = readSettings(app);
const prefix = `LongBoil-${settings.envName}`;
const env = { account: settings.account, region: REGION };

const foundation = new FoundationStack(app, `${prefix}-Foundation`, { env, settings });

let certificate: CertificateStack | undefined;
if (settings.domainName && settings.hostedZoneId) {
  // Cross-region references need a known account.
  if (!settings.account) {
    throw new Error("A custom domain needs the account: run with AWS credentials or pass -c account=123456789012.");
  }
  certificate = new CertificateStack(app, `${prefix}-Certificate`, {
    env: { account: settings.account, region: "us-east-1" },
    crossRegionReferences: true,
    domainName: settings.domainName,
    hostedZoneId: settings.hostedZoneId,
    hostedZoneName: settings.hostedZoneName ?? settings.domainName,
  });
}

const game = new AppStack(app, `${prefix}-App`, {
  env,
  settings,
  repository: foundation.repository,
  ...(certificate ? { certificate: certificate.certificate, crossRegionReferences: true } : {}),
});
game.addStackDependency(foundation);

Tags.of(app).add("project", "the-long-boil");
Tags.of(app).add("environment", settings.envName);
