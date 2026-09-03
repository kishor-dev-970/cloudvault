# CloudVault

A private "cloud storage" app. All your media is stored as **private** uploads in
**your own YouTube account** — the app is just a media library UI on top of it.
Videos upload directly; photos are converted to a short still video (ffmpeg) so
they can also be stored privately on YouTube. No public YouTube or Instagram
presence.

> **Privacy guarantee:** every upload uses `privacyStatus: "private"`. Only your
> own account can see it — not in search, not on your public channel, invisible to
> others even by video ID.

## Repo layout

```
cloudvault/
├── server/   Node.js + Express + TypeScript + Prisma backend
│   └── src/
│       ├── routes/      auth, connect (YouTube OAuth), files (upload/list)
│       ├── services/    youtube.ts, convert.ts (ffmpeg image→video), storage
│       ├── middleware/  JWT auth
│       └── db/          Prisma client
└── mobile/   React Native + Expo (SDK 57) app
    ├── app/             expo-router screens (login, (tabs): library/upload/settings, view)
    └── src/             api client, auth context
```

## Backend setup

```bash
cd server
cp .env.example .env          # fill in DATABASE_URL, JWT_SECRET, Google OAuth creds
npm install
npx prisma db push            # create the DB schema (SQLite dev.db by default)
npm run dev                   # http://localhost:4000
```

Local dev uses **SQLite** (`file:./dev.db`, zero install). For production, switch
`DATABASE_URL` to a Postgres connection string and edit `prisma/schema.prisma`'s
datasource provider to `postgresql` (the JSON field in `Connection` must revert to
`Json` for Postgres).

### Google Cloud / YouTube setup
1. Create a Google Cloud project, enable **YouTube Data API v3**.
2. OAuth consent screen → scope `https://www.googleapis.com/auth/youtube.upload`.
3. Create OAuth 2.0 **Web** client credentials → put client ID/secret + redirect
   URI (`http://localhost:4000/api/connect/youtube/callback`) in `.env`.
4. ffmpeg must be installed on the host for image→video conversion
   (`ffmpeg -version`).

## Mobile setup

```bash
cd mobile
npm install
npm start                     # Expo dev server
```

Api base URL defaults to `http://localhost:4000/api`; override with
`EXPO_PUBLIC_API_URL`.

## API overview

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/signup` | – | create account |
| POST | `/api/auth/login` | – | login → JWT |
| GET  | `/api/connect/youtube` | JWT | get OAuth URL |
| POST | `/api/connect/youtube/callback` | JWT | exchange code → save token |
| GET  | `/api/connect/youtube/status` | JWT | connected? |
| POST | `/api/files/upload` | JWT | upload (multipart `file`), streams NDJSON progress |
| GET  | `/api/files` | JWT | list files |
| GET  | `/api/files/:id/stream` | JWT | resolve playable stream URL for a private video |

## Playback
Private videos are played inline with the **native player** (`expo-video` /
ExoPlayer on Android, AVPlayer on iOS). Because the videos are private, the backend
resolves an authenticated stream URL with **yt-dlp + the owner's YouTube OAuth
tokens** (`server/src/services/stream.ts`), then hands the URL to the native player.
Tokens never leave the server.

## Known limitations / next steps
- **Playback:** requires the connected account to own the file (it does) and a
  working `yt-dlp` + `python` on the backend host. Stream URLs can be large;
  proxying the bytes through the server (instead of returning the direct URL) is a
  later-hardening option.
- **Original file restore:** original image bytes are kept (plan: Supabase
  Storage/S3); download/export is not wired yet.
- **Instagram:** intentionally not used (can't be private via API).
