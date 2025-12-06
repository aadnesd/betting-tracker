# Matched Betting Feature

This project now supports ingesting paired screenshots for back/lay slips and auto‑creating matched bets.

## Flow
1. Navigate to `/bets/new`.
2. Upload two images: a bookmaker (back) slip and an exchange (lay) slip.
3. The server stores the images in Vercel Blob, runs the multimodal parser, and shows suggested fields with confidence.
4. Review/edit the parsed numbers, then click **Accept & save matched bet** to persist.

## Data Model
- `ScreenshotUpload` keeps the blob URL, type (`back`/`lay`), status, and errors.
- `BackBet` / `LayBet` store parsed odds, stake, bookmaker/exchange, ISO currency (back slips can be EUR/USD, lay slips are NOK), and per-field confidence.
- `MatchedBet` links the pair, tracks status (`pending`/`matched`/`needs_review`/`error`), and stores computed net exposure.

## APIs
- `POST /api/bets/screenshots` — multipart form with `back` and `lay` files. Returns screenshot ids/urls.
- `POST /api/bets/autoparse` — `{ backScreenshotId, layScreenshotId }`; returns parsed pair + confidence.
- `POST /api/bets/create-matched` — persists parsed payload into the DB.

## Parser
- Located at `lib/bet-parser.ts`.
- Uses the vision-capable model (`chat-model`) with retries; in test mode it returns a deterministic stub.
- Extracts bookmaker name, odds, stakes, and ISO currency codes. Lay bets are normalized to exchange `bfb247`/currency `NOK`.
- Flags `needsReview` if markets diverge or confidence is low; never fabricates missing values.

## FX Conversion
- We always present matched-bet exposure in NOK.
- A small helper in `lib/fx-rates.ts` hits `https://api.fxratesapi.com/latest` with `FXRATES_API_KEY` to convert any non-NOK back profit into NOK before computing exposure.
- Rates are cached in-memory for five minutes. If the API fails, the matched-bet creation will bubble a server error (so upstream tooling can retry).

## Testing
- Playwright is run via `pnpm test` with `PLAYWRIGHT=True`, which activates the deterministic parser stub.
- Add route-level tests under `tests/routes/` for API assertions; UI flows can live in `tests/e2e/`.

## Gotchas
- Ensure `.env.local` contains valid `POSTGRES_URL`, `BLOB_READ_WRITE_TOKEN`, and `FXRATES_API_KEY`.
- Keep migrations in sync (`pnpm db:migrate`). Do not hand-edit generated SQL outputs.
- For UI tweaks, favor `components/ui` primitives and keep routes under `/bets` in the `(chat)` layout.
