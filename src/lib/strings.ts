// All user-facing strings live here (Slovak translation drops in later).
export const APP_NAME = 'Brain';

export const strings = {
  app: {
    name: APP_NAME,
    tagline: 'Cognitive testing & training',
  },
  nav: {
    home: 'Tests',
    stats: 'Stats',
    settings: 'Settings',
  },
  home: {
    personalBest: 'Best',
    lastPlayed: 'Last',
    never: '—',
  },
  shell: {
    start: 'Start',
    pause: 'Paused',
    resume: 'Resume',
    quit: 'Quit',
    trialAborted: 'Trial aborted (tab lost focus). It was not recorded.',
    playAgain: 'Play again',
    backHome: 'All tests',
    confirm: 'Confirm',
  },
  results: {
    title: 'Results',
    personalBest: 'Personal best',
    average: 'Your average',
    vsAverage: 'vs average',
    best: 'Best',
    consistency: 'Consistency',
    history: 'Last 20 attempts',
    newBest: 'New personal best!',
    latencyFootnote:
      "Measured value includes your device's display + touch latency.",
  },
  difficulty: {
    label: 'Difficulty',
    easy: 'Easy',
    normal: 'Normal',
    hard: 'Hard',
  },
  stats: {
    title: 'Statistics',
    totalAttempts: 'Total attempts',
    streak: 'Daily streak',
    days: 'days',
    noData: 'No attempts yet. Play some tests first.',
  },
  settings: {
    title: 'Settings',
    data: 'Data',
    export: 'Export data (JSON)',
    import: 'Import data (JSON)',
    reset: 'Delete all data',
    resetConfirm: 'Delete ALL local data? This cannot be undone.',
    importDone: 'Import complete.',
    importError: 'Import failed: file is not a valid export.',
    theme: 'Theme',
    themeDark: 'Dark (more coming later)',
  },
  games: {
    'reaction-f1': {
      name: 'Lights Out',
      short: 'Reaction time',
      how: 'Five columns of red lights come on one by one. When they all go out — tap as fast as you can. Tap too early and it is a jump start. A session is 5 starts.',
      ui: {
        startCounter: (n: number, total: number) => `Start ${n} / ${total}`,
        wait: 'Wait for lights out…',
        jumpStart: 'JUMP START',
        jumpStarts: 'Jump starts',
        sessionBest: 'Session best',
        sessionAvg: 'Session average',
      },
    },
    mot: {
      name: 'Ball Tracking',
      short: 'Multiple object tracking',
      how: 'A few balls flash as targets, then all balls look identical and start moving. Keep your eyes on the targets. When they stop, tap the balls you tracked.',
      ui: {
        level: (n: number) => `Level ${n}`,
        memorize: 'Memorize the highlighted balls',
        track: 'Track them…',
        select: (k: number) => `Tap the ${k} balls you tracked`,
        thisLevel: 'This round',
        nextLevel: 'Next round',
      },
    },
    rotation: {
      name: 'Mental Rotation',
      short: '3D spatial reasoning',
      how: 'Two 3D shapes are shown. Decide whether they are the SAME shape rotated, or MIRRORED copies. 10 trials per round.',
    },
    'go-nogo': {
      name: 'Go / No-Go',
      short: 'Inhibition + reaction',
      how: 'Shapes appear one at a time. GREEN circle: tap as fast as you can. RED circle: do NOT tap. 30 stimuli per round.',
    },
    'digit-span': {
      name: 'Digit Span',
      short: 'Working memory',
      how: 'Digits appear one at a time, then you type the sequence back. Each success adds a digit. In reverse mode, type the sequence backwards.',
    },
  },
  comingSoon: 'This test is coming soon.',
} as const;
