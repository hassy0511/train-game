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
varying vec3 vDirection;

void main() {
  float gradient = smoothstep(-0.15, 0.75, vDirection.y);
  gl_FragColor = vec4(mix(bottomColor, topColor, gradient), 1.0);
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
