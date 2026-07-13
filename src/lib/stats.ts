// Derived statistics over stored attempts (bests, averages, streaks).
import { getAttempts, type Attempt } from './storage';
import { mean } from '../engine/timing';

export interface TestSummary {
  count: number;
  validCount: number;
  best: number | null;
  average: number | null;
  last: Attempt | null;
}

export function summarize(
  attempts: Attempt[],
  lowerIsBetter: boolean
): TestSummary {
  const valid = attempts.filter((a) => a.valid);
  const scores = valid.map((a) => a.score);
  return {
    count: attempts.length,
    validCount: valid.length,
    best: scores.length
      ? lowerIsBetter
        ? Math.min(...scores)
        : Math.max(...scores)
      : null,
    average: scores.length ? mean(scores) : null,
    last: attempts.length ? attempts[attempts.length - 1]! : null,
  };
}

export async function summarizeTest(
  testId: string,
  lowerIsBetter: boolean
): Promise<TestSummary> {
  return summarize(await getAttempts(testId), lowerIsBetter);
}

/** Consecutive days (ending today or yesterday) with >= 1 attempt. */
export function dailyStreak(
  allAttempts: Attempt[],
  today: Date = new Date()
): number {
  const days = new Set(
    allAttempts.map((a) => new Date(a.timestamp).toDateString())
  );
  let streak = 0;
  const d = new Date(today);
  // a streak survives if today has no attempt yet but yesterday does
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
