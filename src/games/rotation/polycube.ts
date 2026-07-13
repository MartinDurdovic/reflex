// Polycube generation for the mental-rotation game. Pure logic, no DOM
// or three.js — unit-testable in Node.
//
// A shape is a set of integer grid cells grown by random-walk adjacency.
// Generated shapes must be:
//  - non-degenerate: not flat (no axis where all cells share one
//    coordinate — this also excludes straight lines and guarantees the
//    "at least 2 bends" requirement, since leaving a plane needs bends
//    in two different planes)
//  - CHIRAL: the mirrored copy must NOT equal any of the 24 grid
//    rotations of the original, otherwise a MIRRORED trial would be
//    indistinguishable from SAME and the task would be unanswerable.

export type Cell = readonly [number, number, number];
type Mat3 = readonly (readonly number[])[];

/** The 24 orientation-preserving (det = +1) signed permutation matrices. */
export const ROTATIONS_24: Mat3[] = (() => {
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  const out: Mat3[] = [];
  for (const p of perms) {
    for (const sx of [1, -1]) {
      for (const sy of [1, -1]) {
        for (const sz of [1, -1]) {
          const m = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0],
          ];
          const signs = [sx, sy, sz];
          for (let r = 0; r < 3; r++) m[r]![p[r]!] = signs[r]!;
          // det of a signed permutation = sign(perm) * product(signs)
          const det =
            m[0]![0]! * (m[1]![1]! * m[2]![2]! - m[1]![2]! * m[2]![1]!) -
            m[0]![1]! * (m[1]![0]! * m[2]![2]! - m[1]![2]! * m[2]![0]!) +
            m[0]![2]! * (m[1]![0]! * m[2]![1]! - m[1]![1]! * m[2]![0]!);
          if (det === 1) out.push(m);
        }
      }
    }
  }
  if (out.length !== 24) throw new Error('rotation group generation broken');
  return out;
})();

export function applyRotation(cells: Cell[], m: Mat3): Cell[] {
  return cells.map(([x, y, z]) => [
    m[0]![0]! * x + m[0]![1]! * y + m[0]![2]! * z,
    m[1]![0]! * x + m[1]![1]! * y + m[1]![2]! * z,
    m[2]![0]! * x + m[2]![1]! * y + m[2]![2]! * z,
  ]);
}

export function mirrorCells(cells: Cell[]): Cell[] {
  return cells.map(([x, y, z]) => [-x, y, z]);
}

/** Translation-invariant canonical key: shift min corner to origin, sort. */
export function normalizeKey(cells: Cell[]): string {
  const mins = [Infinity, Infinity, Infinity];
  for (const c of cells) {
    for (let i = 0; i < 3; i++) mins[i] = Math.min(mins[i]!, c[i]!);
  }
  return cells
    .map((c) => `${c[0] - mins[0]!},${c[1] - mins[1]!},${c[2] - mins[2]!}`)
    .sort()
    .join(';');
}

/** True if the shape equals its own mirror image under some rotation. */
export function isAchiral(cells: Cell[]): boolean {
  const key = normalizeKey(cells);
  const mirrored = mirrorCells(cells);
  return ROTATIONS_24.some((m) => normalizeKey(applyRotation(mirrored, m)) === key);
}

/** True if all cells share one coordinate on some axis (flat/straight). */
export function isFlat(cells: Cell[]): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (cells.every((c) => c[axis] === cells[0]![axis])) return true;
  }
  return false;
}

/**
 * Legibility score of a shape under a rotation, for a STATIC view along
 * -z: the smallest screen-plane (xy) distance between any two cubes
 * that sit at clearly different depths (one could hide the other).
 * Higher = every cube visible from this single POV. `rot` is a
 * row-major 3x3 matrix (9 numbers).
 */
export function viewScore(cells: Cell[], rot: readonly number[]): number {
  const pts = cells.map(([x, y, z]) => [
    rot[0]! * x + rot[1]! * y + rot[2]! * z,
    rot[3]! * x + rot[4]! * y + rot[5]! * z,
    rot[6]! * x + rot[7]! * y + rot[8]! * z,
  ]);
  let worst = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dz = Math.abs(pts[i]![2]! - pts[j]![2]!);
      if (dz < 0.6) continue; // similar depth — can't occlude each other
      const dxy = Math.hypot(pts[i]![0]! - pts[j]![0]!, pts[i]![1]! - pts[j]![1]!);
      worst = Math.min(worst, dxy);
    }
  }
  return worst;
}

const DIRS: Cell[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Self-avoiding, non-touching path growth (no branching, and the arm
 * never folds back against itself) — classic Shepard-Metzler "arm"
 * shapes. A clean chain reads far better as a static image than a
 * branchy or self-touching blob.
 */
function growRandomWalk(n: number, rng: () => number): Cell[] | null {
  const cells: Cell[] = [[0, 0, 0]];
  const used = new Set(['0,0,0']);
  while (cells.length < n) {
    const last = cells[cells.length - 1]!;
    const options = DIRS.map(
      (d) => [last[0] + d[0], last[1] + d[1], last[2] + d[2]] as Cell
    ).filter((c) => {
      if (used.has(c.join(','))) return false;
      // candidate may only be adjacent to the current chain end
      let adjacent = 0;
      for (const d of DIRS) {
        if (used.has(`${c[0] + d[0]},${c[1] + d[1]},${c[2] + d[2]}`)) adjacent++;
      }
      return adjacent === 1;
    });
    if (!options.length) return null; // dead end — retry from scratch
    const next = options[Math.floor(rng() * options.length)]!;
    used.add(next.join(','));
    cells.push(next);
  }
  return cells;
}

/**
 * Generate a chiral, non-flat polycube of `n` cells (n >= 5; chiral
 * shapes don't exist below 5 cells for practical purposes).
 */
export function generatePolycube(
  n: number,
  rng: () => number = Math.random
): Cell[] {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const cells = growRandomWalk(n, rng);
    if (!cells) continue;
    if (isFlat(cells)) continue;
    if (isAchiral(cells)) continue;
    return cells;
  }
  throw new Error(`could not generate a chiral polycube of size ${n}`);
}
