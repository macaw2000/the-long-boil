// The live connection (build plan milestone 7): one WebSocket per open
// workshop, which the server uses to say a Tinker changed and to carry city
// chat. It reconnects on its own, waiting a little longer after each failure.

import { useEffect, useRef, useState } from "react";
import { liveUrl, type Notice } from "./api";

const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 30_000;

/** Calls onNotice for every push; returns whether the connection is up. */
export function useLive(tinkerId: number, onNotice: (notice: Notice) => void): boolean {
  const [connected, setConnected] = useState(false);
  const handler = useRef(onNotice);
  handler.current = onNotice;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wait = FIRST_RETRY_MS;
    let stopped = false;

    const open = () => {
      socket = new WebSocket(liveUrl(tinkerId));
      socket.onopen = () => {
        wait = FIRST_RETRY_MS;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          handler.current(JSON.parse(String(event.data)) as Notice);
        } catch {
          // A notice this client does not understand is skipped.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (stopped) return;
        retry = setTimeout(open, wait);
        wait = Math.min(wait * 2, LAST_RETRY_MS);
      };
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [tinkerId]);

  return connected;
}
