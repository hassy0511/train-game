import {
  BackSide,
  Color,
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

const SKY_RADIUS = 550;

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
        mistColor: { value: new Color(environment.fog?.color ?? '#ffffff') },
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

  const hemisphere = new HemisphereLight(0xffffff, 0x99bb77, 0.9);
  hemisphere.name = `${environment.lighting}-hemisphere`;
  scene.add(hemisphere);

  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.name = `${environment.lighting}-sun`;
  sun.position.set(1, 2, 0.5).normalize().multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  if (environment.ground) {
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
