# RTO

Return to office, tracked from your phone. RTO is a small progressive web app for logging office days and hours: one tap to clock in and out, a monthly average and presence %, and the daily average you still need to hit your target.

There's no account, server or tracking. Everything is stored on your device, and JSON export/import is the backup.

## Features

- **One-tap punches** with a live clock, plus manual entry and editing for missed days.
- **Day types: Office, WFH, OOO, Sick.** WFH counts as presence 0. OOO and Sick count as presence 1. Average hours only include office days with hours.
- **Recorded vs. actual.** Every day can hold two entries:
  - *recorded*: what you punched, with raw times
  - *actual*: what the official timesheet shows

  A day stays unverified until you confirm it, and unverified numbers show a `*`. When the weekly timesheet comes out, the **Check against timesheet** sheet lists the days it covers. Tap **Matches** to accept the prediction, or **Edit** to type what the timesheet really says.
- **Configurable rounding** on a 15-minute grid: Down, Up, Nearest, None, or Custom with a grace window. For example, clock-out with a 4-minute grace turns 4:16–4:19 into 4:15 and 4:20 into 4:30. Your stored times never change, so rounding is applied when hours are calculated.
- **Rounding check.** Days that have both your punch and the timesheet show how often the rules predicted correctly, and which grace values fit every verified day.
- **Company holidays.** Paste the list in Settings. Holidays are skipped for workdays left and for presence.
- **Monthly stats.** Daily average, presence % (weekdays in the weeks you logged, minus holidays) and workdays left (skips weekends, holidays and days already marked WFH/OOO/Sick). Two charts by month or by year.
- **Month grouping.** *Tracking month* puts a week that straddles two months entirely in the earlier month. *Calendar month* uses each day's own month.
- **Light, dark or system theme.**
- **Works offline** once loaded, via a service worker.

## Install on iPhone

1. Open the GitHub Pages URL in Safari.
2. Share → **Add to Home Screen**.
3. Open RTO from the Home Screen and do all your tracking there.

The Home Screen app has **its own storage**, separate from Safari tabs. Data you enter in a browser tab won't show up in the Home Screen app, and the reverse is also true. Import your backup inside the Home Screen app.

On iOS 16.4 and later, Chrome, Edge and Firefox can also add web apps to the Home Screen. Every iOS browser runs on WebKit, so the installed app behaves the same whichever browser added it.

### How safe is the data?

- It lives in IndexedDB for this site, on this device only, and the app asks the browser to keep it persistent.
- Safari can delete a *website's* storage after 7 days without a visit. Home Screen web apps are exempt from that rule, which is another reason to use the installed app.
- Deleting the Home Screen app, or clearing Safari website data, erases everything.
- Export a backup regularly. **Settings → Export JSON** opens the share sheet, where you can pick *Save to Files*. The app reminds you after 14 days without an export.

## Backup format

```json
{
  "app": "rto",
  "version": 2,
  "days": [
    {
      "date": "2026-11-19",
      "status": "office",
      "recorded": { "start": "08:57", "end": "16:18", "hours": null, "pto": null },
      "actual":   { "start": "08:45", "end": "16:15", "hours": 7.5,  "pto": null },
      "note": null
    }
  ],
  "holidays": [{ "date": "2026-11-26", "name": "Thanksgiving" }],
  "settings": { "grouping": "tracking", "roundIn": { "mode": "down" }, "roundOut": { "mode": "custom", "grace": 4 }, "target": 8 }
}
```

- `status` is one of `office`, `wfh`, `ooo` or `sick`.
- `actual` present means the day is verified. Otherwise it's `null`.
- Times are 24-hour `HH:MM`. `hours` is used only when there are no times. `null` means blank, never a guessed 0.
- Import merges by date: a day in the file replaces the same day on the device.
- The importer also accepts flat rows (`date`, `start_time`, `end_time`, `hours`, `pto_hours`, `hours_with_pto`, `source`).

## Development

There's no build step. The app is plain HTML, CSS and ES modules, with [Lume.js](https://github.com/sathvikc/lume-js) vendored in `vendor/lume-js/`.

```sh
python3 -m http.server 8000      # then open http://localhost:8000
node --test tests/*.test.mjs     # unit tests for the calculations
```

| Path | What it is |
|---|---|
| `index.html` | Markup, dialogs and the import map for Lume |
| `css/app.css` | Theme tokens (light/dark) and layout |
| `js/calc.js` | Pure math: rounding, presence, monthly stats, import parsing |
| `js/store.js` | Lume stores, persistence and every state write |
| `js/app.js` | Rendering effects, dialogs and event handling |
| `js/storage.js` | IndexedDB with a localStorage fallback |
| `js/charts.js` | SVG bar charts |
| `sw.js` | Offline cache |

## Deploy

`.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push to `main`. To turn it on, open **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## License

[MIT](LICENSE). Lume.js is also MIT. Its license is in `vendor/lume-js/LICENSE`.
