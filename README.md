# Monarch Net Worth (Pebble Time 2)

A Pebble watch app that shows your **current Monarch Money net worth** on a clean Time 2 card UI.

## What this MVP does

- Displays net worth as a large value on-watch
- Shows last update time
- Supports manual refresh (press **Select**)
- Auto-refreshes every 30 minutes by default
- Lets user configure Monarch credentials from Pebble settings

## Security model (v1)

This v1 stores credentials in PebbleKit JS local storage on your phone and calls Monarch directly.

- Credentials are **not sent to the watch**
- Credentials are sent from phone companion JS to `https://api.monarchmoney.com`
- This is intended as a simple MVP; for stronger security, use a backend broker in v2

## Setup

1. Install Pebble SDK tooling on your machine.
2. In this project folder, build with your Pebble toolchain.
3. Install the generated `.pbw` onto your Pebble Time 2.
4. In the Pebble mobile app, open app settings and enter:
   - Monarch email
   - Monarch password
   - Optional current MFA code
   - Refresh interval (5–120 min)

## Usage

- Launch app on watch
- Initial state shows a setup hint until config is saved
- Press **Select** to force refresh at any time

## Message protocol (watch ↔ companion)

Defined in `appinfo.json` and `message_keys.json`:

- `REQUEST_REFRESH` (watch → phone)
- `NET_WORTH_TEXT` (phone → watch)
- `UPDATED_TEXT` (phone → watch)
- `STATUS_TEXT` (phone → watch)
- `ERROR_TEXT` (phone → watch)

## Files

- `src/main.c` — watch UI and manual refresh action
- `src/pkjs/index.js` — PebbleKit JS lifecycle + refresh orchestration
- `src/pkjs/monarch.js` — Monarch login + GraphQL net worth fetch
- `src/pkjs/config-page.js` — inline config page for settings flow

## Troubleshooting

- **Auth failed**: verify email/password and that account supports password login
- **MFA code required**: enter a current MFA code in settings and save again
- **Network error**: check mobile internet connectivity
- **No data**: account may not have aggregate snapshots yet; retry later

## Next-step ideas

- Account-by-account breakdown view
- Scrollable asset/liability pages
- Backend auth broker for stronger credential isolation
