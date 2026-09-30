import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { EnvironmentDef, SnowDef } from '../../stage/types';
import { AMBIENT_FIREFLIES, NIGHT } from '../../train/params';
import { buildWaterGround } from './water';

export const SKY_RADIUS = 550;

const skyVertexShader = `
varying vec3 vDirection;

void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragmentShader = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 mistColor;
uniform float mist;
varying vec3 vDirection;

void main() {
  float gradient = smoothstep(-0.15, 0.75, vDirection.y);
  gl_FragColor = vec4(mix(mix(bottomColor, topColor, gradient), mistColor, mist), 1.0);
}
`;

/**
 * v1.10 (3-3): faint stars in the upper half of the sky (one Points draw, riding on the sky dome so they follow the
 * camera; the sky hides under water, and they with it). Seeded: the same sky every time.
 */
export function buildStars(count: number): Points {
  const positions = new Float32Array(count * 3);
  let seed = 0x5eed;
  const random = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    // More of them high up (towards the deep blue), none near the pink horizon.
    const up = 0.35 + 0.65 * Math.sqrt(random());
    const r = Math.sqrt(1 - up * up);
    positions.set([Math.cos(a) * r * SKY_RADIUS * 0.9, up * SKY_RADIUS * 0.9, Math.sin(a) * r * SKY_RADIUS * 0.9], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const stars = new Points(geometry, new PointsMaterial({ color: '#fff8e0', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  stars.name = 'stars';
  stars.frustumCulled = false;
  return stars;
}

/**
 * The pieces of the stage's look, built one by one by EnvironmentState (environment-state.ts), which puts them in
 * the scene and sets them again on every apply(env).
 */

/** The sky dome (a gradient, whitened by a fog stretch's mist): it follows the camera. */
export function buildSky(): Mesh {
  const sky = new Mesh(
    new SphereGeometry(SKY_RADIUS, 32, 16),
    new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color() },
        bottomColor: { value: new Color() },
        // Inside a fog stretch the sky whitens too (0 = clear, 1 = all mist).
        mistColor: { value: new Color() },
        mist: { value: 0 },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.name = 'sky';
  sky.frustumCulled = false;
  return sky;
}

/** Sets the sky dome's colours. */
export function paintSky(sky: Mesh, environment: EnvironmentDef): void {
  const uniforms = (sky.material as ShaderMaterial).uniforms;
  (uniforms.topColor.value as Color).set(environment.sky.top);
  (uniforms.bottomColor.value as Color).set(environment.sky.bottom);
  // This shader writes its colour straight out (no sRGB encoding), so the mist colour goes in already encoded: at
  // full mist the sky then matches the fogged scenery exactly (a tinted fog showed seams).
  (uniforms.mistColor.value as Color).set(environment.fog?.color ?? '#ffffff').convertLinearToSRGB();
}

/** v1.3: a soft white floor far below the sky islands; the fog blends it into the horizon. */
export function buildCloudSea(): Mesh {
  const sea = new Mesh(new PlaneGeometry(4000, 4000), new MeshLambertMaterial({ color: '#F4F8FF', emissive: new Color('#DDE8F5') }));
  sea.name = 'cloud-sea';
  sea.rotation.x = -Math.PI / 2;
  return sea;
}

/** The stage's two lights: the sky's (hemisphere) and the sun's. */
export function buildLights(): { hemisphere: HemisphereLight; sun: DirectionalLight } {
  const hemisphere = new HemisphereLight();
  const sun = new DirectionalLight();
  sun.target.position.set(0, 0, 0);
  return { hemisphere, sun };
}

/** A snowy stage's light from below (the hemisphere light's ground colour): bouncing off snow it is white. */
const SNOW_BOUNCE = '#DCE8F2';

/** v1.11 (5-1): where the moon stands when a night stage does not say (degrees; 第 4 部 §4.1). */
const MOON_DEFAULT = { azimuth: 20, elevation: 32 };

/** The unit direction to azimuth `az` (degrees from +Z towards +X) and elevation `el` (degrees). */
function skyDirection(az: number, el: number): { x: number; y: number; z: number } {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: Math.cos(a) * Math.cos(e) };
}

/**
 * Sets the lights for `environment.lighting` ("day", or v1.10 (3-3) "evening": a warm low sun from the pink side of
 * the sky and a bluer ground light, not darker overall; v1.11 (5-1) "night": a blue moonlight from where the moon
 * stands, 70% of the day's light in all, NIGHT). On snow the light from below is white, not the grass green of the
 * other islands (v1.10, 4-1).
 */
export function lightUp(hemisphere: HemisphereLight, sun: DirectionalLight, environment: EnvironmentDef): void {
  if (environment.lighting === 'night') {
    hemisphere.color.set(NIGHT.hemiSky);
    hemisphere.groundColor.set(environment.surface === 'snow' ? SNOW_BOUNCE : NIGHT.hemiGround);
    hemisphere.intensity = NIGHT.hemi;
    hemisphere.name = 'night-hemisphere';
    sun.color.set(NIGHT.moonColor);
    sun.intensity = NIGHT.moon;
    sun.name = 'night-sun';
    const m = environment.moon ?? MOON_DEFAULT;
    const d = skyDirection(m.azimuth, m.elevation);
    sun.position.set(d.x, d.y, d.z).multiplyScalar(100);
    return;
  }
  const evening = environment.lighting === 'evening';
  hemisphere.color.set(evening ? 0xffd9b8 : 0xffffff);
  hemisphere.groundColor.set(environment.surface === 'snow' ? SNOW_BOUNCE : evening ? 0x6a7ab0 : 0x99bb77);
  hemisphere.intensity = evening ? 0.95 : 0.9;
  hemisphere.name = `${environment.lighting}-hemisphere`;
  sun.color.set(evening ? 0xffc89a : 0xffffff);
  sun.intensity = evening ? 1.05 : 1.2;
  sun.name = `${environment.lighting}-sun`;
  if (evening) sun.position.set(-1, 0.28, -0.35).normalize().multiplyScalar(100);
  else sun.position.set(1, 2, 0.5).normalize().multiplyScalar(100);
}

/**
 * The ground: a plane, or v1.10 with water one with holes where the ponds are (none at all over a sea: the water
 * layer draws the sea's surface and floor). Null when there is none.
 */
export function buildGround(environment: EnvironmentDef): Mesh | null {
  if (environment.water && environment.water.length > 0) return buildWaterGround(environment);
  if (!environment.ground) return null;
  const ground = new Mesh(
    new PlaneGeometry(environment.ground.size, environment.ground.size),
    new MeshLambertMaterial({ color: environment.ground.color }),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = environment.ground.y;
  if (environment.ground.look === 'playmat') playmat(ground.material as MeshLambertMaterial);
  return ground;
}

/** v1.11 (5-2): the play mat's squares (m a side) and their pastel colours, mixed over the ground's colour. */
const PLAYMAT_SQUARE = 4;

/**
 * v1.11 (5-2): the ground as a big play mat: pastel squares PLAYMAT_SQUARE m a side in the shader (from the world x, z;
 * no texture, still one draw call), a soft line between them.
 */
function playmat(material: MeshLambertMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMat = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMat;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 cell = floor(vMat / ${PLAYMAT_SQUARE.toFixed(1)});
        float k = mod(cell.x + cell.y * 3.0, 4.0);
        vec3 pastel = k < 1.0 ? vec3(1.0, 0.86, 0.9) : k < 2.0 ? vec3(0.84, 0.94, 1.0) : k < 3.0 ? vec3(1.0, 0.96, 0.8) : vec3(0.86, 1.0, 0.9);
        vec2 f = abs(fract(vMat / ${PLAYMAT_SQUARE.toFixed(1)}) - 0.5);
        float line = smoothstep(0.47, 0.5, max(f.x, f.y));
        diffuseColor.rgb *= mix(pastel, vec3(0.93), line * 0.6);`,
      );
  };
  material.customProgramCacheKey = () => 'playmat';
}

/** Sets the ground's colour; a snowy ground gets a little light of its own, so the snow is white rather than grey. */
export function paintGround(ground: Mesh, environment: EnvironmentDef): void {
  const material = ground.material as MeshLambertMaterial;
  if (!material.isMeshLambertMaterial || !environment.ground) return;
  material.color.set(environment.ground.color);
  if (environment.surface === 'snow') material.emissive.copy(material.color).multiplyScalar(0.3);
  else material.emissive.setRGB(0, 0, 0);
}

const moonVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const moonFragmentShader = `
uniform vec3 discColor;
uniform vec3 haloColor;
varying vec2 vUv;

void main() {
  // The quad is four moons wide: the disc in the middle quarter, a soft ring of light round it.
  float r = length(vUv - 0.5) * 4.0;
  float disc = 1.0 - smoothstep(0.94, 1.0, r);
  // The ring fades out before the quad's edge (no square shows round it).
  float halo = (1.0 - disc) * 0.45 * exp(-2.6 * max(r - 1.0, 0.0)) * (1.0 - smoothstep(1.5, 1.95, r));
  gl_FragColor = vec4(discColor * disc + haloColor * halo, 1.0);
}
`;

/** v1.11 (5-1): how big the moon is at size 1 (radius, m, on the sky dome 0.8 × SKY_RADIUS away: about 2.6°). */
const MOON_RADIUS = 20;

/**
 * v1.11 (5-1): the moon (environment.moon): a pale yellow disc with a soft ring of light round it, no face (one quad,
 * one draw, additive over the sky, no fog). It rides on the sky dome, so it stays where it is in the sky however the
 * train moves, and hides with the sky under water.
 */
export function buildMoon(moon: NonNullable<EnvironmentDef['moon']>): Mesh {
  const size = MOON_RADIUS * (moon.size ?? 1) * 4;
  const quad = new Mesh(
    new PlaneGeometry(size, size),
    new ShaderMaterial({
      uniforms: { discColor: { value: new Color('#fff4c8') }, haloColor: { value: new Color('#8fa4e8') } },
      vertexShader: moonVertexShader,
      fragmentShader: moonFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  quad.name = 'moon';
  quad.frustumCulled = false;
  const d = skyDirection(moon.azimuth, moon.elevation);
  quad.position.set(d.x, d.y, d.z).multiplyScalar(SKY_RADIUS * 0.8);
  // Facing the dome's middle (where the camera is).
  quad.lookAt(0, 0, 0);
  return quad;
}

const fireflyVertexShader = `
attribute float phase;
uniform float time;
uniform vec3 center;
uniform float radius;
uniform float size;
varying float vGlow;

void main() {
  // Each one keeps its place in a box round the camera (wrapping as the train moves), floating slowly.
  vec2 rel = mod(position.xz - center.xz + radius, 2.0 * radius) - radius;
  vec3 w = vec3(center.x + rel.x, center.y - 2.5 + position.y * 7.0, center.z + rel.y);
  w.x += sin(time * 0.45 + phase * 11.0) * 0.9;
  w.y += sin(time * 0.7 + phase * 6.3) * 0.6;
  w.z += cos(time * 0.4 + phase * 7.0) * 0.9;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mv;
  // A slow "ぽわっ": bright for a while, then gone for a while.
  float pulse = 0.5 + 0.5 * sin(time * (0.6 + phase * 0.8) + phase * 40.0);
  vGlow = smoothstep(0.35, 1.0, pulse);
  gl_PointSize = size * 260.0 / max(1.0, -mv.z);
}
`;

const fireflyFragmentShader = `
uniform vec3 color;
varying float vGlow;

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vGlow;
  gl_FragColor = vec4(color * a, a);
}
`;

/**
 * v1.11 (5-1): firefly motes round the camera (environment.fireflies): `count` yellow-green points (#d8ff7a) within
 * `radius` m, each floating and glowing in and out on the shader's clock: one Points, one draw, additive, no fog. The
 * CPU only moves the box's centre (update()).
 */
export class AmbientFireflies {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
  private readonly time: { value: number };
  private readonly center: { value: Vector3 };

  constructor(def: NonNullable<EnvironmentDef['fireflies']>) {
    const radius = def.radius ?? AMBIENT_FIREFLIES.radius;
    const count = Math.min(def.count, AMBIENT_FIREFLIES.max);
    const pos = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = hash(i * 5 + 1) * 2 * radius;
      pos[i * 3 + 1] = hash(i * 5 + 2);
      pos[i * 3 + 2] = hash(i * 5 + 3) * 2 * radius;
      phase[i] = hash(i * 5 + 4);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('phase', new Float32BufferAttribute(phase, 1));
    const material = new ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        center: { value: new Vector3() },
        radius: { value: radius },
        size: { value: 0.5 },
        color: { value: new Color('#d8ff7a') },
      },
      vertexShader: fireflyVertexShader,
      fragmentShader: fireflyFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.points = new Points(g, material);
    this.points.name = 'fireflies';
    this.points.frustumCulled = false;
    this.time = material.uniforms.time as { value: number };
    this.center = material.uniforms.center as { value: Vector3 };
  }

  update(dt: number, camera: PerspectiveCamera): void {
    this.time.value += dt;
    this.center.value.copy(camera.position);
  }
}

/** A soft round dot (a snowflake). */
export function dotTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

/** A steady pseudo-random number in [0, 1) for `i`. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** v1.10 (4-1): snow falling round the camera: `count` flakes in a box `radius` m round it, falling `fall` m/s. */
export class Snowfall {
  readonly points: Points;
  private readonly speed: Float32Array;
  private time = 0;

  constructor(private readonly def: SnowDef) {
    const radius = def.radius ?? 60;
    const pos = new Float32Array(def.count * 3);
    this.speed = new Float32Array(def.count);
    for (let i = 0; i < def.count; i++) {
      pos[i * 3] = (hash(i * 3) - 0.5) * 2 * radius;
      pos[i * 3 + 1] = hash(i * 3 + 1) * radius;
      pos[i * 3 + 2] = (hash(i * 3 + 2) - 0.5) * 2 * radius;
      this.speed[i] = 0.7 + hash(i * 7) * 0.6;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    (g.getAttribute('position') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
    // Tunnels (snow.ts) find it by its name to hide it inside.
    this.points = new Points(g, new PointsMaterial({ color: '#FFFFFF', size: 0.35, map: dotTexture(), transparent: true, opacity: 0.9, depthWrite: false }));
    this.points.name = 'snowfall';
    this.points.frustumCulled = false;
  }

  update(dt: number, camera: PerspectiveCamera): void {
    this.time += dt;
    const def = this.def;
    const radius = def.radius ?? 60;
    const fall = def.fall ?? 1.2;
    const attr = this.points.geometry.getAttribute('position') as Float32BufferAttribute;
    const arr = attr.array as Float32Array;
    const c = camera.position;
    for (let i = 0; i < def.count; i++) {
      let x = arr[i * 3];
      let y = arr[i * 3 + 1] - fall * this.speed[i] * dt;
      let z = arr[i * 3 + 2];
      x += Math.sin(this.time * 0.7 + i) * 0.3 * dt;
      // Keep each flake in the box round the camera (wrapping), falling from above it.
      const wrap = (v: number, centre: number): number => {
        const d = v - centre;
        return d > radius ? v - 2 * radius : d < -radius ? v + 2 * radius : v;
      };
      x = wrap(x, c.x);
      z = wrap(z, c.z);
      if (y < c.y - radius * 0.4) y += radius;
      if (y > c.y + radius * 0.6) y -= radius;
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  }
}
