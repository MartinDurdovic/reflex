// Local persistence for attempts + settings.
// Primary backend: IndexedDB via idb-keyval. Fallback: localStorage
// (same async API) when IndexedDB is unavailable/broken (e.g. some
// private-browsing modes).
import { get, set, update, del, keys, createStore } from 'idb-keyval';

export type DeviceType = 'touch' | 'mouse' | 'pen' | 'unknown';

export interface Attempt {
  testId: string;
  /** wall-clock ms (Date.now) — for history only, never for scoring */
  timestamp: number;
  /** primary score; meaning is per-game (ms, level, span, accuracy…) */
  score: number;
  /** false for DNF/jump-start etc. — excluded from averages/bests */
  valid: boolean;
  difficulty: string;
  /** game-specific parameters & sub-metrics of the attempt */
  params: Record<string, unknown>;
  deviceType: DeviceType;
}

export interface ExportBlob {
  app: 'brain';
  exportVersion: 1;
  exportedAt: number;
  attempts: Record<string, Attempt[]>; // keyed by testId
  settings: Record<string, unknown>;
}

const ATTEMPTS_PREFIX = 'attempts:';
const SETTINGS_KEY = 'settings';

// ---------- backend selection ----------
interface Backend {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  update<T>(key: string, fn: (old: T | undefined) => T): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

function makeIdbBackend(): Backend {
  const store = createStore('brain-db', 'kv');
  return {
    get: (k) => get(k, store),
    set: (k, v) => set(k, v, store),
    update: (k, fn) => update(k, fn, store),
    del: (k) => del(k, store),
    keys: async () => (await keys(store)).map(String),
  };
}

function makeLocalStorageBackend(): Backend {
  const P = 'brain:';
  return {
    async get(k) {
      const raw = localStorage.getItem(P + k);
      return raw === null ? undefined : JSON.parse(raw);
    },
    async set(k, v) {
      localStorage.setItem(P + k, JSON.stringify(v));
    },
    async update(k, fn) {
      const raw = localStorage.getItem(P + k);
      localStorage.setItem(
        P + k,
        JSON.stringify(fn(raw === null ? undefined : JSON.parse(raw)))
      );
    },
    async del(k) {
      localStorage.removeItem(P + k);
    },
    async keys() {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(P)) out.push(k.slice(P.length));
      }
      return out;
    },
  };
}

let backendPromise: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  backendPromise ??= (async () => {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('no idb');
      const b = makeIdbBackend();
      await b.get('__probe__'); // throws if IDB is broken
      return b;
    } catch {
      return makeLocalStorageBackend();
    }
  })();
  return backendPromise;
}

// ---------- attempts ----------
export async function saveAttempt(attempt: Attempt): Promise<void> {
  const b = await backend();
  await b.update<Attempt[]>(ATTEMPTS_PREFIX + attempt.testId, (old) => [
    ...(old ?? []),
    attempt,
  ]);
}

export async function getAttempts(testId: string): Promise<Attempt[]> {
  const b = await backend();
  return (await b.get<Attempt[]>(ATTEMPTS_PREFIX + testId)) ?? [];
}

export async function getAllAttempts(): Promise<Record<string, Attempt[]>> {
  const b = await backend();
  const out: Record<string, Attempt[]> = {};
  for (const k of await b.keys()) {
    if (k.startsWith(ATTEMPTS_PREFIX)) {
      out[k.slice(ATTEMPTS_PREFIX.length)] = (await b.get<Attempt[]>(k)) ?? [];
    }
  }
  return out;
}

// ---------- settings ----------
export async function getSettings(): Promise<Record<string, unknown>> {
  const b = await backend();
  return (await b.get<Record<string, unknown>>(SETTINGS_KEY)) ?? {};
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const b = await backend();
  await b.update<Record<string, unknown>>(SETTINGS_KEY, (old) => ({
    ...(old ?? {}),
    [key]: value,
  }));
}

// ---------- export / import / reset ----------
export async function exportData(): Promise<ExportBlob> {
  return {
    app: 'brain',
    exportVersion: 1,
    exportedAt: Date.now(),
    attempts: await getAllAttempts(),
    settings: await getSettings(),
  };
}

export async function importData(blob: unknown): Promise<void> {
  const data = blob as ExportBlob;
  if (data?.app !== 'brain' || typeof data.attempts !== 'object') {
    throw new Error('invalid export blob');
  }
  const b = await backend();
  for (const [testId, attempts] of Object.entries(data.attempts)) {
    if (!Array.isArray(attempts)) continue;
    // merge & dedupe by timestamp so re-imports don't duplicate
    await b.update<Attempt[]>(ATTEMPTS_PREFIX + testId, (old) => {
      const seen = new Set((old ?? []).map((a) => a.timestamp));
      const merged = [...(old ?? [])];
      for (const a of attempts) if (!seen.has(a.timestamp)) merged.push(a);
      merged.sort((x, y) => x.timestamp - y.timestamp);
      return merged;
    });
  }
  if (data.settings) {
    await b.update<Record<string, unknown>>(SETTINGS_KEY, (old) => ({
      ...(old ?? {}),
      ...data.settings,
    }));
  }
}

export async function resetAllData(): Promise<void> {
  const b = await backend();
  for (const k of await b.keys()) await b.del(k);
}
