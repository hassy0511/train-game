import { AudioEngine } from '../audio/audio';
import { SOUNDS } from '../audio/catalog';
import { MusicPlayer } from '../audio/music';
import { RUN_SOUND, RUN_SURFACES, type RunInput, type RunSurface } from '../audio/run-sound';
import { SONGS, type Song } from '../audio/songs';
import { AMBIENCE_KINDS, type AmbienceKind } from '../stage/types';
import { ACCELERATION, LEVER_NOTCHES } from '../train/params';

/**
 * The sounds page (sounds.html): every sound effect on a button, the running sound on a pretend train (lever,
 * track, a jump, under water), the islands' ambience and every song, so the sound can be judged on the iPad. It
 * also measures each effect, run, ambience and song offline (window.__measure, window.__measureSongs, for the
 * smoke test): nothing should clip, nothing should be silent.
 */
const audio = new AudioEngine();
audio.listenForGestures();
const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
$('build').textContent = `build ${__BUILD_ID__}`;

const button = (label: string, onClick: () => void): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', () => {
    audio.unlock();
    onClick();
  });
  return b;
};

// The pretend train: the lever's speed, reached at the game's acceleration; braking at the stop notch's rate.
const train = { speed: 0, notch: 1, surface: 'rail' as RunSurface, airFor: 0, burnFor: 0, underwater: false };
const notchRow = $('notches');
const notchButtons = LEVER_NOTCHES.map((n, i) => {
  const b = button(n.label, () => {
    train.notch = i;
    notchButtons.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
  });
  b.dataset.notch = String(i);
  b.setAttribute('aria-pressed', String(i === train.notch));
  notchRow.appendChild(b);
  return b;
});
const SURFACE_NAMES: Record<RunSurface, string> = {
  rail: 'ふつうの レール',
  bridge: 'てっきょう',
  wood: 'きの はし',
  silk: 'くもの いと',
  soft: 'はなびら',
  ice: 'こおり',
  snow: 'ゆき',
  tunnel: 'トンネル',
};
const surfaceButtons = RUN_SURFACES.map((id) => {
  const b = button(SURFACE_NAMES[id], () => {
    train.surface = id;
    surfaceButtons.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.surface === id)));
  });
  b.dataset.surface = id;
  b.setAttribute('aria-pressed', String(id === train.surface));
  $('surfaces').appendChild(b);
  return b;
});
$('burn').addEventListener('click', () => {
  audio.unlock();
  audio.playRocket();
  train.burnFor = 3;
});
$('hop').addEventListener('click', () => {
  audio.unlock();
  if (train.speed > 3) train.airFor = 1.6;
});
const dive = $('dive');
dive.setAttribute('aria-pressed', 'false');
dive.addEventListener('click', () => {
  audio.unlock();
  train.underwater = !train.underwater;
  dive.setAttribute('aria-pressed', String(train.underwater));
});

let last = performance.now();
const tick = (now: number): void => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const n = LEVER_NOTCHES[train.notch];
  if (train.speed < n.speed) train.speed = Math.min(n.speed, train.speed + ACCELERATION * dt);
  else train.speed = Math.max(n.speed, train.speed - n.brake * dt);
  train.airFor = Math.max(0, train.airFor - dt);
  train.burnFor = Math.max(0, train.burnFor - dt);
  audio.setAmbienceUnderwater(train.underwater);
  audio.updateRun(dt, {
    speed: train.speed,
    target: n.speed,
    braking: n.speed < train.speed - 0.3,
    airborne: train.airFor > 0,
    surface: train.surface,
    rocket: train.burnFor > 0,
    underwater: train.underwater,
    quiet: false,
  });
  const kmh = Math.round(train.speed * 3.6);
  $('speed').textContent = train.speed < 0.05 ? 'とまっている' : `${kmh} km/h${train.airFor > 0 ? '（そら）' : ''}${train.underwater ? '（みずの なか）' : ''}`;
  ($('bar').firstElementChild as HTMLElement).style.width = `${Math.min(100, (train.speed / 30) * 100)}%`;
  document.body.dataset.joints = String(audio.runStats.joints);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

