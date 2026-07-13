// Shared results screen: this attempt's score, personal best, delta vs
// average, custom stat lines, and a mini history chart (last 20 valid
// attempts) drawn as plain SVG. Every game renders results through this.
import { getAttempts } from '../lib/storage';
import { summarize } from '../lib/stats';
import { strings } from '../lib/strings';
import type { GameMeta } from '../games/registry';

export interface StatLine {
  label: string;
  value: string;
}

const HISTORY_LEN = 20;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mini line chart of recent scores. Pure SVG, no deps. */
function sparkline(scores: number[], w = 300, h = 72): string {
  if (!scores.length) return '';
  const pad = 8;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1; // flat series -> centered line
  const x = (i: number): number =>
    scores.length === 1
      ? w / 2
      : pad + (i / (scores.length - 1)) * (w - pad * 2);
  const y = (v: number): number => pad + (1 - (v - min) / span) * (h - pad * 2);
  const pts = scores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const lastX = x(scores.length - 1).toFixed(1);
  const lastY = y(scores[scores.length - 1]!).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)"
      stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="var(--accent)"/>
  </svg>`;
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
    (opts.score !== null ? meta.formatScore(opts.score) : 'DNF');

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
          ? `<div><p class="dim" style="font-size:0.8rem;margin:0 0 4px">${esc(strings.results.history)}</p>${sparkline(history)}</div>`
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
