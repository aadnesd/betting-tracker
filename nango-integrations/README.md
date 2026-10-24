# Gmail offer reader

This is a separate Zero YAML Nango TypeScript project. The app calls the deployed `list-offer-emails` action by name. The action handles one Gmail search page and reads up to ten messages. The app owns AI assessment and durable scan checkpoints.

## Setup

1. Create the `google-mail` integration in Nango, using the `https://www.googleapis.com/auth/gmail.readonly` scope. Configure your own Google OAuth app for production.
2. Set `NANGO_API_KEY` in the app environment. `NANGO_SECRET_KEY` and `NANGO_TOOLBOX_SECRET_KEY` are also accepted. Keep the key server-side. Optionally set `NANGO_MAILBOX_INTEGRATION` and `NANGO_SERVER_URL`.
3. Install this project's dependencies with `npm ci`. Set `NANGO_SECRET_KEY_DEV` in your shell or the ignored `nango-integrations/.env` for the same Nango environment.
4. Open `/bets/email-offers` in the app and connect Gmail. Connections must originate from this app's server-created session so the application and user tags are verified.
5. Validate with `npx nango dryrun list-offer-emails CONNECTION_ID --integration-id google-mail --validate -e dev --no-interactive --auto-confirm --input '{"after":"2026-10-01T00:00:00Z","before":"2026-10-24T00:00:00Z"}'`. Use a recent time range.
6. Record fixtures with the same command using `--save` instead of `--validate`, then run `npx nango generate:tests` and `npm test`. Recorded mocks can contain private email, so review them before committing.
7. Deploy with `npx nango deploy --action list-offer-emails dev`. Use the environment matching the app's key. Deployment is separate from the Next.js build.
8. Run the generated Drizzle migration with `pnpm db:migrate`, and set `AI_GATEWAY_API_KEY` for offer assessment. `EMAIL_OFFER_MODEL` defaults to `openai/gpt-5-nano`.
9. Set `CRON_SECRET` in Vercel. The hourly `/api/cron/email-offers` job uses that bearer secret and requires a Vercel plan supporting hourly cron schedules. Manual scans work independently.

Nango's connection tags are the source of authorization. Browser callbacks only refresh the server's connection list; the app does not accept a browser-supplied connection or user ID as proof of ownership. No webhook is needed to persist connection ownership.

If Gmail authorization expires, use Reconnect in the inbox. If a page fails, its time window and cursor remain unchanged. Repeating a successful page does not create duplicate offers or reset saved/dismissed state. Only offer assessments are stored; bodies are processed in memory and sent to the configured AI provider. Nango request logs and AI-provider retention are governed by those services' settings.
