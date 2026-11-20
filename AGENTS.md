# AGENTS.md

Notes for AI coding agents working in this repo.

## What this is

A static, offline-first PWA for tracking office attendance. There's no backend, no build step and no npm dependencies at runtime. It's served as-is from GitHub Pages and installed to an iPhone Home Screen.

## Ground rules

- **Never commit personal data.** The repo is public. No real timesheet rows, employer names, backups or screenshots containing data. Test fixtures must be synthetic.
- **No build step.** Plain ES modules loaded by the browser. Lume is resolved through the import map in `index.html`. Don't add a bundler, framework or CDN script; vendor anything new under `vendor/`.
- **Data stays on device.** No network calls except fetching the app's own files.
- Keep `js/calc.js` pure (no DOM, no storage, no Lume) so it runs under `node --test`.

## Lume.js

State uses [Lume.js](https://github.com/sathvikc/lume-js) 2.4.0, vendored in `vendor/lume-js/` (unminified dist files, which share one kernel). Before changing state code, read the package's `AGENT_GUIDE.md` (npm `lume-js`). The rules that matter here:

- Lume tracks **top-level keys only**. Always replace arrays and objects (`data.days = [...]`, `data.settings = { ...data.settings, x }`). Never mutate them in place.
- Updates flush on a microtask. Use `batch()` when one event writes several stores.
- `data-*` attribute values are store keys, not expressions. Derive flat keys in an effect.
- `computed().value` is not tracked by effects. This app derives into a state object (`m` in `app.js`) instead.

## Layout

- `js/calc.js`: rounding (grace model), resolving recorded vs. actual, presence, monthly stats, workdays left, timesheet coverage, rounding check, import parsing.
- `js/store.js`: `data` (persisted doc) and `ui` (session) stores; every write goes through functions here.
- `js/app.js`: the derived model `m`, render effects per region, dialogs, events.
- `js/storage.js`: IndexedDB with a localStorage fallback.
- `sw.js`: precache plus stale-while-revalidate. Add new files to `SHELL`. Bump `CACHE` when removing files.

## Domain rules (keep these consistent)

- `actual` present means verified. Calculations use `actual` when present, otherwise `recorded` with the rounding rules applied.
- Rounding rule `{ mode, grace }` on a 15-minute grid: round down when the minutes past the quarter are at most `grace`, otherwise round up. The presets are Down = 14, Nearest = 7, Up = 0.
- Presence: WFH = 0, OOO/Sick = 1, office = 1 when the day has hours, PTO or an open punch. The denominator is Mon–Fri of the weeks with records in the group, up to today, minus company holidays.
- The average counts non-WFH days with work hours, using work + PTO. PTO-only days are excluded.
- Timesheet: published on `settings.releaseDay` (default Wednesday), covering through the previous Friday.

## Checks before committing

```sh
node --test tests/*.test.mjs
python3 -m http.server 8000   # load at a phone-sized viewport; no console errors, no horizontal scroll
```

Test the day dialog at 375px wide. iOS Safari gives native date/time inputs an intrinsic width. The `.field`/`.grid2` rules in `css/app.css` are what keep them inside their columns.
