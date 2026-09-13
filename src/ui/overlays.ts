export interface Overlays {
  showEnd(): void;
  showError(message: string): void;
}

export function createOverlays(root: HTMLElement): Overlays {
  const rotate = document.createElement('div');
  rotate.id = 'rotate-notice';
  rotate.className = 'overlay';
  rotate.innerHTML = '<h1>よこむきにしてね</h1><p>iPad や スマホを よこに してから あそんでね</p>';
  root.appendChild(rotate);

  const end = document.createElement('div');
  end.id = 'end-overlay';
  end.className = 'overlay';
  end.hidden = true;
  end.innerHTML = '<h1>おしまい！</h1><p>せんろの おわりに つきました</p>';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'big-button';
  again.textContent = 'もういちど';
  again.addEventListener('click', () => location.reload());
  end.appendChild(again);
  root.appendChild(end);

  const error = document.createElement('div');
  error.id = 'error-overlay';
  error.className = 'overlay';
  error.hidden = true;
  root.appendChild(error);

  return {
    showEnd(): void {
      end.hidden = false;
    },
    showError(message: string): void {
      error.innerHTML = '<h1>うまく うごかなかった</h1>';
      const p = document.createElement('p');
      p.textContent = message;
      error.appendChild(p);
      error.hidden = false;
    },
  };
}
