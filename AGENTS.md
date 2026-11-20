# AGENTS.md

Guidance for AI coding agents working in this repository.

## Before you start

- If `.private/REQUIREMENTS.md` exists, read it first. It holds the product requirements and decision log. It is gitignored and must never be committed, quoted into tracked files, or pasted into issues or PRs.
- This repository is public. Never commit personal data: real timesheet rows, backups (`rto-backup-*.json`), employer names, or screenshots containing data. Test fixtures must be synthetic (see `tests/helpers.js`).

## What this is

A static, offline-first PWA. There is no backend and no build step: the browser loads `index.html`, the stylesheets in `src/styles/` and the ES modules in `src/js/` directly, and GitHub Pages serves the repository as-is. Node is used only for development tooling.

## Commands

```sh
npm install          # dev tooling only
npm start            # serve at http://localhost:8000
npm run check        # format check, lint, type-check, app-shell check, tests (what CI runs)
npm test             # unit tests (node --test)
npm run format       # apply Prettier
```

Run `npm run check` before every commit.

## Layout

```
index.html               markup, dialogs, import map for Lume
sw.js                    service worker (offline cache)
src/js/
  main.js                entry: mounts views, starts the clock
  domain/                pure logic: no DOM, no storage, no Lume
  lib/format.js          display formatting (pure)
  state/                 Lume stores, persistence, derived model
  ui/                    DOM helpers, actions, dialogs, theme
  ui/views/              one module per screen region or dialog
  ui/components/         reusable render functions
src/styles/              CSS split by cascade layer
tests/                   node:test unit tests
vendor/lume-js/          vendored Lume.js (do not edit)
types/lume-js/           Lume type declarations for the type-checker
scripts/                 dev scripts (e.g. app-shell check)
```

Dependencies point inward: `ui` → `state` → `domain`/`lib`. `domain` imports nothing outside itself. `state` never imports from `ui`.

## Code standards

**JavaScript**

- ES modules, `const` by default, no globals, no default exports.
- JSDoc types on every exported function. Shared types live in `src/js/domain/types.js`. The code is type-checked with `tsc` in strict mode (`jsconfig.json`), so keep it passing without `any` or `@ts-ignore`.
- Keep `domain/` pure and covered by tests. New calculation logic needs a test.
- Render HTML only through the `html` tagged template in `ui/dom.js`. It escapes every interpolation. Don't assign strings to `innerHTML` yourself.
- Clicks go through `data-action` attributes and `registerActions()` (`ui/actions.js`). Each action name is registered once.
- Each view exports a `mountX()` that returns a cleanup function (use `createCleanupGroup` from `lume-js/addons`).
- When you add, rename or remove a shipped file, update `APP_SHELL` in `sw.js`. `npm run check:shell` enforces this. Bump `CACHE_NAME` when files are removed or renamed.

**CSS**

- Cascade layers, declared in `tokens.css`: `tokens, base, layout, components, forms, dialogs, utilities`.
- Use design tokens (`--color-*`, `--space-*`, `--radius-*`, `--text-*`) rather than raw values. Colors are defined once with `light-dark()`; the theme switches `color-scheme`.
- BEM class names (`block__element--modifier`). Utilities are prefixed by intent (`text-dim`, `visually-hidden`). Don't style IDs.
- Mobile first. Check at 375px wide: no horizontal scroll. Respect the safe-area insets.
- iOS date/time inputs: keep the `.field-grid` / `.input` rules in `forms.css`. They stop native pickers overflowing their columns.

**HTML**

- Semantic elements, labels for every input, `aria-*` only where native semantics fall short.
- Dialogs are native `<dialog>` elements opened with `openDialog()`.

## Lume.js

Version 2.4.0, vendored unminified (the files share one reactive kernel). Read the package's `AGENT_GUIDE.md` (npm `lume-js`) before changing state code. The rules that bite:

- Only top-level keys are reactive. Replace arrays and objects; never mutate them in place.
- Updates flush on a microtask. Use `batch()` when one event writes several stores.
- `data-*` attribute values are store keys, not expressions. Derive flat keys in an effect.
- `computed().value` is not tracked by effects. Derived values are written into the `model` store (`state/model.js`) instead.

## Commits and PRs

- Small, focused commits with imperative subjects.
- Don't commit `.private/`, backups, `node_modules/` or generated files.
