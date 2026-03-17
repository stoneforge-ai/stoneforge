import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createStore, type IFeedStore } from "./store.js";
import { DemoBridge } from "./bridge.js";
import { screenshotAndPost } from "./screenshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Config from env ---
const PORT = parseInt(process.env.PORT || "8080");
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""; // empty = no auth
const FEED_PASSWORD = process.env.FEED_PASSWORD || ""; // human-friendly password for browser login
const SYNC_MODE = process.env.SYNC_MODE === "true"; // true = expect pushes from Mac, no demo
const SESSION_SECRET = process.env.SESSION_SECRET || AUTH_TOKEN || "stoneforge-dev";
const TRUST_PROXY = process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";

// --- Session cookie helpers ---
function makeSessionToken(token: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}

function setSessionCookie(res: express.Response, token: string) {
  const sessionValue = makeSessionToken(token);
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("sf_session", sessionValue, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  });
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key] = rest.join("=");
  }
  return cookies;
}

function validateSession(cookieHeader: string | undefined): boolean {
  if (!AUTH_TOKEN) return true;
  const cookies = parseCookies(cookieHeader);
  const sessionCookie = cookies["sf_session"];
  if (!sessionCookie) return false;
  return sessionCookie === makeSessionToken(AUTH_TOKEN);
}

