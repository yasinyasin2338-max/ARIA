# ARIA Mobile — Final Build

ARIA is a Persian-first mobile assistant architecture with a PWA, secure server-side OpenAI API integration, local memory, speech input/output, and an Android VoiceInteractionService scaffold for system-level voice invocation.

## Server
Copy `server/.env.example` to `.env`, set `OPENAI_API_KEY`, then run `npm install && npm start`.

## PWA
Serve `web/` from HTTPS and set `ARIA_API_URL` in localStorage if the API is hosted separately.

## Android
The Android module is designed to be built with Gradle. The GitHub Actions workflow can build the debug APK without a local computer.

## Important
API keys stay on the server. A normal PWA cannot guarantee an always-listening hotword in the background; Android's selected VoiceInteractionService is the intended system integration point for that capability.
