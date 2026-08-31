# Contributing

## Contributions are welcome

This is a small project maintained by one person in his spare time, and that is
exactly why an outside pair of eyes is worth a lot. **Finding a bug and writing
it down is a real contribution** — arguably the most useful one, because I only
ever use this on my own machine, with my own setup, and most of what is broken
is broken somewhere I never look.

Three ways to help, in the order of what they cost you:

### 1. Report something that is wrong

Open an issue with the **Bug report** template. It asks for what it does because
each field is something I would otherwise have to come back and ask for, which
costs us both a day.

What actually decides whether a report is useful:

- **What you expected, and what happened instead.** Both halves. "It does not
  work" is the one report I cannot act on.
- **The steps that get there.** If you can reproduce it, say how. If it only
  happened once, say that too — an intermittent bug is still worth knowing about,
  and "I could not reproduce it" is useful information rather than a
  disqualification.
- **Your setup**, as the template asks for it.

Do not polish it. A rough report today beats a perfect one that never gets
written. If in doubt whether something counts as a bug: open it. Deciding that
is my job, not yours.

### 2. Suggest something it should do

Open an issue with the **Feature request** template.

It asks what you are trying to *achieve* before what you want built, and that is
deliberate — not a hoop. Roughly half the time there turns out to be a simpler
answer than the one either of us had in mind, and it only surfaces if I know the
underlying situation.

A wish that gets declined is not a wasted issue. "Not now" and "not in this
project" are answers you will get quickly and with a reason.

### 3. Send a fix or a feature

Very welcome, and you do not need to ask permission for something small.

**For anything bigger than a few lines, open an issue first** — or comment on
the existing one — and say you are working on it. It costs you a sentence and
saves you the case where I fixed the same thing that evening, or where I would
have wanted it solved differently.

Because you cannot push to this repository, the route is through a fork:

```bash
# 1. Fork it on GitHub, then clone your fork
git clone https://github.com/<your-username>/pomodoro-focus.git
cd pomodoro-focus

# 2. A branch. Any name.
git switch -c fix/the-thing

# 3. Change what you came for, then run the checks below

# 4. Push to your fork and open the pull request
git push -u origin fix/the-thing
```

GitHub then offers you the pull request button. Fill in the template, and if it
closes an issue write `Fixes #12` so it closes itself on merge.

## What happens after you send it

1. **The pipeline runs** and posts a comment on your pull request with a table
   of what passed. It updates that same comment on every push, so there is one
   place to look rather than a growing pile.
2. **It labels the pull request** by size and type, and adds `ready-to-merge`
   once everything is green.
3. **On your very first contribution here, the checks wait for me to release
   them.** GitHub does that by default so that a stranger's code cannot use the
   runners unasked. If your pull request sits at "waiting for approval",
   **nothing is broken and you do not need to do anything** — I have to click
   once.
4. **I do the merging.** The default branch takes nothing that has not been
   through a pull request with green checks, and that holds for my own commits
   too.

If a check is red, the run log says which one and why. Ask in the pull request
if it is not obvious — a red pipeline is not a rejection, and quite often it is
the pipeline that is wrong rather than you.

I do this beside a job, so a reply can take a few days. It is not disinterest.

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

- Branch off `main` **in your fork** (see above). Any branch name is fine.
- Commit messages follow `fix(scope):`, `feat(scope):`, `docs:`, `chore:`.
  The pipeline reads the pull request title's prefix to label it.
- The pipeline comments the result and updates that comment on every push.
  Green plus not-a-draft gets a `ready-to-merge` label.
- Maintainers can ask for a deeper look with `/claude review`.

## Licence

MIT, same as the project. By contributing you agree your work ships under it.