// The islands' ambience, one at a time ("みずの なか" above crossfades it to the underwater sound).
const AMBIENCE_LABELS: Record<AmbienceKind, string> = {
  town: 'まち',
  valley: 'きょうりゅうの たに',
  sky: 'くもの うえ',
  forest: 'もり',
  meadow: 'はらっぱ',
  sea: 'かざんの しま（うみ）',
  underwater: 'うみの なか',
  river: 'かわ',
  ice: 'こおりの みずうみ',
  snow: 'ゆきやま',
  night: 'よるの もり',
  toy: 'おもちゃの まち',
  mirror: 'かがみの せかい',
  castle: 'さかさまの しろ',
};
const ambienceButtons: HTMLButtonElement[] = [];
for (const kind of [...AMBIENCE_KINDS, null]) {
  const b = button(kind ? AMBIENCE_LABELS[kind] : 'なし', () => {
    audio.setAmbience(kind);
    ambienceButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  b.dataset.ambience = kind ?? 'none';
  b.setAttribute('aria-pressed', String(kind === null));
  ambienceButtons.push(b);
  $('ambience').appendChild(b);
}

// Every song, one at a time, with where it plays (in the order of the stages).
const SONG_PLACES: Record<string, string> = {
  title: 'タイトル',
  town: '1-1',
  valley: '1-2',
  sky: '1-3',
  forest: '2-1',
  meadow: '2-2',
  volcano: '2-3',
  hurry: 'レース',
  umi: '3-1',
  kawa: '3-2',
  hoshimatsuri: '3-3',
  koori: '4-1',
  mura: '4-2',
  yuki: '4-3',
};
const songButtons: HTMLButtonElement[] = [];
const playSong = (id: string | null, pressed: HTMLButtonElement): void => {
  audio.playMusic(id);
  document.body.dataset.song = id ?? '';
  songButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === pressed)));
};
const placeOrder = Object.keys(SONG_PLACES);
const rank = (id: string): number => (placeOrder.includes(id) ? placeOrder.indexOf(id) : placeOrder.length);
for (const song of Object.values(SONGS).sort((a, b) => rank(a.id) - rank(b.id))) {
  const place = SONG_PLACES[song.id];
  const b = button(place ? `${place} ${song.title}` : song.title, () => playSong(song.id, b));
  b.dataset.song = song.id;
  b.setAttribute('aria-pressed', 'false');
  songButtons.push(b);
  $('songs').appendChild(b);
}
const silence = button('とめる', () => playSong(null, silence));
silence.dataset.song = 'none';
silence.setAttribute('aria-pressed', 'true');
songButtons.push(silence);
$('songs').appendChild(silence);

// Every one-shot effect, in its group.
const effects = $('effects');
let group = '';
let row: HTMLElement | null = null;
for (const s of SOUNDS) {
  if (s.group !== group) {
    group = s.group;
    const h = document.createElement('h2');
    h.textContent = group;
    row = document.createElement('div');
    row.className = 'row';
    effects.append(h, row);
  }
  const b = button(s.label, () => s.play(audio));
  b.dataset.sound = s.id;
  row?.appendChild(b);
}

interface Measure {
  id: string;
  peak: number;
  rms: number;
  /** How bright it is: the level of the sample-to-sample change over the level (higher = more treble). */
  bright: number;
}

const RATE = 22050;

function levels(id: string, data: Float32Array): Measure {
  let peak = 0;
  let sum = 0;
  let diff = 0;
  let prev = 0;
  for (const x of data) {
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
    diff += (x - prev) * (x - prev);
    prev = x;
  }
  return { id, peak, rms: Math.sqrt(sum / data.length), bright: sum > 0 ? Math.sqrt(diff / sum) : 0 };
}

/** Feeds `input` to the engine every frame of an offline render. */
function drive(ctx: OfflineAudioContext, engine: AudioEngine, seconds: number, step: number, input: RunInput): void {
  for (let t = step; t < seconds - step; t += step) {
    void ctx.suspend(t).then(() => {
      engine.updateRun(step, input);
      void ctx.resume();
    });
  }
  engine.updateRun(step, input);
}

/**
 * Renders each effect (3 s), the running sound on each surface, with the rocket and under water (4 s at びゅーん),
 * and each island's ambience (6 s; also the sea with the train under water) offline.
 */
