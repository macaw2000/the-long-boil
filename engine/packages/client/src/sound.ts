// The workshop's few sounds: the valve, a thing landing in the stores, a rat
// going down, a level gained, the brass tube; and since work order 044, a
// soft blow in a fight the player is watching, a telling blow, a rare find,
// and a first claimed. The valve and the tube are air
// and a rattle; nothing strikes anything (work order 041). Each is a moment worth hearing
// once, never a loop. They are made in the browser from tones and hiss, so
// there is nothing to fetch; a phone build without Web Audio stays silent.
// Off is remembered, and nothing plays while the tab is out of sight: a
// workshop left open in the background keeps quiet.

import { useEffect, useState } from "react";

export type Sound = "valve" | "clink" | "thud" | "level" | "tube" | "hit" | "crit" | "find" | "claim";

const SOUND_KEY = "long-boil.sound";

type Web = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext; document?: { visibilityState?: string } };
const web = globalThis as unknown as Web;

let context: AudioContext | null = null;

export function soundOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

function setSoundOn(on: boolean) {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // Without storage the switch lasts for this visit only.
  }
}

/** The switch on the bar: whether sound is on, and a way to flip it. */
export function useSound(): { available: boolean; on: boolean; toggle: () => void } {
  const [on, setOn] = useState(soundOn);
  const toggle = () => {
    setSoundOn(!on);
    setOn(!on);
    if (!on) play("clink");
  };
  return { available: Boolean(web.AudioContext ?? web.webkitAudioContext), on, toggle };
}

function audio(): AudioContext | null {
  const Maker = web.AudioContext ?? web.webkitAudioContext;
  if (!Maker) return null;
  try {
    context ??= new Maker();
    // A browser holds sound until the page is touched; every sound here follows a press or a look, so asking again is enough.
    if (context.state === "suspended") void context.resume().catch(() => undefined);
    return context;
  } catch {
    return null;
  }
}

/** One note: a pitch that may slide, fading out over its length. */
function tone(ctx: AudioContext, at: number, length: number, from: number, to: number, type: OscillatorType, loud: number) {
  const voice = ctx.createOscillator();
  const level = ctx.createGain();
  voice.type = type;
  voice.frequency.setValueAtTime(from, at);
  if (to !== from) voice.frequency.exponentialRampToValueAtTime(to, at + length);
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(loud, at + 0.008);
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  voice.connect(level).connect(ctx.destination);
  voice.start(at);
  voice.stop(at + length + 0.02);
}

/** A breath of hiss through a filter that may sweep: steam, or air in a pipe. */
function hiss(ctx: AudioContext, at: number, length: number, from: number, to: number, kind: BiquadFilterType, loud: number) {
  const frames = Math.ceil(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(from, at);
  if (to !== from) filter.frequency.exponentialRampToValueAtTime(to, at + length);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.0001, at);
  level.gain.exponentialRampToValueAtTime(loud, at + Math.min(0.05, length / 4));
  level.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(level).connect(ctx.destination);
  source.start(at);
  source.stop(at + length + 0.02);
}

