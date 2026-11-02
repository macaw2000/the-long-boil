// Real sign-in (build plan milestone 11): Cognito, with Google and Discord
// behind it (GDD sections 10 and 11). The client sends Cognito's ID token on
// every HTTP request and on the live connection; the server checks it
// against the user pool's published keys and turns it into the account's
// login. The ID token, unlike the access token, says which email signed in
// and through which provider, which is how an admin is known. Without an
// Auth the server keeps the dev login, which trusts whatever login and
// Tinker id it is given.

import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface Identity {
  login: string;
  /** May use the dev tools and skips the trading gate (Jeremy, 24 October 2026). */
  admin: boolean;
  /** The email the account signed in with, and through which provider, kept for the admin console (milestone 14). */
  email?: string | null;
  provider?: string | null;
}

export interface Auth {
  /** Who a token speaks for; throws Unauthorized if it is not good. */
  verify(token: string): Promise<Identity>;
}

export class Unauthorized extends Error {}

/**
 * A Cognito account's login is its user's sub, which never changes; the
 * prefix keeps it apart from any dev login. Signing in with Google and with
 * Discord makes two Cognito users, so two accounts, until the pool links them.
 */
export function cognitoAuth({
  userPoolId,
  clientId,
  adminEmails = [],
}: {
  userPoolId: string;
  clientId: string;
  /** Google accounts that are admins. Only Google: the same email through Discord is not. */
  adminEmails?: string[];
}): Auth {
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "id" });
  const admins = new Set(adminEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  return {
    async verify(token) {
      let claims;
      try {
        claims = await verifier.verify(token);
      } catch {
        throw new Unauthorized("sign in again");
      }
      return { login: `cognito:${claims.sub}`, admin: isAdmin(claims, admins), ...whoIs(claims) };
    },
  };
}

/** The email and provider a token names: Google or Discord through Cognito's "identities", or Cognito itself. */
export function whoIs(claims: Record<string, unknown>): { email: string | null; provider: string | null } {
  const email = typeof claims.email === "string" && claims.email ? claims.email.toLowerCase() : null;
  const identities = Array.isArray(claims.identities) ? (claims.identities as { providerName?: string }[]) : [];
  return { email, provider: identities[0]?.providerName ?? (email ? "Cognito" : null) };
}

/** A verified Google email on the admin list; Cognito names the provider in "identities". */
export function isAdmin(claims: Record<string, unknown>, admins: Set<string>): boolean {
  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const verified = claims.email_verified === true || claims.email_verified === "true";
  const identities = Array.isArray(claims.identities) ? (claims.identities as { providerName?: string }[]) : [];
  return verified && admins.has(email) && identities.some((identity) => identity.providerName === "Google");
}

/** The bearer token on a request: the Authorization header, or ?token= on the live connection, which a browser cannot give headers. */
export function tokenOf(headers: Record<string, string | string[] | undefined>, query: unknown): string | null {
  const header = headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || null;
  const token = (query as { token?: unknown } | undefined)?.token;
  return typeof token === "string" && token ? token : null;
}
