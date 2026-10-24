// Real sign-in (build plan milestone 11): Cognito, with Google and later
// Discord behind it (GDD sections 10 and 11). The client sends Cognito's
// access token on every HTTP request and on the live connection; the server
// checks it against the user pool's published keys and turns it into the
// account's login. Without an Auth the server keeps the dev login, which
// trusts whatever login and Tinker id it is given.

import { CognitoJwtVerifier } from "aws-jwt-verify";

export interface Auth {
  /** The login a token speaks for; throws Unauthorized if it is not good. */
  verify(token: string): Promise<string>;
}

export class Unauthorized extends Error {}

/**
 * A Cognito account's login is its user's sub, which never changes; the
 * prefix keeps it apart from any dev login. Signing in with Google and with
 * Discord makes two Cognito users, so two accounts, until the pool links them.
 */
export function cognitoAuth({ userPoolId, clientId }: { userPoolId: string; clientId: string }): Auth {
  const verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: "access" });
  return {
    async verify(token) {
      try {
        const claims = await verifier.verify(token);
        return `cognito:${claims.sub}`;
      } catch {
        throw new Unauthorized("sign in again");
      }
    },
  };
}

/** The bearer token on a request: the Authorization header, or ?token= on the live connection, which a browser cannot give headers. */
export function tokenOf(headers: Record<string, string | string[] | undefined>, query: unknown): string | null {
  const header = headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || null;
  const token = (query as { token?: unknown } | undefined)?.token;
  return typeof token === "string" && token ? token : null;
}
