// Glue between the intro page and a game module: reads the chosen
// difficulty, hides the intro, creates the fullscreen game stage.
import { getGame, type GameMeta } from '../games/registry';

export interface PlayContext {
  meta: GameMeta;
  difficulty: string;
  /** values of the intro screen's config fields (empty if none) */
  config: Record<string, number>;
  stage: HTMLElement;
}

export function bindIntro(
  gameId: string,
  run: (ctx: PlayContext) => void
): void {
  const intro = document.getElementById('intro');
  const btn = document.getElementById('start-btn');
  if (!intro || !btn) return;
  let started = false;
  btn.addEventListener('pointerdown', (e) => {
    if (started || !e.isPrimary) return;
    started = true;
    const sel = document.querySelector<HTMLElement>(
      '#difficulty-row button.primary'
    );
    const difficulty = sel?.dataset.difficulty ?? 'custom';
    const config: Record<string, number> = {};
    for (const el of document.querySelectorAll<HTMLInputElement>('[data-cfg]')) {
      config[el.dataset.cfg!] = Number(el.value);
    }
    intro.style.display = 'none';

    const stage = document.createElement('div');
    stage.className = 'game-stage';
    // no long-press context menu / text selection on the play surface
    stage.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.body.appendChild(stage);
    run({ meta: getGame(gameId), difficulty, config, stage });
  });
}
