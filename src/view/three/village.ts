import { Color, DirectionalLight, Fog, HemisphereLight, Mesh, Scene, ShaderMaterial } from 'three';
import type { StageEvent } from '../../core/stage-events';
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
  from: { top: Color; bottom: Color; fog: Color | null; background: Color | null; hemi: Color[]; sun: Color[] };
}

export class VillageGimmicks {
  private tween: SkyTween | null = null;
  private lanterns = 0;
  private lanternTarget = 0;
  private trace = 0;
  private traceTarget = 0;

  constructor(
    private readonly scene: Scene,
    private readonly sky: Mesh | null,
  ) {
    setLanternGlow(0);
    setTraceGlow(0);
  }

  onEvent(e: StageEvent): void {
    if (e.type === 'trace') this.traceTarget = e.on ? 1 : 0;
    if (e.type !== 'sky') return;
    const uniforms = (this.sky?.material as ShaderMaterial | undefined)?.uniforms;
    const lights = { hemi: [] as HemisphereLight[], sun: [] as DirectionalLight[] };
    this.scene.traverse((o) => {
      if ((o as HemisphereLight).isHemisphereLight) lights.hemi.push(o as HemisphereLight);
      else if ((o as DirectionalLight).isDirectionalLight) lights.sun.push(o as DirectionalLight);
    });
    this.tween = {
      t: 0,
      seconds: Math.max(0.001, e.seconds),
      from: {
        top: (uniforms?.topColor.value as Color | undefined)?.clone() ?? new Color(),
        bottom: (uniforms?.bottomColor.value as Color | undefined)?.clone() ?? new Color(),
        fog: (this.scene.fog as Fog | null)?.color.clone() ?? null,
        background: this.scene.background instanceof Color ? this.scene.background.clone() : null,
        hemi: lights.hemi.map((l) => l.color.clone()),
        sun: lights.sun.map((l) => l.color.clone()),
      },
    };
    this.lanternTarget = 1;
    if (e.seconds <= 0) this.lanterns = 1;
  }

  update(dt: number): void {
    const tw = this.tween;
    if (tw && tw.t < 1) {
      tw.t = Math.min(1, tw.t + dt / tw.seconds);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      const uniforms = (this.sky?.material as ShaderMaterial | undefined)?.uniforms;
      if (uniforms) {
        (uniforms.topColor.value as Color).copy(tw.from.top).lerp(EVENING.top, k);
        (uniforms.bottomColor.value as Color).copy(tw.from.bottom).lerp(EVENING.bottom, k);
        if (uniforms.mistColor) (uniforms.mistColor.value as Color).copy(EVENING.fog).convertLinearToSRGB();
      }
      const fog = this.scene.fog as Fog | null;
      if (fog && tw.from.fog) fog.color.copy(tw.from.fog).lerp(EVENING.fog, k);
      if (this.scene.background instanceof Color && tw.from.background) this.scene.background.copy(tw.from.background).lerp(EVENING.bottom, k);
      let h = 0;
      let s = 0;
      this.scene.traverse((o) => {
        if ((o as HemisphereLight).isHemisphereLight) (o as HemisphereLight).color.copy(tw.from.hemi[h++] ?? EVENING.hemisphere).lerp(EVENING.hemisphere, k);
        else if ((o as DirectionalLight).isDirectionalLight) (o as DirectionalLight).color.copy(tw.from.sun[s++] ?? EVENING.sun).lerp(EVENING.sun, k);
      });
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
