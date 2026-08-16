# bits-backend — todo

## Now
- [ ] Set `OPENROUTER_API_KEY` in Vercel and delete `OPENAI_API_KEY` — `/ai/config` reports AI unavailable until the new one is set
- [ ] Deploy and verify `/ai/chat` end-to-end (tool call → client result → final reply)
- [ ] Change backend service domain

## Later
- [ ] Retire `/ai/cards`, `/ai/summary`, `/ai/quiz`, `/ai/tutor` once the shipped 2.0.1 install base has aged out — they only exist for clients that predate the chat
- [ ] Watch OpenRouter spend: chat costs one request per tool round (capped at 6), where the old one-shot endpoints cost exactly one
- [ ] Consider streaming `/ai/chat` (SSE) to pair with streaming in the app
- [ ] Per-feature model policy is still in `lib/models.ts` — move chat off Haiku 4.5 if quality on tool selection turns out weak

## Done
- [x] OpenRouter migration — `openai` package kept (same wire format), model IDs are now OpenRouter slugs, every feature on `anthropic/claude-haiku-4.5`
- [x] Agentic `/ai/chat` endpoint with client-executed tools
- [x] Fix `/ai/config` gating availability on the old `OPENAI_API_KEY`
