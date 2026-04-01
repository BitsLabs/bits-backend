# Bits Backend

AI API used by the iOS app.

## Environment

Required:

```bash
OPENAI_API_KEY=your_openai_api_key
BITS_SESSION_SECRET=replace_with_a_long_random_server_side_secret
BITS_ALLOWED_BUNDLE_ID=technology.mja.Bits
```

`BITS_SESSION_SECRET` signs the short-lived app session tokens returned by `/ai/session`. Do not ship or expose it to the client.

## Local Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
```

## Release Notes

- App traffic is authenticated with short-lived signed session tokens, not a static shared secret embedded in the app.
- Production is only considered ready when `OPENAI_API_KEY`, `BITS_SESSION_SECRET`, and `BITS_ALLOWED_BUNDLE_ID` are configured.
