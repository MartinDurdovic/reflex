// Sanity tests for the polycube generator (run: node scripts/test-polycube.mts)
import {
  ROTATIONS_24,
  generatePolycube,
  applyRotation,
  mirrorCells,
  normalizeKey,
  isAchiral,
  isFlat,
  viewScore,
} from '../src/games/rotation/polycube.ts';

let failures = 0;
const check = (name: string, cond: boolean): void => {
  if (!cond) {
    failures++;
    console.error('FAIL:', name);
  }
};

// rotation group sanity
check('24 rotations', ROTATIONS_24.length === 24);
check(
  '24 distinct matrices',
  new Set(ROTATIONS_24.map((m) => JSON.stringify(m))).size === 24
);
// a fully asymmetric probe must land in 24 distinct orientations
const probe = [
  [0, 0, 0],
  [1, 0, 0],
  [2, 0, 0],
  [2, 1, 0],
  [2, 1, 1],
  [0, 1, 0],
  [0, 0, 2],
] as const;
const keys = new Set(
  ROTATIONS_24.map((m) => normalizeKey(applyRotation([...probe], m)))
);
check('rotations produce distinct orientations of an asymmetric probe', keys.size === 24);

// known flat / straight shapes
check('straight line is flat', isFlat([[0, 0, 0], [1, 0, 0], [2, 0, 0]]));
check('L in a plane is flat', isFlat([[0, 0, 0], [1, 0, 0], [1, 1, 0]]));

// known achiral shape: a plus-sign extruded symmetric shape (T tetromino in 3D is coplanar anyway)
// a simple symmetric 3D shape: cross of 7 cells centered at origin
const cross = [
  [0, 0, 0],
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
] as const;
check('3D cross is achiral', isAchiral([...cross]));

// viewScore: a column stacked along z fully occludes itself -> 0
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
check(
  'stacked column scores 0 (fully occluded)',
  viewScore([[0, 0, 0], [0, 0, 1], [0, 0, 2]], IDENTITY) === 0
);
// a shape lying flat in the view plane has no occlusion pairs -> Infinity
check(
  'flat-in-view shape scores Infinity (nothing occludes)',
  viewScore([[0, 0, 0], [1, 0, 0], [1, 1, 0]], IDENTITY) === Infinity
);

// path shapes have no branches: every inner cell has exactly 2 neighbors
{
  const cells = generatePolycube(10);
  const set = new Set(cells.map((c) => c.join(',')));
  const neighborCount = (c: readonly number[]): number =>
    [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ].filter((d) => set.has(`${c[0]! + d[0]!},${c[1]! + d[1]!},${c[2]! + d[2]!}`)).length;
  const counts = cells.map(neighborCount).sort((a, b) => a - b);
  check(
    'path shape: exactly two endpoints, rest degree 2',
    counts[0] === 1 && counts[1] === 1 && counts.slice(2).every((c) => c === 2)
  );
}

// generated shapes: 600 samples across all difficulty sizes
for (const n of [7, 10, 13]) {
  for (let i = 0; i < 200; i++) {
    const cells = generatePolycube(n);
    check(`n=${n} count`, cells.length === n);
    check(`n=${n} not flat`, !isFlat(cells));
    check(`n=${n} chiral`, !isAchiral(cells));
    // mirror must differ from EVERY rotation of the original
    const mirroredKeys = new Set(
      ROTATIONS_24.map((m) => normalizeKey(applyRotation(mirrorCells(cells), m)))
    );
    check(`n=${n} mirror distinguishable`, !mirroredKeys.has(normalizeKey(cells)));
    // ...and a rotated SAME copy must be reachable (identity works)
    check(
      `n=${n} same reachable`,
      ROTATIONS_24.some((m) => normalizeKey(applyRotation(cells, m)) === normalizeKey(cells))
    );
    // connectivity: every cell has at least one orthogonal neighbor
    const set = new Set(cells.map((c) => c.join(',')));
    check(
      `n=${n} connected-ish`,
      cells.every(
        (c) =>
          cells.length === 1 ||
          [
            [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
          ].some((d) => set.has(`${c[0] + d[0]},${c[1] + d[1]},${c[2] + d[2]}`))
      )
    );
  }
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all polycube tests passed');
