# لوحة تذاكر الدعم الفني — IT Support Dashboard (Arabic, RTL)

A single-file, mobile-first, Arabic (MSA) dashboard for a ~50-person helpdesk team
(teams: L0, L1A, L1B, Hardware, Coordination). There is no build step and it calls no APIs.
The only external request is the IBM Plex Sans Arabic web font, and the page falls back to system fonts without it.

## Open it

- **Quickest:** double-click `index.html`, or open it in any modern browser.
- **Local server** (recommended):
  ```bash
  python3 -m http.server 8765
  # then visit http://localhost:8765/
  ```

## Features

- About 200 realistic sample tickets over the last 3 weeks, with category, team, priority, status, requester, assignee and SLA due time.
- Dates are shown as `2026/9/30`.
- KPI cards: open tickets, closed today, SLA breach %, and average resolution time.
- Charts drawn with inline SVG (no libraries). The bar chart shows tickets per team; click a bar to filter the table. The line chart shows tickets created and closed over the last 14 days, with a hover/tap readout.
- Search, plus filters by team, status (including "open" and "SLA breached") and priority.
- The table turns into cards on mobile.
- Click a ticket to open a side panel with its details and timeline, and to change its status.
- A "new ticket" form with validation. The team is suggested from the category, and the SLA comes from the priority.
- Light/dark mode that follows the OS setting, with a manual toggle.
- Data and theme are saved in `localStorage`. **إعادة تعيين** (Reset) regenerates the sample data.

## Tests

`tests/smoke.mjs` is a headless Playwright test. It checks desktop (1366×900) and iPhone 13 viewports,
fails on any console error, and exercises the filters, search, the side panel, adding a ticket,
persistence, the theme toggle, the chart tooltip and reset. It writes screenshots to `screenshots/`.

```bash
python3 -m http.server 8765 &
node tests/smoke.mjs            # needs `playwright` installed (npm i -g playwright)
```
