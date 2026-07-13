// Shared results screen: this attempt's score, personal best, delta vs
// average, custom stat lines, and a mini history chart (last 20 valid
// attempts) drawn as plain SVG. Every game renders results through this.
import { getAttempts } from '../lib/storage';
import { summarize } from '../lib/stats';
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
  }
): Promise<void> {
  const { meta } = opts;
  // attempts already include this one (games save before rendering)
  const attempts = await getAttempts(meta.id);
  const sum = summarize(attempts, meta.lowerIsBetter);

  const bigText =
    opts.scoreText ??
    (opts.score !== null ? meta.formatScore(opts.score) : strings.results.dnf);

  const isNewBest =
    opts.score !== null && sum.best !== null && opts.score === sum.best &&
    sum.validCount > 1;

  let deltaText = '—';
  if (opts.score !== null && sum.average !== null && sum.validCount > 1) {
    const delta = opts.score - sum.average;
    const sign = delta >= 0 ? '+' : '−';
    deltaText = `${sign}${meta.formatScore(Math.abs(delta))}`;
  }

  const statCells: StatLine[] = [
    {
      label: strings.results.personalBest,
      value: sum.best !== null ? meta.formatScore(sum.best) : '—',
    },
    {
      label: strings.results.vsAverage,
      value: deltaText,
    },
    ...(opts.stats ?? []),
  ];

  const history = attempts
    .filter((a) => a.valid)
    .slice(-HISTORY_LEN)
    .map((a) => a.score);

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
