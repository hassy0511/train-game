/**
 * Background music, written for this game (original; not based on any existing tune or station melody).
 * Notes: "C5:2" = pitch and length in steps, "-:2" = rest, "k"/"s"/"h" = kick, snare, hi-hat. "|" marks bars
 * for reading only. Every track of a song must add up to the same number of steps; the song loops (unless `loop` is false).
 */
export type Voice = 'lead' | 'bass' | 'bell' | 'wood' | 'pad' | 'drums';

export interface Song {
  id: string;
  title: string;
  bpm: number;
  /** Steps per beat (2 = eighth notes; 3 = eighths in 6/8 with the dotted quarter as the beat). */
  stepsPerBeat: number;
  /** `false`: the song plays once and stops at its end (the world ending). Left out, the song repeats. */
  loop?: boolean;
  tracks: { voice: Voice; gain?: number; notes: string }[];
}

const repeat = (bar: string, times: number): string => Array.from({ length: times }, () => bar).join(' | ');
/** v1.11 (5-3): the half as written, then the same notes backwards (the mirror song "kagami"). */
const mirrored = (half: string): string => {
  const notes = half.split(/\s+/).filter((t) => t && t !== '|');
  return `${half} | ${notes.slice().reverse().join(' ')}`;
};

const F = 'F2:1 -:1 C3:1 -:1';
const C = 'C2:1 -:1 G2:1 -:1';
const Bb = 'Bb1:1 -:1 F2:1 -:1';

// 2-3 volcano: the melody (marimba and bell together) and the tuba-ish bass bars ("2" = with an octave hop).
const VOLCANO_MELODY =
  'F4:1 A4:1 C5:2 A4:1 C5:1 F5:2 | D5:2 F5:1 D5:1 Bb4:2 -:2 | G4:1 C5:1 E5:2 G5:1 E5:1 C5:2 | A4:3 C5:1 F5:2 -:2 | ' +
  'A4:1 D5:1 F5:2 A5:1 F5:1 D5:2 | Bb4:1 D5:1 F5:2 Bb5:2 A5:1 G5:1 | G5:2 E5:1 C5:1 D5:1 E5:1 G5:2 | F5:4 -:2 C5:1 E5:1 | ' +
  'D5:1 F5:1 Bb5:2 -:2 A5:1 Bb5:1 | C6:2 A5:2 -:4 | E5:1 G5:1 C6:2 -:2 Bb5:1 A5:1 | A5:2 F5:2 -:4 | ' +
  'D5:1 F5:1 Bb5:1 D5:1 F5:1 Bb5:1 D6:2 | C6:1 A5:1 F5:1 D5:1 E5:1 F5:1 A5:2 | G5:2 C6:2 Bb5:1 G5:1 E5:1 C5:1 | F5:2 C5:1 A4:1 F4:2 -:2';
const VF = 'F2:2 -:2 C2:2 -:2';
const VF2 = 'F2:2 -:2 F3:1 -:1 C3:1 -:1';
const VBb = 'Bb1:2 -:2 F2:2 -:2';
const VBb2 = 'Bb1:2 -:2 Bb2:1 -:1 F2:1 -:1';
const VC = 'C2:2 -:2 G2:2 -:2';
const VC2 = 'C2:2 -:2 C3:1 -:1 G2:1 -:1';
const VDm = 'D2:2 -:2 A2:2 -:2';
const VDRUM = 'k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1';
/** A bar whose second half goes quiet so the "ぽふっ" is heard alone. */
const VDRUM_HOLE = 'k:1 h:1 s:1 h:1 -:4';

// hurry: one bar of eighth-note bass per chord (root, then the fifth below).
const HC = 'C3:1 C3:1 C3:1 C3:1 G2:1 G2:1 C3:1 G2:1';
const HG = 'G2:1 G2:1 G2:1 G2:1 D2:1 D2:1 G2:1 D2:1';
const HAm = 'A2:1 A2:1 A2:1 A2:1 E2:1 E2:1 A2:1 E2:1';
const HF = 'F2:1 F2:1 F2:1 F2:1 C2:1 C2:1 F2:1 C2:1';

// ---- chapters 3 and 4 ----------------------------------------------------------------------------------------

// 3-2 kawa: rolling sixteenth-note marimba arpeggios (the stream), one bar per chord: up five notes and back.
const KW = (a: string, b: string, c: string, d: string, e: string): string => `${a}:1 ${b}:1 ${c}:1 ${d}:1 ${e}:1 ${d}:1 ${c}:1 ${b}:1`;
const KW_D = KW('A3', 'D4', 'F#4', 'A4', 'D5');
const KW_G = KW('B3', 'D4', 'G4', 'B4', 'D5');
const KW_A = KW('A3', 'C#4', 'E4', 'A4', 'C#5');
const KW_Bm = KW('B3', 'D4', 'F#4', 'B4', 'D5');
const KW_Fsm = KW('A3', 'C#4', 'F#4', 'A4', 'C#5');
const KW_EmA = 'B3:1 E4:1 G4:1 B4:1 A4:1 E4:1 C#4:1 A3:1';

