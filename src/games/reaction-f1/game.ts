// GAME 1 — Reaction: F1 Lights Out
//
// Timing model (score-critical, read carefully):
//  - The whole light sequence is scheduled on an ABSOLUTE timeline
//    (t0 + k*1000ms) via scheduleAt(), which is a rAF loop checking
//    performance.now() — setTimeout is never trusted for scoring.
//  - Lights-out time (tOut) is the actual performance.now() timestamp
//    of the rAF tick in which the "off" classes are applied. The pixels
//    change at the next vsync; that display latency (plus touch-sensor
//    latency) is inherent to the device and is disclosed in the results
//    footnote rather than guessed at.
//  - The press time is event.timeStamp from pointerdown (high-res,
//    same timebase as performance.now on modern browsers), with a
//    sanity fallback to performance.now() if a browser reports a
//    non-monotonic value.
//  - Reaction = pressTime - tOut. Press before tOut = jump start,
//    recorded as an invalid attempt (DNF) so it never pollutes averages.
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import {
  now,
  scheduleAt,
  randRange,
  mean,
  stdDev,
  type CancelHandle,
} from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { saveAttempt } from '../../lib/storage';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';

const COLUMNS = 5;
const ROWS = 4;
const COLUMN_INTERVAL_MS = 1000;
const HOLD_MIN_MS = 200;
const HOLD_MAX_MS = 3000;
const STARTS_PER_SESSION = 5;
const RESULT_HOLD_MS = 1600; // how long each start's time stays on screen
const PRE_SEQUENCE_MS = 600; // quiet gap before column 1 of each start
// A visual reaction faster than this is physiologically impossible —
// the light was anticipated, not reacted to. Treated as a false start.
const ANTICIPATION_FLOOR_MS = 100;

type Phase =
  | 'between' // gap before/after a start; taps ignored
  | 'sequence' // columns illuminating; tap = jump start
  | 'armed' // all 5 columns on, random hold; tap = jump start
  | 'go' // lights out; tap = reaction
  | 'done';

const ui = strings.games['reaction-f1'].ui;

