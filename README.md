# ChronoBlink Arcade

An instant-play HTML5 gaming platform (target: https://www.chronoblink.xyz). Players can browse and play games without an account. Signing in adds XP, achievements, leaderboards, daily challenges, favorites and cloud saves. Developers can submit sandboxed games for human review.

The original **CHRONO // BLINK** game lives in [`games/chrono-blink/`](games/chrono-blink/) and is playable at `/play/chrono-blink`. The pre-platform version is preserved on the `backup/original-game-2026-10-10` branch and the `original-game-v1` tag.

## Run it locally

Requires Node 20.19+ and pnpm 10. Docker and a system Postgres are not needed.

```bash
pnpm install
cp .env.example .env
pnpm db:start          # real PostgreSQL via embedded-postgres; keep this running
pnpm db:setup          # migrations + genuine starter content (categories, 3 first-party games)
pnpm dev               # app on http://localhost:3000, game origin on http://127.0.0.1:3001
```

To make yourself an admin, register at `/register` and verify through the development mailbox at `/dev/mailbox`. Then run:

```bash
pnpm user:role you@example.com admin
```

## Architecture (short)

- **App**: Next.js 16 (App Router, RSC), TypeScript strict, Tailwind 4 with shadcn-style components, Drizzle on PostgreSQL, and Better Auth (email/password with verification, password reset, username, optional Google sign-in, optional Turnstile).
- **Game isolation**: games are served from a separate origin (`game-host/`, or a Cloudflare Worker in production) inside `<iframe sandbox="allow-scripts allow-pointer-lock">` without `allow-same-origin`. Each game therefore has an opaque origin, with no access to cookies, storage or the platform DOM. Each game also gets its own CSP, with `frame-ancestors` restricted to the app.
- **SDK**: `packages/sdk` (`@chronoblink/sdk`, about 7 KB). A versioned `postMessage` handshake hands the game a private `MessagePort`. The platform validates every message and rate-limits each method, and the server authorizes every action against the play session.
- **Anti-abuse**: scores must come from a server-timed run, pass a plausibility ceiling, and can be posted only once per run. XP grants are idempotent and capped per day. Boards for client-side games are labelled *provisional* and carry no prizes.
- **Uploads**: direct upload through a signed URL. The ZIP is validated for traversal, symlinks, zip bombs, size and count limits, a file-type allowlist and a required `index.html`. Files go to private staging and the build gets a signed sandbox preview, then human review before publication. Without a malware scanner (`MALWARE_SCANNER=clamav`), uploads are limited to admin-verified studios.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test:unit         # 65 tests
pnpm test:integration  # 29 tests against a real chronoblink_test database
pnpm test:e2e          # Playwright; needs db:start (starts dev servers itself)
```
