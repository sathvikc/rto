# RTO

Return to office, tracked from your phone. RTO is a small progressive web app for logging office days and hours: one tap to clock in and out, a monthly average and presence %, and the daily average you still need to hit your target.

There's no account, server or tracking. Everything is stored on your device, and JSON export/import is the backup.

## Features

- **One-tap punches** with a live clock. Forgot to clock in or out? Set the time instead. Every punch can be undone or adjusted from the confirmation.
- **Leave-by guide** while you're on the clock: what the timesheet shows if you leave now, when the next quarter hour gets credited, and when you'll be on pace for the month.
- **Forgotten clock-out guard**: a shift left open overnight asks when you left instead of becoming a 20-hour day.
- **Quick day entry** with Today/Yesterday, your usual times in one tap, and extras (PTO, timesheet, note) tucked under More.
- **Day types:** Office, WFH, OOO and Sick.
- **Your entry vs. the official timesheet.** Office days can hold both. Unverified days are marked `*`; a **Matches? / ✓ Matched** toggle on each card (and a weekly review sheet) confirms them. WFH, OOO and Sick days count as verified automatically.
- **Rounding rules** on a 15-minute grid: Down, Up, Nearest, None, or Custom with a grace window. A **rounding check** shows how well the rules predict the timesheet.
- **Company holidays**, skipped for workdays left and presence.
- **Home / History / Settings tabs.** Home shows today and the current month (average, presence, the average still needed). History has any month's stats, charts and the day list.
- **Light, dark or system theme.**
- **Works offline.**

## Install on iPhone

1. Open the site in Safari (or any iOS browser on iOS 16.4+).
2. Share → **Add to Home Screen**.
3. Use RTO from the Home Screen.

The Home Screen app keeps **its own storage**, separate from browser tabs. Import any backup from inside the installed app.

### Your data

- It's stored in IndexedDB on this device only, and the app asks the browser to keep it persistent.
- Home Screen apps aren't subject to Safari's 7-day cleanup of website storage. Deleting the app or clearing website data still erases it.
- **Settings → Export JSON** opens the share sheet, where you can pick _Save to Files_. The app reminds you when you haven't exported for two weeks.

## Backup format

```json
{
  "app": "rto",
  "version": 2,
  "days": [
    {
      "date": "2026-01-05",
      "status": "office",
      "recorded": { "start": "08:57", "end": "16:18", "hours": null, "pto": null },
      "actual": { "start": "08:45", "end": "16:15", "hours": 7.5, "pto": null },
      "note": null
    }
  ],
  "holidays": [{ "date": "2026-01-01", "name": "New Year's Day" }],
  "settings": { "grouping": "tracking", "roundIn": { "mode": "down" }, "roundOut": { "mode": "custom", "grace": 4 }, "target": 8 }
}
```

- `status` is one of `office`, `wfh`, `ooo` or `sick`.
- `recorded` is your own entry, with raw times.
- `actual` is the official timesheet. When present, the day is verified.
- Times are 24-hour `HH:MM`. `hours` is used only when there are no times. `null` means blank.
- Import merges by date and the file wins: its days replace local days with the same date; other local days are kept.

## Development

The app needs no build step. Node 22+ is used for tooling only.

```sh
npm install
npm start          # http://localhost:8000
npm run check      # format, lint, type-check, app-shell check, tests
```

```
index.html          markup and dialogs
sw.js               offline cache
src/js/domain/      pure logic (rounding, stats, verification, backup parsing)
src/js/state/       Lume stores, persistence, derived model
src/js/ui/          DOM helpers, actions, dialogs, views
src/styles/         CSS by cascade layer
tests/              unit tests (node:test)
vendor/lume-js/     Lume.js, vendored
```

State management uses [Lume.js](https://github.com/sathvikc/lume-js). See [AGENTS.md](AGENTS.md) for conventions.

## Deploy

`.github/workflows/ci.yml` runs the checks on every push and pull request. On `main`, it also publishes the site to GitHub Pages. To turn publishing on, open **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## License

[MIT](LICENSE). Lume.js is MIT too. Its license is in `vendor/lume-js/LICENSE`.
