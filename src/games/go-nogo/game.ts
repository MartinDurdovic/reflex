// GAME 4 — Go/No-Go (inhibition + reaction)
//
// 30 stimuli, ~75% GO (green circle, tap fast) / 25% NO-GO (red circle,
// withhold). Random ISI 800–2500ms. Response window 800ms.
//
// Timing: stimulus onset = actual rAF fire time from scheduleAt;
// reaction = pointerdown event.timeStamp - onset (same discipline as
// the F1 game). The 800ms window is enforced by a scheduled timeout
// cross-checked against performance.now, and tap-vs-timeout races are
// settled by a per-stimulus resolved flag.
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import {
  now,
  scheduleAt,
  randRange,
  mean,
  type CancelHandle,
} from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';

const TOTAL = 30;
const GO_COUNT = 22; // ~75%
const ISI_MIN_MS = 800;
const ISI_MAX_MS = 2500;
const WINDOW_MS = 800;

const ui = strings.games['go-nogo'].ui;

export function run(ctx: PlayContext): void {
  const { stage, meta, difficulty } = ctx;
  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    pauseMode: 'abort', // reaction task — a paused trial is garbage
  });

  stage.innerHTML = `
    <div class="gng-top mono dim"></div>
    <div class="gng-arena"><div class="gng-stim" hidden></div></div>`;
  const topEl = stage.querySelector<HTMLElement>('.gng-top')!;
  const stimEl = stage.querySelector<HTMLElement>('.gng-stim')!;

  // shuffled trial order (Fisher-Yates)
  const kinds: ('go' | 'nogo')[] = [
    ...Array<'go'>(GO_COUNT).fill('go'),
    ...Array<'nogo'>(TOTAL - GO_COUNT).fill('nogo'),
  ];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }

  let index = -1; // current stimulus index
  let phase: 'isi' | 'stimulus' | 'done' = 'isi';
  let onset = 0;
  let resolved = true; // current stimulus already answered/timed out?
  let pending: CancelHandle[] = [];

  const reactionTimes: number[] = [];
  let falseAlarms = 0;
  let misses = 0;
  let premature = 0; // taps during ISI (not scored, but recorded)

  const cancelPending = (): void => {
    for (const h of pending) h.cancel();
    pending = [];
  };

  const showProgress = (): void => {
    topEl.textContent = `${Math.min(index + 1, TOTAL)} / ${TOTAL}`;
  };

  const nextStimulus = (): void => {
    index++;
    if (index >= TOTAL) {
      finishRound();
      return;
    }
    phase = 'isi';
    stimEl.hidden = true;
    showProgress();
    pending.push(
      scheduleAt(now() + randRange(ISI_MIN_MS, ISI_MAX_MS), (firedAt) => {
        const kind = kinds[index]!;
        onset = firedAt;
        resolved = false;
        phase = 'stimulus';
        stimEl.className = `gng-stim ${kind}`;
        stimEl.hidden = false;
        // response window: timeout = go-miss / nogo-correct rejection
        pending.push(
          scheduleAt(onset + WINDOW_MS, () => {
            if (resolved) return;
            resolved = true;
            if (kind === 'go') misses++;
            nextStimulus();
          })
        );
      })
    );
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!e.isPrimary || phase === 'done') return;
    shell.noteDevice(deviceTypeFromEvent(e));

    if (phase === 'isi') {
      premature++;
      return;
    }
    if (phase !== 'stimulus' || resolved) return;

    let press = e.timeStamp;
    const t = now();
    if (!(press > 0) || Math.abs(press - t) > 5000) press = t;
    const rt = Math.max(0, press - onset);
    if (rt > WINDOW_MS) return; // let the scheduled timeout settle it

    resolved = true;
    if (kinds[index] === 'go') {
      reactionTimes.push(rt);
    } else {
      falseAlarms++;
    }
    nextStimulus();
  };

  const finishRound = async (): Promise<void> => {
    phase = 'done';
    cancelPending();
    stage.removeEventListener('pointerdown', onPointerDown);
    const avg = reactionTimes.length ? mean(reactionTimes) : 0;
    await shell.finish({
      score: avg,
      valid: reactionTimes.length > 0, // no correct GO at all -> DNF
      params: {
        goTrials: GO_COUNT,
        nogoTrials: TOTAL - GO_COUNT,
        hits: reactionTimes.length,
        falseAlarms,
        misses,
        premature,
      },
    });
    renderResults(stage, {
      meta,
      score: reactionTimes.length ? avg : null,
      stats: [
        { label: ui.falseAlarms, value: String(falseAlarms) },
        { label: ui.misses, value: String(misses) },
      ],
      footnote: strings.results.latencyFootnote,
    });
  };

  stage.addEventListener('pointerdown', onPointerDown);

  shell.begin({
    onStart: nextStimulus,
    onAbort: () => {
      cancelPending();
      stage.removeEventListener('pointerdown', onPointerDown);
    },
  });
}