export function run(ctx: PlayContext): void {
  const { stage, meta, difficulty } = ctx;
  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    // a paused reaction trial is meaningless — abort on tab switch
    pauseMode: 'abort',
    // the light sequence IS the countdown — start it right away
    countdown: false,
  });

  // ---- DOM ----
  stage.innerHTML = `
    <div class="f1-wrap">
      <div class="f1-status dim mono"></div>
      <div class="f1-board" aria-hidden="true">
        ${Array.from(
          { length: COLUMNS },
          () =>
            `<div class="f1-col">${'<div class="f1-light"></div>'.repeat(ROWS)}</div>`
        ).join('')}
      </div>
      <div class="f1-msg dim"></div>
    </div>`;
  const statusEl = stage.querySelector<HTMLElement>('.f1-status')!;
  const msgEl = stage.querySelector<HTMLElement>('.f1-msg')!;
  const cols = [...stage.querySelectorAll<HTMLElement>('.f1-col')];

  // ---- session state ----
  const sessionId = Date.now();
  let startIndex = 0; // 1-based once running
  let phase: Phase = 'between';
  let tOut = 0; // lights-out timestamp (performance.now timebase)
  let holdMs = 0;
  const reactionTimes: number[] = [];
  let jumpStarts = 0;
  let pending: CancelHandle[] = [];

  const cancelPending = (): void => {
    for (const h of pending) h.cancel();
    pending = [];
  };

  const setLights = (litColumns: number): void => {
    cols.forEach((c, i) => c.classList.toggle('on', i < litColumns));
  };

  // ---- one start ----
  const runStart = (): void => {
    startIndex++;
    phase = 'sequence';
    statusEl.textContent = ui.startCounter(startIndex, STARTS_PER_SESSION);
    msgEl.textContent = ui.wait;
    msgEl.className = 'f1-msg dim';
    setLights(0);

    // absolute timeline for this start — no cumulative drift
    const t0 = now() + PRE_SEQUENCE_MS;
    for (let c = 1; c <= COLUMNS; c++) {
      pending.push(
        scheduleAt(t0 + c * COLUMN_INTERVAL_MS, () => {
          setLights(c);
          if (c === COLUMNS) phase = 'armed';
        })
      );
    }
    // random hold, then lights out — all columns off in the same frame
    holdMs = randRange(HOLD_MIN_MS, HOLD_MAX_MS);
    pending.push(
      scheduleAt(t0 + COLUMNS * COLUMN_INTERVAL_MS + holdMs, (firedAt) => {
        setLights(0);
        tOut = firedAt;
        phase = 'go';
      })
    );
  };

  const nextOrFinish = (): void => {
    if (startIndex >= STARTS_PER_SESSION) {
      finishSession();
    } else {
      pending.push(scheduleAt(now() + RESULT_HOLD_MS, runStart));
    }
  };

  const recordReaction = async (rt: number): Promise<void> => {
    phase = 'between';
    reactionTimes.push(rt);
    msgEl.textContent = `${Math.round(rt)} ms`;
    msgEl.className = 'f1-msg time';
    await saveAttempt({
      testId: meta.id,
      timestamp: Date.now(),
      score: rt,
      valid: true,
      difficulty,
      params: { sessionId, startIndex, holdMs },
      deviceType: shell.deviceType,
    });
    nextOrFinish();
  };

  const recordJumpStart = async (reason: 'jump' | 'anticipated'): Promise<void> => {
    phase = 'between';
    cancelPending();
    setLights(0);
    jumpStarts++;
    msgEl.textContent = reason === 'anticipated' ? ui.tooSoon : ui.jumpStart;
    msgEl.className = 'f1-msg jump';
    await saveAttempt({
      testId: meta.id,
      timestamp: Date.now(),
      score: 0,
      valid: false, // DNF — excluded from averages and bests
      difficulty,
      params: { sessionId, startIndex, jumpStart: true, reason },
      deviceType: shell.deviceType,
    });
    nextOrFinish();
  };

  const finishSession = (): void => {
    phase = 'done';
    shell.end();
    stage.removeEventListener('pointerdown', onPointerDown);
    const valid = reactionTimes;
    const best = valid.length ? Math.min(...valid) : null;
    renderResults(stage, {
      meta,
      score: best,
      // this session appended one attempt per successful start; exclude
      // exactly those from the prior baseline so PB/avg compare fairly
      sessionSize: valid.length,
      stats: [
        {
          label: ui.sessionAvg,
          value: valid.length ? `${Math.round(mean(valid))} ms` : '—',
        },
        {
          label: strings.results.consistency,
          value: valid.length >= 2 ? `±${Math.round(stdDev(valid))} ms` : '—',
        },
        { label: ui.jumpStarts, value: String(jumpStarts) },
      ],
      footnote: strings.results.latencyFootnote,
    });
  };

  // ---- input ----
  const onPointerDown = (e: PointerEvent): void => {
    // ignore second finger / non-primary pointers entirely
    if (!e.isPrimary) return;
    shell.noteDevice(deviceTypeFromEvent(e));

    if (phase === 'sequence' || phase === 'armed') {
      recordJumpStart('jump');
      return;
    }
    if (phase !== 'go') return; // between starts / done — ignore

    // press time: prefer the event's own high-res timestamp (captured
    // closer to the hardware event than our handler's execution time)
    let press = e.timeStamp;
    const t = now();
    if (!(press > 0) || Math.abs(press - t) > 5000) press = t; // sanity net
    const rt = press - tOut;
    // a "reaction" below the human floor means the tap was already in
    // flight before the lights went out — a false start, not a score
    if (rt < ANTICIPATION_FLOOR_MS) {
      recordJumpStart('anticipated');
      return;
    }
    recordReaction(rt);
  };

  stage.addEventListener('pointerdown', onPointerDown);

  shell.begin({
    onStart: runStart,
    onAbort: () => {
      cancelPending();
      stage.removeEventListener('pointerdown', onPointerDown);
    },
  });
}
