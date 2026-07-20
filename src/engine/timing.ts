// Timing primitives for score-critical scheduling.
//
// Rule: anything a score depends on uses performance.now(), checked
// inside a requestAnimationFrame loop. setTimeout alone is never
// trusted — it can drift 4ms+ and is throttled in background tabs.

export const now = (): number => performance.now();

export interface CancelHandle {
  cancel(): void;
}

/**
 * Fires `cb` at the first rAF tick where performance.now() >= target.
 * `cb` receives the actual fire time so callers can account for the
 * (sub-frame) overshoot if they need to.
 */
export function scheduleAt(
  targetMs: number,
  cb: (firedAt: number) => void
): CancelHandle {
  let raf = 0;
  const tick = () => {
    const t = now();
    if (t >= targetMs) {
      cb(t);
    } else {
      raf = requestAnimationFrame(tick);
    }
  };
  raf = requestAnimationFrame(tick);
  return { cancel: () => cancelAnimationFrame(raf) };
}

/**
 * rAF-driven game loop with a fixed physics timestep (accumulator
 * pattern). `update` runs zero or more times per frame at exactly
 * `stepMs` intervals, so simulation speed is identical on 60Hz and
 * 120Hz displays. `render` runs once per frame.
 */
export function fixedStepLoop(opts: {
  stepMs: number;
  update: (stepMs: number) => void;
  render: (alpha: number) => void;
}): CancelHandle & { pause(): void; resume(): void } {
  const { stepMs, update, render } = opts;
  let raf = 0;
  let last = now();
  let acc = 0;
  let paused = false;
  let stopped = false;

  const frame = () => {
    const t = now();
    // clamp: after a jank/pause spike, don't run a physics avalanche
    acc = Math.min(acc + (t - last), 250);
    last = t;
    // update() may call cancel()/pause() on this very loop;
    // cancelAnimationFrame can't cancel the currently-executing
    // callback, so the flags are what actually stops the loop here
    while (acc >= stepMs && !stopped && !paused) {
      update(stepMs);
      acc -= stepMs;
    }
    if (stopped || paused) return;
    render(acc / stepMs);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    cancel: () => {
      stopped = true;
      cancelAnimationFrame(raf);
    },
    pause() {
      if (paused || stopped) return;
      paused = true;
      cancelAnimationFrame(raf);
    },
    resume() {
      if (!paused || stopped) return;
      paused = false;
      last = now(); // don't count paused time into the accumulator
      acc = 0;
      raf = requestAnimationFrame(frame);
    },
  };
}

/** Uniform random in [min, max). */
export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Mean of an array (0 for empty). */
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Population standard deviation (0 for < 2 samples). */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
