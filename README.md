# RoomKhoj voice test: budget hybrid and live WebRTC

The default UI now offers an explicit **budget hybrid** mode: microphone PCM WAV → `gpt-4o-mini-transcribe` → `gpt-4o-mini` → `gpt-4o-mini-tts` (marin). Press **बोल्न सुरु**, speak, then **पठाउनुहोस्**; recording ends automatically after ten seconds. The microphone is released while the answer is generated. Press record again or **जवाफ रोक्नुहोस्** to stop playback. This first increment is turn based, not hands-free full duplex. Live WebRTC remains an explicit separate choice, with no hybrid spending control applied.

## What this does and does not do

- Preserves system instructions and prior conversation across up to twenty turns. Asks short Nepali questions, clarifies uncertain numbers and locations, and never claims to save or publish.
- Sends only explicitly recorded audio; digitally silent input is rejected without a provider request. Quiet meaningful speech and background noise still need real microphone evaluation.
- Serializes turns, deduplicates the latest successful request, and rejects older processed IDs rather than regenerating speech. Provider failures stop the session, mark cost unknown, and are never automatically retried.
- Bounds five-minute sessions, one active hybrid session per login, one hundred retained sessions per process, ten seconds per input, thirty seconds per generated answer, and conversation text length. Retained responses are limited to the latest turn. Idle conversations clear after five minutes and records expire after thirty minutes via a sweep.
- Requests clear Nepali pronunciation and a moderate pace. **No measured Nepali accuracy, clarity, latency or NPR/min result is claimed.** English/mixed speech, weak microphones, cancellation and playback need real browser evaluation before production rollout.
- This is an isolated voice test. It has **no SIP, RoomKhoj database, verified extraction, matching, booking, payment, consent ledger or customer messaging integration**. It cannot run the rental business yet. Do not feed real customer data into tests.

## Cost: estimate, not invoice or hard cap

The UI displays estimated NPR and average NPR per connected session minute and marks an estimate above the target in red. Planning rates checked 2026-10-30: transcription $0.003 per input audio minute, text $0.15/$0.60 per million input/output tokens, speech approximately $0.015 per generated audio minute. Input duration is validated from WAV bytes; output duration comes from PCM bytes at 24 kHz; text uses provider token counts. Cached text is conservatively charged at full input rate. FX defaults to **153 NPR/USD as an explicit planning assumption**, not a live exchange quote.

Before a paid turn, the server reserves a planning allowance for STT, a thirty-second short TTS response, and $0.006 text processing. It rejects turns when that allowance would exceed `HYBRID_MAX_ESTIMATED_NPR` (default 3 NPR **per session**, not per minute). This conservative allowance can stop a session before it spends 3 NPR. Duration-based speech pricing is approximate, in-flight requests can still charge, and failures may have unknown spend. Therefore this is **not a guaranteed bill cap or a promise of 3 NPR/min**. Carrier/SIP, hosting, tax and other tools are excluded. Use independent provider account controls and reconcile actual usage before rollout. Restarting the process loses this temporary meter and conversation state; there is no persistent billing ledger or account-wide budget.

Official pricing: https://developers.openai.com/api/docs/pricing
Speech API: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create
The current TTS model is scheduled for retirement on 2027-01-06; verify and evaluate its supported replacement before that date. Provider rejection fails closed, without a more expensive fallback.

## Run and validate

Node.js 20+; no dependencies. Configure `OPENAI_API_KEY` and `CALL_CENTER_ACCESS_PASSWORD` (16+ characters). Optional: `USD_TO_NPR=153`, `AI_TARGET_NPR_PER_MIN=3`, `HYBRID_MAX_ESTIMATED_NPR=3`. Invalid zero/nonfinite hybrid configuration prevents startup. Never put provider keys in frontend code.

```
npm test
node --check server.js
node --check hybrid.js
npm start
```

Mock tests cover audio validation/silence, duplicate and concurrent turns, session ownership, estimated budget rejection, memory after twelve messages, provider failures, expiration, end during an in-flight call, HTTP auth, missing backend capability before microphone access, playback interruption and late response cancellation. They make no external paid calls. Real browser/microphone/provider tests remain required; mocks do not establish speech quality or production readiness.

## Deployment and rollback

Deploy backend and frontend from the same reviewed commit. Backend adds `/api/hybrid/session`, `/api/hybrid/turn`, `/api/hybrid/usage`, `/api/hybrid/end` (POST and OPTIONS); Nginx must proxy these to 127.0.0.1:3010. Confirm proxy routes, credentials and provider model access before publishing. If backend capability is absent, budget UI fails before requesting microphone access; it does not silently fall back to paid Realtime.

Both `index.html` and `public/index.html` must match. Frontend origin is https://aifrontend-topaz.vercel.app; backend is https://api-ai.roomkhoj.com. `EXTRA_CORS_ORIGINS` supports additional exact HTTPS origins. The existing VPS directory is `/opt/ai-call-center`, PM2 process `ai-call-center`. The default listener is 127.0.0.1:3010. A VPS pull/restart alone does not publish the Vercel frontend.

Before rollout record the previous frontend deployment and VPS commit. After matching-version release verify login, no-token rejection, safe invalid-audio rejection and a bounded operator test with billing reconciliation. Roll back both source versions and restart the same PM2 service on failure. No database migration is involved. Do not merge/deploy this increment until microphone quality and latency are accepted and backend access/readiness are verified.

The legacy `/api/session`, `/api/turn`, `/api/end` and `/api/voice-test` routes remain for compatibility. The new UI never invokes the legacy recorded-turn route. Realtime uses `REALTIME_MODEL` (existing default `gpt-realtime-2.1`) and has its own five-minute best-effort server hangup timer; this is not a durable cap across process restarts.
