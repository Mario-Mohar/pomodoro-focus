# Contributing

Thanks for taking the time. This is a small project, so the process is short.

## Getting set up

```bash
git clone https://github.com/Mario-Mohar/pomodoro-focus.git
cd pomodoro-focus
npm install
npm start          # serves public/ on http://localhost:3000
```

There is no build step for the app itself. `public/` is what ships: open
`index.html` and it runs. Only the stylesheet is generated, with
`npm run build:css`.

## Running the checks

```bash
npm test           # vitest
node --check public/app.js
```

## How the tests reach a script with no exports

`public/app.js` is one file in global scope. It has no exports, it queries the
DOM, and it calls `updateUI()`, `fetchTodos()` and
`requestNotificationPermission()` at the bottom of the file.

Rather than keep a second copy of the logic that could drift away from the
shipped file, `tests/harness.js` loads the real `public/index.html` into JSDOM,
stubs the browser APIs the script reaches for — `fetch`, `Notification`,
`Audio`, `AudioContext`, `Worker`, the service worker, and a clicked
`<a download>` — and then evaluates the real `public/app.js` against it.

Two things follow from that, and they trip people up:

- **Function declarations are reachable as `window.formatTime`. `let` and
  `const` are not.** `stats` is declared with `let`, so it lives in the script's
  global lexical environment rather than on the global object. Read it with the
  harness's `evaluate("stats")`.
- **The clock can be frozen**: `loadApp({ now: new Date(2026, 7, 31, 10, 0) })`.
  Use it instead of waiting for anything.

## The one rule that matters most

**Which day a session belongs to is worked out in local time.** `toISOString()`
returns UTC, so east of Greenwich every session between midnight and 01:00 or
02:00 would be filed under yesterday — while the streak, which compares
`toDateString()`, would call it today. The tile would count a session that the
week chart and the heatmap draw on the day before.

`localDateKey()` exists for exactly this, and `tests/stats.test.js` pins it
down: three of its tests fail if the function is changed to use
`toISOString()`. The test suite runs under `TZ=Europe/Vienna` on purpose —
under `TZ=UTC` the local and UTC dates never disagree and those tests would
pass whatever the code did.

If you touch anything that decides which day something happened on, add a test
at a local time between midnight and 02:00.

## Also worth knowing

**It runs without a server and without an account.** `npm start` is a
convenience, not a requirement — the app has to keep working when `index.html`
is opened straight off disk. Nothing may become dependent on a backend.

**Everything lives in `localStorage`.** There is no account and no sync, so a
change to the shape of what is stored has to keep reading what an older version
wrote, or migrate it. Silently dropping somebody's streak is the worst bug this
app can have.

## Pull requests

- Branch off `main`. Any branch name is fine.
- Commit messages follow `fix(scope):`, `feat(scope):`, `docs:`, `chore:`.
  The pipeline reads the pull request title's prefix to label it.
- The pipeline comments the result and updates that comment on every push.
  Green plus not-a-draft gets a `ready-to-merge` label.
- Maintainers can ask for a deeper look with `/claude review`.

## Licence

MIT, same as the project. By contributing you agree your work ships under it.
