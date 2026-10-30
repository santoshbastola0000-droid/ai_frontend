# RoomKhoj Live Voice

Browser microphone streams over WebRTC to OpenAI Realtime. No MediaRecorder file-upload step is used by the live interface. Server VAD creates replies and interrupts model playback when the caller starts speaking.

## Run

Node.js 20+ (deployed VPS uses Node.js 24). Set OPENAI_API_KEY and CALL_CENTER_ACCESS_PASSWORD (16+ characters) in the server environment. REALTIME_MODEL defaults to gpt-realtime-2.1 and can be overridden with an available compatible realtime model. Start server.js with the existing PM2 environment file. Default listen address: 127.0.0.1:3010.

The frontend uses https://api-ai.roomkhoj.com. The allowed production frontend is https://aifrontend-topaz.vercel.app. EXTRA_CORS_ORIGINS supports additional exact HTTPS origins. Both index.html and public/index.html must match.

## Deploy

Run git -C /opt/ai-call-center pull --ff-only origin main, then pm2 restart ai-call-center. Publish the frontend from the same commit using the existing Vercel Git deployment. The UI should show Start Live Call. A backend-only pull does not publish the Vercel frontend. Nginx must proxy /api/login, /api/session and /api/end to port 3010, including OPTIONS. No new route is needed for realtime.

## Limits and billing

Login is required. Two sessions per login token, call-start rate limiting and a five-minute server hangup timer are included. The frontend also closes at five minutes and on End Call. The server timer is in memory: a server restart loses timeout state; it is not durable enforcement or a billing cap. Client disconnect and tab-close cleanup are best effort.

Realtime is provider-billed; the previous NPR 3/min estimate and legacy MAX_SESSION_NPR do not apply to realtime. No realtime currency cost is claimed. Provider account budgets should be configured separately. Legacy recorded-turn endpoints remain for compatibility but are not used by the new UI.

There is no SIP telephone integration or RoomKhoj database integration. Audio is sent live to OpenAI. Transcript text is shown only in the browser; no persistent call ledger is implemented.

## Validation

Server/client syntax checked. Mock provider checks covered login enforcement, invalid SDP rejection, successful SDP exchange, interrupt configuration and authenticated hangup. Real provider credentials, microphone quality, barge-in and browser/network behavior still require live testing after deployment.

https://developers.openai.com/api/docs/guides/voice-webrtc
