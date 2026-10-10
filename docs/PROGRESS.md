# ChronoBlink Arcade: progress (2026-10-10)

## Done (verified)
- Original CHRONO // BLINK in `games/chrono-blink/` with an additive SDK bridge, playable at `/play/chrono-blink`. Backup: branch `backup/original-game-2026-10-10`, tag `original-game-v1`.
- New original games Neon Drift and Pulse Stack, both integrated with the SDK.
- Isolated game origin (`game-host/`) with an opaque-origin sandbox and per-game CSP. E2E confirms games can't reach the parent DOM, cookies or storage.
- `@chronoblink/sdk` and a validated MessagePort protocol.
- Server-side rules: scores tied to server-timed runs with plausibility checks (provisional boards), idempotent and capped XP, achievements, daily challenges.
- Discovery, accounts (verification, reset, export, deletion), developer portal (ZIP validation, staging, preview, review), admin panel, analytics, consent banner. Ads are off by default.
- Checks: typecheck and lint pass; 65/65 unit tests and 29/29 integration tests (real Postgres) pass; 11/11 discovery and runtime E2E tests pass; journey E2E steps 1–7 pass.

## Broken / unverified
- Journey E2E steps 8–10 (developer upload → admin approve → game live) have not been re-run since the fix that moved status helpers to `src/lib/status.ts`. The same pipeline passes in the integration tests.
- Mobile E2E (`e2e/mobile.spec.ts`) has never been run.
- Ad adapters (AdSense, H5 Games Ads) are untested because no credentials exist.
- Better Auth rate limits are stored in memory per instance, not shared across instances.
- Removed games return a 200 page with a notice, not a 410 status.

## Not started
- `docs/` for architecture, security, deployment and monetization/payout design.
- Production Cloudflare Worker for the game origin (`deploy/cloudflare-game-worker`).
- Real payments and payouts (deliberately deferred).
- Legal pages are templates that still need review by a lawyer.

## Next 3 steps
1. Run `pnpm db:start` and `pnpm dev`, then `pnpm test:e2e`. Fix whatever fails in journey steps 8–10 and the mobile spec.
2. Write the Cloudflare Worker game origin (reusing `src/server/game-host-policy.ts`, serving from R2) and `docs/DEPLOYMENT.md` for chronoblink.xyz: DNS, a separate game domain, Postgres, R2, environment variables, the cron job.
3. Write `docs/ARCHITECTURE.md` and `docs/SECURITY.md` (threat model, sandbox, anti-cheat limits, upload policy). Then do a security review pass before enabling uploads from unverified developers.
