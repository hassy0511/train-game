import { Color, Scene, ShaderMaterial } from 'three';
import type { StageEvent } from '../../core/stage-events';
import type { EnvironmentState } from './environment-state';
import { setLanternGlow, setTraceGlow } from './village-placeholders';

/**
 * The snowy village of 4-2 in the scene (docs/PHASE8_CHAPTER3_4.md 第 6 部 第 B 部 §8, §12): the evening a cutscene
 * brings (the sky, the fog and the light turn warm over a few seconds and stay so; the lanterns come on with it), and
 * Sakasa's swirl marks on the upside-down snow fences glowing while the light finds them.
 */
const EVENING = {
  top: new Color('#E99A78'),
  bottom: new Color('#FCE0C2'),
  fog: new Color('#F5D7C2'),
  hemisphere: new Color('#FFE3C8'),
  sun: new Color('#FFB887'),
};

interface SkyTween {
  t: number;
  seconds: number;
  from: { top: Color; bottom: Color; fog: Color | null; background: Color | null; hemi: Color | null; sun: Color | null };
}

export class VillageGimmicks {
  private tween: SkyTween | null = null;
  private lanterns = 0;
  private lanternTarget = 0;
  private trace = 0;
  private traceTarget = 0;

  constructor(
    private readonly scene: Scene,
    /** The look (PHASE9 B6.1): its sky, fog and lights are read when the evening comes (they may have changed). */
    private readonly look: EnvironmentState,
  ) {
    setLanternGlow(0);
    setTraceGlow(0);
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'trace') this.traceTarget = e.on ? 1 : 0;
    if (e.type !== 'sky') return;
    const uniforms = (this.look.sky?.material as ShaderMaterial | undefined)?.uniforms;
    const lights = this.look.lights;
    this.tween = {
      t: 0,
      seconds: Math.max(0.001, e.seconds),
      from: {
        top: (uniforms?.topColor.value as Color | undefined)?.clone() ?? new Color(),
        bottom: (uniforms?.bottomColor.value as Color | undefined)?.clone() ?? new Color(),
        fog: this.look.fogObject?.color.clone() ?? null,
        background: this.scene.background instanceof Color ? this.scene.background.clone() : null,
        hemi: lights?.hemisphere.color.clone() ?? null,
        sun: lights?.sun.color.clone() ?? null,
      },
    };
    this.lanternTarget = 1;
    if (e.seconds <= 0) this.lanterns = 1;
  }

  /** v1.11: a new look was applied (day ⇄ night): an evening still turning stops where the new look put things. */
  onLook(): void {
    this.tween = null;
  }

  update(dt: number): void {
    const tw = this.tween;
    if (tw && tw.t < 1) {
      tw.t = Math.min(1, tw.t + dt / tw.seconds);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      const uniforms = (this.look.sky?.material as ShaderMaterial | undefined)?.uniforms;
      if (uniforms) {
        (uniforms.topColor.value as Color).copy(tw.from.top).lerp(EVENING.top, k);
        (uniforms.bottomColor.value as Color).copy(tw.from.bottom).lerp(EVENING.bottom, k);
        if (uniforms.mistColor) (uniforms.mistColor.value as Color).copy(EVENING.fog).convertLinearToSRGB();
      }
      const fog = this.look.fogObject;
      if (fog && tw.from.fog) fog.color.copy(tw.from.fog).lerp(EVENING.fog, k);
      if (this.scene.background instanceof Color && tw.from.background) this.scene.background.copy(tw.from.background).lerp(EVENING.bottom, k);
      const lights = this.look.lights;
      if (lights) {
        lights.hemisphere.color.copy(tw.from.hemi ?? EVENING.hemisphere).lerp(EVENING.hemisphere, k);
        lights.sun.color.copy(tw.from.sun ?? EVENING.sun).lerp(EVENING.sun, k);
      }
    }
    if (this.lanterns !== this.lanternTarget) {
      this.lanterns = Math.min(this.lanternTarget, this.lanterns + dt / 2.5);
      setLanternGlow(this.lanterns);
    }
    if (this.trace !== this.traceTarget) {
      const step = dt / 0.4;
      this.trace = this.traceTarget > this.trace ? Math.min(1, this.trace + step) : Math.max(0, this.trace - step);
      setTraceGlow(this.trace);
    }
  }
}
