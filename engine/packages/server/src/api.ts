// The HTTP API for the first playable slice. The client looks at GET
// /tinkers/:id while open, which also collects Exchange fills. A WebSocket,
// GET /live/:id (GDD section 10), pushes notices that a Tinker changed and
// city chat; everything a player does still goes through these HTTP routes.
// With an Auth (milestone 11) every route but /health and /content needs a
// Cognito token, and a route naming a Tinker needs it to be the caller's.
// Admins (auth.ts) may use the /dev routes and skip the trading gate.

import cors from "@fastify/cors";
import { PURCHASES, type Purchase } from "@long-boil/rules";
import websocket from "@fastify/websocket";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import { Unauthorized, tokenOf, type Auth } from "./auth.js";
import { mutedAccounts, recentChat, say, setMute, whisperInbox, whisperTo } from "./chat.js";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { chooseSeal, discardOffer, readDesk, turnIn } from "./work_orders.js";
import {
  acceptApplication,
  acceptInvite,
  applyToGuild,
  disbandGuild,
  dropRequest,
  foundGuild,
  guildChannel,
  inviteToGuild,
  pledgeToGuild,
  readGuild,
  removeMember,
  renameGuild,
  setRank,
  type GuildOutcome,
} from "./guilds.js";
import { CITY, HELP, PUBLIC_CHANNELS, TRADE, localBroadcast, tinkerChannel, type Broadcast, type Notice } from "./live.js";
import {
  GDD_TRADING,
  Refused,
  buyFromGrocer,
  cancelOrder,
  marketView,
  orderBook,
  placeOrder,
  sellToCollector,
  type TradingRules,
} from "./market.js";
import { readLedgerPages } from "./pages.js";
import { BadSignature, MAX_CRATES, type Payments } from "./payments.js";
import { buyUpgrade, grantCrates, openCrates, readShop, rememberStripeCustomer, revokeCrates, stripeCustomerOf } from "./shop.js";
import { devSetStory, discardLetter, payDebt, playStory, readStory } from "./story.js";
import { BadRequest, NotFound, checkIn, createTinker, equip, wear, fightOutlooks, listTinkers, loadout, look, readGuide, saveGuide, setQueue, type GuideProgress } from "./tinkers.js";

export interface ApiOptions {
  db: Db;
  content: GameContent;
  /** Injected so tests can move time. */
  now?: () => number;
  /** Origins allowed to call the API from a browser: the Expo dev server, in development. */
  corsOrigins?: string[];
  /** The trading gate; the GDD's unless local play opens it early. */
  trading?: TradingRules;
  /**
   * A dev-only clock that can be moved forward, so a person can play days of
   * the game in an evening. Never given in production; with it, /dev routes exist.
   */
  devClock?: DevClock;
  /** Fan-out to open sessions; in-process unless several servers share one. */
  broadcast?: Broadcast;
  /** Real sign-in; without it, the dev login trusts the login and Tinker id it is given. */
  auth?: Auth;
  /** A path the API also answers under, such as /api behind CloudFront, which sends /api/* to the server unchanged. */
  prefix?: string;
  /** Stripe Checkout for Cog Crates; without it, crates are not sold for money. */
  payments?: Payments;
  /** The site's own address, where Stripe sends a player back to. */
  siteUrl?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in account's login, when there is an Auth. */
    login: string | null;
    /** An admin's request, or any request under the dev login, which has no one to tell apart. */
    admin: boolean;
  }
}

/** How often the live connection pings, well inside CloudFront's 10-minute idle limit. */
const PING_MS = 45_000;

/** The trading gate as admins see it: open. */
const NO_GATE: TradingRules = { level: 0, days: 0 };

/** Routes anyone may call, signed in or not: the load balancer's health check, the game's content, and Stripe's webhook, which carries its own signature. */
const OPEN_ROUTES = new Set(["/health", "/content", "/stripe/webhook"]);

export interface DevClock {
  /** How far the server's clock runs ahead of the wall clock, in ms. */
  offset(): number;
  skip(ms: number): Promise<number>;
}

