// The live connection and city chat (build plan milestones 7 and 8) against
// a real PostgreSQL database, long_boil_test, rebuilt from the migrations.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApi } from "../src/api.js";
import { loadContent } from "../src/content-loader.js";
import { connect, migrate } from "../src/db.js";

const db = connect(process.env.PGDATABASE_TEST ?? "long_boil_test");
const content = loadContent();
let clock = Date.UTC(2026, 9, 22, 8, 0, 0);
const app = buildApi({ db, content, now: () => clock, trading: { level: 0, days: 0 } });

beforeAll(async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.end();
});

async function call(method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) {
  const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
  return { status: response.statusCode, body: response.json() };
}

async function newTinker(login: string, name: string): Promise<number> {
  return (await call("POST", "/tinkers", { login, name })).body.tinker.id;
}

/** Opens /live/:id and records every notice it receives. */
async function listen(id: number) {
  const notices: { type: string; message?: { text: string; tinker: { name: string } } }[] = [];
  const socket = await app.injectWS(`/live/${id}`);
  socket.on("message", (data: Buffer) => notices.push(JSON.parse(data.toString())));
  const until = async (test: () => boolean) => {
    for (let tries = 0; tries < 50 && !test(); tries++) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(test()).toBe(true);
  };
  return { notices, socket, until };
}

describe("the live connection", () => {
  it("tells a Tinker's open session when an action changes it", async () => {
    const ada = await newTinker("live-ada@example.com", "Ada");
    const live = await listen(ada);
    await live.until(() => live.notices.length === 1);
    expect(live.notices[0]).toEqual({ type: "changed" });
    await call("PUT", `/tinkers/${ada}/queue`, { queue: [{ actionId: "action.rustmoor.prospect_copper", remaining: 5 }] });
    await live.until(() => live.notices.length === 2);
    expect(live.notices[1]).toEqual({ type: "changed" });
    live.socket.terminate();
  });

  it("tells the seller when a buyer fills a resting order", async () => {
    const seller = await newTinker("live-seller@example.com", "Seller");
    const buyer = await newTinker("live-buyer@example.com", "Buyer");
    // The buyer earns Crowns the ordinary way: bent nails sold to the collectors.
    await call("PUT", `/tinkers/${buyer}/queue`, { queue: [{ actionId: "action.rustmoor.scavenge_bent_nails", remaining: 10_000 }] });
    clock += 2 * 3_600_000;
    expect((await call("POST", `/tinkers/${buyer}/collector`, { item: "item.rustmoor.bent_nails", qty: 10 })).status).toBe(200);
    expect((await call("POST", `/tinkers/${seller}/orders`, { item: "item.rustmoor.brass_ingot", side: "sell", price: 5, qty: 10 })).status).toBe(201);

    const live = await listen(seller);
    await live.until(() => live.notices.length === 1);
    const bought = await call("POST", `/tinkers/${buyer}/orders`, { item: "item.rustmoor.brass_ingot", side: "buy", price: 5, qty: 1 });
    expect(bought.status).toBe(201);
    expect(bought.body.trades).toEqual([expect.objectContaining({ kind: "bought", qty: 1, price: 5 })]);
    expect("counterparties" in bought.body).toBe(false);
    await live.until(() => live.notices.length === 2);
    expect(live.notices[1]).toEqual({ type: "changed" });
    live.socket.terminate();
  });

  it("closes the connection for a Tinker that does not exist", async () => {
    const socket = await app.injectWS("/live/999999");
    const code = await new Promise<number>((resolve) => socket.on("close", (closed: number) => resolve(closed)));
    expect(code).toBe(4404);
  });
});

