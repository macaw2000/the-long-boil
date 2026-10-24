// Real sign-in (build plan milestone 11): Cognito's managed login, which
// offers Google and later Discord (GDD sections 10 and 11), through the
// authorization code flow with PKCE. The game is a PWA, so this is the
// browser's flow: leave for Cognito, come back with a code, trade it for
// tokens. Without EXPO_PUBLIC_COGNITO_DOMAIN and _CLIENT_ID the client keeps
// the dev login and none of this runs.

import { Platform } from "react-native";

const DOMAIN = process.env.EXPO_PUBLIC_COGNITO_DOMAIN;
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;

export const cognitoEnabled = Boolean(DOMAIN && CLIENT_ID) && Platform.OS === "web";

const TOKENS_KEY = "long-boil.tokens";
const PENDING_KEY = "long-boil.sign-in";
/** A token this close to expiring is refreshed first, so it does not lapse in flight. */
const EARLY_MS = 60_000;

interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
}

/** Cognito sends the player back to the page they left from: the site root. */
function redirectUri(): string {
  return `${globalThis.location.origin}/`;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function readTokens(): Tokens | null {
  try {
    return JSON.parse(globalThis.localStorage.getItem(TOKENS_KEY) ?? "null") as Tokens | null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null) {
  if (tokens) globalThis.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else globalThis.localStorage.removeItem(TOKENS_KEY);
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const response = await fetch(`https://${DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID!, ...body }).toString(),
  });
  if (!response.ok) throw new Error(`sign-in failed with ${response.status}`);
  return response.json();
}

/** Leaves for Cognito's managed login; the player comes back to finishSignIn. */
export async function startSignIn(): Promise<void> {
  const verifier = randomString();
  const state = randomString();
  globalThis.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID!,
    redirect_uri: redirectUri(),
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  globalThis.location.assign(`https://${DOMAIN}/oauth2/authorize?${query}`);
}

/**
 * On the way back from Cognito, trades the code in the address for tokens and
 * tidies the address. Anything else on the page is left alone.
 */
export async function finishSignIn(): Promise<void> {
  if (!cognitoEnabled) return;
  const params = new URLSearchParams(globalThis.location.search);
  const code = params.get("code");
  if (!code) return;
  const pending = JSON.parse(globalThis.sessionStorage.getItem(PENDING_KEY) ?? "null") as { verifier: string; state: string } | null;
  globalThis.sessionStorage.removeItem(PENDING_KEY);
  globalThis.history.replaceState(null, "", redirectUri());
  // A code this browser did not ask for is ignored, so a crafted link cannot sign someone in as another player.
  if (!pending || params.get("state") !== pending.state) return;
  const got = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: pending.verifier });
  writeTokens({ access: got.access_token, refresh: got.refresh_token ?? "", expiresAt: Date.now() + got.expires_in * 1000 });
}

let refreshing: Promise<string | null> | null = null;

/** The access token to send, refreshed if it is about to expire; null when signed out or under the dev login. */
export async function accessToken(): Promise<string | null> {
  if (!cognitoEnabled) return null;
  const tokens = readTokens();
  if (!tokens) return null;
  if (tokens.expiresAt - EARLY_MS > Date.now()) return tokens.access;
  // Many requests can find the token stale at once; they share one refresh.
  refreshing ??= tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh })
    .then((got) => {
      writeTokens({ ...tokens, access: got.access_token, expiresAt: Date.now() + got.expires_in * 1000 });
      return got.access_token;
    })
    .catch(() => {
      writeTokens(null);
      return null;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

/** Forgets the tokens here and signs out of Cognito's managed login, which sends the player back to the site. */
export function signOut(): void {
  writeTokens(null);
  const query = new URLSearchParams({ client_id: CLIENT_ID!, logout_uri: redirectUri() });
  globalThis.location.assign(`https://${DOMAIN}/logout?${query}`);
}
