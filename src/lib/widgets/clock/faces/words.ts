/** The time in words, to the nearest five minutes below. Shared by the Words and Fuzzy faces. */

export const HOUR_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

/** How the minutes are said, for each five-minute step of the hour. */
const STEPS: { words: string[]; to: boolean }[] = [
  { words: [], to: false },
  { words: ['five', 'past'], to: false },
  { words: ['ten', 'past'], to: false },
  { words: ['a', 'quarter', 'past'], to: false },
  { words: ['twenty', 'past'], to: false },
  { words: ['twenty', 'five', 'past'], to: false },
  { words: ['half', 'past'], to: false },
  { words: ['twenty', 'five', 'to'], to: true },
  { words: ['twenty', 'to'], to: true },
  { words: ['a', 'quarter', 'to'], to: true },
  { words: ['ten', 'to'], to: true },
  { words: ['five', 'to'], to: true },
];

export interface Spoken {
  /** "twenty five past", or empty on the hour. */
  minutes: string[];
  /** The hour the phrase names (the next one after half past). */
  hour: string;
  /** On the hour: "o'clock". */
  oclock: boolean;
  /** Minutes past the five-minute step, 0 to 4. */
  extra: number;
}

export function speak(date: Date): Spoken {
  const step = Math.floor(date.getMinutes() / 5);
  const s = STEPS[step];
  return {
    minutes: s.words,
    hour: HOUR_WORDS[(date.getHours() + (s.to ? 1 : 0)) % 12],
    oclock: step === 0,
    extra: date.getMinutes() % 5,
  };
}

export function partOfDay(hour: number): string {
  if (hour < 5) return 'at night';
  if (hour < 12) return 'in the morning';
  if (hour < 17) return 'in the afternoon';
  if (hour < 21) return 'in the evening';
  return 'at night';
}
