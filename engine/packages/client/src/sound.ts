// The workshop's few sounds: the valve, a thing landing in the stores, a rat
// going down, a level gained, the brass tube. Each is a moment worth hearing
// once, never a loop. They are made in the browser from tones and hiss, so
// there is nothing to fetch; a phone build without Web Audio stays silent.
// Off is remembered, and nothing plays while the tab is out of sight: a
// workshop left open in the background keeps quiet.

import { useState } from "react";

export type Sound = "valve" | "clink" | "thud" | "level" | "tube";

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
  // The valve: a knock in the pipes, then a long breath of steam.
  valve: (ctx, at) => {
    tone(ctx, at, 0.22, 110, 55, "sine", 0.3);
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
  // The Pneumatic Post: air down the pipe, and the canister knocks home.
  tube: (ctx, at) => {
    hiss(ctx, at, 0.42, 380, 2600, "bandpass", 0.2);
    tone(ctx, at + 0.4, 0.2, 130, 70, "sine", 0.3);
    tone(ctx, at + 0.41, 0.09, 1250, 1250, "triangle", 0.05);
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
