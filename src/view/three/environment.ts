import {
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
} from 'three';
import type { EnvironmentDef, SnowDef } from '../../stage/types';
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

/**
 * Sets the lights for `environment.lighting` ("day", or v1.10 (3-3) "evening": a warm low sun from the pink side of
 * the sky and a bluer ground light, not darker overall). On snow the light from below is white, not the grass green
 * of the other islands (v1.10, 4-1).
 */
export function lightUp(hemisphere: HemisphereLight, sun: DirectionalLight, environment: EnvironmentDef): void {
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
  return ground;
}

/** Sets the ground's colour; a snowy ground gets a little light of its own, so the snow is white rather than grey. */
export function paintGround(ground: Mesh, environment: EnvironmentDef): void {
  const material = ground.material as MeshLambertMaterial;
  if (!material.isMeshLambertMaterial || !environment.ground) return;
  material.color.set(environment.ground.color);
  if (environment.surface === 'snow') material.emissive.copy(material.color).multiplyScalar(0.3);
  else material.emissive.setRGB(0, 0, 0);
}

/** A soft round dot (a snowflake). */
function dotTexture(): CanvasTexture | null {
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
