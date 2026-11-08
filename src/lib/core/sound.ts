import { persisted } from './storage';
import { get } from 'svelte/store';

/** Global mute switch, toggled with the `sound` command. */
export const soundEnabled = persisted<boolean>('sound:enabled', true);

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Play one synthesized tone. Silently does nothing when muted or unsupported. */
export function tone(freq: number, durationMs = 90, type: OscillatorType = 'square', volume = 0.05, delayMs = 0) {
  if (!get(soundEnabled)) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

export type Sfx = 'blip' | 'score' | 'hit' | 'win' | 'lose' | 'chime' | 'key';

/** Small library of retro sound effects. */
export function sfx(kind: Sfx) {
  switch (kind) {
    case 'key':
      return tone(1200, 18, 'square', 0.012);
    case 'blip':
      return tone(660, 50, 'square', 0.035);
    case 'score':
      tone(880, 70, 'square', 0.04);
      return tone(1320, 90, 'square', 0.04, 70);
    case 'hit':
      return tone(140, 120, 'sawtooth', 0.05);
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 120, 'square', 0.04, i * 110));
      return;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 180, 'triangle', 0.06, i * 170));
      return;
    case 'chime':
      [880, 1175, 1568].forEach((f, i) => tone(f, 380, 'sine', 0.08, i * 220));
      return;
  }
}
