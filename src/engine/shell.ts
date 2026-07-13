// Game shell: shared lifecycle every game plugs into.
//   intro (handled by the page) -> countdown 3-2-1 -> game -> results
//
// Responsibilities:
//  - rAF-timed countdown (no setTimeout for anything user-visible)
//  - visibilitychange: pause or abort the live trial so a background
//    tab can never produce a garbage score
//  - locks UI chrome (header etc.) while a trial is live
//  - persists results via the storage wrapper
import { now, scheduleAt, type CancelHandle } from './timing';
import { saveAttempt, type Attempt, type DeviceType } from '../lib/storage';
import { guessDeviceType } from '../lib/device';
import { strings } from '../lib/strings';

export type PauseMode = 'pause' | 'abort';

export interface ShellCallbacks {
  /** countdown finished — the trial is live */
  onStart(): void;
  /** only called when pauseMode === 'pause' */
  onPause?(): void;
  onResume?(): void;
  /** trial thrown away (tab hidden with pauseMode 'abort') */
  onAbort?(): void;
}

export interface ShellOptions {
  stage: HTMLElement;
  testId: string;
  difficulty: string;
  /** what to do when the tab is hidden mid-trial */
  pauseMode: PauseMode;
}

const COUNTDOWN_STEP_MS = 800;

export class GameShell {
  private readonly opts: ShellOptions;
  private cb: ShellCallbacks | null = null;
  private countdownHandle: CancelHandle | null = null;
  private state: 'idle' | 'countdown' | 'live' | 'paused' | 'done' = 'idle';
  private pauseOverlay: HTMLElement | null = null;
  /** authoritative device type — updated from real pointer events */
  deviceType: DeviceType = guessDeviceType();

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'hidden') return;
    if (this.state === 'countdown') {
      // restartable for free: cancel and rerun countdown on return
      this.countdownHandle?.cancel();
      this.abortToOverlay();
      return;
    }
    if (this.state !== 'live') return;
    if (this.opts.pauseMode === 'pause') {
      this.state = 'paused';
      this.cb?.onPause?.();
      this.showPauseOverlay();
    } else {
      this.abortToOverlay();
    }
  };

  constructor(opts: ShellOptions) {
    this.opts = opts;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Run the 3-2-1 countdown, then hand control to the game. */
  begin(cb: ShellCallbacks): void {
    this.cb = cb;
    // Already-hidden page: rAF is frozen and visibilitychange will never
    // fire, so the trial would stall and then burst on return. Abort now.
    if (document.visibilityState === 'hidden') {
      this.abortToOverlay();
      return;
    }
    this.state = 'countdown';
    this.lockChrome(true);

    const overlay = document.createElement('div');
    overlay.className = 'countdown-overlay';
    overlay.textContent = '3';
    this.opts.stage.appendChild(overlay);

    const t0 = now();
    const step = (n: number): void => {
      if (n === 0) {
        overlay.remove();
        this.state = 'live';
        cb.onStart();
        return;
      }
      overlay.textContent = String(n);
      this.countdownHandle = scheduleAt(t0 + (4 - n) * COUNTDOWN_STEP_MS, () =>
        step(n - 1)
      );
    };
    step(3);
  }

  /** Record device type from a real input event (call once per trial). */
  noteDevice(type: DeviceType): void {
    this.deviceType = type;
  }

  /**
   * Persist a finished attempt. `valid:false` records a DNF (jump start,
   * abort…) that shows in history but is excluded from averages/bests.
   */
  async finish(result: {
    score: number;
    valid: boolean;
    params: Record<string, unknown>;
  }): Promise<Attempt> {
    this.state = 'done';
    this.lockChrome(false);
    const attempt: Attempt = {
      testId: this.opts.testId,
      timestamp: Date.now(),
      score: result.score,
      valid: result.valid,
      difficulty: this.opts.difficulty,
      params: result.params,
      deviceType: this.deviceType,
    };
    await saveAttempt(attempt);
    return attempt;
  }

  /**
   * End the session without saving an attempt here — for games that
   * persist per-trial via saveAttempt() themselves (e.g. one attempt
   * per F1 start). Unlocks chrome and stops visibility handling.
   */
  end(): void {
    this.state = 'done';
    this.lockChrome(false);
  }

  /** Game-initiated resume after a pause overlay. */
  private resume(): void {
    if (this.state !== 'paused') return;
    this.pauseOverlay?.remove();
    this.pauseOverlay = null;
    this.state = 'live';
    this.cb?.onResume?.();
  }

  private abortToOverlay(): void {
    this.state = 'idle';
    this.lockChrome(false);
    this.cb?.onAbort?.();
    const ov = document.createElement('div');
    ov.className = 'pause-overlay';
    const msg = document.createElement('p');
    msg.className = 'dim';
    msg.textContent = strings.shell.trialAborted;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = strings.shell.playAgain;
    btn.addEventListener('pointerdown', () => location.reload());
    ov.append(msg, btn);
    this.opts.stage.appendChild(ov);
  }

  private showPauseOverlay(): void {
    const ov = document.createElement('div');
    ov.className = 'pause-overlay';
    const title = document.createElement('h2');
    title.textContent = strings.shell.pause;
    const btn = document.createElement('button');
    btn.className = 'primary';
    btn.textContent = strings.shell.resume;
    btn.addEventListener('pointerdown', () => this.resume());
    ov.append(title, btn);
    this.pauseOverlay = ov;
    this.opts.stage.appendChild(ov);
  }

  private lockChrome(locked: boolean): void {
    document.body.classList.toggle('game-locked', locked);
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.countdownHandle?.cancel();
    this.lockChrome(false);
  }
}
