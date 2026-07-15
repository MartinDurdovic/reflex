// GAME 2 — Multiple Object Tracking (Pylyshyn paradigm)
//
// Round flow: reveal (targets flash 2s, balls static) -> tracking
// (balls move, all identical) -> select (frozen; tap the targets,
// confirm) -> results.
//
// The round is configured by the player on the intro screen (persisted
// per game in settings): total balls, targets ("balls to track", capped
// at half the total), ball speed (1-10) and ball size (1-10).
//
// Physics correctness:
//  - fixed timestep (fixedStepLoop, 120 steps/s) so ball speed is
//    identical on 60Hz and 120Hz displays
//  - elastic circle-circle collisions, equal mass: exchange velocity
//    components along the collision normal
//  - after each step every ball's speed is renormalized to the
//    configured constant speed (collisions + perturbations never
//    accumulate drift)
//  - phase timers advance with the accumulated fixed steps, never wall
//    time, so pausing (tab hidden) can't skip tracking time
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import { fixedStepLoop, randRange } from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';

const STEP_MS = 1000 / 120;
const REVEAL_MS = 2000;
const TRACK_MS = 8000;
const PERTURB_INTERVAL_MS = 500; // avg time between heading nudges
const PERTURB_MAX_RAD = 0.35;

const ui = strings.games.mot.ui;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  isTarget: boolean;
  selected: boolean;
  nextPerturb: number; // countdown in ms of simulated time
}

/** Map the user's 1-10 speed setting to a fraction of min(w,h) per second. */
const speedFraction = (setting: number): number => 0.055 * setting;
/** Map the user's 1-10 size setting to a radius fraction of min(w,h). */
const radiusFraction = (setting: number): number => 0.015 + 0.005 * setting;