const SOUNDS: Record<Sound, (ctx: AudioContext, at: number) => void> = {
  // The valve: steam, a rush of it and then a long breath. Only steam: nothing strikes anything.
  valve: (ctx, at) => {
    hiss(ctx, at, 0.5, 900, 2600, "bandpass", 0.14);
    hiss(ctx, at + 0.08, 1.4, 5200, 1400, "highpass", 0.16);
  },
  // Brass on brass: something lands in the stores.
  clink: (ctx, at) => {
    tone(ctx, at, 0.16, 2093, 2093, "triangle", 0.1);
    tone(ctx, at + 0.05, 0.2, 3136, 3136, "sine", 0.07);
  },
  // A rat goes down.
  thud: (ctx, at) => {
    tone(ctx, at, 0.16, 150, 58, "sine", 0.28);
    hiss(ctx, at, 0.07, 900, 900, "lowpass", 0.1);
  },
  // A level: four notes up.
  level: (ctx, at) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((pitch, index) => tone(ctx, at + index * 0.085, index === 3 ? 0.5 : 0.2, pitch, pitch, "triangle", 0.12));
  },
  // A blow, heard only while the fight is on screen: soft, short, and low, as it comes every second and a half.
  hit: (ctx, at) => {
    tone(ctx, at, 0.07, 220, 120, "sine", 0.06);
    hiss(ctx, at, 0.04, 1800, 1800, "bandpass", 0.03);
  },
  // A telling blow: the same, with weight and a ring.
  crit: (ctx, at) => {
    tone(ctx, at, 0.12, 260, 90, "sine", 0.16);
    tone(ctx, at + 0.02, 0.18, 1568, 1568, "triangle", 0.05);
  },
  // A rare find: a bright run up and a shimmer, unlike anything else here.
  find: (ctx, at) => {
    [783.99, 987.77, 1174.66, 1567.98, 1975.53].forEach((pitch, index) => tone(ctx, at + index * 0.06, index === 4 ? 0.7 : 0.18, pitch, pitch, "triangle", 0.1));
    hiss(ctx, at + 0.25, 0.6, 6000, 9000, "highpass", 0.04);
  },
  // A first claimed: coins into a till.
  claim: (ctx, at) => {
    [0, 0.07, 0.15].forEach((after, index) => tone(ctx, at + after, 0.14, 2349 - index * 180, 2349 - index * 180, "triangle", 0.08));
  },
  // The Pneumatic Post: air down the tube, and the brass rattles as it arrives.
  tube: (ctx, at) => {
    hiss(ctx, at, 0.42, 380, 2600, "bandpass", 0.2);
    // Uneven and unpitched in effect: a rattle, never a run of notes.
    [[0, 1310], [0.05, 1240], [0.1, 1335], [0.16, 1265]].forEach(([after, pitch]) => tone(ctx, at + 0.38 + after!, 0.05, pitch!, pitch!, "triangle", 0.05));
  },
};

export function play(sound: Sound): void {
  if (!soundOn() || web.document?.visibilityState === "hidden") return;
  const ctx = audio();
  if (!ctx) return;
  try {
    SOUNDS[sound](ctx, ctx.currentTime + 0.01);
  } catch {
    // A sound that cannot play is not worth an error on the screen.
  }
}

// The workshop's breath (work order 044): a low bed of steam under everything,
// so No. 9 never sits in silence. One quiet loop made in the browser, faded in
// and out; it follows the sound switch, and stops while the tab is out of sight.
const AMBIENT_LOUD = 0.018;
let ambient: { source: AudioBufferSourceNode; level: GainNode } | null = null;

function startAmbient() {
  if (ambient || !soundOn() || web.document?.visibilityState === "hidden") return;
  const ctx = audio();
  if (!ctx) return;
  try {
    const length = 4;
    const frames = Math.ceil(ctx.sampleRate * length);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Brown noise, smoothed, with a slow swell: steam in a pipe, and the odd tick of something cooling.
    let last = 0;
    for (let i = 0; i < frames; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      const swell = 0.75 + 0.25 * Math.sin((2 * Math.PI * i) / frames);
      data[i] = last * 3.2 * swell;
    }
    for (const at of [0.9, 2.6]) {
      const start = Math.floor(at * ctx.sampleRate);
      for (let i = 0; i < 400; i++) data[start + i]! += Math.sin(i * 0.9) * Math.exp(-i / 60) * 0.25;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, ctx.currentTime);
    level.gain.exponentialRampToValueAtTime(AMBIENT_LOUD, ctx.currentTime + 2);
    source.connect(filter).connect(level).connect(ctx.destination);
    source.start();
    ambient = { source, level };
  } catch {
    ambient = null;
  }
}

function stopAmbient() {
  if (!ambient || !context) return;
  const { source, level } = ambient;
  ambient = null;
  try {
    level.gain.setValueAtTime(Math.max(0.0001, level.gain.value), context.currentTime);
    level.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    source.stop(context.currentTime + 0.7);
  } catch {
    // Already stopped.
  }
}

/** Keeps the workshop's breath going while the workshop is open and sound is on. */
export function useAmbient(on: boolean): void {
  useEffect(() => {
    const doc = (globalThis as unknown as { document?: { visibilityState?: string; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } }).document;
    const follow = () => (on && doc?.visibilityState !== "hidden" ? startAmbient() : stopAmbient());
    follow();
    doc?.addEventListener?.("visibilitychange", follow);
    // A browser holds sound until the page is touched: try again at the first press.
    doc?.addEventListener?.("pointerdown", follow);
    return () => {
      doc?.removeEventListener?.("visibilitychange", follow);
      doc?.removeEventListener?.("pointerdown", follow);
      stopAmbient();
    };
  }, [on]);
}
