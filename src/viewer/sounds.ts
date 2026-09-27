import { AudioEngine } from '../audio/audio';
import { SOUNDS } from '../audio/catalog';
import { RUN_SOUND, type RunInput, type RunSurface } from '../audio/run-sound';
import { ACCELERATION, LEVER_NOTCHES } from '../train/params';

/**
 * The sounds page (sounds.html): every sound effect on a button, and the running sound on a pretend train
 * (lever, track, a jump), so the sound can be judged on the iPad. It also measures each effect offline
 * (window.__measure, for the smoke test): nothing should clip, nothing should be silent.
 */
const audio = new AudioEngine();
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
const train = { speed: 0, notch: 1, surface: 'rail' as RunSurface, airFor: 0 };
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
const SURFACE_LABELS: [RunSurface, string][] = [
  ['rail', 'ふつうの レール'],
  ['bridge', 'てっきょう'],
  ['wood', 'きの はし'],
  ['silk', 'くもの いと'],
  ['soft', 'はなびら'],
];
const surfaceButtons = SURFACE_LABELS.map(([id, label]) => {
  const b = button(label, () => {
    train.surface = id;
    surfaceButtons.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.surface === id)));
  });
  b.dataset.surface = id;
  b.setAttribute('aria-pressed', String(id === train.surface));
  $('surfaces').appendChild(b);
  return b;
});
$('hop').addEventListener('click', () => {
  audio.unlock();
  if (train.speed > 3) train.airFor = 1.6;
});

let last = performance.now();
const tick = (now: number): void => {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const n = LEVER_NOTCHES[train.notch];
  if (train.speed < n.speed) train.speed = Math.min(n.speed, train.speed + ACCELERATION * dt);
  else train.speed = Math.max(n.speed, train.speed - n.brake * dt);
  train.airFor = Math.max(0, train.airFor - dt);
  audio.updateRun(dt, {
    speed: train.speed,
    target: n.speed,
    braking: n.speed < train.speed - 0.3,
    airborne: train.airFor > 0,
    surface: train.surface,
    quiet: false,
  });
  const kmh = Math.round(train.speed * 3.6);
  $('speed').textContent = train.speed < 0.05 ? 'とまっている' : `${kmh} km/h${train.airFor > 0 ? '（そら）' : ''}`;
  ($('bar').firstElementChild as HTMLElement).style.width = `${Math.min(100, (train.speed / 30) * 100)}%`;
  document.body.dataset.joints = String(audio.runStats.joints);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

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
}

const RATE = 22050;

function levels(id: string, data: Float32Array): Measure {
  let peak = 0;
  let sum = 0;
  for (const x of data) {
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  return { id, peak, rms: Math.sqrt(sum / data.length) };
}

/** Renders each effect (3 s) and the running sound at each surface (4 s at びゅーん) offline. */
async function measure(): Promise<Measure[]> {
  const out: Measure[] = [];
  for (const s of SOUNDS) {
    const ctx = new OfflineAudioContext(1, RATE * 3, RATE);
    const engine = new AudioEngine();
    engine.attach(ctx);
    s.play(engine);
    out.push(levels(s.id, (await ctx.startRendering()).getChannelData(0)));
  }
  for (const [surface] of SURFACE_LABELS) {
    const seconds = 4;
    const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
    const engine = new AudioEngine();
    engine.attach(ctx);
    const step = 1 / 30;
    const input: RunInput = { speed: RUN_SOUND.full, target: RUN_SOUND.full, braking: false, airborne: false, surface, quiet: false };
    for (let t = step; t < seconds - step; t += step) {
      void ctx.suspend(t).then(() => {
        engine.updateRun(step, input);
        void ctx.resume();
      });
    }
    engine.updateRun(step, input);
    const data = (await ctx.startRendering()).getChannelData(0);
    out.push({ ...levels(`run-${surface}`, data), joints: engine.runStats.joints } as Measure);
  }
  return out;
}
(window as unknown as { __measure: typeof measure }).__measure = measure;

/** The running sound at `speed` on `surface`, rendered offline: its loudness every 10 ms (for a look at the shape). */
async function envelope(speed: number, surface: RunSurface, seconds = 4): Promise<number[]> {
  const ctx = new OfflineAudioContext(1, RATE * seconds, RATE);
  const engine = new AudioEngine();
  engine.attach(ctx);
  const step = 1 / 30;
  const input: RunInput = { speed, target: speed, braking: false, airborne: false, surface, quiet: false };
  for (let t = step; t < seconds - step; t += step) {
    void ctx.suspend(t).then(() => {
      engine.updateRun(step, input);
      void ctx.resume();
    });
  }
  engine.updateRun(step, input);
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