/**
 * A clock for local play: the wall clock plus an offset that only grows.
 * Given a file, the offset survives a restart; otherwise game time would run
 * backwards and every skipped Tinker would wait for the wall clock to catch up.
 */
export function devClock(file?: string): { clock: DevClock; now: () => number } {
  let offset = 0;
  if (file && existsSync(file)) offset = Number(JSON.parse(readFileSync(file, "utf8")).offsetMs) || 0;
  return {
    clock: {
      offset: () => offset,
      skip: async (ms) => {
        offset += ms;
        if (file) writeFileSync(file, JSON.stringify({ offsetMs: offset }) + "\n");
        return offset;
      },
    },
    now: () => Date.now() + offset,
  };
}

/**
 * The same clock for a deployed dev server, whose disk does not outlive a
 * deploy: the offset is kept in the database (migration 011). One clock for
 * the whole server, so a skip moves time for every player on it. With more
 * than one server, each would need to reload it; dev runs one.
 */
export async function devClockInDatabase(db: Db): Promise<{ clock: DevClock; now: () => number }> {
  const row = await db.query<{ offset_ms: string }>("SELECT offset_ms FROM dev_clock");
  let offset = Number(row.rows[0]?.offset_ms ?? 0);
  return {
    clock: {
      offset: () => offset,
      skip: async (ms) => {
        const saved = await db.query<{ offset_ms: string }>(
          `INSERT INTO dev_clock (offset_ms) VALUES ($1)
           ON CONFLICT (only_row) DO UPDATE SET offset_ms = dev_clock.offset_ms + EXCLUDED.offset_ms
           RETURNING offset_ms`,
          [ms],
        );
        offset = Number(saved.rows[0]!.offset_ms);
        return offset;
      },
    },
    now: () => Date.now() + offset,
  };
}

