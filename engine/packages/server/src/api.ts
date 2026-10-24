// The HTTP API for the first playable slice. The client looks at GET
// /tinkers/:id while open, which also collects Exchange fills. A WebSocket,
// GET /live/:id (GDD section 10), pushes notices that a Tinker changed and
// city chat; everything a player does still goes through these HTTP routes.

import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import { mutedAccounts, recentChat, say, setMute } from "./chat.js";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { CITY, localBroadcast, tinkerChannel, type Broadcast, type Notice } from "./live.js";
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
import { discardLetter, payDebt, playStory, readStory } from "./story.js";
import { BadRequest, NotFound, checkIn, createTinker, equip, fightOutlooks, listTinkers, look, setQueue } from "./tinkers.js";

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
}

export interface DevClock {
  /** How far the server's clock runs ahead of the wall clock, in ms. */
  offset(): number;
  skip(ms: number): number;
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
      skip: (ms) => {
        offset += ms;
        if (file) writeFileSync(file, JSON.stringify({ offsetMs: offset }) + "\n");
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
}: ApiOptions): FastifyInstance {
  const app = Fastify();
  // The plugin allows only GET, HEAD and POST by default; the queue, weapons, orders and letters also use PUT and DELETE.
  if (corsOrigins.length) app.register(cors, { origin: corsOrigins, methods: ["GET", "HEAD", "POST", "PUT", "DELETE"] });
  app.register(websocket, { options: { maxPayload: 4096 } });

  // Anything that changes a Tinker tells that Tinker's other open sessions to look again.
  app.addHook("onResponse", async (request, reply) => {
    if (request.method === "GET" || reply.statusCode >= 400) return;
    const id = Number((request.params as { id?: string }).id);
    if (Number.isInteger(id) && id > 0) broadcast.publish(tinkerChannel(id), { type: "changed" });
  });

  app.setErrorHandler((error: Error & { validation?: unknown; code?: string }, _request, reply) => {
    if (error instanceof NotFound) return reply.code(404).send({ error: error.message });
    if (error instanceof Refused) return reply.code(403).send({ error: error.message });
    if (error instanceof BadRequest || error.validation) return reply.code(400).send({ error: error.message });
    // A rule the database enforces with RAISE EXCEPTION, such as 3 Tinkers per account.
    if (error.code === "P0001") return reply.code(409).send({ error: error.message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/content", async () => ({
    version: content.rules.version,
    actions: [...content.rules.actions.values()],
    monsters: [...content.rules.monsters.values()],
    weapons: [...content.rules.weapons.values()],
    items: [...content.items.values()],
    economy: Object.fromEntries(content.economy),
    guide: content.guide,
    dev: clock ? { offsetMs: clock.offset() } : null,
    totalXp: content.rules.totalXp,
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
      async (request) => ({ offsetMs: clock.skip(request.body.hours * 3_600_000), now: new Date(now()).toISOString() }),
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
              maxItems: 2,
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
    marketView(db, content, Number(request.params.id), now(), trading),
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
      const { counterparties, ...result } = await placeOrder(db, content, Number(request.params.id), request.body, now(), trading);
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

  app.get<{ Params: { id: string } }>("/tinkers/:id/story", async (request) => readStory(db, content, Number(request.params.id), now()));

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

  app.get<{ Params: { id: string } }>("/tinkers/:id/chat", async (request) => recentChat(db, Number(request.params.id)));

  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/tinkers/:id/chat",
    { schema: { body: { type: "object", required: ["text"], properties: { text: { type: "string", minLength: 1, maxLength: 2000 } } } } },
    async (request, reply) => {
      const message = await say(db, Number(request.params.id), request.body.text, now());
      broadcast.publish(CITY, { type: "chat", message });
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
      let muted: Set<number>;
      try {
        muted = await mutedAccounts(db, id);
      } catch {
        socket.close(4404, "no such Tinker");
        return;
      }
      stops.push(
        broadcast.subscribe(tinkerChannel(id), (notice) => {
          if (notice.type === "mutes") {
            mutedAccounts(db, id).then((fresh) => (muted = fresh), () => undefined);
          }
          send(notice);
        }),
        broadcast.subscribe(CITY, (notice) => {
          if (notice.type === "chat" && muted.has(notice.message.accountId)) return;
          send(notice);
        }),
      );
      send({ type: "changed" });
    });
  });

  return app;
}