async function measure(): Promise<Measure[]> {
  const out: Measure[] = [];
  for (const s of SOUNDS) {
    const ctx = new OfflineAudioContext(1, RATE * 3, RATE);
    const engine = new AudioEngine();
    engine.attach(ctx);
    s.play(engine);
    out.push(levels(s.id, (await ctx.startRendering()).getChannelData(0)));
  }
  const runs: [string, RunSurface, { rocket?: boolean; underwater?: boolean }][] = [
    ...RUN_SURFACES.map((s): [string, RunSurface, object] => [s, s, {}]),
    ['rocket', 'rail', { rocket: true }],
    ['underwater', 'rail', { underwater: true }],
  ];
  for (const [name, surface, extra] of runs) {
    const seconds = 4;
    const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
    const engine = new AudioEngine();
    engine.attach(ctx);
    drive(ctx, engine, seconds, 1 / 30, { speed: RUN_SOUND.full, target: RUN_SOUND.full, braking: false, airborne: false, surface, quiet: false, ...extra });
    const data = (await ctx.startRendering()).getChannelData(0);
    out.push({ ...levels(`run-${name}`, data), joints: engine.runStats.joints } as Measure);
  }
  // Each island's ambience for 6 s, with its little sounds coming as they would.
  const arounds: [string, AmbienceKind, boolean][] = [...AMBIENCE_KINDS.map((k): [string, AmbienceKind, boolean] => [k, k, false]), ['sea-underwater', 'sea', true]];
  for (const [name, kind, underwater] of arounds) {
    const seconds = 6;
    const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
    const engine = new AudioEngine();
    engine.attach(ctx);
    engine.setAmbience(kind);
    engine.setAmbienceUnderwater(underwater);
    drive(ctx, engine, seconds, 1 / 20, { speed: 0, target: 0, braking: false, airborne: false, surface: 'rail', quiet: true });
    out.push(levels(`ambience-${name}`, (await ctx.startRendering()).getChannelData(0)));
  }
  return out;
}
(window as unknown as { __measure: typeof measure }).__measure = measure;

/** Renders the first `seconds` of every song offline (as the music-render tool does) and measures it. */
async function measureSongs(seconds = 8): Promise<Measure[]> {
  const out: Measure[] = [];
  for (const id of Object.keys(SONGS)) {
    const ctx = new OfflineAudioContext(1, Math.ceil(RATE * (seconds + 1.5)), RATE);
    const player = new MusicPlayer(ctx, ctx.destination);
    player.setVolume(1);
    player.scheduleAll(id, seconds);
    out.push(levels(`song-${id}`, (await ctx.startRendering()).getChannelData(0)));
  }
  return out;
}
(window as unknown as { __measureSongs: typeof measureSongs }).__measureSongs = measureSongs;

/**
 * `Song.loop: false`: a two-second bell song rendered for 7 s, once as it is and once looping. The loudness of
 * the last three seconds (after the notes have rung out) says whether it stopped or went round again.
 */
async function measureSongEnd(): Promise<{ once: number; loops: number }> {
  const tail = async (loop: boolean): Promise<number> => {
    const def: Song = { id: 'check', title: 'check', bpm: 120, stepsPerBeat: 2, ...(loop ? {} : { loop: false }), tracks: [{ voice: 'bell', notes: 'C5:2 E5:2 G5:2 C6:2' }] };
    const ctx = new OfflineAudioContext(1, Math.ceil(RATE * 7), RATE);
    const player = new MusicPlayer(ctx, ctx.destination);
    player.setVolume(1);
    player.scheduleAll('check', 7, def);
    const data = (await ctx.startRendering()).getChannelData(0);
    return levels('tail', data.subarray(RATE * 4)).rms;
  };
  return { once: await tail(false), loops: await tail(true) };
}
(window as unknown as { __measureSongEnd: typeof measureSongEnd }).__measureSongEnd = measureSongEnd;

/** The running sound at `speed` on `surface`, rendered offline: its loudness every 10 ms (for a look at the shape). */
async function envelope(speed: number, surface: RunSurface, seconds = 4, underwater = false): Promise<number[]> {
  const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
  const engine = new AudioEngine();
  engine.attach(ctx);
  drive(ctx, engine, seconds, 1 / 30, { speed, target: speed, braking: false, airborne: false, surface, underwater, quiet: false });
  const data = (await ctx.startRendering()).getChannelData(0);
  const per = RATE / 100;
  const out: number[] = [];
  for (let i = 0; i + per <= data.length; i += per) {
    let m = 0;
    for (let j = 0; j < per; j++) m = Math.max(m, Math.abs(data[i + j]));
    out.push(m);
  }
  return out;
}
(window as unknown as { __envelope: typeof envelope }).__envelope = envelope;
