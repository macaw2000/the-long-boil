// Cog Crates for money (GDD section 8, Payments path): Stripe Checkout in
// test mode. The server asks Stripe for a hosted checkout page and sends the
// player there; Stripe reports the paid session to POST /stripe/webhook,
// signed, and the crates are queued as a locked delivery whose reference is
// the Checkout Session id, so a payment reported twice delivers once. The
// GDD put the webhook in a Lambda with DynamoDB; the game server and
// Postgres's unique reference give the same once-only grant with one less
// service (Jeremy, 27 October 2026).

import Stripe from "stripe";

/** At most this many crates in one checkout. */
export const MAX_CRATES = 10;

export interface CheckoutRequest {
  tinkerId: number;
  crates: number;
  /** Each crate's price in US cents, from the Cog Shop's terms. */
  priceCents: number;
  cogsPerCrate: number;
  lockHours: number;
  /** Where Stripe sends the player back to. */
  siteUrl: string;
}

/** A paid checkout: who bought, how many crates, and the session that is the payment's reference. */
export interface Paid {
  sessionId: string;
  tinkerId: number;
  crates: number;
}

export interface Payments {
  /** Test-mode keys only, unless live payments were asked for. */
  testMode: boolean;
  /** Opens a Checkout Session and returns its page's address. */
  checkout(request: CheckoutRequest): Promise<string>;
  /**
   * Checks a webhook's signature against its raw body and reads it: a paid
   * session, or null for any other event. Throws when the signature is bad.
   */
  paidFrom(rawBody: Buffer, signature: string): Paid | null;
}

export class BadSignature extends Error {}

/** Tags our sessions in the Dashboard, so this checkout can be told from any other. */
const INTEGRATION = "long-boil-cog-crate-qhvbmzrd";

/**
 * Stripe with an API key and the webhook's signing secret. The key should be
 * a restricted key (rk_) that may only write Checkout Sessions. A live key
 * is refused unless `allowLive`: the capstone runs in test mode.
 */
export function stripePayments({ apiKey, webhookSecret, allowLive = false }: { apiKey: string; webhookSecret: string; allowLive?: boolean }): Payments {
  const testMode = !apiKey.includes("_live_");
  if (!testMode && !allowLive) throw new Error("a live Stripe key needs STRIPE_ALLOW_LIVE=1; the capstone runs in test mode");
  const stripe = new Stripe(apiKey);
  return {
    testMode,
    async checkout({ tinkerId, crates, priceCents, cogsPerCrate, lockHours, siteUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        integration_identifier: INTEGRATION,
        line_items: [
          {
            quantity: crates,
            price_data: {
              currency: "usd",
              unit_amount: priceCents,
              product_data: { name: "Cog Crate", description: `${cogsPerCrate} Gilded Cogs for The Long Boil. Held ${lockHours} hours, then delivered to your workshop.` },
            },
          },
        ],
        client_reference_id: String(tinkerId),
        metadata: { tinkerId: String(tinkerId), crates: String(crates) },
        success_url: `${siteUrl}/?checkout=paid`,
        cancel_url: `${siteUrl}/?checkout=cancelled`,
      });
      if (!session.url) throw new Error("Stripe opened a checkout with no page");
      return session.url;
    },
    paidFrom(rawBody, signature) {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (error) {
        throw new BadSignature((error as Error).message);
      }
      return paidSession(event);
    },
  };
}

/** A completed, paid Checkout Session from a webhook event, or null. Card payments are paid at completion; a delayed method reports later. */
export function paidSession(event: Stripe.Event): Paid | null {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return null;
  const session = event.data.object;
  if (session.payment_status !== "paid") return null;
  const tinkerId = Number(session.metadata?.tinkerId);
  const crates = Number(session.metadata?.crates);
  if (!Number.isInteger(tinkerId) || tinkerId < 1 || !Number.isInteger(crates) || crates < 1) return null;
  return { sessionId: session.id, tinkerId, crates };
}
