// Central registry of all tests: metadata, score semantics, icons.
// Pages and stats read from here; each game's logic lives in
// src/games/<id>/.
import { strings } from '../lib/strings';

export interface DifficultyOption {
  id: string;
  label: string;
}

/** A user-tunable number on the intro screen (± buttons or typing). */
export interface ConfigField {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** dependent upper bound, evaluated against the current values */
  dynamicMax?: (values: Record<string, number>) => number;
}

export interface GameMeta {
  id: string;
  name: string;
  short: string;
  how: string;
  /** inline SVG markup (24x24 viewBox, currentColor) */
  icon: string;
  scoreUnit: string;
  /** reaction times: lower is better; levels/spans: higher */
  lowerIsBetter: boolean;
  formatScore: (score: number) => string;
  implemented: boolean;
  difficulties: DifficultyOption[];
  /** optional per-game settings rendered on the intro screen */
  config?: ConfigField[];
}

const s = strings.games;
const d = strings.difficulty;

export const games: GameMeta[] = [
  {
    id: 'reaction-f1',
    name: s['reaction-f1'].name,
    short: s['reaction-f1'].short,
    how: s['reaction-f1'].how,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="7.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="16.5" cy="12" r="1.4" fill="currentColor"/></svg>`,
    scoreUnit: 'ms',
    lowerIsBetter: true,
    formatScore: (v) => `${Math.round(v)} ms`,
    implemented: true,
    difficulties: [{ id: 'standard', label: d.normal }],
  },
  {
    id: 'mot',
    name: s.mot.name,
    short: s.mot.short,
    how: s.mot.how,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="8" r="2.6"/><circle cx="16.5" cy="6.5" r="2.6"/><circle cx="12" cy="16" r="2.6"/><path d="M9 10.5l1.5 3M14.8 8.5L13.4 14"/></svg>`,
    scoreUnit: '%',
    lowerIsBetter: false,
    formatScore: (v) => `${Math.round(v)}%`,
    implemented: true,
    difficulties: [],
    config: [
      { id: 'total', label: s.mot.ui.cfgTotal, min: 2, max: 20, default: 8 },
      {
        id: 'targets',
        label: s.mot.ui.cfgTargets,
        min: 1,
        max: 10,
        default: 3,
        // never more than half the balls (odd totals round down)
        dynamicMax: (v) => Math.max(1, Math.floor((v['total'] ?? 8) / 2)),
      },
      { id: 'speed', label: s.mot.ui.cfgSpeed, min: 1, max: 10, default: 4 },
      { id: 'size', label: s.mot.ui.cfgSize, min: 1, max: 10, default: 5 },
    ],
  },
  {
    id: 'go-nogo',
    name: s['go-nogo'].name,
    short: s['go-nogo'].short,
    how: s['go-nogo'].how,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="12" r="4.5"/><circle cx="17" cy="12" r="4.5"/><path d="M14 9l6 6" /></svg>`,
    scoreUnit: 'ms',
    lowerIsBetter: true,
    formatScore: (v) => `${Math.round(v)} ms`,
    implemented: true,
    difficulties: [{ id: 'standard', label: d.normal }],
  },
  {
    id: 'digit-span',
    name: s['digit-span'].name,
    short: s['digit-span'].short,
    how: s['digit-span'].how,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 5v14M5 8h6M13 5h6M13 12h6M13 19h6"/></svg>`,
    scoreUnit: 'digits',
    lowerIsBetter: false,
    formatScore: (v) => `${v} digits`,
    implemented: true,
    difficulties: [
      { id: 'forward', label: s['digit-span'].ui.forward },
      { id: 'reverse', label: s['digit-span'].ui.reverse },
    ],
  },
  {
    id: 'rotation',
    name: s.rotation.name,
    short: s.rotation.short,
    how: s.rotation.how,
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 4v10l-7 4-7-4V7z"/><path d="M12 3v18M5 7l7 4 7-4" opacity="0.6"/></svg>`,
    scoreUnit: '%',
    lowerIsBetter: false,
    formatScore: (v) => `${Math.round(v)}%`,
    implemented: true,
    difficulties: [
      { id: 'easy', label: d.easy },
      { id: 'normal', label: d.normal },
      { id: 'hard', label: d.hard },
    ],
  },
];

export function getGame(id: string): GameMeta {
  const g = games.find((g) => g.id === id);
  if (!g) throw new Error(`unknown game: ${id}`);
  return g;
}
