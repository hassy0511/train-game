/** Noise colours for synthesized sounds: white (hiss, air), pink (softer rush), brown (low rumble). */
export type NoiseColor = 'white' | 'pink' | 'brown';

/** Seconds of noise in each buffer; they loop, so this only has to be long enough not to sound repeated. */
const NOISE_SECONDS = 2;

const cache = new WeakMap<BaseAudioContext, Map<NoiseColor, AudioBuffer>>();

/** A looping buffer of noise, made once per context (seeded, so every run sounds the same). */
export function noiseBuffer(ctx: BaseAudioContext, color: NoiseColor): AudioBuffer {
  let byColor = cache.get(ctx);
  if (!byColor) {
    byColor = new Map();
    cache.set(ctx, byColor);
  }
  const found = byColor.get(color);
  if (found) return found;
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x2f6b1a3d;
  const random = (): number => {
    // xorshift32: cheap and the same every time.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  // Pink: Paul Kellet's economy filter; brown: leaky integration of white. Both scaled to about the same loudness.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = random();
    if (color === 'white') {
      data[i] = white * 0.5;
    } else if (color === 'pink') {
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
    } else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  // Fade the seam so the loop does not click.
  const fade = Math.min(512, length >> 4);
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    data[length - fade + i] = data[length - fade + i] * (1 - k) + data[i] * k;
  }
  byColor.set(color, buffer);
  return buffer;
}

/** A looping noise source (started at once; stop it with `stop()`). */
export function noiseSource(ctx: BaseAudioContext, color: NoiseColor, at = ctx.currentTime): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, color);
  src.loop = true;
  // Start somewhere else in the buffer each time, so two sounds at once are not the same noise.
  src.start(at, (at * 7.31) % NOISE_SECONDS);
  return src;
}
