const BADGE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#ffd166" stroke="#e9573f" stroke-width="6"/>
  <circle cx="60" cy="60" r="38" fill="#3fa7d6"/>
  <path d="M20 60h80" stroke="#f4f4f0" stroke-width="6" stroke-linecap="round"/>
  <path d="M30 48h60M30 72h60" stroke="#f4f4f0" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  <circle cx="60" cy="60" r="9" fill="#ffd166" stroke="#2b3a4a" stroke-width="3"/>
</svg>`;

export type CardIcon = 'badge' | 'ring' | 'wave' | 'snow' | 'drawing';

/**
 * v1.10 (3-2): a crayon drawing of the Wonder train on drawing paper (the boat's sail): three round cars with windows
 * and wheels (no face), wobbly crayon lines, a pink swirl in the corner. Drawn in the DOM, never in 3D.
 */
const DRAWING = (() => {
  // Each line is drawn twice, a little apart, so it looks like crayon.
  const crayon = (d: string, color: string, width = 3.2): string =>
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>` +
    `<path d="${d}" transform="translate(0.8 0.6)" fill="none" stroke="${color}" stroke-width="${width * 0.6}" stroke-linecap="round" opacity="0.55"/>`;
  const cars = [0, 1, 2]
    .map((i) => {
      const x = 14 + i * 50;
      const body = `M${x} 64 q-2 -22 6 -26 l32 -1 q8 3 6 27 z`;
      const win = `M${x + 8} 46 h10 v9 h-10 z M${x + 26} 46 h10 v9 h-10 z`;
      const wheels = `M${x + 12} 70 a5 5 0 1 0 0.1 0 M${x + 34} 70 a5 5 0 1 0 0.1 0`;
      return crayon(body, i === 0 ? '#e9573f' : '#3fa7d6') + crayon(win, '#2b3a4a', 2.4) + crayon(wheels, '#2b3a4a', 2.6);
    })
    .join('');
  const coupling = crayon('M62 58 h6 M112 58 h6', '#2b3a4a', 2.4);
  const rail = crayon('M6 80 q80 4 158 -1', '#8a6a48', 2.4);
  const swirl = crayon('M150 96 c0-3 4-3 4 0 0 5-8 5-8 0 0-7 12-7 12 0 0 9-16 9-16 0', '#e8579f', 2.6);
  return `<svg class="card-drawing" viewBox="0 0 170 110" role="img" aria-label="ワンダーごうの え">${cars}${coupling}${rail}${swirl}</svg>`;
})();

/** Chapter 3's end (water): a wave with bubbles over the sea. */
const WAVE = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#bfe9ff" stroke="#ffd166" stroke-width="6"/>
  <path d="M10 70 C24 52 38 52 48 64 C56 74 68 72 70 60 C72 44 92 40 104 56 L110 60 A54 54 0 0 1 10 70 Z" fill="#3fa7d6"/>
  <path d="M16 84 C30 74 42 76 54 84 C66 92 80 92 104 80 A54 54 0 0 1 16 84 Z" fill="#1d7fb8"/>
  <path d="M70 60 C72 48 86 44 96 52" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="40" cy="36" r="7" fill="#fff" stroke="#3fa7d6" stroke-width="2.5"/>
  <circle cx="56" cy="24" r="4.5" fill="#fff" stroke="#3fa7d6" stroke-width="2"/>
  <circle cx="30" cy="20" r="3.5" fill="#fff" stroke="#3fa7d6" stroke-width="2"/>
</svg>`;

/** v1.10 (3-1): Sakasa's mark on the mirror-written note: a pink swirl in the paper's corner. */
const SWIRL = `<svg class="card-swirl" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 32c0-3 4-3 4 0 0 5-8 5-8 0 0-7 12-7 12 0 0 9-16 9-16 0 0-11 20-11 20 0 0 13-24 13-24 0" fill="none" stroke="#e8579f" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

/** Chapter 4's end (ice and snow): a snow crystal. */
const SNOW = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#6f9fe0" stroke="#ffd166" stroke-width="6"/>
  <g stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none">
    ${[0, 60, 120]
      .map(
        (a) => `<g transform="rotate(${a} 60 60)">
      <path d="M60 22 V98"/>
      <path d="M60 36 L50 28 M60 36 L70 28 M60 84 L50 92 M60 84 L70 92"/>
    </g>`,
      )
      .join('')}
  </g>
  <circle cx="60" cy="60" r="8" fill="#fff"/>
</svg>`;

/** Chapter 2's end: six islands joined by rail into a ring. */
const RING = `<svg class="card-icon" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="54" fill="#3fa7d6" stroke="#ffd166" stroke-width="6"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#a2805c" stroke-width="9" stroke-dasharray="3 3.3"/>
  <circle cx="60" cy="60" r="36" fill="none" stroke="#f4f4f0" stroke-width="2.5"/>
  <circle cx="60.0" cy="24.0" r="12" fill="#8bd17c" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="42.0" r="12" fill="#f4a261" stroke="#fff" stroke-width="4"/>
  <circle cx="91.2" cy="78.0" r="12" fill="#c9b8f0" stroke="#fff" stroke-width="4"/>
  <circle cx="60.0" cy="96.0" r="12" fill="#5fb36b" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="78.0" r="12" fill="#f2d45c" stroke="#fff" stroke-width="4"/>
  <circle cx="28.8" cy="42.0" r="12" fill="#e76f51" stroke="#fff" stroke-width="4"/>
