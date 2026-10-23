// The HTTP API for the first playable slice. The client polls GET
// /tinkers/:id while open; WebSockets (GDD section 10) replace the polling
// when the Exchange needs pushed fills.

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { GameContent } from "./content-loader.js";
import type { Db } from "./db.js";
import { BadRequest, NotFound, checkIn, createTinker, equip, listTinkers, look, setQueue } from "./tinkers.js";

export interface ApiOptions {
  db: Db;
  content: GameContent;
  /** Injected so tests can move time. */
  now?: () => number;
  /** Origins allowed to call the API from a browser: the Expo dev server, in development. */
  corsOrigins?: string[];
}

export function buildApi({ db, content, now = Date.now, corsOrigins = [] }: ApiOptions): FastifyInstance {
  const app = Fastify();
  if (corsOrigins.length) app.register(cors, { origin: corsOrigins });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof NotFound) return reply.code(404).send({ error: error.message });
    if (error instanceof BadRequest || error.validation) return reply.code(400).send({ error: error.message });
    // A rule the database enforces with RAISE EXCEPTION, such as 3 Tinkers per account.
    if ((error as { code?: string }).code === "P0001") return reply.code(409).send({ error: error.message });
    app.log.error(error);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/content", async () => ({
    version: content.rules.version,
    actions: [...content.rules.actions.values()],
    monsters: [...content.rules.monsters.values()],
    weapons: [...content.rules.weapons.values()],
    items: [...content.items.values()],
    totalXp: content.rules.totalXp,
  }));

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

  return app;
}
