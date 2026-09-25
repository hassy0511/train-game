import type { Settings, VolumeLevel } from '../core/settings';

interface Row<K extends keyof Settings> {
  key: K;
  label: string;
  choices: { value: Settings[K]; label: string }[];
}

const VOLUME: { value: VolumeLevel; label: string }[] = [
  { value: 0, label: 'けす' },
  { value: 1, label: 'ちいさく' },
  { value: 2, label: 'おおきく' },
];

const ROWS: Row<keyof Settings>[] = [
  { key: 'music', label: 'おんがく', choices: VOLUME },
  { key: 'sound', label: 'こうかおん', choices: VOLUME },
  {
    key: 'calm',
    label: 'がめんの ゆれ',
    choices: [
      { value: false, label: 'あり' },
      { value: true, label: 'へらす' },
    ],
  },
  {
    key: 'leftHanded',
    label: 'レバーの ばしょ',
    choices: [
      { value: false, label: 'ひだり' },
      { value: true, label: 'みぎ' },
    ],
  },
] as Row<keyof Settings>[];

/**
 * Settings overlay (from the gear on the title screen). Every tap applies at once through `onChange`
 * (the caller saves and applies); "とじる" closes it.
 */
export function showSettings(root: HTMLElement, current: Settings, onChange: (next: Settings) => void): void {
  let settings = { ...current };
  const el = document.createElement('div');
  el.id = 'settings';
  el.className = 'overlay settings';
  const h = document.createElement('h1');
  h.textContent = 'せってい';
  const list = document.createElement('div');
  list.className = 'settings-list';
  for (const row of ROWS) {
    const line = document.createElement('div');
    line.className = 'settings-row';
    const label = document.createElement('div');
    label.className = 'settings-label';
    label.textContent = row.label;
    const group = document.createElement('div');
    group.className = 'settings-choices';
    const buttons: HTMLButtonElement[] = [];
    for (const choice of row.choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'settings-choice';
      b.dataset.setting = row.key;
      b.dataset.value = String(choice.value);
      b.textContent = choice.label;
      b.setAttribute('aria-pressed', String(settings[row.key] === choice.value));
      b.addEventListener('click', () => {
        settings = { ...settings, [row.key]: choice.value };
        for (const other of buttons) other.setAttribute('aria-pressed', String(other === b));
        onChange(settings);
      });
      buttons.push(b);
      group.appendChild(b);
    }
    line.append(label, group);
    list.appendChild(line);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'settings-close';
  close.className = 'big-button';
  close.textContent = 'とじる';
  close.addEventListener('click', () => el.remove());
  el.append(h, list, close);
  root.appendChild(el);
}
