// Tiny SVG chart helpers — no chart library. Used by the results
// screen (sparkline) and the stats page (history chart).

/** Mini line chart of recent scores (no axes). Scales down to tiny inline use. */
export function sparklineSvg(scores: number[], w = 300, h = 72): string {
  if (!scores.length) return '';
  const pad = Math.min(8, h * 0.18);
  const dotR = Math.min(3.5, h * 0.13);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1; // flat series -> centered line
  const x = (i: number): number =>
    scores.length === 1 ? w / 2 : pad + (i / (scores.length - 1)) * (w - pad * 2);
  const y = (v: number): number => pad + (1 - (v - min) / span) * (h - pad * 2);
  const pts = scores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const lastX = x(scores.length - 1).toFixed(1);
  const lastY = y(scores[scores.length - 1]!).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)"
      stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${lastX}" cy="${lastY}" r="${dotR}" fill="var(--accent)"/>
  </svg>`;
}

/**
 * History chart for the stats page: score per attempt over time, with
 * min/max value labels and first/last date labels. x is attempt index
 * (equal spacing — long idle gaps would squash the line otherwise).
 */
export function historyChartSvg(
  points: { timestamp: number; score: number }[],
  format: (v: number) => string,
  w = 640,
  h = 140
): string {
  if (!points.length) return '';
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 22;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const x = (i: number): number =>
    points.length === 1
      ? w / 2
      : padL + (i / (points.length - 1)) * (w - padL - padR);
  const y = (v: number): number =>
    padT + (1 - (v - min) / span) * (h - padT - padB);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`);
  const fmtDate = (t: number): string => new Date(t).toLocaleDateString();
  const lastX = x(points.length - 1).toFixed(1);
  const lastY = y(points[points.length - 1]!.score).toFixed(1);

  // recessive graticule between the min/max rules
  const grid = [0.25, 0.5, 0.75]
    .map((f) => {
      const gy = (padT + f * (h - padT - padB)).toFixed(1);
      return `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="var(--border)" stroke-width="1" stroke-dasharray="1 6" opacity="0.7"/>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" style="display:block">
    ${grid}
    <line x1="${padL}" y1="${y(max)}" x2="${w - padR}" y2="${y(max)}" stroke="var(--border)" stroke-dasharray="3 4"/>
    <line x1="${padL}" y1="${y(min)}" x2="${w - padR}" y2="${y(min)}" stroke="var(--border)" stroke-dasharray="3 4"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)"
      stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3" fill="var(--accent)"/>
    <text x="${padL}" y="${y(max) - 4}" fill="var(--text-dim)" font-size="10">${format(max)}</text>
    <text x="${padL}" y="${y(min) + 12}" fill="var(--text-dim)" font-size="10">${format(min)}</text>
    <text x="${padL}" y="${h - 6}" fill="var(--text-dim)" font-size="10">${fmtDate(points[0]!.timestamp)}</text>
    <text x="${w - padR}" y="${h - 6}" fill="var(--text-dim)" font-size="10" text-anchor="end">${fmtDate(points[points.length - 1]!.timestamp)}</text>
  </svg>`;
}
