// GAME 3 — Mental Rotation (Shepard-Metzler style, three.js)
//
// Each trial: one chiral path-polycube ("arm" shape). The right view
// shows either the SAME shape (50%) or a DIFFERENT one — a mirrored
// copy (50%). Both views are STATIC, each at its own random orientation
// chosen so that every cube is visible from the single viewpoint
// (orientations are sampled and scored with viewScore: no cube may hide
// directly behind another). The user answers SAME or DIFFERENT.
//
// Trial timers advance on SIMULATED time (fixed-step loop), so pausing
// via tab switch freezes the clock instead of eating the time budget.
import * as THREE from 'three';
import type { PlayContext } from '../../engine/mount';
import { GameShell } from '../../engine/shell';
import { fixedStepLoop, mean } from '../../engine/timing';
import { renderResults } from '../../engine/results';
import { deviceTypeFromEvent } from '../../lib/device';
import { strings } from '../../lib/strings';
import { generatePolycube, mirrorCells, viewScore, type Cell } from './polycube';

const TRIALS = 10;
const FEEDBACK_MS = 800;
const STEP_MS = 1000 / 60;
const ORIENTATION_SAMPLES = 120; // random orientations scored per view

interface DiffParams {
  cubes: number;
  limitMs: number | null;
}
const DIFFS: Record<string, DiffParams> = {
  easy: { cubes: 7, limitMs: null },
  normal: { cubes: 10, limitMs: 15000 },
  hard: { cubes: 13, limitMs: 8000 },
};

const ui = strings.games.rotation.ui;

/** Uniform random rotation (Shoemake's method). */
function randomQuaternion(): THREE.Quaternion {
  const u1 = Math.random();
  const u2 = Math.random();
  const u3 = Math.random();
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  return new THREE.Quaternion(
    s1 * Math.sin(2 * Math.PI * u2),
    s1 * Math.cos(2 * Math.PI * u2),
    s2 * Math.sin(2 * Math.PI * u3),
    s2 * Math.cos(2 * Math.PI * u3)
  );
}

/**
 * Sample random orientations and keep the one whose static projection
 * is most legible (maximise the worst-case occlusion score).
 */
function pickLegibleOrientation(cells: Cell[]): THREE.Quaternion {
  let best: THREE.Quaternion | null = null;
  let bestScore = -Infinity;
  const m = new THREE.Matrix4();
  for (let i = 0; i < ORIENTATION_SAMPLES; i++) {
    const q = randomQuaternion();
    m.makeRotationFromQuaternion(q);
    const e = m.elements; // column-major
    // row-major 3x3 for viewScore
    const score = viewScore(cells, [
      e[0]!, e[4]!, e[8]!,
      e[1]!, e[5]!, e[9]!,
      e[2]!, e[6]!, e[10]!,
    ]);
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
    // early exit: a full cube of clearance means nothing is hidden
    if (bestScore >= 1.05) break;
  }
  return best!;
}

/** One static viewport: renderer + scene + shape group. */
class ShapeView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];

  constructor(
    readonly container: HTMLElement,
    canvas: HTMLCanvasElement
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.scene.add(this.group);

    const dir = new THREE.DirectionalLight(0xffffff, 2.4);
    dir.position.set(3, 5, 4);
    this.scene.add(dir);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  }

  size(): void {
    const box = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(box.width));
    const h = Math.max(1, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setShape(cells: Cell[], color: THREE.Color, orientation: THREE.Quaternion): void {
    this.clearShape();
    const cx = mean(cells.map((c) => c[0]));
    const cy = mean(cells.map((c) => c[1]));
    const cz = mean(cells.map((c) => c[2]));

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const edgeGeo = new THREE.EdgesGeometry(geo);
    const mat = new THREE.MeshLambertMaterial({ color }); // flat/matte
    const edgeMat = new THREE.LineBasicMaterial({
      color: color.clone().multiplyScalar(0.35),
    });
    this.disposables.push(geo, edgeGeo, mat, edgeMat);

    let radius = 0;
    for (const c of cells) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c[0] - cx, c[1] - cy, c[2] - cz);
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      this.group.add(mesh);
      radius = Math.max(radius, mesh.position.length() + 0.87);
    }
    this.group.quaternion.copy(orientation);
    // fit camera to bounding sphere
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(0, 0, dist * 1.12);
    this.camera.lookAt(0, 0, 0);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private clearShape(): void {
    this.group.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  dispose(): void {
    this.clearShape();
    this.renderer.dispose();
  }
}

