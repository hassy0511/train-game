/**
 * Dev tool (tools/music-render.html, driven by scripts/render-music.mjs): renders a song offline to a WAV so
 * it can be listened to outside the game. `?song=<id>&seconds=<n>`. Not part of the game build.
 */
import { MusicPlayer } from '../audio/music';
import { SONGS } from '../audio/songs';

const RATE = 44100;

function wav(buffer: AudioBuffer): string {
  const data = buffer.getChannelData(0);
  const bytes = new DataView(new ArrayBuffer(44 + data.length * 2));
  const text = (at: number, s: string): void => [...s].forEach((c, i) => bytes.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  bytes.setUint32(4, 36 + data.length * 2, true);
  text(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, 1, true);
  bytes.setUint32(24, RATE, true);
  bytes.setUint32(28, RATE * 2, true);
  bytes.setUint16(32, 2, true);
  bytes.setUint16(34, 16, true);
  text(36, 'data');
  bytes.setUint32(40, data.length * 2, true);
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  document.body.dataset.peak = peak.toFixed(3);
  for (let i = 0; i < data.length; i++) bytes.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 0x7fff, true);
  let binary = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const id = params.get('song') ?? 'title';
  if (!SONGS[id]) throw new Error(`unknown song ${id}`);
  const seconds = Number(params.get('seconds') ?? 30);
  const ctx = new OfflineAudioContext(1, Math.ceil(RATE * (seconds + 1.5)), RATE);
  const player = new MusicPlayer(ctx, ctx.destination);
  player.setVolume(1);
  player.scheduleAll(id, seconds);
  const buffer = await ctx.startRendering();
  (window as unknown as { wav: string }).wav = wav(buffer);
  document.body.dataset.done = '1';
}

main().catch((err: unknown) => {
  console.error(err);
  document.body.dataset.error = String(err);
});
