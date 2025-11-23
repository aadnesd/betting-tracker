# Matched Betting Feature

This project now supports ingesting paired screenshots for back/lay slips and auto‑creating matched bets.

## Flow
1. Navigate to `/bets/new`.
2. Upload two images: a bookmaker (back) slip and an exchange (lay) slip.
3. The server stores the images in Vercel Blob, runs the multimodal parser, and shows suggested fields with confidence.
4. Review/edit the parsed numbers, then click **Accept & save matched bet** to persist.

## Data Model
- `ScreenshotUpload` keeps the blob URL, type (`back`/`lay`), status, and errors.
- `BackBet` / `LayBet` store parsed odds, stake, exchange/bookmaker, optional references, and per-field confidence.
- `MatchedBet` links the pair, tracks status (`pending`/`matched`/`needs_review`/`error`), and stores computed net exposure.

## APIs
- `POST /api/bets/screenshots` — multipart form with `back` and `lay` files. Returns screenshot ids/urls.
- `POST /api/bets/autoparse` — `{ backScreenshotId, layScreenshotId }`; returns parsed pair + confidence.
- `POST /api/bets/create-matched` — persists parsed payload into the DB.

## Parser
- Located at `lib/bet-parser.ts`.
- Uses the vision-capable model (`chat-model`) with retries; in test mode it returns a deterministic stub.
- Flags `needsReview` if markets diverge or confidence is low; never fabricates missing values.

## Testing
- Playwright is run via `pnpm test` with `PLAYWRIGHT=True`, which activates the deterministic parser stub.
- Add route-level tests under `tests/routes/` for API assertions; UI flows can live in `tests/e2e/`.

## Gotchas
- Ensure `.env.local` contains valid `POSTGRES_URL` and `BLOB_READ_WRITE_TOKEN` (for uploads).
- Keep migrations in sync (`pnpm db:migrate`). Do not hand-edit generated SQL outputs.
- For UI tweaks, favor `components/ui` primitives and keep routes under `/bets` in the `(chat)` layout.
