export interface Hud {
  setSpeedWord(word: string): void;
}

export function createHud(root: HTMLElement): Hud {
  const speed = document.createElement('div');
  speed.id = 'hud-speed';
  speed.className = 'hud-speed';
  speed.textContent = '';
  root.appendChild(speed);
  let last = '';
  return {
    setSpeedWord(word: string): void {
      if (word === last) return;
      last = word;
      speed.textContent = word;
    },
  };
}
