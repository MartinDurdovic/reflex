// Glue between the intro page and a game module: reads the chosen
// difficulty, hides the intro, creates the fullscreen game stage.
import { getGame, type GameMeta } from '../games/registry';

export interface PlayContext {
  meta: GameMeta;
  difficulty: string;
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
    const difficulty = sel?.dataset.difficulty ?? 'standard';
    intro.style.display = 'none';

    const stage = document.createElement('div');
    stage.className = 'game-stage';
    // no long-press context menu / text selection on the play surface
    stage.addEventListener('contextmenu', (ev) => ev.preventDefault());
    document.body.appendChild(stage);
    run({ meta: getGame(gameId), difficulty, stage });
  });
}
