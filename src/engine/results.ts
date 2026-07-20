// Shared results screen: this attempt's score, personal best, delta vs
// average, custom stat lines, and a mini history chart (last 20 valid
// attempts) drawn as plain SVG. Every game renders results through this.
//
// Comparisons are STRATIFIED: a game passes `comparable` to say which
// prior attempts are a fair yardstick (same difficulty, same MOT load…)
// so an easy-mode score is never rated against a hard-mode best. Best,
// average and the "new best" banner are computed against PRIOR attempts
// (this session excluded via `sessionSize`) so a result never rates
// itself — no self-inflated average, and a tie is not a "new best".
import { getAttempts, type Attempt } from '../lib/storage';
import { mean } from '../engine/timing';
import { strings } from '../lib/strings';
import { sparklineSvg } from './chart';
import type { GameMeta } from '../games/registry';

export interface StatLine {
  label: string;
  value: string;
}

const HISTORY_LEN = 20;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const bestOf = (scores: number[], lowerIsBetter: boolean): number | null =>
  scores.length ? (lowerIsBetter ? Math.min(...scores) : Math.max(...scores)) : null;

export async function renderResults(
  stage: HTMLElement,
  opts: {
    meta: GameMeta;
    /** numeric score of this attempt, or null for a failed attempt (DNF) */
    score: number | null;
    /** big text override (defaults to formatted score / 'DNF') */
    scoreText?: string;
    stats?: StatLine[];
    footnote?: string;
    /**
     * Which stored attempts are a fair comparison for this result
     * (e.g. same difficulty / same MOT load). Default: every attempt.
     * Invalid attempts are always excluded on top of this.
     */
    comparable?: (a: Attempt) => boolean;
    /**
     * How many VALID comparable attempts were saved this session and so
     * must be excluded from the "prior" baseline (default 1). F1 saves
     * one per successful start, so it passes its own count.
     */
    sessionSize?: number;
  }
): Promise<void> {
  const { meta } = opts;
  const lowerIsBetter = meta.lowerIsBetter;
  const pred = opts.comparable ?? (() => true);

  // attempts already include this session (games save before rendering)
  const all = await getAttempts(meta.id);
  const comparable = all.filter((a) => a.valid && pred(a));
  const sessionSize = Math.max(0, opts.sessionSize ?? 1);
  const prior = comparable.slice(0, Math.max(0, comparable.length - sessionSize));
  const priorScores = prior.map((a) => a.score);

  const priorBest = bestOf(priorScores, lowerIsBetter);
  const priorAvg = priorScores.length ? mean(priorScores) : null;
  // personal best shown to the user is the up-to-date one (incl. this run)
  const pbNow = bestOf(comparable.map((a) => a.score), lowerIsBetter);

  const bigText =
    opts.scoreText ??
    (opts.score !== null ? meta.formatScore(opts.score) : strings.results.dnf);

  // a genuine improvement: strictly beats the previous best (ties don't)
  const isNewBest =
    opts.score !== null &&
    priorBest !== null &&
    (lowerIsBetter ? opts.score < priorBest : opts.score > priorBest);

  let deltaText = '—';
  if (opts.score !== null && priorAvg !== null) {
    const delta = opts.score - priorAvg;
    const sign = delta >= 0 ? '+' : '−';
    deltaText = `${sign}${meta.formatScore(Math.abs(delta))}`;
  }

  const statCells: StatLine[] = [
    {
      label: strings.results.personalBest,
      value: pbNow !== null ? meta.formatScore(pbNow) : '—',
    },
    {
      label: strings.results.vsAverage,
      value: deltaText,
    },
    ...(opts.stats ?? []),
  ];

  const history = comparable.slice(-HISTORY_LEN).map((a) => a.score);

  stage.innerHTML = `
    <div class="results" style="flex:1;overflow-y:auto">
      <h2>${esc(strings.results.title)}</h2>
      ${isNewBest ? `<p style="color:var(--success);font-weight:600">${esc(strings.results.newBest)}</p>` : ''}
      <div class="score">${esc(bigText)}</div>
      <div class="stat-row">
        ${statCells
          .map(
            (s) =>
              `<span>${esc(s.label)}<b class="mono">${esc(s.value)}</b></span>`
          )
          .join('')}
      </div>
      ${
        history.length > 1
          ? `<div><p class="dim" style="font-size:0.8rem;margin:0 0 4px">${esc(strings.results.history)}</p>${sparklineSvg(history)}</div>`
          : ''
      }
      ${opts.footnote ? `<p class="footnote">${esc(opts.footnote)}</p>` : ''}
      <div style="display:flex;gap:var(--gap)">
        <button class="primary" data-again>${esc(strings.shell.playAgain)}</button>
        <button data-home>${esc(strings.shell.backHome)}</button>
      </div>
    </div>`;

  stage
    .querySelector('[data-again]')!
    .addEventListener('pointerdown', () => location.reload());
  stage
    .querySelector('[data-home]')!
    .addEventListener('pointerdown', () => (location.href = '/'));
}
