// Build plan milestones 7 and 8: pushing to open sessions. Every push goes
// through a Broadcast, so one local server fans out in-process now and
// several servers share Valkey pub/sub later (GDD section 11), with no change
// to the code that publishes.

export type Notice =
  /** Something about this Tinker changed on the server; look again. */
  | { type: "changed" }
  /** This Tinker's account muted or unmuted someone; reload the mute list. */
  | { type: "mutes" }
  /** This Tinker's guild changed (joined, left, a request, a pledge); look again and follow its chat. */
  | { type: "guild" }
  | { type: "chat"; message: ChatMessage & { accountId: number } };

export interface ChatMessage {
  id: number;
  channel: string;
  tinker: { id: number; name: string };
  text: string;
  at: string;
}

export interface Broadcast {
  publish(channel: string, notice: Notice): void;
  /** Returns a function that stops the subscription. */
  subscribe(channel: string, listener: (notice: Notice) => void): () => void;
}

export const CITY = "chat:city";
/** Buying and selling, so it does not crowd the city channel. */
export const TRADE = "chat:trade";
/** Questions from new Tinkers and answers from anyone. */
export const HELP = "chat:help";
/** The channels every Tinker reads. */
export const PUBLIC_CHANNELS = { city: CITY, trade: TRADE, help: HELP } as const;

/** A private conversation between two Tinkers, the same whichever of them names it. */
export function whisperChannel(a: number, b: number): string {
  return `chat:dm:${Math.min(a, b)}:${Math.max(a, b)}`;
}

export function tinkerChannel(tinkerId: number): string {
  return `tinker:${tinkerId}`;
}

/** Fan-out inside one server process. */
export function localBroadcast(): Broadcast {
  const listeners = new Map<string, Set<(notice: Notice) => void>>();
  return {
    publish(channel, notice) {
      for (const listener of listeners.get(channel) ?? []) listener(notice);
    },
    subscribe(channel, listener) {
      const set = listeners.get(channel) ?? new Set();
      set.add(listener);
      listeners.set(channel, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(channel);
      };
    },
  };
}
