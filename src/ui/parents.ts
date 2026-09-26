import {
  clearProgress,
  loadProgress,
  passcodeToProgress,
  progressToPasscode,
  saveProgress,
  storagePersisted,
  type PasscodeError,
} from '../core/progress';

export interface ParentsOptions {
  /** The build id shown at the bottom (the title's "build …"). */
  buildId: string;
  /** After the progress was replaced (あいことば) or erased: the game starts over from the title. */
  onProgressChanged(): void;
}

const PASSCODE_ERRORS: Record<PasscodeError, string> = {
  empty: 'あいことばを いれてください。',
  letters: 'つかえない もじが あります。（えいすうじ 12もじ）',
  version: 'あいことばが ちがうようです。1もじめを たしかめてください。',
  length: 'もじの かずが ちがいます。（12もじ）',
  check: 'あいことばが ちがうようです。もういちど たしかめてください。',
};

/** Opened as a home-screen app (Safari's "ホーム画面に追加"): its storage is not dropped after a while. */
function homeScreenApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * 「おうちの かたへ」 (PHASE7_FINISH §4 items 8 and 9), behind a long press in the settings: what the game does and
 * does not do (no network, collects nothing), how to keep the progress (home screen, あいことば), the build id, and
 * erasing everything (asked twice). For grown-ups, so it reads as ordinary Japanese with a little kanji.
 */
export function showParents(root: HTMLElement, options: ParentsOptions): void {
  const el = document.createElement('div');
  el.id = 'parents';
  el.className = 'overlay parents';
  const inner = document.createElement('div');
  inner.className = 'parents-inner';
  el.appendChild(inner);

  const h = document.createElement('h1');
  h.textContent = 'おうちの かたへ';
  inner.appendChild(h);

  const section = (title: string, ...lines: string[]): HTMLElement => {
    const sec = document.createElement('section');
    sec.className = 'parents-section';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    sec.appendChild(h2);
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      sec.appendChild(p);
    }
    inner.appendChild(sec);
    return sec;
  };

  section(
    'このゲームについて',
    '遊んでいる記録や端末の情報を、どこにも送りません。名前・写真・位置など、何も集めません。',
    '通信するのは、ゲームを読みこむときと、新しい版を確かめるときだけです。広告や、アプリ内の購入はありません。',
    '記録は、この端末のブラウザの中だけに保存されます。',
  );

  const keep = section(
    '記録を消えにくくするには',
    'Safari のタブで遊んでいると、しばらく開かないうちに記録が消えることがあります（iPad のしくみです）。',
    'Safari の 共有ボタン（□に↑）→「ホーム画面に追加」で追加し、ホーム画面から開くと消えにくくなります。',
  );
  const state = document.createElement('p');
  state.id = 'parents-storage';
  state.className = 'parents-note';
  state.textContent = homeScreenApp() ? 'いまは ホーム画面から開いています。' : '';
  keep.appendChild(state);
  void storagePersisted().then((kept) => {
    if (kept) state.textContent = 'この端末では、記録を消えにくく保存しています。';
    else if (!homeScreenApp()) state.textContent = 'いまは ふつうの保存です（ホーム画面への追加がおすすめです）。';
  });

  // あいことば: the progress as 12 letters, and back.
  const pass = section(
    'あいことば（記録の書きうつし）',
    '記録を 12文字の「あいことば」にできます。書きうつしておけば、記録が消えたときや、別の端末でも、入れると元にもどせます。通信はしません。',
  );
  const show = document.createElement('button');
  show.type = 'button';
  show.id = 'parents-passcode-show';
  show.className = 'parents-button';
  show.textContent = 'あいことばを だす';
  const code = document.createElement('div');
  code.id = 'parents-passcode';
  code.className = 'parents-passcode';
  code.hidden = true;
  show.addEventListener('click', () => {
    code.textContent = progressToPasscode(loadProgress());
    code.hidden = false;
  });
  const form = document.createElement('div');
  form.className = 'parents-form';
  const input = document.createElement('input');
  input.id = 'parents-passcode-input';
  input.className = 'parents-input';
  input.type = 'text';
  input.inputMode = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'characters');
  input.placeholder = 'XXXX-XXXX-XXXX';
  input.maxLength = 24;
  const load = document.createElement('button');
  load.type = 'button';
  load.id = 'parents-passcode-load';
  load.className = 'parents-button';
  load.textContent = 'この あいことばで もどす';
  const message = document.createElement('p');
  message.id = 'parents-passcode-message';
  message.className = 'parents-note';
  load.addEventListener('click', () => {
    const read = passcodeToProgress(input.value);
    if (!read.ok) {
      message.textContent = PASSCODE_ERRORS[read.error];
      message.classList.add('is-error');
      return;
    }
    message.textContent = '';
    message.classList.remove('is-error');
    const found = read.progress;
    confirm(
      el,
      `いまの記録を、この あいことばの記録（クリア ${found.cleared.length}・ずかん ${found.records.length}）に 入れかえます。`,
      '入れかえる',
      () => {
        saveProgress(found);
        options.onProgressChanged();
      },
    );
  });
  form.append(input, load);
  pass.append(show, code, form, message);

  // Erase everything: asked twice.
  const erase = section('記録を ぜんぶ けす', 'クリアした島・おぼえたこと・ずかんを、すべて消します。設定（音やレバーの位置）はそのままです。');
  const eraseButton = document.createElement('button');
  eraseButton.type = 'button';
  eraseButton.id = 'parents-reset';
  eraseButton.className = 'parents-button is-danger';
  eraseButton.textContent = 'きろくを ぜんぶ けす';
  eraseButton.addEventListener('click', () => {
    confirm(el, '記録を ぜんぶ 消しますか？', 'けす', () => {
      confirm(el, 'ほんとうに 消しますか？\n消した記録は もどせません。', 'ぜんぶ けす', () => {
        clearProgress();
        options.onProgressChanged();
      });
    });
  });
  erase.appendChild(eraseButton);

  const build = document.createElement('p');
  build.id = 'parents-build';
  build.className = 'parents-build';
  build.textContent = `ビルド ${options.buildId}`;
  inner.appendChild(build);

  const close = document.createElement('button');
  close.type = 'button';
  close.id = 'parents-close';
  close.className = 'big-button';
  close.textContent = 'とじる';
  close.addEventListener('click', () => el.remove());
  const closeTop = document.createElement('button');
  closeTop.type = 'button';
  closeTop.id = 'parents-close-top';
  closeTop.className = 'parents-button';
  closeTop.textContent = 'とじる';
  closeTop.addEventListener('click', () => el.remove());
  el.append(close, closeTop);
  root.appendChild(el);
}

/** A question over the page with "yes" and "やめる"; `onYes` runs on yes. */
function confirm(root: HTMLElement, question: string, yes: string, onYes: () => void): void {
  const box = document.createElement('div');
  box.className = 'parents-confirm';
  box.setAttribute('role', 'alertdialog');
  const panel = document.createElement('div');
  panel.className = 'parents-confirm-panel';
  const p = document.createElement('p');
  p.className = 'parents-confirm-text';
  p.textContent = question;
  const row = document.createElement('div');
  row.className = 'parents-confirm-buttons';
  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'parents-button parents-confirm-no';
  no.textContent = 'やめる';
  no.addEventListener('click', () => box.remove());
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'parents-button is-danger parents-confirm-yes';
  ok.textContent = yes;
  ok.addEventListener('click', () => {
    box.remove();
    onYes();
  });
  row.append(no, ok);
  panel.append(p, row);
  box.appendChild(panel);
  root.appendChild(box);
}
