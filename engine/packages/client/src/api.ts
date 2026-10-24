// The server's HTTP API, as the client sees it. The shapes mirror
// packages/server/src/tinkers.ts and packages/rules/src/ledger.ts.

const BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000";

/** How far a dev server's clock runs ahead of this one; 0 everywhere else. */
let clockOffset = 0;

/** The game's time: the wall clock, plus any dev skip the server has applied. */
export function gameNow(): number {
  return Date.now() + clockOffset;
}

export function setClockOffset(offsetMs: number): void {
  clockOffset = offsetMs;
}

export interface ItemStack {
  item: string;
  qty: number;
}

export interface Action {
  id: string;
  skill: string;
  level_required: number;
  seconds: number;
  xp: number;
  inputs: ItemStack[];
  outputs: ItemStack[];
}

export interface Monster {
  id: string;
  name: string;
  flavour: string;
  level: number;
  boss: boolean;
  weakness: string;
  seconds_per_kill: number;
  hp: number;
}

export interface Weapon {
  item: string;
  style: string;
  level_required: number;
  power: number;
  accuracy: number;
}

export interface Item {
  id: string;
  name: string;
  flavour: string;
}

export interface ItemTerms {
  bound: boolean;
  collectorPrice: number | null;
  collectorWeeklyCap: number | null;
  grocerPrice: number | null;
}

export interface Content {
  version: string;
  guide: { id: string; speaker: string; line: string; button?: string }[];
  /** Present only on a dev server, which can skip time forward. */
  dev: { offsetMs: number } | null;
  economy: Record<string, ItemTerms>;
  actions: Action[];
  monsters: Monster[];
  weapons: Weapon[];
  items: Item[];
  totalXp: number[];
}

export interface QueueEntry {
  actionId: string;
  remaining: number;
}

export interface Tinker {
  id: number;
  name: string;
  crowns: number;
  inventory: { item: string; qty: number; bound: boolean }[];
  skills: { skill: string; xp: number; level: number }[];
  queue: QueueEntry[];
  progressMs: number;
  steamUntil: string;
  resolvedTo: string;
  weapon: string | null;
  bossesBeaten: string[];
  story: {
    nerve: number;
    nerveCap: number;
    nextNerveAt: string | null;
    needles: Record<string, number>;
    letters: number;
    backRent: number;
    debts: { id: string; label: string; crowns: number }[];
    openScenes: number;
    qualities: Record<string, number>;
    inInfirmary: boolean;
  };
}

export interface LedgerLine {
  id: string;
  count: number;
  won: number;
  xp: Record<string, number>;
  crowns: number;
  consumed: Record<string, number>;
  produced: Record<string, number>;
}

export interface Ledger {
  from: number | null;
  to: number | null;
  lines: LedgerLine[];
  crowns: number;
  levelUps: { skill: string; level: number }[];
  stalls: { actionId: string; reason: string }[];
  boilerDryAt: number | null;
}

export type TradeNote =
  | { kind: "bought" | "sold"; item: string; qty: number; price: number; tax: number; at: number }
  | { kind: "expired"; side: "buy" | "sell"; item: string; qty: number; price: number; at: number };

export interface Outcome {
  tinker: Tinker;
  ledger: Ledger;
  trades: TradeNote[];
}

export type Side = "buy" | "sell";

export interface OptionView {
  label: string;
  available: boolean;
  locked: [string, string, number][];
  challenge: { quality: string; level: number; difficulty: number; odds: number } | null;
}

export interface SceneView {
  id: string;
  kind: "storylet" | "letter";
  act: number;
  location: string;
  description: string;
  nerve: number;
  sender: string | null;
  options: OptionView[];
}

export interface StoryView {
  nerve: number;
  nerveCap: number;
  nextNerveAt: string | null;
  needles: Record<string, number>;
  qualities: Record<string, number>;
  letters: SceneView[];
  storylets: SceneView[];
  upcoming: { id: string; location: string; needs: [string, string, number][] }[];
  cooling: { id: string; location: string; opensAt: string }[];
  backRent: number;
  debts: { id: string; label: string; crowns: number }[];
  inInfirmary: boolean;
}

export type FightOutlook =
  | { monsterId: string; ready: false; reason: "no_weapon" | "level" | "cannot_win" }
  | { monsterId: string; ready: true; seconds: number; winChance: number | null; rations: number };

