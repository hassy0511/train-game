import { Color, Fog, type DirectionalLight, type HemisphereLight, type Material, type Mesh, type Object3D, type PerspectiveCamera, type Scene } from 'three';
import type { EnvironmentDef, RailDef } from '../../stage/types';
import { buildCloudSea, buildGround, buildLights, buildSky, buildStars, lightUp, paintGround, paintSky, SKY_RADIUS, Snowfall } from './environment';

/** The camera's draw distance without a fog (m). */
export const CAMERA_FAR = 600;
/** The camera draws this far past the stage fog's far end (m). */
export const FOG_CULL_MARGIN = 40;

/** v1.10 (4-1): the track bed colour on snow. */
const SNOW_BED = '#E8EEF4';

/**
 * The pieces that come and go with the look. `moon`, `fireflies` and `landmark` are slots for looks still to come
 * (the night's moon and firefly motes, PR2c; a far landmark past the fog, 6-2): nothing builds them yet.
 */
type PieceName = 'cloudSea' | 'stars' | 'ground' | 'snowfall' | 'moon' | 'fireflies' | 'landmark';

interface Piece {
  /** What it was built from: the same key keeps it, another one builds it again. */
  key: string;
  object: Object3D;
}

/**
 * The scene's look (PHASE9_CHAPTER5_6 part 3 B6.1): background, sky dome, fog, the camera's far plane, lights,
 * ground, stars, cloud sea, falling snow (and the slots above). `apply(env)` can be called any number of times: the
 * sky, the fog and the two lights stay the same objects (other layers hold on to them) and are set again; a piece
 * that is no longer wanted is taken out and disposed, one whose settings are unchanged is kept as it is.
 * The first apply builds everything in the order the scene always had (the same draw order as before).
 * 6-2 applies a section's look as the view crosses into it; 5-1 goes from day to night and back.
 */
export class EnvironmentState {
  private skyMesh: Mesh | null = null;
  private fog: Fog | null = null;
  private readonly background = new Color();
  private lights: { hemisphere: HemisphereLight; sun: DirectionalLight } | null = null;
  private readonly pieces = new Map<PieceName, Piece>();
  private snowfall: Snowfall | null = null;
  private fogAsSet: { near: number; far: number } | null = null;
  private farAsSet = 0;

  constructor(
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {}

  /** The sky dome, which follows the camera (null before the first apply). */
  get sky(): Mesh | null {
    return this.skyMesh;
  }

  /** The fog as the look sets it (a fog stretch, a tunnel or the water only lend it for a while), or null. */
  get baseFog(): { near: number; far: number } | null {
    return this.fogAsSet;
  }

  /** The camera's usual draw distance (set from the fog; 0 without a fog); a fixed camera draws further. */
  get baseFar(): number {
    return this.farAsSet;
  }

  apply(env: EnvironmentDef): void {
    const scene = this.scene;
    scene.background = this.background.set(env.sky.bottom);
    if (env.fog) {
      this.fog ??= new Fog(env.fog.color);
      this.fog.color.set(env.fog.color);
      this.fog.near = env.fog.near;
      this.fog.far = env.fog.far;
      scene.fog = this.fog;
    } else {
      scene.fog = null;
    }

    const sky = (this.skyMesh ??= buildSky());
    paintSky(sky, env);
    // Under water the view hides it for a while; a new look starts above the surface (the view checks again).
    sky.visible = true;
    const cloudSea = this.piece('cloudSea', env.cloudSea ? 'cloud-sea' : null, buildCloudSea, scene);
    if (cloudSea && env.cloudSea) cloudSea.position.y = env.cloudSea.y;
    if (!sky.parent) scene.add(sky);
    // v1.10 (3-3): riding on the sky dome, so they follow the camera (and hide with it under water).
    this.piece('stars', env.stars ? String(env.stars.count) : null, () => buildStars(env.stars?.count ?? 0), sky);

    if (!this.lights) {
      this.lights = buildLights();
      scene.add(this.lights.hemisphere);
      scene.add(this.lights.sun, this.lights.sun.target);
    }
    lightUp(this.lights.hemisphere, this.lights.sun, env);

    // v1.10: the stage's water is the same everywhere (it cuts the ground's holes), so it is part of the key.
    const groundKey = env.ground || env.water?.length ? JSON.stringify([env.ground?.size, env.ground?.y, env.water ?? null]) : null;
    const ground = this.piece('ground', groundKey, () => buildGround(env), scene) as Mesh | null;
    if (ground) paintGround(ground, env);

    const snow = env.snow && env.snow.count > 0 ? env.snow : null;
    const snowKey = snow ? JSON.stringify(snow) : null;
    if (this.pieces.get('snowfall')?.key !== snowKey) this.snowfall = snow ? new Snowfall(snow) : null;
    this.piece('snowfall', snowKey, () => this.snowfall?.points ?? null, scene);

    // Looks still to come (PR2c: the moon and the firefly motes; 6-2: the landmark).
    this.piece('moon', null, () => null, scene);
    this.piece('fireflies', null, () => null, scene);
    this.piece('landmark', null, () => null, scene);

    // Past the fog nothing shows, so stop drawing there (the track and prop pieces beyond are culled); the sky dome
    // shrinks to stay inside the camera's reach.
    this.fogAsSet = env.fog ? { near: env.fog.near, far: env.fog.far } : null;
    this.camera.far = env.fog ? Math.min(CAMERA_FAR, env.fog.far + FOG_CULL_MARGIN) : CAMERA_FAR;
    this.camera.updateProjectionMatrix();
    this.farAsSet = env.fog ? this.camera.far : 0;
    sky.scale.setScalar(env.fog ? Math.min(1, (this.camera.far * 0.95) / SKY_RADIUS) : 1);
  }

  /** Every frame, with the camera in place: the falling snow keeps round it. */
  update(dt: number): void {
    this.snowfall?.update(dt, this.camera);
  }

  /**
   * The piece `name`: kept when built from the same `key`, else the old one is taken out and disposed and a new one
   * built and added to `parent` (a null key or a null build: none).
   */
  private piece(name: PieceName, key: string | null, build: () => Object3D | null, parent: Object3D): Object3D | null {
    const had = this.pieces.get(name);
    if (had && had.key === key) return had.object;
    if (had) {
      this.pieces.delete(name);
      disposeTree(had.object);
    }
    if (key === null) return null;
    const object = build();
    if (!object) return null;
    parent.add(object);
    this.pieces.set(name, { key, object });
    return object;
  }
}

/** Takes `root` out of the scene and frees its geometries, materials and their textures. */
function disposeTree(root: Object3D): void {
  root.removeFromParent();
  root.traverse((o) => {
    const drawn = o as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] };
    drawn.geometry?.dispose();
    const materials = drawn.material ? (Array.isArray(drawn.material) ? drawn.material : [drawn.material]) : [];
    for (const m of materials) {
      (m as Material & { map?: { dispose(): void } | null }).map?.dispose();
      m.dispose();
    }
  });
}

/**
 * v1.10 (4-1): the track beds a snowy look paints white: the whole of every rail in `rails` (a stage's rails, or one
 * section's, each under its own look).
 */
export function snowBeds(rails: readonly Pick<RailDef, 'id'>[], env: Pick<EnvironmentDef, 'surface'>): { railId: string; from: number; to: number; color: string }[] {
  return env.surface === 'snow' ? rails.map((r) => ({ railId: r.id, from: 0, to: Infinity, color: SNOW_BED })) : [];
}