// 4-1 koori: the pad's "ちゃっ ちゃっ" on beats 2 and 3 of a waltz bar.
const KO = (note: string): string => `-:2 ${note}:1 -:1 ${note}:1 -:1`;

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

  // 2-2 むしのはらっぱ: a hopping 2/4, marimba leaping in fourths (grasshoppers), a bell sparkle every four
  // bars (butterflies) that turns into a little answering line in the B part.
  meadow: {
    id: 'meadow',
    title: 'はらっぱ ぴょこぴょこ',
    bpm: 126,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'G4:1 -:1 B4:1 -:1 | D5:1 G5:1 D5:2 | E5:1 -:1 C5:1 -:1 | D5:4 | G4:1 -:1 B4:1 -:1 | D5:1 G5:1 A5:1 G5:1 | F#5:1 D5:1 E5:1 F#5:1 | G5:4 | ' +
          'C5:1 E5:1 G5:2 | E5:1 C5:1 D5:2 | B4:1 D5:1 G5:2 | D5:1 B4:1 C5:2 | A4:1 C5:1 E5:1 G5:1 | F#5:1 A5:1 G5:1 F#5:1 | E5:1 D5:1 C5:1 A4:1 | G4:2 -:2',
      },
      {
        voice: 'bell',
        gain: 0.6,
        notes:
          '-:4 | -:4 | -:4 | -:2 B5:1 D6:1 | -:4 | -:4 | -:4 | -:2 D6:1 G6:1 | ' +
          'G6:2 -:2 | -:4 | D6:2 -:2 | -:4 | E6:2 -:2 | -:4 | C6:1 B5:1 A5:1 -:1 | G5:2 -:2',
      },
      {
        voice: 'bass',
        notes:
          'G2:1 -:1 D3:1 -:1 | G2:1 -:1 D3:1 -:1 | C3:1 -:1 G2:1 -:1 | D3:1 -:1 A2:1 -:1 | G2:1 -:1 D3:1 -:1 | G2:1 -:1 D3:1 -:1 | D3:1 -:1 A2:1 -:1 | G2:1 -:1 D3:1 -:1 | ' +
          'C3:1 -:1 G2:1 -:1 | C3:1 -:1 G2:1 -:1 | G2:1 -:1 D3:1 -:1 | G2:1 -:1 D3:1 -:1 | A2:1 -:1 E3:1 -:1 | D3:1 -:1 A2:1 -:1 | C3:1 -:1 D3:1 -:1 | G2:2 -:2',
      },
      { voice: 'drums', gain: 0.45, notes: `${repeat('k:1 h:1 s:1 h:1', 15)} | k:1 -:1 k:1 -:1` },
    ],
  },

  // 2-3 かざんのしま: a bright island tune in F, a bouncy 4/4 with the lift on 2 and 4. Marimba and bell play the
  // melody together (a steel-drum-like shimmer). A (bars 1-8) climbs; B (9-16) leaves little holes that a low
  // wooden "ぽふっ" fills, like the volcano's smoke rings. Tuba-ish bass on beats 1 and 3; a thin pad in B only.
  volcano: {
    id: 'volcano',
    title: 'かざんの しま',
    bpm: 120,
    stepsPerBeat: 2,
    tracks: [
      { voice: 'wood', notes: VOLCANO_MELODY },
      { voice: 'bell', gain: 0.5, notes: VOLCANO_MELODY },
      {
        voice: 'bass',
        notes: [
          ...[VF, VBb2, VC, VF2, VDm, VBb, VC2, VF],
          ...[VBb, VF2, VC, VF2, VBb2, VDm, VC2, VF],
        ].join(' | '),
      },
      { voice: 'pad', gain: 0.55, notes: `${repeat('-:8', 8)} | F3:8 | A3:8 | G3:8 | A3:8 | F3:8 | A3:8 | G3:8 | A3:8` },
      { voice: 'pad', gain: 0.45, notes: `${repeat('-:8', 8)} | D4:8 | C4:8 | E4:8 | C4:8 | D4:8 | D4:8 | E4:8 | C4:8` },
      // The tom-like "ぽこ" every two bars, and in B the "ぽふっ" in the melody's holes.
      {
        voice: 'wood',
        gain: 0.8,
        notes:
          `${repeat('-:8 | -:6 C4:1 F3:1', 4)} | ` +
          '-:8 | -:4 F3:2 -:2 | -:8 | -:4 F3:2 -:2 | -:8 | -:6 C4:1 F3:1 | -:8 | -:6 C4:1 F3:1',
      },
      {
        voice: 'drums',
        gain: 0.45,
        notes: `${repeat(VDRUM, 9)} | ${VDRUM_HOLE} | ${VDRUM} | ${VDRUM_HOLE} | ${repeat(VDRUM, 3)} | k:1 h:1 s:1 h:1 k:1 -:1 -:2`,
      },
    ],
  },

  // The countdown (2-3 M3, later 3-3's race): a quick, cheerful 8-bar loop in C (C-G-Am-F twice). The marimba
  // runs in eighths, the bass ticks in eighths, the drums never stop, and a bell "ちゃらん" every two bars.
  // Major and bouncy on purpose: no alarm or siren sound.
  hurry: {
    id: 'hurry',
    title: 'いそげ！',
    bpm: 150,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'E5:1 G5:1 C6:1 G5:1 E5:1 G5:1 C6:1 D6:1 | B5:1 G5:1 D5:1 G5:1 B5:1 D6:1 B5:1 G5:1 | ' +
          'A5:1 E5:1 C5:1 E5:1 A5:1 C6:1 B5:1 A5:1 | G5:1 F5:1 C5:1 F5:1 A5:1 G5:1 F5:1 E5:1 | ' +
          'E5:1 G5:1 C6:1 G5:1 E6:1 D6:1 C6:1 G5:1 | D6:1 B5:1 G5:1 B5:1 D6:1 E6:1 D6:1 B5:1 | ' +
          'C6:1 A5:1 E5:1 A5:1 C6:1 E6:1 D6:1 C6:1 | A5:1 F5:1 C5:1 F5:1 A5:1 C6:1 B5:1 G5:1',
      },
      { voice: 'bell', gain: 0.5, notes: 'C6:1 G6:3 -:4 | -:8 | C6:1 E6:3 -:4 | -:8 | C6:1 G6:3 -:4 | -:8 | C6:1 E6:3 -:4 | -:8' },
      { voice: 'bass', notes: repeat([HC, HG, HAm, HF].join(' | '), 2) },
      { voice: 'drums', gain: 0.5, notes: repeat('k:1 h:1 s:1 h:1 k:1 h:1 s:1 h:1', 8) },
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

  // 3-1 うみのそこ: a slow, floating 6/8 in E♭. A music-box bell sings long arcs; little marimba arpeggios rise on
  // beat 2 like bubbles; a warm pad; the bass only touches beat 1. In B (bars 9-16) the bass sings a slow low line
  // (a whale far off) and the bell answers it high up. No drums, no steel-drum or calypso colour, and no two-note
  // "danger" figure in the bass.
  umi: {
    id: 'umi',
    title: 'うみの そこの さんぽ',
    bpm: 66,
    stepsPerBeat: 3,
    tracks: [
      {
        voice: 'bell',
        notes:
          'Eb5:2 F5:1 G5:3 | Ab5:2 G5:1 Eb5:3 | Bb4:2 C5:1 Eb5:2 G5:1 | F5:6 | G5:2 Ab5:1 G5:2 Eb5:1 | C5:3 Eb5:2 C5:1 | Ab4:3 D5:3 | Eb5:6 | ' +
          '-:3 Eb6:2 C6:1 | Bb5:3 -:3 | -:3 F5:2 Ab5:1 | F5:3 D5:3 | -:3 C6:2 Ab5:1 | G5:2 Ab5:1 Bb5:3 | Ab5:2 G5:1 F5:2 D5:1 | Eb5:6',
      },
      // Bubbles: three quick notes going up on beat 2, while the bell holds.
      {
        voice: 'wood',
        gain: 0.35,
        notes:
          '-:3 G5:1 Bb5:1 Eb6:1 | -:3 Ab5:1 C6:1 Eb6:1 | -:6 | -:3 F5:1 Bb5:1 D6:1 | -:3 G5:1 C6:1 Eb6:1 | -:6 | -:6 | -:3 G5:1 Bb5:1 Eb6:1 | ' +
          '-:6 | -:3 G5:1 Bb5:1 Eb6:1 | -:6 | -:3 F5:1 Bb5:1 D6:1 | -:6 | -:6 | -:6 | -:3 Bb5:1 Eb6:1 G6:1',
      },
      {
        voice: 'bass',
        gain: 0.8,
        notes:
          'Eb2:3 -:3 | Ab2:3 -:3 | Eb2:3 -:3 | Bb1:3 -:3 | C2:3 -:3 | Ab1:3 -:3 | F2:3 Bb1:3 | Eb2:3 -:3 | ' +
          'Ab2:3 C3:2 Eb3:1 | G2:6 | F2:3 Ab2:2 C3:1 | Bb2:3 D3:3 | Ab2:3 C3:3 | G2:2 Bb2:1 Eb3:3 | F2:3 Bb1:3 | Eb2:6',
      },
      {
        voice: 'pad',
        gain: 0.7,
        notes: 'Eb3:6 | Ab3:6 | Eb3:6 | D3:6 | Eb3:6 | Ab3:6 | F3:6 | Eb3:6 | Ab3:6 | G3:6 | F3:6 | F3:6 | Ab3:6 | G3:6 | Ab3:3 F3:3 | G3:6',
      },
      {
        voice: 'pad',
        gain: 0.55,
        notes: 'G3:6 | C4:6 | Bb3:6 | F3:6 | G3:6 | C4:6 | Ab3:3 D4:3 | Bb3:6 | C4:6 | Bb3:6 | Ab3:6 | D4:6 | C4:6 | Bb3:6 | C4:3 D4:3 | Bb3:6',
      },
    ],
  },

  // 3-2 たきのかわ: a bright 2/4 in D that keeps going up. The marimba rolls in sixteenths all the way (the stream);
  // the bell jumps up fourths and fifths (fish leaping). In B (bars 9-16, the waterfall) a pad swells and the bell
  // draws long arcs (a rainbow). Bass short on both beats; a soft kick on 1 and quiet eighth hi-hats.
  kawa: {
    id: 'kawa',
    title: 'かわの さかのぼり',
    bpm: 112,
    stepsPerBeat: 4,
    tracks: [
      {
        voice: 'bell',
        notes:
          'A4:2 D5:2 A5:3 -:1 | G5:1 F#5:1 E5:2 D5:2 B4:2 | A4:2 D5:2 F#5:2 A5:2 | G5:2 F#5:2 E5:4 | ' +
          'F#5:2 B5:2 -:1 F#5:1 B5:2 | A5:1 G5:1 F#5:2 E5:2 D5:2 | E5:2 B5:2 A5:2 C#5:2 | D5:4 -:4 | ' +
          'G5:4 B5:4 | C#6:4 E6:4 | C#6:4 A5:4 | F#5:8 | G5:4 B5:4 | D6:4 C#6:2 B5:2 | B5:2 E5:2 G5:2 C#6:2 | D6:4 A5:4',
      },
      {
        voice: 'wood',
        gain: 0.28,
        notes: [KW_D, KW_G, KW_D, KW_A, KW_Bm, KW_G, KW_EmA, KW_D, KW_G, KW_A, KW_Fsm, KW_Bm, KW_G, KW_A, KW_EmA, KW_D].join(' | '),
      },
      {
        voice: 'bass',
        gain: 0.85,
        notes:
          'D2:1 -:3 A2:1 -:3 | G2:1 -:3 D2:1 -:3 | D2:1 -:3 A2:1 -:3 | A1:1 -:3 E2:1 -:3 | B1:1 -:3 F#2:1 -:3 | G2:1 -:3 D2:1 -:3 | E2:1 -:3 A1:1 -:3 | D2:1 -:3 A1:1 -:3 | ' +
          'G2:1 -:3 D2:1 -:3 | A1:1 -:3 E2:1 -:3 | F#2:1 -:3 C#2:1 -:3 | B1:1 -:3 F#2:1 -:3 | G2:1 -:3 D2:1 -:3 | A1:1 -:3 E2:1 -:3 | E2:1 -:3 A1:1 -:3 | D2:1 -:3 A1:1 -:3',
      },
      { voice: 'pad', gain: 0.6, notes: `${repeat('-:8', 8)} | B3:8 | C#4:8 | A3:8 | B3:8 | B3:8 | C#4:8 | B3:4 A3:4 | A3:8` },
      { voice: 'pad', gain: 0.45, notes: `${repeat('-:8', 8)} | D4:8 | E4:8 | C#4:8 | D4:8 | D4:8 | E4:8 | E4:4 C#4:4 | D4:8` },
      { voice: 'drums', gain: 0.35, notes: `${repeat('k:2 h:2 h:2 h:2', 15)} | k:2 h:2 k:2 -:2` },
    ],
  },

  // 3-3 ほしのうみ: an evening festival by the sea, 4/4 in F. A "ゆうぐれ" (bars 1-8): the bell brings the stars
  // down in falling phrases over a warm pad. B "おまつり" (9-16): a bright flute tune that walks the whole scale
  // (not a pentatonic festival flute), little hand drums on beats 1 and 3 (never a 2-and-4 hayashi beat), and
  // lantern sparkles on the bell.
  hoshimatsuri: {
    id: 'hoshimatsuri',
    title: 'ほしまつりの うみ',
    bpm: 96,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'bell',
        notes:
          'C6:3 A5:1 F5:4 | E5:2 G5:2 C6:3 Bb5:1 | A5:3 F5:1 D5:4 | F5:2 Bb5:2 D6:3 C6:1 | Bb5:3 G5:1 D5:4 | C5:2 E5:2 G5:2 Bb5:2 | A5:3 G5:1 F5:2 D5:2 | C5:2 E5:2 G5:4 | ' +
          '-:4 C6:1 F6:1 A6:1 -:1 | -:4 D6:1 F6:1 Bb6:1 -:1 | -:4 C6:1 E6:1 G6:1 -:1 | -:4 C6:1 F6:1 A6:1 -:1 | ' +
          '-:4 D6:1 F6:1 A6:1 -:1 | -:4 D6:1 F6:1 Bb6:1 -:1 | -:4 C6:1 E6:1 G6:1 -:1 | -:4 A5:1 C6:1 F6:1 -:1',
      },
      {
        voice: 'lead',
        gain: 0.9,
        notes:
          `${repeat('-:8', 8)} | ` +
          'C5:2 F5:1 E5:1 F5:2 A5:2 | G5:1 F5:1 E5:1 D5:1 Bb4:4 | E5:2 G5:1 F5:1 E5:2 C5:2 | A5:3 G5:1 F5:4 | ' +
          'D5:2 F5:1 E5:1 D5:2 A5:2 | Bb5:3 A5:1 G5:2 F5:2 | G5:1 A5:1 Bb5:2 E5:2 C5:2 | F5:4 -:4',
      },
      // A: now and then a bubble "ぽこ"; B: a little hand drum, long on 1 and 3.
      { voice: 'wood', gain: 0.6, notes: `${repeat('-:8 | -:6 G4:1 C5:1', 4)} | ${repeat('F3:2 C4:1 C4:1 F3:2 C4:1 C4:1', 8)}` },
      {
        voice: 'bass',
        notes:
          'F2:2 -:2 C3:2 -:2 | C2:2 -:2 G2:2 -:2 | D2:2 -:2 A2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | G2:2 -:2 D2:2 -:2 | C2:2 -:2 G2:2 -:2 | D2:2 -:2 Bb1:2 -:2 | C2:2 -:2 G2:2 -:2 | ' +
          'F2:2 -:2 C3:2 -:2 | Bb1:2 -:2 F2:2 -:2 | C2:2 -:2 G2:2 -:2 | F2:2 -:2 C3:2 -:2 | D2:2 -:2 A2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | G2:2 -:2 C2:2 -:2 | F2:2 -:2 C2:2 -:2',
      },
      {
        voice: 'pad',
        gain: 0.7,
        notes: 'F3:8 | E3:8 | F3:8 | F3:8 | G3:8 | E3:8 | F3:8 | E3:8 | F3:8 | F3:8 | E3:8 | F3:8 | F3:8 | F3:8 | G3:4 E3:4 | F3:8',
      },
      {
        voice: 'pad',
        gain: 0.55,
        notes: 'A3:8 | G3:8 | A3:8 | Bb3:8 | Bb3:8 | Bb3:8 | A3:4 Bb3:4 | G3:8 | A3:8 | D4:8 | G3:8 | A3:8 | A3:8 | D4:8 | Bb3:8 | A3:8',
      },
      {
        voice: 'drums',
        gain: 0.3,
        notes: `${repeat('-:1 h:1 -:1 h:1 -:1 h:1 -:1 h:1', 8)} | ${repeat('k:2 h:1 h:1 k:2 h:1 h:1', 7)} | k:2 h:1 h:1 k:2 -:2`,
      },
    ],
  },

  // 4-1 こおりのみずうみ: a quick skating waltz in A. It opens on a scale gliding up (a skate pushing off) rather
  // than long held notes; a celesta-like bell sings and the flute answers in B. Bass on beat 1, a soft pad
  // "ちゃっ ちゃっ" on 2 and 3, the faintest hi-hat. No sleigh bells.
  koori: {
    id: 'koori',
    title: 'つるつる ワルツ',
    bpm: 144,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'bell',
        notes:
          'A4:1 B4:1 C#5:1 D5:1 E5:1 F#5:1 | A5:4 E5:2 | F#5:1 G#5:1 A5:1 B5:1 C#6:1 D6:1 | E6:2 D6:1 B5:1 G#5:2 | C#6:2 A5:2 F#5:2 | D6:2 A5:1 F#5:1 D5:2 | B5:2 G#5:1 E5:1 D5:1 B4:1 | A4:2 C#5:1 E5:1 A5:2 | ' +
          'F#5:2 A5:2 D6:2 | -:6 | E5:2 A5:2 C#6:2 | -:6 | B5:1 A5:1 G#5:1 F#5:1 E5:1 D5:1 | -:6 | C#6:2 B5:1 A5:1 E5:2 | D5:2 B4:2 G#4:2',
      },
      {
        voice: 'lead',
        gain: 0.7,
        notes: `${repeat('-:6', 9)} | D5:2 C#5:1 B4:1 A4:2 | -:6 | C#5:2 B4:1 A4:1 E4:2 | -:6 | E5:2 G#5:2 B5:2 | A4:2 C#5:2 E5:2 | -:6`,
      },
      {
        voice: 'bass',
        notes:
          'A2:2 -:4 | A2:2 -:4 | D2:2 -:4 | E2:2 -:4 | F#2:2 -:4 | D2:2 -:4 | E2:2 -:4 | A2:2 -:4 | ' +
          'D2:2 -:4 | D2:2 -:4 | A2:2 -:4 | A2:2 -:4 | B1:2 -:4 | E2:2 -:4 | A2:2 -:4 | E2:2 -:4',
      },
      { voice: 'pad', gain: 0.9, notes: ['C#4', 'C#4', 'D4', 'D4', 'C#4', 'D4', 'D4', 'C#4', 'D4', 'D4', 'C#4', 'C#4', 'D4', 'D4', 'C#4', 'D4'].map(KO).join(' | ') },
      { voice: 'pad', gain: 0.7, notes: ['E4', 'E4', 'F#4', 'G#4', 'F#4', 'F#4', 'G#4', 'E4', 'F#4', 'F#4', 'E4', 'E4', 'F#4', 'G#4', 'E4', 'G#4'].map(KO).join(' | ') },
      { voice: 'drums', gain: 0.2, notes: repeat('-:2 h:2 h:2', 16) },
    ],
  },

  // 4-2 おおゆきの むら: a cosy 4/4 in B♭: a warm marimba with a skip in its step (dotted notes, boots in fresh
  // snow), a bell answering in the gaps, round bass on 1 and 3. The only beat is a soft kick on 1 and a tiny hi-hat
  // just before the next bar: no sleigh-bell eighths, no winter song, no festival drums.
  mura: {
    id: 'mura',
    title: 'ゆきの むらの おまつり',
    bpm: 104,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'D5:3 C5:1 Bb4:2 D5:2 | Eb5:3 F5:1 G5:4 | F5:3 Eb5:1 D5:2 Bb4:2 | C5:2 D5:1 C5:1 A4:4 | Bb4:3 C5:1 D5:2 G5:2 | G5:3 F5:1 Eb5:2 C5:2 | E5:2 G5:2 F5:3 Eb5:1 | D5:4 -:4 | ' +
          'G5:2 Bb5:2 G5:1 F5:1 Eb5:2 | F5:2 A5:2 F5:1 Eb5:1 C5:2 | D5:2 F#5:2 A5:2 C6:2 | Bb5:3 A5:1 G5:4 | Eb5:1 F5:1 G5:1 Eb5:1 Bb5:2 G5:2 | A5:1 Bb5:1 C6:1 A5:1 F5:4 | Eb5:2 G5:2 F5:1 G5:1 A5:2 | Bb5:4 -:4',
      },
      {
        voice: 'bell',
        gain: 0.55,
        notes:
          '-:8 | -:4 Bb5:2 Eb6:2 | -:8 | -:4 F6:1 D6:1 C6:2 | -:8 | -:8 | -:8 | -:4 Bb5:1 D6:1 F6:2 | ' +
          '-:8 | -:8 | -:8 | -:4 D6:2 Bb5:2 | -:8 | -:4 C6:1 A5:1 F5:2 | -:8 | -:4 F6:1 D6:1 Bb5:2',
      },
      {
        voice: 'bass',
        notes:
          'Bb1:2 -:2 F2:2 -:2 | Eb2:2 -:2 Bb1:2 -:2 | Bb1:2 -:2 F2:2 -:2 | F2:2 -:2 C2:2 -:2 | G2:2 -:2 D2:2 -:2 | Eb2:2 -:2 Bb1:2 -:2 | C2:2 -:2 F2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | ' +
          'Eb2:2 -:2 Bb1:2 -:2 | F2:2 -:2 C2:2 -:2 | D2:2 -:2 A1:2 -:2 | G2:2 -:2 D2:2 -:2 | Eb2:2 -:2 Bb1:2 -:2 | F2:2 -:2 C2:2 -:2 | C2:2 -:2 F2:2 -:2 | Bb1:2 -:2 F2:2 -:2',
      },
      {
        voice: 'pad',
        gain: 0.65,
        notes: 'D3:8 | Eb3:8 | D3:8 | C3:8 | D3:8 | Eb3:8 | E3:4 Eb3:4 | D3:8 | Eb3:8 | Eb3:8 | D3:8 | D3:8 | Eb3:8 | Eb3:8 | Eb3:8 | D3:8',
      },
      {
        voice: 'pad',
        gain: 0.5,
        notes: 'F3:8 | G3:8 | F3:8 | A3:8 | Bb3:8 | G3:8 | G3:4 A3:4 | F3:8 | G3:8 | A3:8 | F#3:8 | Bb3:8 | G3:8 | A3:8 | G3:4 A3:4 | F3:8',
      },
      { voice: 'drums', gain: 0.35, notes: `${repeat('k:1 -:6 h:1', 15)} | k:1 -:3 k:1 -:3` },
    ],
  },

  // 4-3 ゆきやまのトンネル: brave and climbing, a 2/4 in G with a dotted "ta-tan" call. The flute leads; low marimba
  // eighths are boots crunching uphill; the bass walks root and fifth. In B (bars 9-16) an F natural brings the
  // mountain air. A bell sparkle of snow every four bars. Hi-hat noise only, no sleigh-bell ring.
  yuki: {
    id: 'yuki',
    title: 'ゆきやま ぐんぐん',
    bpm: 132,
    stepsPerBeat: 4,
    tracks: [
      {
        voice: 'lead',
        notes:
          'B4:3 D5:1 G5:3 A5:1 | B5:2 A5:1 G5:1 A5:2 D5:2 | E5:3 E5:1 G5:2 C6:2 | B5:6 -:2 | E5:3 F#5:1 G5:2 B5:2 | C6:3 B5:1 A5:2 G5:2 | A5:3 G5:1 F#5:2 A5:2 | D5:6 -:2 | ' +
          'C6:3 A5:1 F5:2 A5:2 | G5:3 E5:1 C5:2 E5:2 | D5:3 G5:1 B5:2 D6:2 | C6:2 B5:2 A5:2 G5:2 | F5:2 A5:2 C6:4 | G5:3 E5:1 G5:2 C6:2 | B5:3 A5:1 F#5:2 A5:2 | G5:6 -:2',
      },
      {
        voice: 'wood',
        gain: 0.4,
        notes:
          'G3:2 D4:2 G3:2 D4:2 | G3:2 D4:2 G3:2 D4:2 | C4:2 G4:2 C4:2 G4:2 | G3:2 D4:2 G3:2 D4:2 | E4:2 B4:2 E4:2 B4:2 | C4:2 G4:2 C4:2 G4:2 | D4:2 A4:2 D4:2 A4:2 | D4:2 A4:2 D4:2 F#4:2 | ' +
          'F3:2 C4:2 F3:2 C4:2 | C4:2 G4:2 C4:2 G4:2 | G3:2 D4:2 G3:2 D4:2 | G3:2 D4:2 G3:2 D4:2 | F3:2 C4:2 F3:2 C4:2 | C4:2 G4:2 C4:2 G4:2 | D4:2 A4:2 D4:2 A4:2 | G3:2 D4:2 G3:2 B3:2',
      },
      {
        voice: 'bell',
        gain: 0.5,
        notes: `${repeat('-:8', 3)} | -:4 G6:2 D6:2 | ${repeat('-:8', 3)} | -:4 A6:2 F#6:2 | ${repeat('-:8', 3)} | -:4 G6:4 | ${repeat('-:8', 3)} | -:4 B6:2 G6:2`,
      },
      {
        voice: 'bass',
        notes:
          'G2:3 -:1 D2:3 -:1 | G2:3 -:1 D2:3 -:1 | C2:3 -:1 G2:3 -:1 | G2:3 -:1 D2:3 -:1 | E2:3 -:1 B1:3 -:1 | C2:3 -:1 G2:3 -:1 | D2:3 -:1 A2:3 -:1 | D2:3 -:1 A1:3 -:1 | ' +
          'F2:3 -:1 C2:3 -:1 | C2:3 -:1 G2:3 -:1 | G2:3 -:1 D2:3 -:1 | G2:3 -:1 D2:3 -:1 | F2:3 -:1 C2:3 -:1 | C2:3 -:1 G2:3 -:1 | D2:3 -:1 A2:3 -:1 | G2:3 -:1 D2:3 -:1',
      },
      { voice: 'pad', gain: 0.45, notes: 'B3:8 | B3:8 | C4:8 | B3:8 | B3:8 | C4:8 | A3:8 | A3:8 | A3:8 | G3:8 | B3:8 | B3:8 | A3:8 | G3:8 | A3:8 | B3:8' },
      {
        voice: 'drums',
        gain: 0.4,
        notes: `${repeat('k:2 h:2 s:2 h:2', 7)} | k:2 h:2 s:2 k:1 k:1 | ${repeat('k:2 h:2 s:2 h:2', 7)} | k:2 s:2 s:1 s:1 s:2`,
      },
    ],
  },
  // 5-1 よるのもり: "ほたる ぽつぽつ" (PHASE9_CHAPTER5_6 第 1 部 §8.1): a quiet, warm 4/4 in F at 80. The bell's
  // melody walks softly in steps (fireflies here and there, "ぽつ ぽつ"); a high bell sparkles now and then; the
  // marimba is a slow footstep on beats 1 and 3, the bass the same, a soft pad under it all. No drums, no minor key, no
  // dissonance or low drone (nothing scary at night). Written away from the children's song "ほたるこい" (no
  // repeated call on two notes) and from "ほたるの ひかり" (no pickup, no rising fourth on the first beat).
  yoru: {
    id: 'yoru',
    title: 'ほたる ぽつぽつ',
    bpm: 80,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'bell',
        notes:
          'A5:2 -:1 C6:1 A5:2 G5:2 | F5:3 D5:1 F5:4 | D5:2 F5:1 G5:1 Bb5:4 | A5:2 G5:2 E5:2 C5:2 | A5:2 -:1 C6:1 F6:2 E6:2 | C6:3 A5:1 E5:4 | D5:2 F5:2 Bb5:2 A5:1 G5:1 | G5:6 -:2 | ' +
          'F5:2 A5:2 D6:3 C6:1 | Bb5:2 D6:2 F5:4 | A5:2 C6:1 A5:1 F5:2 A5:2 | G5:3 E5:1 C5:4 | D5:1 F5:1 Bb5:2 A5:2 G5:2 | E5:1 G5:1 C6:2 Bb5:2 G5:2 | A5:3 G5:1 F5:2 C5:2 | F5:6 -:2',
      },
      { voice: 'bell', gain: 0.35, notes: '-:8 | -:6 F6:1 -:1 | -:8 | -:4 A6:1 -:1 C7:1 -:1 | -:8 | -:6 F6:1 -:1 | -:8 | -:4 A6:1 -:1 C7:1 -:1 | -:8 | -:6 F6:1 -:1 | -:8 | -:4 A6:1 -:1 C7:1 -:1 | -:8 | -:6 F6:1 -:1 | -:8 | -:4 A6:1 -:1 C7:1 -:1' },
      { voice: 'wood', gain: 0.3, notes: 'F4:2 -:2 C4:2 -:2 | D4:2 -:2 A3:2 -:2 | D4:2 -:2 F4:2 -:2 | E4:2 -:2 G4:2 -:2 | F4:2 -:2 C4:2 -:2 | E4:2 -:2 C4:2 -:2 | D4:2 -:2 F4:2 -:2 | E4:2 -:2 G4:2 -:2 | D4:2 -:2 A3:2 -:2 | D4:2 -:2 F4:2 -:2 | F4:2 -:2 C4:2 -:2 | E4:2 -:2 G4:2 -:2 | D4:2 -:2 F4:2 -:2 | E4:2 -:2 G4:2 -:2 | F4:2 -:2 C4:2 -:2 | F4:2 -:2 C4:2 -:2' },
      { voice: 'bass', gain: 0.8, notes: 'F2:2 -:2 C3:2 -:2 | D2:2 -:2 A2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | C2:2 -:2 G2:2 -:2 | F2:2 -:2 C3:2 -:2 | A1:2 -:2 E2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | C2:2 -:2 G2:2 -:2 | D2:2 -:2 A2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | F2:2 -:2 C3:2 -:2 | C2:2 -:2 G2:2 -:2 | Bb1:2 -:2 F2:2 -:2 | C2:2 -:2 G2:2 -:2 | F2:2 -:2 C3:2 -:2 | F2:2 -:2 C3:2 -:2' },
      { voice: 'pad', gain: 0.5, notes: 'A3:8 | F3:8 | Bb3:8 | G3:8 | A3:8 | A3:8 | Bb3:8 | G3:8 | F3:8 | Bb3:8 | A3:8 | G3:8 | Bb3:8 | G3:8 | A3:8 | A3:8' },
      { voice: 'pad', gain: 0.4, notes: 'C4:8 | D4:8 | D4:8 | E4:8 | C4:8 | E4:8 | D4:8 | E4:8 | D4:8 | D4:8 | C4:8 | E4:8 | D4:8 | E4:8 | C4:8 | C4:8' },
    ],
  },

  // 5-2 おもちゃのまち「ぜんまい マーチ」(PHASE9_CHAPTER5_6 第 1 部 §8.1): a hopping 2/4 in C, marimba melody with a music
  // box and a soft trumpet answering, a bouncy bass, a tiny snare. It opens with two bars going DOWN the scale (so it is
  // clearly none of the well-known toy songs, toy soldiers' marches, ballet dolls' marches or sports-day tunes).
  omocha: {
    id: 'omocha',
    title: 'ぜんまい マーチ',
    bpm: 116,
    stepsPerBeat: 2,
    tracks: [
      {
        voice: 'wood',
        notes:
          'G5:1 F5:1 E5:1 D5:1 | C5:1 B4:1 A4:1 G4:1 | C5:2 E5:1 G5:1 | A5:2 G5:2 | F5:1 A5:1 G5:1 E5:1 | D5:1 F5:1 E5:1 C5:1 | D5:1 E5:1 F5:1 D5:1 | G5:3 -:1 | ' +
          'E5:1 G5:1 C6:2 | B5:1 A5:1 G5:2 | A5:1 F5:1 D5:1 F5:1 | G5:2 E5:2 | C5:1 E5:1 G5:1 E5:1 | F5:1 A5:1 G5:1 F5:1 | E5:1 D5:1 G4:1 B4:1 | C5:3 -:1',
      },
      {
        voice: 'lead',
        gain: 0.45,
        notes: `${repeat('-:4', 8)} | -:2 G4:2 | -:2 D5:2 | -:2 A4:2 | C5:2 -:2 | -:2 G4:2 | -:2 C5:2 | B4:2 D5:2 | E5:3 -:1`,
      },
      {
        voice: 'bell',
        gain: 0.4,
        notes: `-:4 | -:4 | -:2 G6:1 E6:1 | -:4 | -:2 A6:1 F6:1 | -:4 | -:2 B6:1 G6:1 | -:4 | -:4 | -:2 D7:1 B6:1 | -:4 | -:2 G6:1 E6:1 | -:4 | -:2 A6:1 F6:1 | -:4 | C7:2 -:2`,
      },
      {
        voice: 'bass',
        notes:
          'C3:1 -:1 G2:1 -:1 | G2:1 -:1 D3:1 -:1 | C3:1 -:1 G2:1 -:1 | F2:1 -:1 C3:1 -:1 | F2:1 -:1 C3:1 -:1 | C3:1 -:1 G2:1 -:1 | G2:1 -:1 D3:1 -:1 | G2:1 -:1 B2:1 -:1 | ' +
          'C3:1 -:1 G2:1 -:1 | G2:1 -:1 D3:1 -:1 | D3:1 -:1 A2:1 -:1 | C3:1 -:1 G2:1 -:1 | C3:1 -:1 G2:1 -:1 | F2:1 -:1 C3:1 -:1 | G2:1 -:1 D3:1 -:1 | C3:1 -:1 C2:1 -:1',
      },
      { voice: 'drums', gain: 0.35, notes: `${repeat('k:1 -:1 s:1 -:1', 15)} | k:1 s:1 k:1 -:1` },
    ],
  },

  // 5-3 かがみのせかい「かがみの むこう」(PHASE9_CHAPTER5_6 第 1 部 §8.1): a gentle 4/4 in G at 92, a glassy bell melody,
  // a soft sine answering, a pad and a marimba "ぽろん"; no drums. The song is its own mirror: bars 9–16 are bars 1–8
  // played backwards (every track, note by note: the chords come back in reverse and end on the first bar's G).
  kagami: {
    id: 'kagami',
    title: 'かがみの むこう',
    bpm: 92,
    stepsPerBeat: 2,
    tracks: [
      { voice: 'bell', notes: mirrored('G5:2 B5:2 D6:2 B5:1 A5:1 | G5:3 E5:1 D5:4 | C5:2 E5:2 G5:2 E5:1 F#5:1 | A5:3 G5:1 F#5:4 | B5:2 D6:2 G6:2 F#6:1 E6:1 | D6:3 B5:1 G5:4 | A5:2 C6:2 B5:2 A5:1 F#5:1 | G5:6 -:2') },
      { voice: 'lead', gain: 0.35, notes: mirrored('-:4 D5:4 | B4:8 | -:4 G4:4 | A4:8 | -:4 D5:4 | D5:8 | C5:4 A4:4 | B4:6 -:2') },
      { voice: 'pad', gain: 0.45, notes: mirrored('B3:8 | B3:8 | C4:8 | A3:8 | B3:8 | B3:8 | A3:8 | B3:8') },
      { voice: 'pad', gain: 0.35, notes: mirrored('D4:8 | E4:8 | E4:8 | D4:8 | D4:8 | D4:8 | F#4:8 | D4:8') },
      { voice: 'wood', gain: 0.3, notes: mirrored('G3:2 -:2 D4:2 -:2 | E3:2 -:2 B3:2 -:2 | C4:2 -:2 G3:2 -:2 | D4:2 -:2 A3:2 -:2 | G3:2 -:2 D4:2 -:2 | G3:2 -:2 B3:2 -:2 | D4:2 -:2 A3:2 -:2 | G3:2 -:2 D4:2 -:2') },
    ],
  },

  // v1.11 (6-1 さかさまのしろ): playful 6/8 in D major (bassoon-ish hopping bass, clarinet-ish lead). Not a castle organ
  // toccata, not a theme park's castle tune (PHASE9_CHAPTER5_6 第 1 部 §8.1).
  shiro: {
    id: 'shiro',
    title: 'さかさまの おしろ',
    bpm: 72,
    stepsPerBeat: 3,
    tracks: [
      {
        voice: 'lead',
        notes:
          'A4:2 F#4:1 D5:2 A4:1 | F#5:3 E5:1 D5:1 C#5:1 | B4:2 D5:1 G5:2 B4:1 | A4:2 C#5:1 E5:3 | ' +
          'D5:2 F#5:1 A5:2 F#5:1 | B5:3 A5:1 F#5:1 D5:1 | E5:2 G5:1 B5:2 G5:1 | A5:3 -:1 C#5:1 E5:1 | ' +
          'D5:1 B4:1 G4:1 B4:1 D5:1 G5:1 | E5:1 C#5:1 A4:1 C#5:1 E5:1 A5:1 | F#5:2 E5:1 C#5:2 A4:1 | B4:3 D5:1 F#5:1 B5:1 | ' +
          'G5:2 F#5:1 E5:2 D5:1 | C#5:2 E5:1 A5:2 G5:1 | F#5:2 A5:1 D6:2 A5:1 | D5:3 -:3',
      },
      {
        voice: 'bell',
        gain: 0.4,
        notes:
          'D6:3 -:3 | -:6 | B5:3 -:3 | -:6 | F#6:3 -:3 | -:6 | G6:3 -:3 | -:6 | ' +
          'D6:3 -:3 | -:6 | C#6:3 -:3 | -:6 | B5:3 -:3 | -:6 | A6:3 -:3 | D6:3 -:3',
      },
      {
        voice: 'bass',
        gain: 0.8,
        notes:
          'D2:1 -:1 A2:1 D3:1 -:1 A2:1 | D2:1 -:1 A2:1 D3:1 -:1 A2:1 | G2:1 -:1 D3:1 G3:1 -:1 D3:1 | A2:1 -:1 E3:1 A3:1 -:1 E3:1 | ' +
          'D2:1 -:1 A2:1 D3:1 -:1 A2:1 | B2:1 -:1 F#3:1 B3:1 -:1 F#3:1 | E2:1 -:1 B2:1 E3:1 -:1 B2:1 | A2:1 -:1 E3:1 A3:1 -:1 E3:1 | ' +
          'G2:1 -:1 D3:1 G3:1 -:1 D3:1 | A2:1 -:1 E3:1 A3:1 -:1 E3:1 | F#2:1 -:1 C#3:1 F#3:1 -:1 C#3:1 | B2:1 -:1 F#3:1 B3:1 -:1 F#3:1 | ' +
          'G2:1 -:1 D3:1 G3:1 -:1 D3:1 | A2:1 -:1 E3:1 A3:1 -:1 E3:1 | D2:1 -:1 A2:1 D3:1 -:1 A2:1 | D2:3 -:3',
      },
      {
        voice: 'pad',
        gain: 0.35,
        notes: 'F#4:6 | F#4:6 | G4:6 | E4:6 | F#4:6 | F#4:6 | G4:6 | E4:6 | G4:6 | E4:6 | F#4:6 | F#4:6 | G4:6 | E4:6 | F#4:6 | F#4:6',
      },
      { voice: 'drums', gain: 0.5, notes: `${repeat('k:1 -:1 h:1 k:1 h:1 -:1', 15)} | k:1 -:5` },
    ],
  },
  // v1.11 (6-1 M2): おいかけっこ, a game of tag: bright 2/4 in F major. Not the can-can, not a famous chase sax tune, not
  // "the flight of the bumblebee"; not 'hurry' either (play, not a race against time).
  oikake: {
    id: 'oikake',
    title: 'まてまて〜',
    bpm: 152,
    stepsPerBeat: 2,
    tracks: [
      { voice: 'lead', notes: 'C5:1 F5:1 A5:1 F5:1 | G5:1 E5:1 C5:2 | D5:1 F5:1 Bb5:1 F5:1 | A5:1 G5:1 F5:1 E5:1 | F5:1 A5:1 C6:1 A5:1 | D6:1 C6:1 A5:2 | Bb5:1 G5:1 E5:1 G5:1 | F5:2 -:2' },
      { voice: 'wood', gain: 0.45, notes: 'F4:1 A4:1 C5:1 A4:1 | E4:1 G4:1 C5:1 G4:1 | F4:1 Bb4:1 D5:1 Bb4:1 | E4:1 G4:1 C5:1 G4:1 | F4:1 A4:1 C5:1 A4:1 | F4:1 A4:1 D5:1 A4:1 | G4:1 Bb4:1 C5:1 Bb4:1 | F4:1 A4:1 C5:1 -:1' },
      { voice: 'bass', gain: 0.8, notes: 'F2:1 -:1 C3:1 -:1 | C2:1 -:1 G2:1 -:1 | Bb1:1 -:1 F2:1 -:1 | C2:1 -:1 G2:1 -:1 | F2:1 -:1 C3:1 -:1 | D2:1 -:1 A2:1 -:1 | C2:1 -:1 G2:1 -:1 | F2:1 -:1 F2:1 -:1' },
      { voice: 'drums', gain: 0.55, notes: repeat('k:1 h:1 s:1 h:1', 8) },
    ],
  },
};