</svg>`;

/** A stage's clear card extras (src/mission/runner.ts ClearRewards). */
export interface CardRewards {
  stops: number;
  perfect: number;
  records: { id: string; name: string; found: boolean; fresh: boolean }[];
}

/** "ぴたっ！": the stop line with the train's front right on it. */
const STOP_ICON = `<svg class="reward-icon" viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="22" fill="#ffd166" stroke="#fff" stroke-width="3"/>
  <rect x="8" y="16" width="22" height="16" rx="4" fill="#3fa7d6"/>
  <rect x="12" y="19" width="12" height="6" rx="1.5" fill="#1f2a44"/>
  <rect x="30" y="10" width="4" height="28" rx="2" fill="#e9573f"/>
</svg>`;

/** Records the picture book has a picture of (public/zukan/<id>.png). */
const pictures = new Set<string>(__ZUKAN_PICTURES__);

/**
 * The clear card's row of rewards (PHASE7_FINISH §4 item 10): "ぴたっ！ 5かい" (or "とまれた！ 5かい" when none was
 * perfect: never a zero to feel bad about), and the stage's records as pictures, found ones in colour (new ones
 * pop), the rest as "？", with "きろく 2/3" (or "きろく さがしてみよう" while none is found: no zero there either).
 */
function rewardsRow(rewards: CardRewards): HTMLElement {
  const row = document.createElement('div');
  row.className = 'card-rewards';
  row.id = 'card-rewards';
  if (rewards.stops > 0) {
    const chip = document.createElement('div');
    chip.className = 'reward-chip';
    chip.id = 'reward-stops';
    chip.dataset.perfect = String(rewards.perfect);
    chip.innerHTML = STOP_ICON;
    const text = document.createElement('span');
    text.className = 'reward-text';
    text.textContent = rewards.perfect > 0 ? `ぴたっ！ ${rewards.perfect}かい` : `とまれた！ ${rewards.stops}かい`;
    chip.appendChild(text);
    row.appendChild(chip);
  }
  if (rewards.records.length > 0) {
    const chip = document.createElement('div');
    chip.className = 'reward-chip';
    chip.id = 'reward-records';
    const found = rewards.records.filter((r) => r.found).length;
    chip.dataset.found = `${found}/${rewards.records.length}`;
    const icons = document.createElement('span');
    icons.className = 'reward-records';
    rewards.records.forEach((r, i) => {
      const icon = document.createElement('span');
      icon.className = `reward-record${r.found ? ' is-found' : ''}${r.fresh ? ' is-fresh' : ''}`;
      icon.dataset.record = r.id;
      icon.style.setProperty('--i', String(i));
      if (r.found && pictures.has(r.id)) {
        const img = document.createElement('img');
        img.src = `${import.meta.env.BASE_URL}zukan/${r.id}.png`;
        img.alt = r.name;
        icon.appendChild(img);
      } else icon.textContent = r.found ? '★' : '？';
      icons.appendChild(icon);
    });
    const text = document.createElement('span');
    text.className = 'reward-text';
    // None found on this island yet: no "0/3" either, just an invitation.
    text.textContent = found > 0 ? `きろく ${found}/${rewards.records.length}` : 'きろく さがしてみよう';
    chip.append(icons, text);
    row.appendChild(chip);
  }
  return row;
}

/**
 * Full-screen card with a title, an optional icon, and one button. Resolves on tap. With `guardSeconds` the
 * button pops in only after that long, so a child still tapping from before cannot close a once-only card
 * (a chapter's end) before seeing it.
 */
export function showCard(
  root: HTMLElement,
  title: string,
  button: string,
  icon?: CardIcon,
  guardSeconds = 0,
  rewards?: CardRewards,
  options: { mirror?: boolean } = {},
): Promise<void> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'overlay card';
    el.id = 'card';
    if (options.mirror) {
      // v1.10 (3-1): a small note on paper, written mirror-wise (a child cannot read it; the swirl says who wrote it).
      el.classList.add('is-mirror');
      el.insertAdjacentHTML('beforeend', SWIRL);
    }
    // v1.10 (3-2): a crayon drawing on drawing paper.
    if (icon === 'drawing') el.classList.add('is-drawing');
    if (icon) el.insertAdjacentHTML('beforeend', { badge: BADGE, ring: RING, wave: WAVE, snow: SNOW, drawing: DRAWING }[icon]);
    const h = document.createElement('h1');
    if (options.mirror) h.setAttribute('aria-label', 'ぐるぐる もようの てがみ');
    const lines = title.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) h.appendChild(document.createElement('br'));
      h.appendChild(document.createTextNode(line));
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'big-button';
    btn.id = 'card-button';
    btn.textContent = button;
    let open = guardSeconds <= 0;
    if (!open) {
      btn.classList.add('is-guarded');
      window.setTimeout(() => {
        open = true;
        btn.classList.remove('is-guarded');
        btn.classList.add('is-popping');
      }, guardSeconds * 1000);
    }
    btn.addEventListener('click', () => {
      if (!open) return;
      el.remove();
      resolve();
    });
    el.append(h, ...(rewards ? [rewardsRow(rewards)] : []), btn);
    root.appendChild(el);
  });
}
