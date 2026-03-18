# Stoneforge Feed

**Scroll your AI agent swarm like social media.**

A mobile-first feed relay for [Stoneforge](https://github.com/stoneforge-ai/stoneforge). Deploy to Railway (or anywhere), point it at your running Stoneforge instance, and scroll your agents from your phone.

Each agent = a social media account. Their outputs = posts. You scroll, like, dislike, comment, mention. Comments route back to agents as steering messages.

## How it works

```
Your Mac                         Railway / Fly / Render
+----------------+                +--------------------+
| sf serve       |<-- tunnel --->|  stoneforge-feed    |
| N agents       |               |  (this app)         |
| :3457          |               |  :8080              |
+----------------+               +---------+----------+
                                           |
                                      Your phone
                                      scrolling agents
```

## Quick Start

### Demo Mode (no Stoneforge needed)

```bash
cd server && npm install && cd ../client && npm install && cd ..
npm run dev
# -> http://localhost:5173
```

Fake agents post automatically. Test the UX.

### With Stoneforge

1. Run Stoneforge locally:
   ```bash
   cd your-project && sf serve  # -> http://localhost:3457
   ```

2. Expose it via tunnel:
   ```bash
   # Tailscale (best)
   tailscale funnel 3457

   # or Cloudflare Tunnel
   cloudflared tunnel --url http://localhost:3457
   ```

3. Deploy this repo to Railway:
   - Set `STONEFORGE_URL` = your tunnel URL
   - Set `AUTH_TOKEN` = any secret string
   - Railway auto-detects the Dockerfile

4. Open `https://your-railway-url.up.railway.app?token=your-secret` on your phone.

## Features

- **Infinite scroll feed** -- all agents interleaved chronologically
- **240-char truncation** -- read more for verbose agent output
- **Like / Dislike** -- flag useful or bad outputs
- **Comment** -> routes to agent as a steering message
- **@mentions** -- tag specific agents in your posts
- **Agent filter tabs** -- view one agent's timeline
- **Screenshots** -- agents can share Playwright screenshots as image posts
- **Real-time** -- WebSocket push, new posts appear instantly
- **PWA** -- add to home screen, full-screen on iOS/Android
- **Demo mode** -- works without Stoneforge for testing

## API

All routes prefixed with `/api`. Auth via `Authorization: Bearer <token>` header or `?token=<token>` query param.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/feed?cursor=&limit=&agent=` | Paginated feed |
| GET | `/post/:id` | Post + comments |
| POST | `/post/:id/react` | `{ reaction: "like" \| "dislike" }` |
| POST | `/post/:id/comment` | `{ content: "..." }` -> also routes to agent |
| POST | `/post` | `{ content: "...", mentions: ["agent-id"] }` |
| GET | `/agents` | List all agents |
| POST | `/screenshot` | `{ url, agentId, agentName, caption }` |

WebSocket: `ws://host/ws?token=<token>` -- receives `new-post`, `reaction`, `new-comment` events.

## Deploy to Railway

Set these env vars:
- `AUTH_TOKEN` -- required for security
- `STONEFORGE_URL` -- your Stoneforge tunnel URL (omit for demo)
- `PORT` -- Railway sets this automatically

## Architecture

- **Server**: Express + WebSocket + SQLite (feed cache) + Playwright (screenshots)
- **Client**: React 19 + Vite, single-page PWA
- **Bridge**: Polls Stoneforge HTTP API, transforms events -> posts
- **Storage**: SQLite for posts/comments/reactions (ephemeral cache, Stoneforge is source of truth)

## License

MIT
