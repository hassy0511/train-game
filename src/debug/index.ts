import { AxesHelper, BufferGeometry, Group, Line, LineBasicMaterial, Vector3 } from 'three';
import type { Whistle } from '../actions/whistle';
import type { AudioEngine } from '../audio/audio';
import type { RailNetwork } from '../rail/types';
import { SPEED_NOTCHES } from '../train/params';
import type { Train } from '../train/train';
import type { SceneView } from '../view/SceneView';

export interface DebugContext {
  train: Train;
  whistle: Whistle;
  audio: AudioEngine;
  view: SceneView;
  network: RailNetwork;
  uiRoot: HTMLElement;
}

/**
 * Development helpers: keyboard driving, a stats panel and a spline visualizer.
 * This module is only imported behind `import.meta.env.DEV`, so it never ships in production.
 */
export function installDebug(ctx: DebugContext): { update(fps: number): void } {
  // Dev only: lets a browser console (or a probe script) look at the scene.
  (window as unknown as { __debugView?: SceneView }).__debugView = ctx.view;
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  ctx.uiRoot.appendChild(panel);

  let helper: Group | null = null;
  const toggleHelper = (): void => {
    const scene = ctx.view.getScene();
    if (!scene) return;
    if (helper) {
      scene.remove(helper);
      helper = null;
      return;
    }
    helper = new Group();
    for (const rail of ctx.network.rails.values()) {
      const pts: Vector3[] = [];
      for (let s = 0; s <= rail.length; s += 2) pts.push(rail.frameAt(s).position.clone().setY(rail.frameAt(s).position.y + 0.05));
      helper.add(new Line(new BufferGeometry().setFromPoints(pts), new LineBasicMaterial({ color: 0xffff00 })));
      for (let s = 0; s <= rail.length; s += 20) {
        const axes = new AxesHelper(2);
        const f = rail.frameAt(s);
        axes.position.copy(f.position);
        axes.lookAt(f.position.clone().add(f.tangent));
        helper.add(axes);
      }
    }
    scene.add(helper);
  };

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowUp':
        ctx.train.setNotch(ctx.train.state.notch + 1);
        break;
      case 'ArrowDown':
        ctx.train.setNotch(ctx.train.state.notch - 1);
        break;
      case 'ArrowLeft':
        ctx.train.chooseJunction('left');
        break;
      case 'ArrowRight':
        ctx.train.chooseJunction('right');
        break;
      case ' ':
        ctx.audio.unlock();
        if (ctx.whistle.trigger()) ctx.audio.playWhistle();
        break;
      case 'v':
      case 'V':
        toggleHelper();
        break;
      case 'r':
      case 'R':
        location.reload();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  console.info('[debug] keys: ↑↓ notch, ←→ junction, Space whistle, V spline helper, R restart');

  return {
    update(fps: number): void {
      const st = ctx.train.state;
      const stats = ctx.view.getStats();
      panel.textContent =
        `fps ${fps.toFixed(0)}\n` +
        `rail ${st.railId}  s ${st.s.toFixed(1)} m\n` +
        `speed ${st.speed.toFixed(1)} / ${SPEED_NOTCHES[st.notch]} m/s\n` +
        (stats ? `draw ${stats.drawCalls}  tris ${stats.triangles}` : '');
    },
  };
}