export interface StoryOutcome extends Outcome {
  view: StoryView;
  played: { scene: string; success: boolean; text: string; odds: number | null; roll: number | null } | null;
}

export interface MarketView {
  canTrade: boolean;
  refusal: string | null;
  totalLevel: number;
  orders: { id: number; item: string; side: Side; price: number; qtyTotal: number; qtyOpen: number; expiresAt: string }[];
  collectorLeft: Record<string, number>;
  weekEnds: string;
}

export interface BookLevel {
  price: number;
  qty: number;
  orders: number;
}

export interface ChatMessage {
  id: number;
  channel: string;
  tinker: { id: number; name: string };
  text: string;
  at: string;
}

export interface ChatView {
  messages: ChatMessage[];
  /** Tinkers whose accounts this account has muted. */
  muted: number[];
}

/** What the live connection pushes (packages/server/src/live.ts). */
export type Notice = { type: "changed" } | { type: "mutes" } | { type: "chat"; message: ChatMessage };

/** The live connection's address, on the same server as the HTTP API. */
export function liveUrl(tinkerId: number): string {
  return `${BASE.replace(/^http/, "ws")}/live/${tinkerId}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `${method} ${path} failed with ${response.status}`);
  return json as T;
}

export const api = {
  content: () => request<Content>("GET", "/content"),
  listTinkers: (login: string) =>
    request<{ tinkers: { id: number; name: string }[] }>("GET", `/accounts/${encodeURIComponent(login)}/tinkers`),
  createTinker: (login: string, name: string) => request<Outcome>("POST", "/tinkers", { login, name }),
  checkIn: (id: number) => request<Outcome>("POST", `/tinkers/${id}/check-in`),
  look: (id: number) => request<Outcome>("GET", `/tinkers/${id}`),
  setQueue: (id: number, queue: QueueEntry[]) => request<Outcome>("PUT", `/tinkers/${id}/queue`, { queue }),
  equip: (id: number, item: string) => request<Outcome>("PUT", `/tinkers/${id}/weapon`, { item }),
  market: (id: number) => request<MarketView>("GET", `/tinkers/${id}/market`),
  book: (item: string) => request<{ item: string; bids: BookLevel[]; asks: BookLevel[] }>("GET", `/exchange/${encodeURIComponent(item)}`),
  sellToCollector: (id: number, item: string, qty: number) => request<Outcome>("POST", `/tinkers/${id}/collector`, { item, qty }),
  buyFromGrocer: (id: number, item: string, qty: number) => request<Outcome>("POST", `/tinkers/${id}/grocer`, { item, qty }),
  placeOrder: (id: number, order: { item: string; side: Side; price: number; qty: number }) =>
    request<Outcome>("POST", `/tinkers/${id}/orders`, order),
  cancelOrder: (id: number, orderId: number) => request<Outcome>("DELETE", `/tinkers/${id}/orders/${orderId}`),
  devSkip: (hours: number) => request<{ offsetMs: number; now: string }>("POST", "/dev/skip", { hours }),
  fights: (id: number) => request<{ fights: FightOutlook[] }>("GET", `/tinkers/${id}/fights`),
  story: (id: number) => request<StoryOutcome>("GET", `/tinkers/${id}/story`),
  play: (id: number, kind: "storylet" | "letter", scene: string, option: number) =>
    request<StoryOutcome>("POST", `/tinkers/${id}/story`, { kind, scene, option }),
  discard: (id: number, letter: string) => request<StoryOutcome>("DELETE", `/tinkers/${id}/letters/${encodeURIComponent(letter)}`),
  payDebt: (id: number, debt: string) => request<StoryOutcome>("POST", `/tinkers/${id}/debts/${encodeURIComponent(debt)}`),
  chat: (id: number) => request<ChatView>("GET", `/tinkers/${id}/chat`),
  say: (id: number, text: string) => request<{ message: ChatMessage }>("POST", `/tinkers/${id}/chat`, { text }),
  mute: (id: number, other: number) => request<ChatView>("PUT", `/tinkers/${id}/mutes/${other}`),
  unmute: (id: number, other: number) => request<ChatView>("DELETE", `/tinkers/${id}/mutes/${other}`),
};