export function run(ctx: PlayContext): void {
  const { stage, meta, difficulty } = ctx;
  const diff = DIFFS[difficulty] ?? DIFFS['normal']!;

  const shell = new GameShell({
    stage,
    testId: meta.id,
    difficulty,
    pauseMode: 'pause',
  });

  stage.innerHTML = `
    <div class="rot-top mono dim">
      <span data-trial></span>
      <span data-timer></span>
    </div>
    <div class="rot-views">
      <div class="rot-view"><canvas></canvas></div>
      <div class="rot-view"><canvas></canvas></div>
    </div>
    <div class="rot-buttons">
      <button data-answer="same">${ui.same}</button>
      <button data-answer="different">${ui.different}</button>
    </div>`;
  const trialEl = stage.querySelector<HTMLElement>('[data-trial]')!;
  const timerEl = stage.querySelector<HTMLElement>('[data-timer]')!;
  const viewEls = [...stage.querySelectorAll<HTMLElement>('.rot-view')];
  const buttons = [...stage.querySelectorAll<HTMLButtonElement>('[data-answer]')];

  let views: ShapeView[];
  try {
    views = viewEls.map((el) => new ShapeView(el, el.querySelector('canvas')!));
  } catch {
    stage.innerHTML = `<div class="results"><p class="dim">${ui.webglMissing}</p></div>`;
    shell.destroy();
    return;
  }

  // 5 SAME + 5 DIFFERENT (mirrored), shuffled
  const trialKinds: boolean[] = Array.from(
    { length: TRIALS },
    (_, i) => i < TRIALS / 2
  );
  for (let i = trialKinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [trialKinds[i], trialKinds[j]] = [trialKinds[j]!, trialKinds[i]!];
  }

  let trialIndex = -1;
  let isDifferent = false;
  let phase: 'trial' | 'feedback' | 'done' = 'trial';
  let trialElapsed = 0; // simulated ms within current phase
  let correct = 0;
  let timeouts = 0;
  const answerTimes: number[] = [];

  const nextTrial = (): void => {
    trialIndex++;
    if (trialIndex >= TRIALS) {
      finishRound();
      return;
    }
    phase = 'trial';
    trialElapsed = 0;
    isDifferent = trialKinds[trialIndex]!;
    trialEl.textContent = ui.trial(trialIndex + 1, TRIALS);
    for (const el of viewEls) el.classList.remove('correct', 'wrong');
    for (const b of buttons) b.disabled = false;

    const cells = generatePolycube(diff.cubes);
    const cellsRight = isDifferent ? mirrorCells(cells) : cells;
    const color = new THREE.Color().setHSL(Math.random(), 0.45, 0.62);
    // independent static orientations, each checked for full visibility
    views[0]!.setShape(cells, color, pickLegibleOrientation(cells));
    views[1]!.setShape(cellsRight, color, pickLegibleOrientation(cellsRight));
  };

  const answer = (said: 'same' | 'different' | 'timeout'): void => {
    if (phase !== 'trial') return;
    phase = 'feedback';
    const wasCorrect =
      said !== 'timeout' && (said === 'different') === isDifferent;
    if (said === 'timeout') timeouts++;
    else answerTimes.push(trialElapsed);
    if (wasCorrect) correct++;
    for (const el of viewEls) el.classList.add(wasCorrect ? 'correct' : 'wrong');
    for (const b of buttons) b.disabled = true;
    trialElapsed = 0; // reuse as feedback timer
  };

  const finishRound = async (): Promise<void> => {
    phase = 'done';
    loop.cancel();
    for (const v of views) v.dispose();
    const accuracy = (correct / TRIALS) * 100;
    const avgMs = answerTimes.length ? mean(answerTimes) : 0;
    await shell.finish({
      score: accuracy,
      valid: true,
      params: {
        correct,
        trials: TRIALS,
        avgAnswerMs: Math.round(avgMs),
        timeouts,
        cubes: diff.cubes,
      },
    });
    renderResults(stage, {
      meta,
      score: accuracy,
      scoreText: `${correct} / ${TRIALS}`,
      stats: [
        {
          label: ui.avgTime,
          value: answerTimes.length ? `${(avgMs / 1000).toFixed(1)} s` : '—',
        },
        { label: ui.timeouts, value: String(timeouts) },
      ],
    });
  };

  // simulated-time loop: trial timer, feedback timer, rendering
  const loop = fixedStepLoop({
    stepMs: STEP_MS,
    update: (stepMs) => {
      trialElapsed += stepMs;
      if (phase === 'trial' && diff.limitMs !== null) {
        const left = diff.limitMs - trialElapsed;
        timerEl.textContent = `${Math.max(0, left / 1000).toFixed(1)}s`;
        if (left <= 0) answer('timeout');
      } else if (phase === 'trial') {
        timerEl.textContent = '';
      }
      if (phase === 'feedback' && trialElapsed >= FEEDBACK_MS) nextTrial();
    },
    render: () => {
      if (phase === 'done') return;
      for (const v of views) v.render();
    },
  });
  loop.pause(); // idle during countdown

  for (const b of buttons) {
    b.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) return;
      shell.noteDevice(deviceTypeFromEvent(e));
      answer(b.dataset.answer as 'same' | 'different');
    });
  }

  shell.begin({
    onStart: () => {
      for (const v of views) v.size();
      nextTrial();
      loop.resume();
    },
    onPause: () => loop.pause(),
    onResume: () => loop.resume(),
    onAbort: () => {
      loop.cancel();
      for (const v of views) v.dispose();
    },
  });
}
