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
  /** The account's Stripe Customer from an earlier checkout; without one, Checkout makes one, for a later subscription to use. */
  customer?: string | null;
}

/** A paid checkout: who bought, how many crates, and the session that is the payment's reference. */
export interface Paid {
  type: "paid";
  sessionId: string;
  tinkerId: number;
  crates: number;
  /** The payment a later refund or dispute names. */
  paymentIntent: string | null;
  /** The Stripe Customer who paid, kept on the account. */
  customer: string | null;
}

/** A payment taken back, in full by a refund or by a dispute: its crates should not be delivered. */
export interface Reversed {
  type: "reversed";
  paymentIntent: string;
  why: "refunded" | "disputed";
}

export type PaymentNews = Paid | Reversed;

export interface Payments {
  /** Test-mode keys only, unless live payments were asked for. */
  testMode: boolean;
  /** Opens a Checkout Session and returns its page's address. */
  checkout(request: CheckoutRequest): Promise<string>;
  /**
   * Checks a webhook's signature against its raw body and reads it: a paid
   * session, a reversed payment, or null for any other event. Throws when the
   * signature is bad.
   */
  newsFrom(rawBody: Buffer, signature: string): PaymentNews | null;
}

export class BadSignature extends Error {}

/** Tags our sessions in the Dashboard, so this checkout can be told from any other. */
const INTEGRATION = "long-boil-cog-crate-qhvbmzrd";

/**
 * Stripe with an API key and the webhook's signing secret. The key should be
 * a restricted key (rk_) that may only write Checkout Sessions and read
 * Customers. A live key
 * is refused unless `allowLive`: the capstone runs in test mode.
 */
export function stripePayments({ apiKey, webhookSecret, allowLive = false }: { apiKey: string; webhookSecret: string; allowLive?: boolean }): Payments {
  const testMode = !apiKey.includes("_live_");
  if (!testMode && !allowLive) throw new Error("a live Stripe key needs STRIPE_ALLOW_LIVE=1; the capstone runs in test mode");
  const stripe = new Stripe(apiKey);
  return {
    testMode,
    async checkout({ tinkerId, crates, priceCents, cogsPerCrate, lockHours, siteUrl, customer }) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        integration_identifier: INTEGRATION,
        ...(customer ? { customer } : { customer_creation: "always" as const }),
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
    newsFrom(rawBody, signature) {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (error) {
        throw new BadSignature((error as Error).message);
      }
      return paymentNews(event);
    },
  };
}

/** The id of an expandable Stripe field, whether Stripe sent the id or the object. */
function idOf(field: string | { id: string } | null | undefined): string | null {
  return typeof field === "string" ? field : (field?.id ?? null);
}

/**
 * What a webhook event means for crates, or null. A Checkout Session is paid
 * at completion for a card, later for a delayed method. A charge refunded in
 * full, or disputed, reverses its payment; a partial refund does not.
 */
export function paymentNews(event: Stripe.Event): PaymentNews | null {
  if (event.type === "charge.refunded") {
    const paymentIntent = idOf(event.data.object.payment_intent);
    return event.data.object.refunded && paymentIntent ? { type: "reversed", paymentIntent, why: "refunded" } : null;
  }
  if (event.type === "charge.dispute.created") {
    const paymentIntent = idOf(event.data.object.payment_intent);
    return paymentIntent ? { type: "reversed", paymentIntent, why: "disputed" } : null;
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return null;
  const session = event.data.object;
  if (session.payment_status !== "paid") return null;
  const tinkerId = Number(session.metadata?.tinkerId);
  const crates = Number(session.metadata?.crates);
  if (!Number.isInteger(tinkerId) || tinkerId < 1 || !Number.isInteger(crates) || crates < 1) return null;
  return { type: "paid", sessionId: session.id, tinkerId, crates, paymentIntent: idOf(session.payment_intent), customer: idOf(session.customer) };
}
