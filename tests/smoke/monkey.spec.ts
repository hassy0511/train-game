import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Soak test: a "child" mashes the controls for a few minutes and a watchdog looks for the game getting stuck
 * (frame loop dead, no way forward, uncaught errors). Opt-in: MONKEY=1 (MONKEY_STAGES, MONKEY_SECONDS, MONKEY_RUNS).
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output', 'monkey');
mkdirSync(OUT, { recursive: true });

const STAGES = (process.env.MONKEY_STAGES ?? '1-1,1-2').split(',');
const SECONDS = Number(process.env.MONKEY_SECONDS ?? 240);
const RUNS = Number(process.env.MONKEY_RUNS ?? 2);

/** Runs in the page: random presses every 250 ms, with a little sense (jump when it glows, slow down at stations). */
function installMonkey(seed: number): void {
  let x = seed;
  const rnd = (): number => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const visible = (id: string): HTMLElement | null => {
    const el = document.getElementById(id);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' ? el : null;
  };
  const press = (el: Element, type = 'pointerdown'): void => {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
    el.dispatchEvent(new PointerEvent(type, init));
    if (type === 'pointerdown') el.dispatchEvent(new PointerEvent('pointerup', init));
  };
  const lever = (notch: number): void => {
    const lv = document.getElementById('lever');
    const d = document.querySelector(`.lever-detent[data-notch="${notch}"]`);
    if (!lv || !d) return;
    const r = d.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', clientX: r.x + 30, clientY: r.y + r.height / 2 };
    try {
      lv.dispatchEvent(new PointerEvent('pointerdown', init));
    } catch {
      /* setPointerCapture may refuse synthetic ids */
    }
    lv.dispatchEvent(new PointerEvent('pointerup', init));
  };
  const log: string[] = [];
  (window as unknown as { monkeyLog: string[] }).monkeyLog = log;
  const act = (what: string): void => {
    const app = document.getElementById('app')!.dataset;
    log.push(`${app.time} ${what} phase=${app.phase} m=${app.mission}.${app.step} rail=${app.rail} s=${app.s} v=${app.speed}`);
    if (log.length > 400) log.shift();
  };
  window.setInterval(() => {
    const card = visible('card-button');
    if (card) {
      if (rnd() < 0.5) {
        act('card');
        (card as HTMLButtonElement).click();
      }
      return;
    }
    const caption = visible('caption');
    if (caption && rnd() < 0.3) caption.click();
    const door = visible('door');
    if (door && rnd() < 0.4) {
      act('door');
      press(door);
    }
    const jump = visible('jump');
    if (jump?.dataset.glow === '1' && rnd() < 0.5) {
      act('jump(glow)');
      press(jump);
    }
    const r = rnd();
    const gauge = visible('stop-gauge');
    if (r < 0.12) {
      const weights = gauge ? [0.05, 0.4, 0.4, 0.1, 0.03, 0.02] : [0.05, 0.1, 0.15, 0.3, 0.25, 0.15];
      let pick = rnd();
      let n = 0;
      while (n < weights.length - 1 && pick > weights[n]) pick -= weights[n++];
      act(`lever ${n}`);
      lever(n);
    } else if (r < 0.16 && jump) {
      act('jump');
      press(jump);
    } else if (r < 0.2) {
      const w = visible('whistle');
      if (w) {
        act('whistle');
        press(w);
      }
    } else if (r < 0.22) {
      const l = visible('light');
      if (l) {
        act('light');
        press(l);
      }
    } else if (r < 0.25) {
      const arrows = document.querySelectorAll('#junction .arrow');
      const a = arrows[Math.floor(rnd() * arrows.length)];
      if (a && visible('junction')) {
        act('arrow');
        press(a);
      }
    } else if (r < 0.3) {
      const b = visible('bubble');
      if (b) press(b);
    }
  }, 250);
}

interface Snap {
  t: number;
  time: number;
  phase: string;
  mission: string;
  step: string;
  rail: string;
  s: number;
  speed: number;
  notch: string;
  air: string;
  card: boolean;
  bubble: string;
  error: string;
}

async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const d = document.getElementById('app')!.dataset;
    const card = document.getElementById('card');
    const bubble = document.getElementById('bubble');
    return {
      t: Date.now(),
      time: Number(d.time ?? 0),
      phase: d.phase ?? '',
      mission: d.mission ?? '',
      step: d.step ?? '',
      rail: d.rail ?? '',
      s: Number(d.s ?? 0),
      speed: Number(d.speed ?? 0),
      notch: d.notch ?? '',
      air: d.air ?? '',
      card: !!card,
      bubble: bubble && !bubble.hidden ? (bubble.dataset.line ?? '') : '',
      error: d.error ?? '',
    };
  });
}

for (const stage of STAGES) {
  for (let run = 0; run < RUNS; run++) {
    test(`monkey ${stage} #${run}`, async ({ page }) => {
      test.skip(!process.env.MONKEY, 'soak test: set MONKEY=1');
      test.setTimeout((SECONDS + 120) * 1000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await page.goto(`/?stage=${stage}&go=1`);
      await page.waitForFunction(() => document.getElementById('app')?.dataset.ready === '1', null, { timeout: 60_000 });
      const seed = 1 + run * 7919 + stage.charCodeAt(2) * 31;
      await page.evaluate(installMonkey, seed);

      const history: Snap[] = [];
      const problems: string[] = [];
      let lastProgress = Date.now();
      let lastKey = '';
      const end = Date.now() + SECONDS * 1000;
      while (Date.now() < end && problems.length === 0) {
        await page.waitForTimeout(1000);
        const s = await snap(page);
        history.push(s);
        const prev = history[history.length - 4];
        if (prev && s.time === prev.time) problems.push('FROZEN: game time stopped advancing for 3 s');
        // Progress = anything the player can see changing: position, phase, mission step, a card to tap.
        const key = `${s.phase}|${s.mission}.${s.step}|${s.rail}|${Math.round(s.s)}|${s.card}`;
        if (key !== lastKey) {
          lastKey = key;
          lastProgress = Date.now();
        } else if (Date.now() - lastProgress > 40_000) {
          problems.push(`STUCK: nothing changed for 40 s (${key})`);
        }
        if (s.error) problems.push('boot error overlay');
        if (errors.length) problems.push('uncaught errors');
      }
      const final = await snap(page).catch(() => null);
      const monkeyLog = await page.evaluate(() => (window as unknown as { monkeyLog: string[] }).monkeyLog.slice(-60)).catch(() => []);
      const name = `${stage}-${run}`;
      await page.screenshot({ path: resolve(OUT, `${name}.png`) }).catch(() => undefined);
      writeFileSync(
        resolve(OUT, `${name}.log`),
        [
          `problems: ${problems.join('; ') || 'none'}`,
          `final: ${JSON.stringify(final)}`,
          ...errors,
          '--- last actions',
          ...monkeyLog,
          '--- history',
          ...history.map((h) => JSON.stringify(h)),
        ].join('\n'),
      );
      const reached = history.reduce((m, h) => (`${h.mission}.${h.step}` > m ? `${h.mission}.${h.step}` : m), '');
      console.log(`${name}: reached ${reached}, problems: ${problems.join('; ') || 'none'}`);
      if (problems.length) throw new Error(`${name}: ${problems.join('; ')}\n${errors.join('\n')}`);
    });
  }
}
