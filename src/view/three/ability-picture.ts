import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, RingGeometry, SRGBColorSpace } from 'three';
import type { AbilityId } from '../../stage/types';

/**
 * v1.8: an ability's picture drawn on a canvas (the same shapes as the round buttons' SVG icons, 32×32 units), for
 * the little round sign on a junction whose side way needs that ability. Null for abilities without a picture yet.
 */
function drawAbility(ctx: CanvasRenderingContext2D, ability: AbilityId): boolean {
  const ink = '#2b3a4a';
  const fill = (d: string, color: string): void => {
    ctx.fillStyle = color;
    ctx.fill(new Path2D(d));
  };
  const stroke = (d: string, width: number): void => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(d));
  };
  const roundRect = (x: number, y: number, w: number, h: number, r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  switch (ability) {
    case 'rocket':
      fill('M11 12c-4 0-7 2-9 4 2 2 5 4 9 4-1.5-1.3-2.2-2.6-2.2-4s.7-2.7 2.2-4z', '#ff9f1c');
      fill('M11 13.6c-2.2.2-3.8 1.2-5 2.4 1.2 1.2 2.8 2.2 5 2.4-.8-.8-1.2-1.6-1.2-2.4s.4-1.6 1.2-2.4z', '#ffe066');
      roundRect(10, 10, 17, 12, 6, ink);
      ctx.fillStyle = '#8fd3f4';
      ctx.beginPath();
      ctx.arc(21, 16, 2.6, 0, Math.PI * 2);
      ctx.fill();
      roundRect(12, 8, 5, 3, 1.2, ink);
      roundRect(12, 21, 5, 3, 1.2, ink);
      return true;
    case 'jump':
      ctx.setLineDash([3, 3]);
      stroke('M4 24c4-12 20-12 24 0', 2.6);
      ctx.setLineDash([]);
      roundRect(11, 6, 10, 7, 2, ink);
      return true;
    case 'light':
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(11, 16, 6, 0, Math.PI * 2);
      ctx.fill();
      stroke('M19 10l9-4M19 16h10M19 22l9 4', 2.4);
      return true;
    default:
      return false;
  }
}

/** A round white sign (radius `radius` m, facing +Z) with the ability's picture, or null when it has none. */
export function buildAbilitySign(ability: AbilityId, radius: number): Group | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.save();
  // The 32-unit icon fills the middle of the disc.
  ctx.translate(16, 16);
  ctx.scale(3, 3);
  const drawn = drawAbility(ctx, ability);
  ctx.restore();
  if (!drawn) return null;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const group = new Group();
  group.name = `ability-sign:${ability}`;
  const face = new Mesh(new CircleGeometry(radius, 32), new MeshBasicMaterial({ map: texture }));
  const rim = new Mesh(new RingGeometry(radius, radius * 1.14, 32), new MeshBasicMaterial({ color: '#ff9f1c' }));
  rim.position.z = 0.005;
  group.add(face, rim);
  return group;
}