describe("city chat", () => {
  let ada: number;
  let bram: number;
  let cog: number;

  it("sends a message to every open session and keeps it for those who join later", async () => {
    ada = await newTinker("chat-ada@example.com", "Ada");
    bram = await newTinker("chat-bram@example.com", "Bram");
    cog = await newTinker("chat-cog@example.com", "Cog");
    const listening = await listen(bram);
    const said = await call("POST", `/tinkers/${ada}/chat`, { text: "  Copper is up again.  " });
    expect(said.status).toBe(201);
    expect(said.body.message).toMatchObject({ text: "Copper is up again.", tinker: { id: ada, name: "Ada" } });
    expect("accountId" in said.body.message).toBe(false);
    await listening.until(() => listening.notices.some((notice) => notice.type === "chat"));
    const pushed = listening.notices.find((notice) => notice.type === "chat")!;
    expect(pushed.message).toMatchObject({ text: "Copper is up again.", tinker: { name: "Ada" } });
    expect("accountId" in pushed.message!).toBe(false);
    listening.socket.terminate();

    const history = await call("GET", `/tinkers/${cog}/chat`);
    expect(history.body.messages.map((message: { text: string }) => message.text)).toEqual(["Copper is up again."]);
  });

  it("allows one message every 3 seconds per account", async () => {
    expect((await call("POST", `/tinkers/${ada}/chat`, { text: "Twice." })).status).toBe(403);
    clock += 3_000;
    expect((await call("POST", `/tinkers/${ada}/chat`, { text: "Twice." })).status).toBe(201);
  });

  it("refuses blank messages and anything over 280 characters", async () => {
    clock += 3_000;
    expect((await call("POST", `/tinkers/${bram}/chat`, { text: "   " })).status).toBe(400);
    expect((await call("POST", `/tinkers/${bram}/chat`, { text: "x".repeat(281) })).status).toBe(400);
    expect((await call("POST", `/tinkers/${bram}/chat`, { text: "x".repeat(280) })).status).toBe(201);
  });

  it("hides a muted account from the muter only, live and in history, until unmuted", async () => {
    const live = await listen(cog);
    expect((await call("PUT", `/tinkers/${cog}/mutes/${ada}`)).body.muted).toEqual([ada]);
    clock += 3_000;
    await call("POST", `/tinkers/${ada}/chat`, { text: "Hidden from Cog." });
    await call("POST", `/tinkers/${bram}/chat`, { text: "Seen by Cog." });
    await live.until(() => live.notices.some((notice) => notice.message?.text === "Seen by Cog."));
    expect(live.notices.some((notice) => notice.message?.text === "Hidden from Cog.")).toBe(false);
    live.socket.terminate();

    const cogSees = (await call("GET", `/tinkers/${cog}/chat`)).body.messages.map((message: { text: string }) => message.text);
    expect(cogSees).not.toContain("Hidden from Cog.");
    const bramSees = (await call("GET", `/tinkers/${bram}/chat`)).body.messages.map((message: { text: string }) => message.text);
    expect(bramSees).toContain("Hidden from Cog.");

    const unmuted = await call("DELETE", `/tinkers/${cog}/mutes/${ada}`);
    expect(unmuted.body.muted).toEqual([]);
    expect(unmuted.body.messages.map((message: { text: string }) => message.text)).toContain("Hidden from Cog.");
  });

  it("refuses muting yourself", async () => {
    expect((await call("PUT", `/tinkers/${ada}/mutes/${ada}`)).status).toBe(400);
  });
});

describe("the other channels", () => {
  let ivy: number;
  let jun: number;
  let kit: number;

  it("keeps Trade and Help apart from the city", async () => {
    ivy = await newTinker("chan-ivy@example.com", "Ivy");
    jun = await newTinker("chan-jun@example.com", "Jun");
    kit = await newTinker("chan-kit@example.com", "Kit");
    clock += 3_000;
    expect((await call("POST", `/tinkers/${ivy}/chat`, { text: "Selling copper, 8 a piece.", channel: "trade" })).status).toBe(201);
    clock += 3_000;
    expect((await call("POST", `/tinkers/${ivy}/chat`, { text: "Where do I find coal?", channel: "help" })).status).toBe(201);
    const texts = async (query: string) =>
      (await call("GET", `/tinkers/${jun}/chat${query}`)).body.messages.map((message: { text: string }) => message.text);
    expect(await texts("?channel=trade")).toEqual(["Selling copper, 8 a piece."]);
    expect(await texts("?channel=help")).toEqual(["Where do I find coal?"]);
    expect(await texts("")).not.toContain("Selling copper, 8 a piece.");
  });

  it("whispers to one Tinker only, live, and keeps the conversation", async () => {
    const jl = await listen(jun);
    const kl = await listen(kit);
    clock += 3_000;
    const sent = await call("POST", `/tinkers/${ivy}/chat`, { text: "A word in private?", channel: "whisper", to: jun });
    expect(sent.status).toBe(201);
    await jl.until(() => jl.notices.some((notice) => notice.message?.text === "A word in private?"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(kl.notices.some((notice) => notice.message?.text === "A word in private?")).toBe(false);
    jl.socket.terminate();
    kl.socket.terminate();

    const thread = (await call("GET", `/tinkers/${jun}/chat?channel=whisper&with=${ivy}`)).body.messages;
    expect(thread.map((message: { text: string }) => message.text)).toEqual(["A word in private?"]);
    const inbox = (await call("GET", `/tinkers/${jun}/whispers`)).body.conversations;
    expect(inbox).toEqual([expect.objectContaining({ with: { id: ivy, name: "Ivy" }, last: expect.objectContaining({ text: "A word in private?" }) })]);
    expect((await call("GET", `/tinkers/${kit}/whispers`)).body.conversations).toEqual([]);
  });

  it("will not carry a whisper to someone who muted the sender, or to the sender's own account", async () => {
    await call("PUT", `/tinkers/${kit}/mutes/${ivy}`);
    clock += 3_000;
    const refused = await call("POST", `/tinkers/${ivy}/chat`, { text: "Hello?", channel: "whisper", to: kit });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe("your whisper cannot be delivered");
    const alt = (await call("POST", "/tinkers", { login: "chan-ivy@example.com", name: "Ivy Two" })).body.tinker.id;
    expect((await call("POST", `/tinkers/${ivy}/chat`, { text: "Me again", channel: "whisper", to: alt })).status).toBe(400);
    expect((await call("POST", `/tinkers/${ivy}/chat`, { text: "To nobody", channel: "whisper" })).status).toBe(400);
  });
});
