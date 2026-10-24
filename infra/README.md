# Infrastructure

The AWS CDK app for The Long Boil (GDD section 11, rollout phase 0). TypeScript, CDK v2, us-west-2. It is its own npm package, not one of the engine workspaces.

```
cd infra
npm install
npx cdk synth          # works with no context and no AWS credentials
npx tsc --noEmit
```

## Stacks

One environment per synth, chosen with `-c env=dev`. Only `dev` exists; `prod` is a commented row in `lib/config.ts` (0.5 ACU floor, retained data, two servers).

| Stack | Region | Holds |
| --- | --- | --- |
| `LongBoil-dev-Foundation` | us-west-2 | ECR repository, monthly budget, GitHub OIDC provider and deploy role |
| `LongBoil-dev-Certificate` | us-east-1 | The ACM certificate for CloudFront. Only with a custom domain |
| `LongBoil-dev-App` | us-west-2 | VPC (no NAT), Aurora Serverless v2, ECS on Fargate (arm64) behind an ALB, S3 and CloudFront, Cognito |

The repository is in its own stack so an image can be pushed before the service that runs it exists.

## Context

Pass with `-c key=value`. An empty value counts as not given.

| Key | Default | What it does |
| --- | --- | --- |
| `env` | `dev` | Environment name. Prefixes stacks and resource names |
| `account` | `CDK_DEFAULT_ACCOUNT` (from your credentials) | Target account. Needed for a custom domain, because of the cross-region certificate |
| `imageTag` | `latest` | Server image tag in ECR. The workflow passes the commit SHA, so a hand deploy should pass the running one too |
| `domainName` | none (CloudFront's own domain) | The site's domain, e.g. `play.example.com`. Needs `hostedZoneId` |
| `hostedZoneId` | none | Route 53 zone holding `domainName` |
| `hostedZoneName` | `domainName` | The zone's name, when the site is a subdomain of it |
| `cognitoDomainPrefix` | `long-boil-<env>` | Hosted sign-in at `<prefix>.auth.us-west-2.amazoncognito.com`. Must be unused across all of AWS |
| `googleClientId` | none (no Google sign-in) | Google OAuth client id. Its secret is read from Secrets Manager (below) |
| `alertEmail` | none (no budget, with a synth warning) | Who gets the budget alarms |
| `monthlyBudgetUsd` | `110` | The monthly cost budget; alarms at 80% actual and 100% forecast. The GDD's build phase is about $106 |
| `githubRepo` | none (no deploy role) | `owner/name` allowed to deploy from `main` |
| `cloudFrontPrefixListId` | `pl-82a045eb` | CloudFront's origin-facing prefix list in us-west-2, the only source the ALB admits |
| `desiredCount` | per environment (dev 1) | Server task count. `0` parks dev |

Whatever context was used for a deploy must be used for every later one, or the missing pieces are removed. The workflow reads it from repository variables for that reason.

## Server environment

The task definition sets the contract with `engine/packages/server`:

- `HOST=0.0.0.0`, `PORT=3000`, `API_PREFIX=/api`
- `PGHOST`, `PGPORT`, `PGDATABASE=long_boil`, `PGSSLMODE=require`; `PGUSER` and `PGPASSWORD` as ECS secrets from the Aurora secret (`long-boil/<env>/aurora`)
- `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `CORS_ORIGINS=https://<site domain>`

`LONG_BOIL_DEV` and `LONG_BOIL_OPEN_TRADING` are never set. The ALB health check is `GET /api/health`; it must not query Postgres, or dev's Aurora never pauses.

## Outputs

`LongBoil-dev-App`: `SiteUrl`, `ExpoPublicApiUrl`, `ExpoPublicCognitoDomain`, `ExpoPublicCognitoClientId`, `CognitoUserPoolId`, `SiteBucketName`, `DistributionId`, `EcrRepositoryUri`, `ClusterName`, `ServiceName`, `DatabaseEndpoint`, `DatabaseSecretArn`.

`LongBoil-dev-Foundation`: `EcrRepositoryUri`, and `GitHubDeployRoleArn` when `githubRepo` is given.

## One-time steps

In this order, once the accounts exist (GDD section 11, "Accounts and environments").

1. **Credentials.** Sign in to the non-production account through IAM Identity Center and check `aws sts get-caller-identity`.
2. **Bootstrap** both regions, the second for the certificate stack:
   `npx cdk bootstrap aws://<account>/us-west-2 aws://<account>/us-east-1`
3. **Google sign-in** (optional). Create an OAuth client in Google Cloud with the redirect URI `https://<cognitoDomainPrefix>.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`, then store its secret:
   `aws secretsmanager create-secret --region us-west-2 --name long-boil/dev/google-oauth --secret-string '{"clientSecret":"..."}'`
4. **Domain** (optional). The hosted zone must already exist in Route 53 in this account.
5. **Foundation and first image.**
   ```
   npx cdk deploy LongBoil-dev-Foundation -c githubRepo=<owner>/the-long-boil -c alertEmail=<you>
   aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-west-2.amazonaws.com
   docker build --platform linux/arm64 -t <EcrRepositoryUri>:latest .   # from the repository root
   docker push <EcrRepositoryUri>:latest
   ```
   Confirm the budget's subscription email.
6. **Everything else**, with the same context: `npx cdk deploy --all -c githubRepo=... -c alertEmail=...`
7. **Switch the workflow on.** In GitHub's repository variables set `AWS_DEPLOY_ROLE_ARN` to the `GitHubDeployRoleArn` output, and set any of `ALERT_EMAIL`, `MONTHLY_BUDGET_USD`, `DOMAIN_NAME`, `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME`, `GOOGLE_CLIENT_ID`, `COGNITO_DOMAIN_PREFIX` that step 6 used. From then on each push to `main` deploys dev (`.github/workflows/deploy-dev.yml`).
8. **CloudFront plan.** Dev stays on the free plan. Prod's flat-rate Pro plan (decision 2) is chosen in the console; CloudFormation does not set it.

## Not here yet

- **Discord sign-in.** Discord is OAuth 2 but not an OIDC provider Cognito can federate with directly. It needs a small OIDC wrapper or the Lambda shim of decision 6, which signs Discord players in as native Cognito users. Research first; the phase 0 exit gate's "Discord sign-in tested" stays open until then.
- **Valkey, Scheduler/SQS jobs, Lambda, DynamoDB, AppConfig, SES, Bedrock, Step Functions.** Each arrives with the feature that needs it.
- **WAF, GuardDuty, CloudTrail, KMS keys, Cost Anomaly Detection.** Account-level security, set up with the accounts.
- **Separate accounts.** One environment per account is assumed; the GitHub OIDC provider is created per account.