// --- Init ---
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Async bootstrap
async function bootstrap() {
  const store = await createStore();

  // Broadcast to all connected WS clients
  function broadcast(data: any) {
    const msg = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  }

  const onNewPost = (post: any) => broadcast({ type: "new-post", post });

  // In sync mode, we just store what the Mac pushes — no local bridge needed.
  const bridge = SYNC_MODE ? null : new DemoBridge(store, onNewPost);

  // Track agents pushed from the Mac
  let syncedAgents: any[] = [];

  // --- Middleware ---
  if (TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(express.json({ limit: "10mb" }));

  // --- Rate limiting ---
  let rateLimit: any;
  try {
    const mod = await import("express-rate-limit");
    rateLimit = mod.default || mod.rateLimit;
  } catch (e: any) {
    console.warn("[feed] rate limiting unavailable:", e.message);
  }

  if (rateLimit) {
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many auth attempts, try again later" },
    });

    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many requests, try again later" },
    });

    const syncLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 min
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Too many sync requests, try again later" },
    });

    app.use("/api/auth", authLimiter);
    app.use("/api/sync", syncLimiter);
    app.use("/api", apiLimiter);
  }

  // Auth middleware — checks Bearer header > cookie > query string
  function authMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    if (!AUTH_TOKEN) return next();

    // 1. Bearer header
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    if (bearer === AUTH_TOKEN) return next();

    // 2. Session cookie
    if (validateSession(req.headers.cookie)) return next();

    // 3. Query string (legacy, sets cookie for future requests)
    const queryToken = req.query.token as string;
    if (queryToken === AUTH_TOKEN) {
      setSessionCookie(res, AUTH_TOKEN);
      return next();
    }

    res.status(401).json({ error: "unauthorized" });
  }

  // --- Health endpoint (no auth) ---
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      mode: SYNC_MODE ? "sync" : "demo",
    });
  });

  // --- Auth session endpoint ---
  // GET /api/auth/session?token=X — sets cookie, redirects to /
  app.get("/api/auth/session", (req, res) => {
    if (!AUTH_TOKEN) {
      res.redirect("/");
      return;
    }
    const token = req.query.token as string;
    if (token !== AUTH_TOKEN) {
      res.status(401).json({ error: "invalid token" });
      return;
    }
    setSessionCookie(res, AUTH_TOKEN);
    res.redirect("/");
  });

  // --- Password login endpoint ---
  // POST /api/auth/login { password } — validates password, sets session cookie
  app.post("/api/auth/login", express.json(), (req, res) => {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: "password required" });
      return;
    }

    // Check password against FEED_PASSWORD, or fall back to AUTH_TOKEN
    const validPassword = FEED_PASSWORD || AUTH_TOKEN;
    if (!validPassword) {
      // No auth configured — just set a session
      setSessionCookie(res, "open");
      res.json({ ok: true });
      return;
    }

    // Constant-time comparison — hash both to fixed 32 bytes so length differences don't leak
    const input = crypto.createHash("sha256").update(password).digest();
    const expected = crypto.createHash("sha256").update(validPassword).digest();
    if (!crypto.timingSafeEqual(input, expected)) {
      res.status(401).json({ error: "invalid password" });
      return;
    }

    setSessionCookie(res, AUTH_TOKEN || "open");
    res.json({ ok: true });
  });

  // --- Sync endpoints (Mac pushes here) ---
  const sync = express.Router();
  sync.use(authMiddleware);

  // Mac pushes new posts + agent list
  sync.post("/push", async (req, res) => {
    const { posts, agents } = req.body;

    if (agents) syncedAgents = agents;

    let created = 0;
    if (posts && Array.isArray(posts)) {
      for (const post of posts) {
        if (post.source_id && await store.hasPost(post.source_type, post.source_id)) continue;
        const newPost = await store.createPost(post);
        onNewPost(newPost);
        created++;
      }
    }

    res.json({ ok: true, created });
  });

  // Mac pulls pending comments/reactions to route back to Stoneforge
  sync.get("/pull", async (_req, res) => {
    const pending = await store.getUnsynced();
    res.json(pending);
  });

  // Mac confirms it processed the comments
  sync.post("/ack", async (req, res) => {
    const { commentIds } = req.body;
    if (commentIds && Array.isArray(commentIds)) {
      await store.markSynced(commentIds);
    }
    res.json({ ok: true });
  });

  app.use("/api/sync", sync);

  // --- API Routes ---
  const api = express.Router();
  api.use(authMiddleware);

  // Feed — infinite scroll with cursor pagination
  api.get("/feed", async (req, res) => {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "20", 10) || 20, 1), 100);
    const agentId = req.query.agent as string | undefined;

    const posts = agentId
      ? await store.getAgentFeed(agentId, cursor, limit)
      : await store.getFeed(cursor, limit);

    const nextCursor = posts.length === limit ? posts[posts.length - 1].created_at : null;

    res.json({ posts, nextCursor });
  });

  // Single post with comments
  api.get("/post/:id", async (req, res) => {
    const post = await store.getPost(req.params.id);
    if (!post) { res.status(404).json({ error: "not found" }); return; }
    const comments = await store.getComments(req.params.id);
    res.json({ post, comments });
  });

  // React (like/dislike)
  api.post("/post/:id/react", async (req, res) => {
    const { reaction } = req.body; // 'like' | 'dislike'
    if (!["like", "dislike"].includes(reaction)) {
      res.status(400).json({ error: "invalid reaction" });
      return;
    }
    const result = await store.react(req.params.id, reaction);
    const post = await store.getPost(req.params.id);
    broadcast({ type: "reaction", postId: req.params.id, post });
    res.json({ reaction: result, post });
  });

  // Comment on a post — stored locally, Mac picks up via /api/sync/pull
  api.post("/post/:id/comment", async (req, res) => {
    const { content } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }

    const post = await store.getPost(req.params.id);
    if (!post) { res.status(404).json({ error: "post not found" }); return; }

    const comment = await store.addComment(req.params.id, "operator", "You", content);
    broadcast({ type: "new-comment", postId: req.params.id, comment });

    res.json({ comment });
  });

  // Post as human (new top-level post)
  api.post("/post", async (req, res) => {
    const { content, mentions } = req.body;
    if (!content) { res.status(400).json({ error: "content required" }); return; }

    const post = await store.createPost({
      agent_id: "operator",
      agent_name: "You",
      agent_role: "operator",
      agent_avatar: "\u{1F464}",
      content,
      image_url: null,
      source_type: "human",
      source_id: null,
      mentions: mentions ? JSON.stringify(mentions) : null,
    });
    onNewPost(post);
    res.json({ post });
  });

  // List agents
  api.get("/agents", (_req, res) => {
    if (SYNC_MODE) {
      res.json({ agents: syncedAgents });
    } else {
      res.json({ agents: bridge?.getAgents() || [] });
    }
  });

  // Screenshot endpoint
  api.post("/screenshot", async (req, res) => {
    const { url, agentId, agentName, caption } = req.body;
    if (!url) { res.status(400).json({ error: "url required" }); return; }

    const post = await screenshotAndPost(
      store,
      agentId || "operator",
      agentName || "You",
      url,
      caption,
      onNewPost
    );

    if (!post) { res.status(500).json({ error: "screenshot failed" }); return; }
    res.json({ post });
  });

  app.use("/api", api);

  // --- Static files ---
  app.use("/screenshots", express.static(path.join(process.cwd(), "screenshots")));

  // Serve built client (production)
  const clientDist = path.join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  // --- WebSocket auth ---
  wss.on("connection", (ws, req) => {
    if (AUTH_TOKEN) {
      // Check cookie first, then query param
      if (validateSession(req.headers.cookie)) {
        // Cookie auth OK
      } else {
        const url = new URL(req.url || "/", `http://localhost:${PORT}`);
        const token = url.searchParams.get("token");
        if (token !== AUTH_TOKEN) {
          ws.close(4001, "unauthorized");
          return;
        }
      }
    }
    console.log("[ws] client connected");
    ws.on("close", () => console.log("[ws] client disconnected"));
  });

  // --- Start ---
  if (bridge) bridge.start();

  server.listen(PORT, () => {
    console.log(`
\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  Stoneforge Feed                        \u2502
\u2502                                         \u2502
\u2502  http://localhost:${PORT}                  \u2502
\u2502  ws://localhost:${PORT}/ws                 \u2502
\u2502                                         \u2502
\u2502  Mode: ${SYNC_MODE ? "Sync (push/pull)" : "Demo"}                       \u2502
\u2502  Auth: ${AUTH_TOKEN ? "enabled" : "disabled"}                        \u2502
\u2502  DB:   ${process.env.DATABASE_URL ? "PostgreSQL" : "SQLite"}                        \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
