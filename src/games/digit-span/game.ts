// GAME 5 — Digit Span (working memory)
//
// Digits shown one at a time (800ms on, 200ms off), then typed back on
// an on-screen numpad (never the device keyboard). Start at 4 digits;
// correct -> +1, wrong -> one retry at the same length (new sequence),
// second wrong ends the round. Score = longest correctly recalled span.
// Reverse mode (separate difficulty): type the sequence backwards.
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import { now, scheduleAt, type CancelHandle } from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';

const DIGIT_ON_MS = 800;
const DIGIT_OFF_MS = 200;
const START_LEN = 4;

const ui = strings.games['digit-span'].ui;

export function run(ctx: PlayContext): void {
  const { stage, meta, difficulty } = ctx;
  const reverse = difficulty === 'reverse';
  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    // hidden tab during presentation = missed digits -> abort cleanly
    pauseMode: 'abort',
  });

  stage.innerHTML = `
    <div class="ds-top mono dim"></div>
    <div class="ds-display"><span class="ds-digit"></span></div>
    <div class="ds-input" hidden>
      <div class="ds-typed mono"></div>
      <div class="ds-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-key="${n}">${n}</button>`).join('')}
        <button data-key="back">⌫</button>
        <button data-key="0">0</button>
        <button data-key="ok" class="primary">✓</button>
      </div>
    </div>`;
  const topEl = stage.querySelector<HTMLElement>('.ds-top')!;
  const digitEl = stage.querySelector<HTMLElement>('.ds-digit')!;
  const displayEl = stage.querySelector<HTMLElement>('.ds-display')!;
  const inputEl = stage.querySelector<HTMLElement>('.ds-input')!;
  const typedEl = stage.querySelector<HTMLElement>('.ds-typed')!;
  const padEl = stage.querySelector<HTMLElement>('.ds-pad')!;

  let length = START_LEN;
  let retryUsed = false;
  let longestCorrect = 0;
  let sequence: number[] = [];
  let typed: number[] = [];
  let phase: 'showing' | 'input' | 'done' = 'showing';
  let pending: CancelHandle[] = [];

  const cancelPending = (): void => {
    for (const h of pending) h.cancel();
    pending = [];
  };

  const newSequence = (len: number): number[] => {
    const seq: number[] = [];
    for (let i = 0; i < len; i++) {
      let d = Math.floor(Math.random() * 10);
      // avoid immediate repeats — a repeated digit across the 200ms
      // blank is too easy to miscount
      while (i > 0 && d === seq[i - 1]) d = Math.floor(Math.random() * 10);
      seq.push(d);
    }
    return seq;
  };

  const presentSequence = (): void => {
    phase = 'showing';
    sequence = newSequence(length);
    typed = [];
    topEl.textContent = ui.lengthLabel(length);
    inputEl.hidden = true;
    displayEl.hidden = false;
    digitEl.textContent = '';

    // 800ms on / 200ms off, scheduled on an absolute rAF timeline
    const t0 = now() + 600; // brief settle before the first digit
    sequence.forEach((d, i) => {
      const onAt = t0 + i * (DIGIT_ON_MS + DIGIT_OFF_MS);
      pending.push(
        scheduleAt(onAt, () => {
          digitEl.textContent = String(d);
        })
      );
      pending.push(
        scheduleAt(onAt + DIGIT_ON_MS, () => {
          digitEl.textContent = '';
        })
      );
    });
    pending.push(
      scheduleAt(t0 + sequence.length * (DIGIT_ON_MS + DIGIT_OFF_MS), () => {
        phase = 'input';
        displayEl.hidden = true;
        inputEl.hidden = false;
        topEl.textContent = reverse ? ui.typeReverse : ui.typeForward;
        renderTyped();
      })
    );
  };

  const renderTyped = (): void => {
    typedEl.textContent = typed.length ? typed.join(' ') : '·';
    padEl.querySelector<HTMLButtonElement>('[data-key="ok"]')!.disabled =
      typed.length !== sequence.length;
  };

  const submit = async (): Promise<void> => {
    const expected = reverse ? [...sequence].reverse() : sequence;
    const correct =
      typed.length === expected.length &&
      typed.every((d, i) => d === expected[i]);

    if (correct) {
      longestCorrect = length;
      length++;
      retryUsed = false;
      transitionToNext(true);
      return;
    }
    if (!retryUsed) {
      retryUsed = true;
      transitionToNext(false); // one retry at same length, fresh sequence
      return;
    }
    // second miss at this length -> round over
    phase = 'done';
    cancelPending();
    await shell.finish({
      score: longestCorrect,
      valid: longestCorrect > 0,
      params: { mode: reverse ? 'reverse' : 'forward', failedAt: length },
    });
    renderResults(stage, {
      meta,
      score: longestCorrect > 0 ? longestCorrect : null,
      // forward and reverse are different tasks — compare like with like
      comparable: (a) => a.difficulty === difficulty,
      stats: [
        { label: ui.mode, value: reverse ? ui.reverse : ui.forward },
        { label: ui.failedAt, value: String(length) },
      ],
    });
  };

  /** Show correct/wrong feedback briefly, then run the next sequence. */
  const transitionToNext = (good: boolean): void => {
    phase = 'showing'; // block pad input during the feedback gap
    inputEl.hidden = true;
    displayEl.hidden = false;
    digitEl.textContent = '';
    topEl.textContent = good ? ui.correct : ui.wrong;
    topEl.style.color = good ? 'var(--success)' : 'var(--danger)';
    pending.push(
      scheduleAt(now() + 900, () => {
        topEl.style.color = '';
        presentSequence();
      })
    );
  };

  padEl.addEventListener('pointerdown', (e) => {
    if (!(e instanceof PointerEvent) || !e.isPrimary || phase !== 'input') return;
    shell.noteDevice(deviceTypeFromEvent(e));
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-key]');
    if (!btn) return;
    const key = btn.dataset.key!;
    if (key === 'back') {
      typed.pop();
    } else if (key === 'ok') {
      if (typed.length === sequence.length) {
        submit();
        return;
      }
    } else if (typed.length < sequence.length) {
      typed.push(Number(key));
    }
    renderTyped();
  });

  shell.begin({
    onStart: presentSequence,
    onAbort: cancelPending,
  });
}
