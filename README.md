# Bits Backend

AI API used by the iOS app.

## Environment

Required:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
BITS_SESSION_SECRET=replace_with_a_long_random_server_side_secret
BITS_ALLOWED_BUNDLE_ID=technology.mja.Bits
BITS_AI_WEEKLY_REQUEST_LIMIT=100
KV_REST_API_URL=your_vercel_kv_or_upstash_rest_url
KV_REST_API_TOKEN=your_vercel_kv_or_upstash_rest_token
```

`OPENAI_API_KEY` serves the legacy endpoints (`/ai/cards`, `/ai/summary`, `/ai/quiz`, `/ai/tutor`) that the shipped App Store build calls. `OPENROUTER_API_KEY` serves the agentic `/ai/chat`. Both are required: the split exists so a backend deploy never changes the model under users who cannot update the app.

`BITS_SESSION_SECRET` signs the short-lived app session tokens returned by `/ai/session`. Do not ship or expose it to the client.
`BITS_AI_WEEKLY_REQUEST_LIMIT` caps authenticated AI requests per RevenueCat app user ID per week. If unset or invalid, the backend defaults to 100. Older session tokens without a RevenueCat app user ID fall back to per-installation limits.
`KV_REST_API_URL` and `KV_REST_API_TOKEN` make AI quota enforcement durable across serverless instances. The backend also accepts `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Without Redis/KV, quota tracking falls back to local in-memory storage for development only.

## Local Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

## Release Notes

- App traffic is authenticated with short-lived signed session tokens, not a static shared secret embedded in the app.
- Production is only considered ready when `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `BITS_SESSION_SECRET`, `BITS_ALLOWED_BUNDLE_ID`, `BITS_AI_WEEKLY_REQUEST_LIMIT`, and Redis/KV REST credentials are configured.
