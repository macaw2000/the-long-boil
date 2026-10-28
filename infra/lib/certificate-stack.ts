// The TLS certificate for the custom domain. CloudFront only takes
// certificates from us-east-1, so this one stack lives there and hands the
// certificate to the app stack through a cross-region reference
// (GDD section 11: Route 53, CloudFront, ACM).

import { Stack, type StackProps } from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import type { Construct } from "constructs";

export interface CertificateStackProps extends StackProps {
  domainName: string;
  /** Further names on the same certificate, such as www. */
  alternateNames: string[];
  hostedZoneId: string;
  hostedZoneName: string;
  /** Cognito's custom sign-in domain, on a certificate of its own so the site's is never replaced. */
  authDomainName?: string;
}

export class CertificateStack extends Stack {
  readonly certificate: acm.ICertificate;
  readonly authCertificate: acm.ICertificate | undefined;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });
    this.certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: props.domainName,
      subjectAlternativeNames: props.alternateNames,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    // Cognito, like CloudFront, takes custom-domain certificates only from us-east-1.
    this.authCertificate = props.authDomainName
      ? new acm.Certificate(this, "AuthCertificate", {
          domainName: props.authDomainName,
          validation: acm.CertificateValidation.fromDns(zone),
        })
      : undefined;
  }
}