export function buildApi({
  db,
  content,
  now = Date.now,
  corsOrigins = [],
  trading = GDD_TRADING,
  devClock: clock,
  broadcast = localBroadcast(),
  auth,
  prefix,
  payments,
  siteUrl = "http://localhost:8081",
}: ApiOptions): FastifyInstance {
  const app = Fastify(
    prefix ? { rewriteUrl: (request) => (request.url?.startsWith(`${prefix}/`) ? request.url.slice(prefix.length) : (request.url ?? "/")) } : {},
  );
  // The plugin allows only GET, HEAD and POST by default; the queue, weapons, orders and letters also use PUT and DELETE.
  if (corsOrigins.length) app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "POST", "PUT", "DELETE"] });
  app.register(websocket, { options: { maxPayload: 4096 } });

  app.decorateRequest("login", null);
  app.decorateRequest("admin", !auth);
  if (auth) {
    // Runs before the WebSocket upgrade too, so a bad token never opens a live connection.
    app.addHook("preHandler", async (request) => {
      if (OPEN_ROUTES.has(request.routeOptions.url ?? "")) return;
      const token = tokenOf(request.headers, request.query);
      if (!token) throw new Unauthorized("sign in first");
      const identity = await auth.verify(token);
      request.login = identity.login;
      request.admin = identity.admin;
      if (request.routeOptions.url?.startsWith("/dev/") && !identity.admin) throw new Refused("admins only");
      const id = Number((request.params as { id?: string }).id);
      if (Number.isInteger(id) && id > 0 && !(await ownsTinker(request.login, id))) throw new Refused("that is not your Tinker");
      const login = (request.params as { login?: string }).login ?? (request.body as { login?: unknown } | undefined)?.login;
      if (login !== undefined && login !== request.login) throw new Refused("that is not your account");
    });
  }
  /** The gate for this request: none for an admin, otherwise the server's. */
  const gate = (request: { admin: boolean }) => (auth && request.admin ? NO_GATE : trading);
  const ownsTinker = async (login: string, id: number) =>
    (await db.query("SELECT 1 FROM tinkers t JOIN accounts a ON a.id = t.account_id WHERE t.id = $1 AND a.login = $2", [id, login])).rowCount === 1;

  // Anything that changes a Tinker tells that Tinker's other open sessions to look again.
  app.addHook("onResponse", async (request, reply) => {
    if (request.method === "GET" || reply.statusCode >= 400) return;
    const id = Number((request.params as { id?: string }).id);
    if (Number.isInteger(id) && id > 0) broadcast.publish(tinkerChannel(id), { type: "changed" });
  });

  app.setErrorHandler((error: Error & { validation?: unknown; code?: string }, _request, reply) => {
    if (error instanceof Unauthorized) return reply.code(401).send({ error: error.message });
    if (error instanceof NotFound) return reply.code(404).send({ error: error.message });
    if (error instanceof Refused) return reply.code(403).send({ error: error.message });
    if (error instanceof BadRequest || error.validation) return reply.code(400).send({ error: error.message });
    // A rule the database enforces with RAISE EXCEPTION, such as 3 Tinkers per account.
    if (error.code === "P0001") return reply.code(409).send({ error: error.message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal error" });
  });

  // Answers without touching the database, so the load balancer's checks never wake a paused Aurora (GDD section 11, decision 3).
  app.get("/health", async () => ({ ok: true }));

  // Who the token speaks for, so the client can list and open its own Tinkers (null under the dev login), and whether to show the dev tools.
  app.get("/me", async (request) => ({ login: request.login, admin: request.admin }));

  app.get("/content", async () => ({
    version: content.rules.version,
    actions: [...content.rules.actions.values()],
    monsters: [...content.rules.monsters.values()],
    weapons: [...content.rules.weapons.values()],
    armours: [...content.rules.armours.values()],
    items: [...content.items.values()],
    economy: Object.fromEntries(content.economy),
    guide: content.guide,
    dev: clock ? { offsetMs: clock.offset() } : null,
    totalXp: content.rules.totalXp,
    shop: content.rules.shop,
    payments: payments && content.rules.shop ? { testMode: payments.testMode } : null,
    ration: { item: content.rules.ration.item, bossCap: content.rules.combat.BOSS_RATION_CAP_PER_ATTEMPT ?? 0 },
  }));

  if (clock) {
    app.get("/dev/clock", async () => ({ offsetMs: clock.offset(), now: new Date(now()).toISOString() }));
    app.post<{ Body: { hours: number } }>(
      "/dev/skip",
      {
        schema: {
          body: { type: "object", required: ["hours"], properties: { hours: { type: "number", exclusiveMinimum: 0, maximum: 168 } } },
        },
      },
      async (request) => ({ offsetMs: await clock.skip(request.body.hours * 3_600_000), now: new Date(now()).toISOString() }),
    );
    app.post<{ Params: { id: string }; Body: { qualities?: Record<string, number>; fillNerve?: boolean } }>(
      "/dev/tinkers/:id/story",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              qualities: { type: "object", maxProperties: 20, additionalProperties: { type: "integer" } },
              fillNerve: { type: "boolean" },
            },
          },
        },
      },
      async (request) => devSetStory(db, content, Number(request.params.id), request.body, now()),
    );
    // Crates for testing the Cog Shop before Stripe sells them; `locked` makes them wait out the lock as a bought crate does.
    app.post<{ Params: { id: string }; Body: { qty: number; locked?: boolean } }>(
      "/dev/tinkers/:id/crates",
      {
        schema: {
          body: {
            type: "object",
            required: ["qty"],
            properties: { qty: { type: "integer", minimum: 1, maximum: 100 }, locked: { type: "boolean" } },
          },
        },
      },
      async (request) => grantCrates(db, content, Number(request.params.id), request.body.qty, now(), { locked: request.body.locked === true }),
    );
  }

  app.get<{ Params: { login: string } }>("/accounts/:login/tinkers", async (request) => ({
    tinkers: await listTinkers(db, request.params.login),
  }));

  app.get<{ Params: { id: string } }>("/tinkers/:id", async (request) => look(db, content, Number(request.params.id), now()));

  app.post<{ Body: { login: string; name: string } }>(
    "/tinkers",
    {
      schema: {
        body: {
          type: "object",
          required: ["login", "name"],
          properties: { login: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1, maxLength: 40 } },
        },
      },
    },
    async (request, reply) => {
      const outcome = await createTinker(db, content, request.body.login, request.body.name, now());
      return reply.code(201).send(outcome);
    },
  );

  app.post<{ Params: { id: string } }>("/tinkers/:id/check-in", async (request) =>
    checkIn(db, content, Number(request.params.id), now()),
  );

  app.put<{ Params: { id: string }; Body: { queue: { actionId: string; remaining: number }[] } }>(
    "/tinkers/:id/queue",
    {
      schema: {
        body: {
          type: "object",
          required: ["queue"],
          properties: {
            queue: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                required: ["actionId", "remaining"],
                properties: { actionId: { type: "string" }, remaining: { type: "integer", minimum: 1 } },
              },
            },
          },
        },
      },
    },
    async (request) => setQueue(db, content, Number(request.params.id), request.body.queue, now()),
  );

  app.put<{ Params: { id: string }; Body: { item: string } }>(
    "/tinkers/:id/weapon",
    { schema: { body: { type: "object", required: ["item"], properties: { item: { type: "string" } } } } },
    async (request) => equip(db, content, Number(request.params.id), request.body.item, now()),
  );

  app.put<{ Params: { id: string }; Body: { item: string } }>(
    "/tinkers/:id/armour",
    { schema: { body: { type: "object", required: ["item"], properties: { item: { type: "string" } } } } },
    async (request) => wear(db, content, Number(request.params.id), request.body.item, now()),
  );

  // The first-session guide's progress, so it follows the player between devices.
  const words = { type: "array", maxItems: 64, items: { type: "string", maxLength: 64 } };
  app.get<{ Params: { id: string } }>("/tinkers/:id/guide", async (request) => readGuide(db, Number(request.params.id)));
  app.put<{ Params: { id: string }; Body: GuideProgress }>(
    "/tinkers/:id/guide",
    {
      schema: {
        body: {
          type: "object",
          required: ["acknowledged", "skipped"],
          additionalProperties: false,
          properties: { acknowledged: words, skipped: { type: "boolean" }, seen: words, opened: { type: "boolean" } },
        },
      },
    },
    async (request) => saveGuide(db, Number(request.params.id), request.body),
  );

  const counting = {
    schema: {
      body: {
        type: "object",
        required: ["item", "qty"],
        properties: { item: { type: "string" }, qty: { type: "integer", minimum: 1 } },
      },
    },
  };

  app.post<{ Params: { id: string }; Body: { item: string; qty: number } }>("/tinkers/:id/collector", counting, async (request) =>
    sellToCollector(db, content, Number(request.params.id), request.body.item, request.body.qty, now()),
  );

  app.post<{ Params: { id: string }; Body: { item: string; qty: number } }>("/tinkers/:id/grocer", counting, async (request) =>
    buyFromGrocer(db, content, Number(request.params.id), request.body.item, request.body.qty, now()),
  );

  app.get<{ Params: { id: string } }>("/tinkers/:id/market", async (request) =>
    marketView(db, content, Number(request.params.id), now(), gate(request)),
  );

  app.post<{ Params: { id: string }; Body: { item: string; side: "buy" | "sell"; price: number; qty: number } }>(
    "/tinkers/:id/orders",
    {
      schema: {
        body: {
          type: "object",
          required: ["item", "side", "price", "qty"],
          properties: {
            item: { type: "string" },
            side: { enum: ["buy", "sell"] },
            price: { type: "integer", minimum: 1 },
            qty: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { counterparties, ...result } = await placeOrder(db, content, Number(request.params.id), request.body, now(), gate(request));
      for (const other of counterparties) broadcast.publish(tinkerChannel(other), { type: "changed" });
      return reply.code(201).send(result);
    },
  );

  app.delete<{ Params: { id: string; order: string } }>("/tinkers/:id/orders/:order", async (request) =>
    cancelOrder(db, content, Number(request.params.id), Number(request.params.order), now()),
  );

  app.get<{ Params: { item: string } }>("/exchange/:item", async (request) => orderBook(db, request.params.item, now()));

  app.get<{ Params: { id: string } }>("/tinkers/:id/fights", async (request) => ({
    fights: await fightOutlooks(db, content, Number(request.params.id), now()),
  }));

  app.get<{ Params: { id: string } }>("/tinkers/:id/loadout", async (request) => loadout(db, content, Number(request.params.id), now()));

  app.get<{ Params: { id: string } }>("/tinkers/:id/story", async (request) => readStory(db, content, Number(request.params.id), now()));

  // Hester's Ledger: the pages this Tinker holds can be read; the rest are only counted.
  app.get<{ Params: { id: string } }>("/tinkers/:id/pages", async (request) => readLedgerPages(db, content, Number(request.params.id)));

  app.post<{ Params: { id: string }; Body: { kind: "storylet" | "letter"; scene: string; option: number } }>(
    "/tinkers/:id/story",
    {
      schema: {
        body: {
          type: "object",
          required: ["kind", "scene", "option"],
          properties: { kind: { enum: ["storylet", "letter"] }, scene: { type: "string" }, option: { type: "integer", minimum: 0 } },
        },
      },
    },
    async (request) => playStory(db, content, Number(request.params.id), request.body.kind, request.body.scene, request.body.option, now()),
  );

  app.delete<{ Params: { id: string; letter: string } }>("/tinkers/:id/letters/:letter", async (request) =>
    discardLetter(db, content, Number(request.params.id), request.params.letter, now()),
  );

  app.post<{ Params: { id: string; debt: string } }>("/tinkers/:id/debts/:debt", async (request) =>
    payDebt(db, content, Number(request.params.id), request.params.debt, now()),
  );

  // The Cog Shop (GDD section 8).
  app.get<{ Params: { id: string } }>("/tinkers/:id/shop", async (request) => readShop(db, content, Number(request.params.id), now()));
  app.post<{ Params: { id: string }; Body: { qty: number } }>(
    "/tinkers/:id/shop/open",
    { schema: { body: { type: "object", required: ["qty"], properties: { qty: { type: "integer", minimum: 1 } } } } },
    async (request) => openCrates(db, content, Number(request.params.id), request.body.qty, now()),
  );
  // Buying crates for money: a Stripe Checkout page to send the player to.
  app.post<{ Params: { id: string }; Body: { crates: number } }>(
    "/tinkers/:id/shop/checkout",
    { schema: { body: { type: "object", required: ["crates"], properties: { crates: { type: "integer", minimum: 1, maximum: MAX_CRATES } } } } },
    async (request) => {
      const shop = content.rules.shop;
      if (!payments || !shop) throw new BadRequest("crates are not sold for money on this server");
      const tinkerId = Number(request.params.id);
      const customer = await stripeCustomerOf(db, tinkerId);
      const url = await payments.checkout({
        tinkerId,
        crates: request.body.crates,
        priceCents: shop.crate.priceCents,
        cogsPerCrate: shop.crate.cogs,
        lockHours: shop.crate.lockHours,
        siteUrl,
        customer,
      });
      return { url };
    },
  );
  // Stripe's report of a payment. Signed, so it needs no sign-in; the signature
  // covers the exact bytes, so this route alone keeps its body raw. A paid
  // session queues its crates once, however often Stripe sends it; a refund
  // or dispute revokes them if they are still locked. Anything Stripe sends
  // that cannot be acted on is still acknowledged, or Stripe retries for days.
  if (payments) {
    app.register(async (hook) => {
      hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
      hook.post<{ Body: Buffer }>("/stripe/webhook", async (request, reply) => {
        const signature = request.headers["stripe-signature"];
        if (typeof signature !== "string") return reply.code(400).send({ error: "no Stripe signature" });
        let news;
        try {
          news = payments.newsFrom(request.body, signature);
        } catch (error) {
          if (error instanceof BadSignature) return reply.code(400).send({ error: "bad Stripe signature" });
          throw error;
        }
        if (news?.type === "paid") {
          try {
            await grantCrates(db, content, news.tinkerId, news.crates, now(), { source: "stripe", reference: news.sessionId, paymentIntent: news.paymentIntent });
          } catch (error) {
            if (!(error instanceof NotFound)) throw error;
            console.warn(`Stripe payment ${news.sessionId} for Tinker ${news.tinkerId}, who is gone; refund it by hand`);
            return { received: true };
          }
          if (news.customer) await rememberStripeCustomer(db, news.tinkerId, news.customer);
          broadcast.publish(tinkerChannel(news.tinkerId), { type: "changed" });
        } else if (news?.type === "reversed") {
          const result = await revokeCrates(db, news.paymentIntent, now());
          if (result?.revoked) broadcast.publish(tinkerChannel(result.tinkerId), { type: "changed" });
          else console.warn(result ? `Stripe payment ${news.paymentIntent} ${news.why} after Tinker ${result.tinkerId}'s crates were delivered` : `Stripe payment ${news.paymentIntent} ${news.why}, with no crates`);
        }
        return { received: true };
      });
    });
  }

  app.post<{ Params: { id: string }; Body: { purchase: Purchase } }>(
    "/tinkers/:id/shop/buy",
    { schema: { body: { type: "object", required: ["purchase"], properties: { purchase: { enum: [...PURCHASES] } } } } },
    async (request) => buyUpgrade(db, content, Number(request.params.id), request.body.purchase, now()),
  );

  app.get<{ Params: { id: string } }>("/tinkers/:id/work-orders", async (request) =>
    readDesk(db, content, Number(request.params.id), now(), gate(request)),
  );
  app.post<{ Params: { id: string; offer: string }; Body: { order: string } }>(
    "/tinkers/:id/work-orders/:offer/choose",
    { schema: { body: { type: "object", required: ["order"], properties: { order: { type: "string" } } } } },
    async (request) => chooseSeal(db, content, Number(request.params.id), Number(request.params.offer), request.body.order, now(), gate(request)),
  );
  app.post<{ Params: { id: string; offer: string } }>("/tinkers/:id/work-orders/:offer/turn-in", async (request) =>
    turnIn(db, content, Number(request.params.id), Number(request.params.offer), now(), gate(request)),
  );
  app.delete<{ Params: { id: string; offer: string } }>("/tinkers/:id/work-orders/:offer", async (request) =>
    discardOffer(db, content, Number(request.params.id), Number(request.params.offer), now(), gate(request)),
  );

  // Guilds (milestone 10). Every change tells the other Tinkers it touched, so their screens and guild chat follow.
  const guildDone = (id: number, outcome: GuildOutcome) => {
    for (const other of [id, ...outcome.touched]) broadcast.publish(tinkerChannel(other), { type: "guild" });
    return outcome.view;
  };
  const idOf = (params: { id: string }) => Number(params.id);
  app.get<{ Params: { id: string } }>("/tinkers/:id/guild", async (request) => (await readGuild(db, content, idOf(request.params), now(), gate(request))).view);
  app.post<{ Params: { id: string }; Body: { name: string; crowns: number } }>(
    "/tinkers/:id/guild",
    { schema: { body: { type: "object", required: ["name", "crowns"], properties: { name: { type: "string", maxLength: 80 }, crowns: { type: "integer", minimum: 1 } } } } },
    async (request) => guildDone(idOf(request.params), await foundGuild(db, content, idOf(request.params), request.body.name, request.body.crowns, now(), gate(request))),
  );
  app.post<{ Params: { id: string; guild: string }; Body: { crowns: number } }>(
    "/tinkers/:id/guilds/:guild/pledge",
    { schema: { body: { type: "object", required: ["crowns"], properties: { crowns: { type: "integer", minimum: 1 } } } } },
    async (request) =>
      guildDone(idOf(request.params), await pledgeToGuild(db, content, idOf(request.params), Number(request.params.guild), request.body.crowns, now(), gate(request))),
  );
  app.post<{ Params: { id: string; guild: string } }>("/tinkers/:id/guilds/:guild/apply", async (request) =>
    guildDone(idOf(request.params), await applyToGuild(db, content, idOf(request.params), Number(request.params.guild), now(), gate(request))),
  );
  app.post<{ Params: { id: string; guild: string } }>("/tinkers/:id/guilds/:guild/accept", async (request) =>
    guildDone(idOf(request.params), await acceptInvite(db, content, idOf(request.params), Number(request.params.guild), now(), gate(request))),
  );
  app.delete<{ Params: { id: string; guild: string; other: string } }>("/tinkers/:id/guilds/:guild/requests/:other", async (request) =>
    guildDone(
      idOf(request.params),
      await dropRequest(db, content, idOf(request.params), Number(request.params.guild), Number(request.params.other), now(), gate(request)),
    ),
  );
  app.post<{ Params: { id: string; other: string } }>("/tinkers/:id/guild/invite/:other", async (request) =>
    guildDone(idOf(request.params), await inviteToGuild(db, content, idOf(request.params), Number(request.params.other), now(), gate(request))),
  );
  app.post<{ Params: { id: string; other: string } }>("/tinkers/:id/guild/applications/:other/accept", async (request) =>
    guildDone(idOf(request.params), await acceptApplication(db, content, idOf(request.params), Number(request.params.other), now(), gate(request))),
  );
  app.put<{ Params: { id: string; other: string }; Body: { rank: "leader" | "officer" | "member" } }>(
    "/tinkers/:id/guild/members/:other/rank",
    { schema: { body: { type: "object", required: ["rank"], properties: { rank: { enum: ["leader", "officer", "member"] } } } } },
    async (request) =>
      guildDone(idOf(request.params), await setRank(db, content, idOf(request.params), Number(request.params.other), request.body.rank, now(), gate(request))),
  );
  app.delete<{ Params: { id: string; other: string } }>("/tinkers/:id/guild/members/:other", async (request) =>
    guildDone(idOf(request.params), await removeMember(db, content, idOf(request.params), Number(request.params.other), now(), gate(request))),
  );
  app.post<{ Params: { id: string }; Body: { name: string } }>(
    "/tinkers/:id/guild/rename",
    { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string", maxLength: 80 } } } } },
    async (request) => guildDone(idOf(request.params), await renameGuild(db, content, idOf(request.params), request.body.name, now(), gate(request))),
  );
  app.post<{ Params: { id: string } }>("/tinkers/:id/guild/disband", async (request) =>
    guildDone(idOf(request.params), await disbandGuild(db, content, idOf(request.params), now(), gate(request))),
  );

  type ChannelName = "city" | "trade" | "help" | "guild" | "whisper";
  const CHANNEL_NAMES = ["city", "trade", "help", "guild", "whisper"];

  /** Which chat a request means: a public channel, this Tinker's guild, or a whisper to one other Tinker. */
  const channelFor = async (id: number, channel: string | undefined, to: number | undefined) => {
    if (channel === "guild") {
      const own = await guildChannel(db, id);
      if (!own) throw new BadRequest("you are not in a guild");
      return own;
    }
    if (channel === "whisper") {
      if (!to) throw new BadRequest("a whisper needs someone to whisper to");
      return whisperTo(db, id, to);
    }
    return PUBLIC_CHANNELS[(channel ?? "city") as keyof typeof PUBLIC_CHANNELS] ?? CITY;
  };

  app.get<{ Params: { id: string }; Querystring: { channel?: ChannelName; with?: string } }>(
    "/tinkers/:id/chat",
    { schema: { querystring: { type: "object", properties: { channel: { enum: CHANNEL_NAMES }, with: { type: "string", pattern: "^[0-9]+$" } } } } },
    async (request) =>
      recentChat(db, Number(request.params.id), await channelFor(Number(request.params.id), request.query.channel, Number(request.query.with) || undefined)),
  );

  app.get<{ Params: { id: string } }>("/tinkers/:id/whispers", async (request) => ({ conversations: await whisperInbox(db, Number(request.params.id)) }));

  app.post<{ Params: { id: string }; Body: { text: string; channel?: ChannelName; to?: number } }>(
    "/tinkers/:id/chat",
    {
      schema: {
        body: {
          type: "object",
          required: ["text"],
          properties: { text: { type: "string", minLength: 1, maxLength: 2000 }, channel: { enum: CHANNEL_NAMES }, to: { type: "integer", minimum: 1 } },
        },
      },
    },
    async (request, reply) => {
      const id = Number(request.params.id);
      const channel = await channelFor(id, request.body.channel, request.body.to);
      const message = await say(db, id, request.body.text, now(), channel);
      // A whisper goes to the two Tinkers' own channels; everything else to its channel.
      if (request.body.channel === "whisper") {
        for (const party of [id, request.body.to!]) broadcast.publish(tinkerChannel(party), { type: "chat", message });
      } else broadcast.publish(channel, { type: "chat", message });
      const { accountId: _account, ...shown } = message;
      return reply.code(201).send({ message: shown });
    },
  );

  const muting = async (id: number, other: number, muted: boolean) => {
    await setMute(db, id, other, muted);
    broadcast.publish(tinkerChannel(id), { type: "mutes" });
    return recentChat(db, id);
  };
  app.put<{ Params: { id: string; other: string } }>("/tinkers/:id/mutes/:other", async (request) =>
    muting(Number(request.params.id), Number(request.params.other), true),
  );
  app.delete<{ Params: { id: string; other: string } }>("/tinkers/:id/mutes/:other", async (request) =>
    muting(Number(request.params.id), Number(request.params.other), false),
  );

  // The live connection: server-to-client only. Chat from muted accounts is
  // dropped here, per connection, so a mute never reaches the muter's screen.
  app.register(async (live) => {
    live.get<{ Params: { id: string } }>("/live/:id", { websocket: true }, async (socket, request) => {
      const id = Number(request.params.id);
      const send = (notice: Notice) => {
        if (socket.readyState !== socket.OPEN) return;
        if (notice.type === "chat") {
          const { accountId: _account, ...message } = notice.message;
          socket.send(JSON.stringify({ type: "chat", message }));
        } else socket.send(JSON.stringify(notice));
      };
      const stops: (() => void)[] = [];
      socket.on("close", () => stops.forEach((stop) => stop()));
      // CloudFront closes a WebSocket after 10 minutes without a byte from the server; a ping keeps a quiet workshop open.
      const ping = setInterval(() => socket.readyState === socket.OPEN && socket.ping(), PING_MS);
      stops.push(() => clearInterval(ping));
      let muted: Set<number>;
      try {
        muted = await mutedAccounts(db, id);
      } catch {
        socket.close(4404, "no such Tinker");
        return;
      }
      const chatListener = (notice: Notice) => {
        if (notice.type === "chat" && muted.has(notice.message.accountId)) return;
        send(notice);
      };
      // Guild chat follows membership: resubscribe whenever this Tinker's guild changes.
      let guildStop: (() => void) | null = null;
      const followGuild = async () => {
        const channel = await guildChannel(db, id).catch(() => null);
        guildStop?.();
        guildStop = channel ? broadcast.subscribe(channel, chatListener) : null;
      };
      stops.push(
        broadcast.subscribe(tinkerChannel(id), (notice) => {
          if (notice.type === "mutes") {
            mutedAccounts(db, id).then((fresh) => (muted = fresh), () => undefined);
          }
          if (notice.type === "guild") followGuild();
          // Whispers arrive here; a muted account's are dropped like any other chat.
          if (notice.type === "chat") return chatListener(notice);
          send(notice);
        }),
        broadcast.subscribe(CITY, chatListener),
        broadcast.subscribe(TRADE, chatListener),
        broadcast.subscribe(HELP, chatListener),
        () => guildStop?.(),
      );
      // Subscribed first, so nothing published while the guild is looked up is missed.
      await followGuild();
      send({ type: "changed" });
    });
  });

  return app;
}
