# RoomKhoj AI Call Center

Prototype: microphone push-to-talk → OpenAI transcription → gpt-4o-mini response → OpenAI TTS → playback.

Run with Node.js 20+: set OPENAI_API_KEY in environment, optionally configure rates from .env.example, then run `npm start`. Visit http://localhost:3005 locally (HTTPS required for remote microphone access).

The NPR 3/min cost guard is an **estimate, not a guaranteed billing cap**. SIP is excluded. TTS pricing and FX rates are configurable. Provider usage reconciliation, authentication, persistent cost ledger, concurrency limits, real phone/SIP connection and full-duplex voice are not yet implemented. Never expose the API key in the frontend.
