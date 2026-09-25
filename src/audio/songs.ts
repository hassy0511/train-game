/**
 * Background music, written for this game (original; not based on any existing tune or station melody).
 * Notes: "C5:2" = pitch and length in steps, "-:2" = rest, "k"/"s"/"h" = kick, snare, hi-hat. "|" marks bars
 * for reading only. Every track of a song must add up to the same number of steps; the song loops.
 */
export type Voice = 'lead' | 'bass' | 'bell' | 'wood' | 'pad' | 'drums';

export interface Song {
  id: string;
  title: string;
  bpm: number;
  /** Steps per beat (2 = eighth notes; 3 = eighths in 6/8 with the dotted quarter as the beat). */
  stepsPerBeat: number;
  tracks: { voice: Voice; gain?: number; notes: string }[];
}

const repeat = (bar: string, times: number): string => Array.from({ length: times }, () => bar).join(' | ');

const F = 'F2:1 -:1 C3:1 -:1';
const C = 'C2:1 -:1 G2:1 -:1';
const Bb = 'Bb1:1 -:1 F2:1 -:1';

export const SONGS: Record<string, Song> = {
  // Title and map: a small music box waltz.
  title: {
    id: 'title',
    title: 'そらの ちず',
    bpm: 92,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'bell',
        notes:
          'E5:2 G5:2 C6:2 | B5:3 A5:1 G5:2 | A5:2 F5:2 A5:2 | G5:6 | E5:2 G5:2 C6:2 | D6:3 C6:1 B5:2 | A5:2 B5:2 D6:2 | C6:6',
      },
      {
        voice: 'bell',
        gain: 0.45,
        notes:
          'C4:2 E4:2 G4:2 | B3:2 D4:2 G4:2 | A3:2 C4:2 F4:2 | C4:2 E4:2 G4:2 | C4:2 E4:2 G4:2 | B3:2 D4:2 G4:2 | A3:2 D4:2 F4:2 | E4:2 G4:2 C5:2',
      },
      { voice: 'pad', gain: 0.8, notes: 'C3:6 | G2:6 | F2:6 | C3:6 | C3:6 | G2:6 | D3:3 G2:3 | C3:6' },
    ],
  },

  // 1-1 はじまりの まち: a cheerful little march.
  town: {
    id: 'town',
    title: 'まちの あさ',
    bpm: 116,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'lead',
        notes:
          'F4:1 A4:1 C5:2 | A4:1 C5:1 F5:2 | E5:1 D5:1 C5:1 A4:1 | G4:4 | G4:1 A4:1 Bb4:2 | D5:1 C5:1 Bb4:2 | A4:1 G4:1 A4:1 C5:1 | F4:4 | ' +
          'C5:1 C5:1 D5:1 C5:1 | A4:2 F4:2 | Bb4:1 Bb4:1 C5:1 Bb4:1 | G4:2 E4:2 | F4:1 A4:1 C5:1 F5:1 | E5:1 C5:1 D5:1 E5:1 | F5:2 C5:2 | F5:2 -:2',
      },
      { voice: 'bass', notes: [F, F, F, C, C, Bb, C, F, F, F, C, C, F, C, F, F].join(' | ') },
      { voice: 'drums', gain: 0.8, notes: `${repeat('k:1 h:1 s:1 h:1', 15)} | k:1 s:1 k:1 -:1` },
    ],
  },

  // 1-2 きょうりゅうの たに: easy-going and low, a wooden marimba.
  valley: {
    id: 'valley',
    title: 'シダの たに',
    bpm: 96,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'D4:2 F4:1 A4:1 G4:2 F4:2 | E4:2 C4:2 D4:4 | A4:2 C5:1 D5:1 C5:2 A4:2 | G4:3 A4:1 E4:4 | D4:2 F4:1 A4:1 B4:2 A4:2 | G4:2 E4:2 F4:2 G4:2 | A4:2 G4:1 F4:1 E4:2 C4:2 | D4:8',
      },
      { voice: 'bass', notes: 'D2:4 A2:4 | C2:4 G2:4 | F2:4 C3:4 | C2:4 G2:4 | D2:4 A2:4 | G2:4 D3:4 | A1:4 E2:4 | D2:8' },
      { voice: 'pad', gain: 0.6, notes: 'D3:8 | C3:8 | F3:8 | C3:8 | D3:8 | G3:8 | A2:8 | D3:8' },
      { voice: 'drums', gain: 0.6, notes: `${repeat('k:2 h:2 k:1 k:1 h:2', 7)} | k:2 h:2 k:4` },
    ],
  },

  // 2-1 おおきなきのくに: a bouncy waltz, marimba with a little flute answering.
  forest: {
    id: 'forest',
    title: 'おおきな き',
    bpm: 132,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'G4:2 B4:1 D5:1 B4:2 | C5:2 E5:2 C5:2 | B4:1 A4:1 G4:2 B4:2 | A4:6 | G4:2 B4:1 D5:1 G5:2 | F#5:2 E5:1 D5:1 E5:2 | D5:2 C5:1 B4:1 A4:2 | G4:6',
      },
      { voice: 'lead', gain: 0.6, notes: '-:6 | -:2 G5:2 E5:2 | -:6 | -:2 C5:2 D5:2 | -:6 | A5:2 G5:2 -:2 | F#5:2 E5:2 F#5:2 | G5:4 -:2' },
      {
        voice: 'bass',
        notes: 'G2:2 D3:2 B2:2 | C3:2 G2:2 E3:2 | G2:2 D3:2 B2:2 | D3:2 A2:2 F#2:2 | G2:2 D3:2 B2:2 | D3:2 A2:2 F#2:2 | A2:2 E3:2 D3:2 | G2:6',
      },
      { voice: 'drums', gain: 0.5, notes: `${repeat('k:2 h:2 h:2', 7)} | k:2 s:2 k:2` },
    ],
  },

  // 1-3 くものうえ: floating 6/8, high bells over a soft pad.
  sky: {
    id: 'sky',
    title: 'くもの うえ',
    bpm: 56,
    stepsPerBeat: 3,
    tracks: [
      {
        voice: 'bell',
        notes:
          'D5:3 G5:2 A5:1 | B5:4 A5:2 | G5:2 A5:1 B5:2 C#6:1 | D6:6 | E6:3 D6:2 B5:1 | A5:4 G5:2 | A5:2 B5:1 A5:2 F#5:1 | G5:6',
      },
      {
        voice: 'bell',
        gain: 0.35,
        notes: [
          'G4:1 B4:1 D5:1 B4:1 D5:1 B4:1',
          'E4:1 G4:1 B4:1 G4:1 B4:1 G4:1',
          'A4:1 C#5:1 E5:1 C#5:1 E5:1 C#5:1',
          'F#4:1 A4:1 D5:1 A4:1 D5:1 A4:1',
          'E4:1 G4:1 C5:1 G4:1 C5:1 G4:1',
          'F#4:1 A4:1 D5:1 A4:1 D5:1 A4:1',
          'F#4:1 A4:1 D5:1 A4:1 D5:1 A4:1',
          'G4:1 B4:1 D5:1 B4:1 D5:1 B4:1',
        ].join(' | '),
      },
      { voice: 'pad', gain: 0.8, notes: 'G3:6 | E3:6 | A3:6 | D3:6 | C3:6 | D3:6 | D3:6 | G3:6' },
      { voice: 'pad', gain: 0.6, notes: 'B3:6 | G3:6 | C#4:6 | F#3:6 | E3:6 | F#3:6 | A3:6 | D4:6' },
    ],
  },
};
