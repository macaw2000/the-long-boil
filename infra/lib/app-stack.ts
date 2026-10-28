// One environment of the game: network, database, game server, site and
// sign-in. Follows GDD section 11's services table and its "Seven decisions
// that keep the bill honest"; each decision is cited where it bites.

import { Annotations, CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { deployRoleName, REGION, type Settings } from "./config.js";

export interface AppStackProps extends StackProps {
  settings: Settings;
  repository: ecr.IRepository;
  /** From the us-east-1 certificate stack, only when a custom domain is given. */
  certificate?: acm.ICertificate;
  /** From the same stack: the certificate for Cognito's custom sign-in domain. */
  authCertificate?: acm.ICertificate;
}

const SERVER_PORT = 3000;
const API_PREFIX = "/api";
/** CloudFront adds this header to every request it sends the load balancer. */
const ORIGIN_HEADER = "X-Origin-Verify";
const DATABASE_NAME = "long_boil";

export class AppStack extends Stack {
  // Named, not looked up, so synth never needs AWS credentials. Two zones
  // because the ALB and Aurora's subnet group each need two.
  override get availabilityZones(): string[] {
    return [`${REGION}a`, `${REGION}b`];
  }

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { settings } = props;
    const removalPolicy = settings.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    // --- Network -----------------------------------------------------------
    // Decision 1: no NAT gateway until launch. Game servers sit in public
    // subnets with public IPs (to reach ECR, Secrets Manager, Cognito's keys
    // and CloudWatch); Aurora sits in isolated subnets with no internet route.
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // --- Database ----------------------------------------------------------
    // Decision 3: dev's floor is 0 ACU, so Aurora pauses when idle and costs
    // only storage. Pausing at 0 ACU needs PostgreSQL 13.15, 14.12, 15.7,
    // 16.3 or later.
    const database = new rds.DatabaseCluster(this, "Database", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_7 }),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      serverlessV2MinCapacity: settings.auroraMinAcu,
      serverlessV2MaxCapacity: settings.auroraMaxAcu,
      // Only matters at 0 ACU: how long without connections before it pauses.
      ...(settings.auroraMinAcu === 0 ? { serverlessV2AutoPauseDuration: Duration.minutes(10) } : {}),
      credentials: rds.Credentials.fromGeneratedSecret("long_boil", {
        secretName: `long-boil/${settings.envName}/aurora`,
      }),
      defaultDatabaseName: DATABASE_NAME,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      storageEncrypted: true,
      backup: { retention: Duration.days(settings.retainData ? 7 : 1) },
      // A final snapshot on delete, even in dev: it costs little and saves the event log.
      removalPolicy: RemovalPolicy.SNAPSHOT,
      deletionProtection: settings.retainData,
    });
    const databaseSecret = database.secret!;

    // --- Cluster ----------------------------------------------------------
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: `long-boil-${settings.envName}`,
    });

    // --- Load balancer -----------------------------------------------------
    // The ALB only listens to CloudFront: its security group admits the
    // CloudFront origin-facing prefix list and nothing else. There is no
    // domain or certificate on the ALB yet, so CloudFront reaches it over
    // plain HTTP inside AWS's network; players still see HTTPS at the edge.
    // Any CloudFront distribution comes from that prefix list, so ours also
    // sends a secret header, and the listener forwards only requests that
    // carry it (see the listener below). Later: an HTTPS listener with its
    // own certificate.
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      vpc,
      description: "Load balancer: HTTP from CloudFront only",
      allowAllOutbound: false,
    });
    albSecurityGroup.addIngressRule(
      ec2.Peer.prefixList(settings.cloudFrontPrefixListId),
      ec2.Port.tcp(80),
      "CloudFront origin-facing",
    );

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: albSecurityGroup,
      // The live connection is one WebSocket per open workshop (build plan,
      // milestone 7), and the server pushes only when something changes, so a
      // socket can sit quiet for minutes. CloudFront drops a WebSocket after
      // 10 minutes with no bytes from the origin; matching that here means the
      // ALB is never the tighter limit. The server should still ping well
      // inside 10 minutes to keep quiet sockets open.
      idleTimeout: Duration.seconds(600),
      dropInvalidHeaderFields: true,
    });

    // --- Game server -------------------------------------------------------
    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc,
      description: "Game server: traffic from the load balancer only",
      // Outbound to ECR, Secrets Manager, Cognito and Aurora.
      allowAllOutbound: true,
    });
    database.connections.allowDefaultPortFrom(serviceSecurityGroup, "Game server to Aurora");

    // Decision 5: Graviton everywhere. The cost table's build phase sizes a
    // small server at 0.5 vCPU and 1 GB.
    const taskDefinition = new ecs.FargateTaskDefinition(this, "ServerTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const userPool = this.userPool(settings, removalPolicy);
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: !settings.retainData,
    });

    // The header value lives in Secrets Manager; the templates hold only a
    // reference to it. Changing it needs a deploy, which updates both ends.
    const originSecret = new secretsmanager.Secret(this, "OriginVerifySecret", {
      description: "The header CloudFront sends so the load balancer knows the request came through our distribution",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
    });
    const originHeaderValue = originSecret.secretValue.unsafeUnwrap();

    const distribution = this.distribution(settings, siteBucket, alb, props.certificate, originHeaderValue);
    const siteDomain = settings.domainName ?? distribution.distributionDomainName;
    const siteUrl = `https://${siteDomain}`;
    const client = this.userPoolClient(settings, userPool, siteUrl);

    const logGroup = new logs.LogGroup(this, "ServerLogs", {
      logGroupName: `/long-boil/${settings.envName}/server`,
      retention: settings.logRetentionDays as logs.RetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // The environment is the contract with engine/packages/server. Dev runs
    // the skippable clock (LONG_BOIL_DEV) for admins only; prod never does.
    // LONG_BOIL_OPEN_TRADING is never set: admins skip the gate by sign-in.
    taskDefinition.addContainer("server", {
      image: ecs.ContainerImage.fromEcrRepository(props.repository, settings.imageTag),
      portMappings: [{ containerPort: SERVER_PORT }],
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: "server" }),
      environment: {
        HOST: "0.0.0.0",
        PORT: String(SERVER_PORT),
        API_PREFIX,
        PGHOST: database.clusterEndpoint.hostname,
        PGPORT: database.clusterEndpoint.port.toString(),
        PGDATABASE: DATABASE_NAME,
        // node-pg reads require as "verify the certificate and host name";
        // the image trusts the RDS CA bundle (see the Dockerfile).
        PGSSLMODE: "require",
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: client.userPoolClientId,
        CORS_ORIGINS: siteUrl,
        SITE_URL: siteUrl,
        ADMIN_EMAILS: settings.adminEmails,
        ...(settings.devTools ? { LONG_BOIL_DEV: "1" } : {}),
      },
      secrets: {
        PGUSER: ecs.Secret.fromSecretsManager(databaseSecret, "username"),
        PGPASSWORD: ecs.Secret.fromSecretsManager(databaseSecret, "password"),
        // Stripe's restricted key and webhook signing secret, made by hand (README). Only this task may read them.
        ...(settings.stripe ? stripeSecrets(this, settings.envName) : {}),
      },
    });

    const service = new ecs.FargateService(this, "ServerService", {
      cluster,
      serviceName: "server",
      taskDefinition,
      desiredCount: settings.desiredCount,
      // Decision 1: public subnets with public IPs instead of a NAT gateway.
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true,
      securityGroups: [serviceSecurityGroup],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      circuitBreaker: { enable: true, rollback: true },
      // A paused Aurora takes about 15 s to resume, then migrations run.
      healthCheckGracePeriod: Duration.seconds(120),
      enableExecuteCommand: true,
    });

    // Without the secret header the answer is a bare 403; with it, the game server.
    const listener = alb.addListener("Http", {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.fixedResponse(403, { contentType: "text/plain", messageBody: "Forbidden" }),
    });
    listener.addTargets("Server", {
      priority: 1,
      conditions: [elbv2.ListenerCondition.httpHeader(ORIGIN_HEADER, [originHeaderValue])],
      port: SERVER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      // Should answer without touching Postgres, or the checks every 30 s
      // would keep a dev Aurora from ever pausing.
      healthCheck: { path: `${API_PREFIX}/health`, healthyHttpCodes: "200", interval: Duration.seconds(30) },
      deregistrationDelay: Duration.seconds(30),
    });

    // --- DNS ---------------------------------------------------------------
    if (settings.domainName && settings.hostedZoneId) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: settings.hostedZoneId,
        zoneName: settings.hostedZoneName ?? settings.domainName,
      });
      const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      const siteA = new route53.ARecord(this, "SiteA", { zone, recordName: settings.domainName, target });
      new route53.AaaaRecord(this, "SiteAaaa", { zone, recordName: settings.domainName, target });
      settings.redirectDomains.forEach((name, index) => {
        new route53.ARecord(this, `RedirectA${index}`, { zone, recordName: name, target });
        new route53.AaaaRecord(this, `RedirectAaaa${index}`, { zone, recordName: name, target });
      });

      // Sign-in at auth.<domain>. Cognito refuses a custom domain whose parent
      // has no A record yet, so it waits for the site's.
      if (settings.authDomain && props.authCertificate) {
        const authDomain = userPool.addDomain("AuthDomain", {
          customDomain: { domainName: settings.authDomain, certificate: props.authCertificate },
        });
        authDomain.node.addDependency(siteA);
        new route53.ARecord(this, "AuthA", {
          zone,
          recordName: settings.authDomain,
          target: route53.RecordTarget.fromAlias(new targets.UserPoolDomainTarget(authDomain)),
        });
      }
    }

    this.grantDeployRole(settings, siteBucket, distribution);

    // --- Outputs the client build and the deploy workflow read ---------------
    const cognitoDomain =
      settings.useAuthDomain && settings.authDomain && props.authCertificate
        ? settings.authDomain
        : `${settings.cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`;
    const outputs: Record<string, [string, string]> = {
      SiteUrl: [siteUrl, "The game's address"],
      ExpoPublicApiUrl: [`${siteUrl}${API_PREFIX}`, "EXPO_PUBLIC_API_URL"],
      ExpoPublicCognitoDomain: [cognitoDomain, "EXPO_PUBLIC_COGNITO_DOMAIN (hosted sign-in)"],
      ExpoPublicCognitoClientId: [client.userPoolClientId, "EXPO_PUBLIC_COGNITO_CLIENT_ID"],
      ExpoPublicSignInProviders: [
        [settings.googleClientId && "Google", settings.discordClientId && "Discord"].filter(Boolean).join(",") || "none",
        "EXPO_PUBLIC_SIGN_IN_PROVIDERS: the buttons on the sign-in screen",
      ],
      ExpoPublicArtUrl: [`${siteUrl}/art`, "EXPO_PUBLIC_ART_URL: art synced from the repository's art/ folder"],
      CognitoUserPoolId: [userPool.userPoolId, "COGNITO_USER_POOL_ID"],
      SiteBucketName: [siteBucket.bucketName, "Where the PWA bundle is synced"],
      DistributionId: [distribution.distributionId, "Invalidated after each bundle sync"],
      EcrRepositoryUri: [props.repository.repositoryUri, "Server image repository"],
      ClusterName: [cluster.clusterName, "ECS cluster"],
      ServiceName: [service.serviceName, "ECS service"],
      DatabaseEndpoint: [database.clusterEndpoint.hostname, "Aurora writer endpoint"],
      DatabaseSecretArn: [databaseSecret.secretArn, "Aurora credentials"],
    };
    for (const [id, [value, description]] of Object.entries(outputs)) new CfnOutput(this, id, { value, description });
  }

  // Players enter through one CloudFront domain (GDD section 11): the PWA from
  // S3, and /api/* (HTTP and the WebSocket at /api/live/:id) from the ALB.
  // Dev rides the free plan; prod moves to the flat-rate Pro plan
  // (decision 2), which CloudFormation does not configure, so it is chosen in
  // the console once prod exists.
  private distribution(
    settings: Settings,
    bucket: s3.IBucket,
    alb: elbv2.IApplicationLoadBalancer,
    certificate: acm.ICertificate | undefined,
    originHeaderValue: string,
  ): cloudfront.Distribution {
    // A single-page app: any path that is not a file is served index.html.
    // This is done with a function on the S3 behaviour rather than custom
    // error responses, because those apply to the whole distribution and
    // would turn the API's own 403s and 404s into index.html. The same
    // function sends www.<domain> to the canonical domain with a 301.
    const redirects = JSON.stringify(settings.redirectDomains);
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "Serve index.html for client routes; redirect www",
      code: cloudfront.FunctionCode.fromInline(
        [
          "function handler(event) {",
          "  var request = event.request;",
          `  var host = request.headers.host ? request.headers.host.value : '';`,
          `  if (${redirects}.indexOf(host) !== -1) {`,
          "    var query = Object.keys(request.querystring).map(function (key) {",
          "      return key + '=' + request.querystring[key].value;",
          "    }).join('&');",
          `    var location = 'https://${settings.domainName ?? ""}' + request.uri + (query ? '?' + query : '');`,
          "    return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: location } } };",
          "  }",
          "  var last = request.uri.split('/').pop();",
          "  if (last.indexOf('.') === -1) request.uri = '/index.html';",
          "  return request;",
          "}",
        ].join("\n"),
      ),
    });

    const apiOrigin = new origins.HttpOrigin(alb.loadBalancerDnsName, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
      customHeaders: { [ORIGIN_HEADER]: originHeaderValue },
      readTimeout: Duration.seconds(60),
      keepaliveTimeout: Duration.seconds(60),
    });

    return new cloudfront.Distribution(this, "Distribution", {
      comment: `The Long Boil ${settings.envName}`,
      defaultRootObject: "index.html",
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...(certificate && settings.domainName ? { certificate, domainNames: [settings.domainName, ...settings.redirectDomains] } : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        [`${API_PREFIX}/*`]: {
          origin: apiOrigin,
          // HTTPS only, not a redirect: a redirected POST loses its body.
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Every header (Authorization, Upgrade, Sec-WebSocket-*), cookie and
          // query string, except Host, which must be the ALB's own.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: false,
        },
      },
    });
  }

  // GDD section 11: Cognito, "Sign-in with Google and Discord".
  private userPool(settings: Settings, removalPolicy: RemovalPolicy): cognito.UserPool {
    const pool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `long-boil-${settings.envName}`,
      // Lite covers the hosted sign-in page and social sign-in, and keeps the
      // 10,000 free monthly users the GDD's Cognito line assumes.
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      // Cognito's own mail allows about 50 a day; SES takes over before alpha.
      email: cognito.UserPoolEmail.withCognito(),
      deletionProtection: settings.retainData,
      removalPolicy,
    });

    // The prefix domain until sign-in moves to auth.<domain>; after that nothing uses it.
    if (!(settings.useAuthDomain && settings.authDomain)) {
      pool.addDomain("HostedDomain", { cognitoDomain: { domainPrefix: settings.cognitoDomainPrefix } });
    }

    if (settings.googleClientId) {
      // The secret never appears in the template: CloudFormation resolves it
      // from Secrets Manager at deploy time. Create it by hand first (README).
      new cognito.UserPoolIdentityProviderGoogle(pool, "Google", {
        userPool: pool,
        clientId: settings.googleClientId,
        clientSecretValue: SecretValue.secretsManager(`long-boil/${settings.envName}/google-oauth`, {
          jsonField: "clientSecret",
        }),
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          emailVerified: cognito.ProviderAttribute.other("email_verified"),
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        },
      });
    } else {
      Annotations.of(this).addInfo("No Google sign-in: pass -c googleClientId=... (and create the google-oauth secret).");
    }

    if (settings.discordClientId) {
      // Discord now publishes an OpenID Connect discovery document with
      // RS256-signed ID tokens (checked 24 October 2026), so Cognito federates
      // with it directly and no shim is needed yet. Decision 6's shim is about
      // cost: past 50 monthly Discord players, OIDC users cost $0.015 each.
      new cognito.UserPoolIdentityProviderOidc(pool, "Discord", {
        userPool: pool,
        name: "Discord",
        clientId: settings.discordClientId,
        // A dynamic reference: the template never holds the secret itself.
        clientSecret: SecretValue.secretsManager(`long-boil/${settings.envName}/discord-oauth`, {
          jsonField: "clientSecret",
        }).unsafeUnwrap(),
        issuerUrl: "https://discord.com",
        scopes: ["openid", "identify", "email"],
        attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
        attributeMapping: {
          email: cognito.ProviderAttribute.other("email"),
          emailVerified: cognito.ProviderAttribute.other("verified"),
          preferredUsername: cognito.ProviderAttribute.other("username"),
        },
      });
    } else {
      Annotations.of(this).addInfo("No Discord sign-in: pass -c discordClientId=... (and create the discord-oauth secret).");
    }
    return pool;
  }

  private userPoolClient(settings: Settings, pool: cognito.UserPool, siteUrl: string): cognito.UserPoolClient {
    const providers = [cognito.UserPoolClientIdentityProvider.COGNITO];
    const google = settings.googleClientId ? pool.node.tryFindChild("Google") : undefined;
    if (google) providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    const discord = settings.discordClientId ? pool.node.tryFindChild("Discord") : undefined;
    if (discord) providers.push(cognito.UserPoolClientIdentityProvider.custom("Discord"));

    // Trailing slashes on purpose: the client redirects to the site root.
    const urls = [`${siteUrl}/`, "http://localhost:8081/"];
    // A public client (no secret) for the PWA: authorization code with PKCE,
    // which Cognito enforces whenever the client sends a code challenge.
    const client = pool.addClient("WebClient", {
      userPoolClientName: "pwa",
      generateSecret: false,
      authFlows: {},
      preventUserExistenceErrors: true,
      supportedIdentityProviders: providers,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: urls,
        logoutUrls: urls,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
    });
    if (google) client.node.addDependency(google);
    if (discord) client.node.addDependency(discord);
    return client;
  }

  // Gives the GitHub deploy role (made by the foundation stack) the bundle
  // sync and the invalidation. Imported by name so neither stack exports to
  // the other the wrong way round.
  private grantDeployRole(settings: Settings, bucket: s3.IBucket, distribution: cloudfront.Distribution): void {
    if (!settings.githubRepo) return;
    const role = iam.Role.fromRoleName(this, "GitHubDeployRole", deployRoleName(settings.envName), { mutable: true });
    bucket.grantReadWrite(role);
    bucket.grantDelete(role);
    distribution.grantCreateInvalidation(role);
  }
}

/** The Stripe keys as container secrets, from long-boil/<env>/stripe: fields apiKey (a restricted rk_test_ key) and webhookSecret. */
function stripeSecrets(scope: Construct, envName: string): Record<string, ecs.Secret> {
  const secret = secretsmanager.Secret.fromSecretNameV2(scope, "StripeSecret", `long-boil/${envName}/stripe`);
  return {
    STRIPE_API_KEY: ecs.Secret.fromSecretsManager(secret, "apiKey"),
    STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(secret, "webhookSecret"),
  };
}
