import {
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';
import type { EnvironmentDef } from '../../stage/types';
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
function buildStars(count: number): Points {
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

/** Builds the stage environment and returns the sky that must follow the camera. */
export function addEnvironment(scene: Scene, environment: EnvironmentDef): Mesh {
  scene.background = new Color(environment.sky.bottom);
  if (environment.fog) {
    scene.fog = new Fog(environment.fog.color, environment.fog.near, environment.fog.far);
  }

  const sky = new Mesh(
    new SphereGeometry(SKY_RADIUS, 32, 16),
    new ShaderMaterial({
      uniforms: {
        topColor: { value: new Color(environment.sky.top) },
        bottomColor: { value: new Color(environment.sky.bottom) },
        // Inside a fog stretch the sky whitens too (0 = clear, 1 = all mist).
        // This shader writes its colour straight out (no sRGB encoding), so the mist colour goes in already
        // encoded: at full mist the sky then matches the fogged scenery exactly (a tinted fog showed seams).
        mistColor: { value: new Color(environment.fog?.color ?? '#ffffff').convertLinearToSRGB() },
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
  if (environment.cloudSea) {
    // A soft white floor far below the sky islands; the fog blends it into the horizon.
    const sea = new Mesh(new PlaneGeometry(4000, 4000), new MeshLambertMaterial({ color: '#F4F8FF', emissive: new Color('#DDE8F5') }));
    sea.name = 'cloud-sea';
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = environment.cloudSea.y;
    scene.add(sea);
  }
  scene.add(sky);
  if (environment.stars) sky.add(buildStars(environment.stars.count));

  // v1.10 (3-3) "evening": a warm low sun from the pink side of the sky and a bluer ground light (not darker overall).
  const evening = environment.lighting === 'evening';
  const hemisphere = evening ? new HemisphereLight(0xffd9b8, 0x6a7ab0, 0.95) : new HemisphereLight(0xffffff, 0x99bb77, 0.9);
  hemisphere.name = `${environment.lighting}-hemisphere`;
  scene.add(hemisphere);

  const sun = new DirectionalLight(evening ? 0xffc89a : 0xffffff, evening ? 1.05 : 1.2);
  sun.name = `${environment.lighting}-sun`;
  if (evening) sun.position.set(-1, 0.28, -0.35).normalize().multiplyScalar(100);
  else sun.position.set(1, 2, 0.5).normalize().multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  if (environment.water && environment.water.length > 0) {
    // v1.10: the ground has holes where the ponds are (or is the sea's surface and floor, drawn by the water layer).
    const ground = buildWaterGround(environment);
    if (ground) scene.add(ground);
  } else if (environment.ground) {
    const ground = new Mesh(
      new PlaneGeometry(environment.ground.size, environment.ground.size),
      new MeshLambertMaterial({ color: environment.ground.color }),
    );
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = environment.ground.y;
    scene.add(ground);
  }

  return sky;
}