export function run(ctx: PlayContext): void {
  const { stage, meta, difficulty, config } = ctx;

  // config values arrive clamped by the intro screen; clamp again anyway
  const clamp = (v: unknown, min: number, max: number, dflt: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
  };
  const totalBalls = clamp(config['total'], 2, 20, 8);
  const targetCount = clamp(config['targets'], 1, Math.max(1, Math.floor(totalBalls / 2)), 3);
  const speedSetting = clamp(config['speed'], 1, 10, 4);
  const sizeSetting = clamp(config['size'], 1, 10, 5);

  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    pauseMode: 'pause', // freezing MOT reveals nothing — safe to pause
  });

  // ---- DOM ----
  stage.innerHTML = `
    <div class="mot-top">
      <span class="mono">${targetCount} / ${totalBalls}</span>
      <span class="mot-hint dim"></span>
    </div>
    <canvas class="mot-canvas"></canvas>
    <div class="mot-bottom">
      <button class="primary" data-confirm hidden>${strings.shell.confirm}</button>
    </div>`;
  const canvas = stage.querySelector<HTMLCanvasElement>('.mot-canvas')!;
  const hintEl = stage.querySelector<HTMLElement>('.mot-hint')!;
  const confirmBtn = stage.querySelector<HTMLButtonElement>('[data-confirm]')!;
  const ctx2d = canvas.getContext('2d')!;

  // resolve theme colors once (canvas can't use CSS vars directly)
  const css = getComputedStyle(document.documentElement);
  const COL_BALL = css.getPropertyValue('--game-ball').trim() || '#6b7488';
  const COL_TARGET = css.getPropertyValue('--game-ball-target').trim() || '#ffc24f';
  const COL_ACCENT = css.getPropertyValue('--accent').trim() || '#4f8cff';

  // ---- canvas sizing (locked at round start) ----
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  const sizeCanvas = (): void => {
    const box = canvas.getBoundingClientRect();
    W = box.width;
    H = box.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  // ---- world state ----
  let balls: Ball[] = [];
  let phase: 'reveal' | 'tracking' | 'select' = 'reveal';
  let phaseElapsed = 0; // simulated ms, advances only in update()
  const minDim = (): number => Math.min(W, H);

  const spawnBalls = (): void => {
    // radius from the size setting; hard px clamp keeps 20 large balls
    // playable on small screens and tiny balls tappable
    const r = Math.min(Math.max(minDim() * radiusFraction(sizeSetting), 7), 56);
    const speed = speedFraction(speedSetting) * minDim(); // px per second
    balls = [];
    for (let i = 0; i < totalBalls; i++) {
      let x = 0;
      let y = 0;
      // rejection-sample non-overlapping spawns; relax spacing if the
      // board is too crowded for the requested count/size
      for (let spacing = 2.4; spacing >= 1.0; spacing -= 0.35) {
        let ok = false;
        for (let tries = 0; tries < 300 && !ok; tries++) {
          x = randRange(r, Math.max(r + 1, W - r));
          y = randRange(r, Math.max(r + 1, H - r));
          ok = balls.every((b) => Math.hypot(b.x - x, b.y - y) > r * spacing);
        }
        if (ok) break;
      }
      const angle = randRange(0, Math.PI * 2);
      balls.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        isTarget: i < targetCount,
        selected: false,
        nextPerturb: randRange(0, PERTURB_INTERVAL_MS * 2),
      });
    }
  };

  // ---- physics ----
  const update = (stepMs: number): void => {
    phaseElapsed += stepMs;
    if (phase === 'reveal') {
      if (phaseElapsed >= REVEAL_MS) {
        phase = 'tracking';
        phaseElapsed = 0;
        hintEl.textContent = ui.track;
      }
      return; // balls static while targets flash
    }
    if (phase !== 'tracking') return;

    const dt = stepMs / 1000;
    const speed = speedFraction(speedSetting) * minDim();

    for (const b of balls) {
      // random heading perturbation so paths aren't predictable
      b.nextPerturb -= stepMs;
      if (b.nextPerturb <= 0) {
        b.nextPerturb = randRange(0.5, 1.5) * PERTURB_INTERVAL_MS;
        const da = randRange(-PERTURB_MAX_RAD, PERTURB_MAX_RAD);
        const cos = Math.cos(da);
        const sin = Math.sin(da);
        const { vx, vy } = b;
        b.vx = vx * cos - vy * sin;
        b.vy = vx * sin + vy * cos;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // wall bounce (reflect + clamp inside)
      if (b.x < b.r) {
        b.x = b.r;
        b.vx = Math.abs(b.vx);
      } else if (b.x > W - b.r) {
        b.x = W - b.r;
        b.vx = -Math.abs(b.vx);
      }
      if (b.y < b.r) {
        b.y = b.r;
        b.vy = Math.abs(b.vy);
      } else if (b.y > H - b.r) {
        b.y = H - b.r;
        b.vy = -Math.abs(b.vy);
      }
    }

    // elastic circle-circle collisions, equal mass
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i]!;
        const b = balls[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.r + b.r;
        if (dist === 0 || dist >= minDist) continue;
        const nx = dx / dist;
        const ny = dy / dist;
        // relative velocity along the normal; only resolve if approaching
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          // equal masses: exchange normal components
          a.vx += rvn * nx;
          a.vy += rvn * ny;
          b.vx -= rvn * nx;
          b.vy -= rvn * ny;
        }
        // positional separation so overlapping balls don't sink
        const push = (minDist - dist) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }

    // keep the classic MOT invariant: every ball at constant speed
    for (const b of balls) {
      const s = Math.hypot(b.vx, b.vy);
      if (s > 0) {
        b.vx = (b.vx / s) * speed;
        b.vy = (b.vy / s) * speed;
      }
    }

    if (phaseElapsed >= TRACK_MS) enterSelect();
  };

  const enterSelect = (): void => {
    phase = 'select';
    phaseElapsed = 0;
    confirmBtn.hidden = false;
    updateConfirm();
  };

  // ---- rendering ----
  const render = (): void => {
    ctx2d.clearRect(0, 0, W, H);
    for (const b of balls) {
      ctx2d.beginPath();
      ctx2d.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      if (phase === 'reveal' && b.isTarget) {
        // flash: pulse between target color and base ~2.5x/s
        const pulse = Math.sin(phaseElapsed * 0.016) > -0.2;
        ctx2d.fillStyle = pulse ? COL_TARGET : COL_BALL;
      } else {
        ctx2d.fillStyle = COL_BALL;
      }
      ctx2d.fill();
      if (phase === 'select' && b.selected) {
        ctx2d.lineWidth = 3;
        ctx2d.strokeStyle = COL_ACCENT;
        ctx2d.stroke();
      }
    }
  };

  // ---- selection input ----
  const selectedCount = (): number => balls.filter((b) => b.selected).length;
  const updateConfirm = (): void => {
    confirmBtn.disabled = selectedCount() !== targetCount;
    hintEl.textContent = `${ui.select(targetCount)} (${selectedCount()}/${targetCount})`;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!e.isPrimary || phase !== 'select') return;
    shell.noteDevice(deviceTypeFromEvent(e));
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    // nearest ball within a fat-finger radius
    let best: Ball | null = null;
    let bestD = Infinity;
    for (const b of balls) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < Math.max(b.r * 1.6, 22) && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return;
    if (!best.selected && selectedCount() >= targetCount) return;
    best.selected = !best.selected;
    updateConfirm();
  };

  const finishRound = async (): Promise<void> => {
    loop.cancel();
    canvas.removeEventListener('pointerdown', onPointerDown);
    const correct = balls.filter((b) => b.selected && b.isTarget).length;
    const accuracy = (correct / targetCount) * 100;

    await shell.finish({
      score: accuracy,
      valid: true,
      params: {
        correct,
        targets: targetCount,
        balls: totalBalls,
        speed: speedSetting,
        size: sizeSetting,
        durationMs: TRACK_MS,
      },
    });

    renderResults(stage, {
      meta,
      score: accuracy,
      scoreText: `${correct} / ${targetCount}`,
      stats: [{ label: ui.correct, value: `${Math.round(accuracy)}%` }],
    });
  };

  confirmBtn.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || confirmBtn.disabled || phase !== 'select') return;
    finishRound();
  });
  canvas.addEventListener('pointerdown', onPointerDown);

  // ---- lifecycle ----
  let loop: ReturnType<typeof fixedStepLoop>;
  shell.begin({
    onStart: () => {
      sizeCanvas();
      spawnBalls();
      hintEl.textContent = ui.memorize;
      loop = fixedStepLoop({ stepMs: STEP_MS, update, render });
    },
    onPause: () => loop?.pause(),
    onResume: () => loop?.resume(),
    onAbort: () => loop?.cancel(),
  });
}
