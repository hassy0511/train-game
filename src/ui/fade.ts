/** Black fade overlay. Resolves when the transition ends. */
export function createFade(root: HTMLElement): (toBlack: boolean, seconds: number) => Promise<void> {
  const el = document.createElement('div');
  el.id = 'fade';
  el.className = 'fade';
  root.appendChild(el);
  return (toBlack, seconds) =>
    new Promise((resolve) => {
      el.style.transitionDuration = `${seconds}s`;
      el.classList.toggle('is-black', toBlack);
      // Force a style flush so the transition runs even when toggled quickly.
      void el.offsetWidth;
      el.style.opacity = toBlack ? '1' : '0';
      window.setTimeout(resolve, seconds * 1000);
    });
}
