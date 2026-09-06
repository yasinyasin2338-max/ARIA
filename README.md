# ARIA ULTIMATE 2.0
All-in-one Persian personal AI app: chat, memory, voice UI, web search, image generation, image-to-image editing, video/image-to-video provider adapter, settings and revenue planning.

## Android
Open `ARIA_ANDROID` in Android Studio or build with Gradle 8.13 + JDK 21.

## Server
Run `npm install` then `npm start` in `ARIA_SERVER`. Copy `.env.example` to `.env` and configure secrets on the server only.

Video is provider-agnostic: set `ARIA_VIDEO_ENDPOINT` and `ARIA_VIDEO_TOKEN` for a compatible video service. No app can honestly provide unlimited generation without a real provider and its quotas.

Cybersecurity features are intended for authorized/defensive testing only.
