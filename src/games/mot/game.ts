// GAME 2 — Multiple Object Tracking (Pylyshyn paradigm)
//
// Round flow: reveal (targets flash 2s, balls static) -> tracking
// (balls move, all identical) -> select (frozen; tap K balls, confirm)
// -> results.
//
// Physics correctness:
//  - fixed timestep (fixedStepLoop, 120 steps/s) so ball speed is
//    identical on 60Hz and 120Hz displays
//  - elastic circle-circle collisions, equal mass: exchange velocity
//    components along the collision normal
//  - after each step every ball's speed is renormalized to the level's
//    constant speed (collisions + perturbations never accumulate drift)
//  - phase timers advance with the accumulated fixed steps, never wall
//    time, so pausing (tab hidden) can't skip tracking time
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import { fixedStepLoop, randRange } from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { getSettings, setSetting } from '../../lib/storage';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';

const STEP_MS = 1000 / 120;
const REVEAL_MS = 2000;
const PERTURB_INTERVAL_MS = 500; // avg time between heading nudges
const PERTURB_MAX_RAD = 0.35;
const LEVEL_KEY = 'mot.level';
const STREAK_KEY = 'mot.perfectStreak';

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

interface LevelParams {
  balls: number;
  targets: number;
  /** speed as a fraction of min(canvas w,h) per second */
  speed: number;
  durationMs: number;
  occluder: boolean;
}

// Staircase dimensions grow in spec order: targets -> speed -> total
// balls -> duration; occlusions join at level 9.
export function levelParams(level: number): LevelParams {
  const p = { balls: 8, targets: 3, speedMul: 1, durationMs: 8000 };
  const bumps = ['targets', 'speed', 'balls', 'duration'] as const;
  for (let l = 2; l <= level; l++) {
    switch (bumps[(l - 2) % bumps.length]) {
      case 'targets':
        if (p.targets < Math.min(7, Math.floor(p.balls / 2))) p.targets++;
        else p.speedMul += 0.12;
        break;
      case 'speed':
        p.speedMul += 0.15;
        break;
      case 'balls':
        if (p.balls < 16) p.balls += 2;
        else p.speedMul += 0.12;
        break;
      case 'duration':
        if (p.durationMs < 14000) p.durationMs += 1500;
        else p.speedMul += 0.12;
        break;
    }
  }
  return {
    balls: p.balls,
    targets: p.targets,
    speed: 0.22 * Math.min(p.speedMul, 2.6),
    durationMs: p.durationMs,
    occluder: level >= 9,
  };
}

export async function run(ctx: PlayContext): Promise<void> {
  const { stage, meta, difficulty } = ctx;

  const settings = await getSettings();
  const level = Math.max(1, Number(settings[LEVEL_KEY]) || 1);
  let perfectStreak = Math.max(0, Number(settings[STREAK_KEY]) || 0);
  const params = levelParams(level);

  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    pauseMode: 'pause', // freezing MOT reveals nothing — safe to pause
  });

  // ---- DOM ----
  stage.innerHTML = `
    <div class="mot-top">
      <span class="mono">${ui.level(level)}</span>
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
  const COL_OCCLUDER = css.getPropertyValue('--bg-elevated').trim() || '#171a21';
  const COL_BORDER = css.getPropertyValue('--border').trim() || '#262b38';

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
  const occluderR = (): number => minDim() * 0.16;

  const spawnBalls = (): void => {
    const r = Math.min(Math.max(minDim() * 0.035, 12), 24);
    const speed = params.speed * minDim(); // px per second
    balls = [];
    for (let i = 0; i < params.balls; i++) {
      let x = 0;
      let y = 0;
      let ok = false;
      for (let tries = 0; tries < 400 && !ok; tries++) {
        x = randRange(r, W - r);
        y = randRange(r, H - r);
        ok = balls.every((b) => Math.hypot(b.x - x, b.y - y) > r * 2.4);
        // don't spawn hidden behind the occluder during the reveal
        if (ok && params.occluder) {
          ok = Math.hypot(x - W / 2, y - H / 2) > occluderR() + r;
        }
      }
      const angle = randRange(0, Math.PI * 2);
      balls.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        isTarget: i < params.targets,
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
    const speed = params.speed * minDim();

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

    if (phaseElapsed >= params.durationMs) enterSelect();
  };

  const enterSelect = (): void => {
    phase = 'select';
    phaseElapsed = 0;
    hintEl.textContent = ui.select(params.targets);
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
    if (params.occluder) {
      ctx2d.beginPath();
      ctx2d.arc(W / 2, H / 2, occluderR(), 0, Math.PI * 2);
      ctx2d.fillStyle = COL_OCCLUDER;
      ctx2d.fill();
      ctx2d.lineWidth = 1;
      ctx2d.strokeStyle = COL_BORDER;
      ctx2d.stroke();
    }
  };

  // ---- selection input ----
  const selectedCount = (): number => balls.filter((b) => b.selected).length;
  const updateConfirm = (): void => {
    confirmBtn.disabled = selectedCount() !== params.targets;
    hintEl.textContent = `${ui.select(params.targets)} (${selectedCount()}/${params.targets})`;
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
      if (d < b.r * 1.6 && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (!best) return;
    if (!best.selected && selectedCount() >= params.targets) return;
    best.selected = !best.selected;
    updateConfirm();
  };

  const finishRound = async (): Promise<void> => {
    loop.cancel();
    canvas.removeEventListener('pointerdown', onPointerDown);
    const correct = balls.filter((b) => b.selected && b.isTarget).length;
    const perfect = correct === params.targets;

    // staircase: 2 perfect rounds in a row -> up; any miss -> down
    let nextLevel = level;
    if (perfect) {
      perfectStreak++;
      if (perfectStreak >= 2) {
        nextLevel = level + 1;
        perfectStreak = 0;
      }
    } else {
      nextLevel = Math.max(1, level - 1);
      perfectStreak = 0;
    }
    await setSetting(LEVEL_KEY, nextLevel);
    await setSetting(STREAK_KEY, perfectStreak);

    // score = level; valid only for perfect rounds so "personal best"
    // means: highest level with a perfect round
    await shell.finish({
      score: level,
      valid: perfect,
      params: {
        correct,
        targets: params.targets,
        balls: params.balls,
        durationMs: params.durationMs,
        occluder: params.occluder,
        nextLevel,
      },
    });

    renderResults(stage, {
      meta,
      score: perfect ? level : null,
      scoreText: `${correct} / ${params.targets}`,
      stats: [
        { label: ui.thisLevel, value: String(level) },
        { label: ui.nextLevel, value: String(nextLevel) },
      ],
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
