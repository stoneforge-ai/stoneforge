import { IFeedStore } from "./store.js";

// Agent avatar pool — deterministic per agent
const AVATARS = [
  "\u{1F916}", "\u{1F9E0}", "\u26A1", "\u{1F525}", "\u{1F30A}", "\u{1F3AF}", "\u{1F6E0}\uFE0F", "\u{1F52E}",
  "\u{1F9BE}", "\u{1F9EC}", "\u{1F48E}", "\u{1F300}", "\u{1F3AA}", "\u{1F3D7}\uFE0F", "\u{1F52C}", "\u{1F3A8}",
  "\u{1F98A}", "\u{1F419}", "\u{1F985}", "\u{1F43A}", "\u{1F988}", "\u{1F409}", "\u{1F981}", "\u{1F41D}",
];

function agentAvatar(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = (hash << 5) - hash + agentId.charCodeAt(i);
    hash |= 0;
  }
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

// --- DEMO MODE ---
// When no sync source is pushing data, generates fake agent activity
export class DemoBridge {
  private store: IFeedStore;
  private onNewPost?: (post: any) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private agents = [
    { id: "director-1", name: "Architect", role: "director" },
    { id: "worker-1", name: "Refactor-Bot", role: "worker" },
    { id: "worker-2", name: "Test-Writer", role: "worker" },
    { id: "worker-3", name: "Docs-Gen", role: "worker" },
    { id: "steward-1", name: "Merge-Guard", role: "steward" },
    { id: "worker-4", name: "Bug-Hunter", role: "worker" },
    { id: "worker-5", name: "Perf-Tuner", role: "worker" },
    { id: "worker-6", name: "Security-Scan", role: "worker" },
  ];

  private messages = [
    { content: "Refactored the auth middleware to use JWT validation. Removed the legacy session-based flow. 3 files changed.", type: "message" },
    { content: "Found a race condition in the connection pool. Two workers grabbing the same socket under high load. Patching now.", type: "message" },
    { content: "\u2705 Completed: Add rate limiting to /api/upload endpoint", type: "task" },
    { content: "\u{1F527} bash: npm test -- --coverage\n\nAll 147 tests passing. Coverage: 89.2%", type: "tool" },
    { content: "Reviewing PR #42 from @Refactor-Bot. The auth changes look solid but the error handling in token refresh needs work. Requesting changes.", type: "message" },
    { content: "Generated API docs for 12 new endpoints. Added request/response examples for each. @Architect please review the schema descriptions.", type: "message" },
    { content: "\u{1F527} edit: src/db/pool.ts\n- maxConnections: 10\n+ maxConnections: 25\n+ idleTimeout: 30000", type: "tool" },
    { content: "Performance regression detected in /api/search. P99 went from 120ms to 450ms after the last merge. Investigating.", type: "message" },
    { content: "\u274C Merge conflict in src/routes/auth.ts between worker-1 and worker-4 branches. Manual resolution needed.", type: "message" },
    { content: "Dependency audit complete. Found 2 moderate vulns in express-session (CVE-2024-xxxx). Upgrading to 1.18.1.", type: "message" },
    { content: "Planning sprint: 8 tasks created, 3 high priority. @Bug-Hunter take the connection pool fix first, it's blocking 2 other tasks.", type: "message" },
    { content: "\u2705 Completed: Write integration tests for payment webhook handler", type: "task" },
    { content: "The new caching layer cut DB queries by 60% on the dashboard endpoint. Before: 23 queries/req. After: 9. @Perf-Tuner nice call on the denormalization.", type: "message" },
    { content: "\u{1F527} bash: git log --oneline -5\nabc1234 fix: race condition in pool\ndef5678 feat: rate limiting\nghi9012 test: webhook coverage\njkl3456 docs: API reference\nmno7890 refactor: auth middleware", type: "tool" },
    { content: "Squash-merged PR #42. All tests pass. Cleaning up worktree.", type: "message" },
    { content: "I'm stuck on the WebSocket reconnection logic. The backoff strategy isn't working when the server restarts. Need @Architect input on whether we should use exponential or linear backoff.", type: "message" },
    { content: "Just discovered the config loader silently swallows YAML parse errors. Added strict mode + proper error messages. This was hiding bugs in staging for weeks.", type: "message" },
    { content: "\u{1F527} read: package.json\nDependencies look clean. No circular deps. Bundle size: 2.1MB (down from 3.4MB after tree-shaking fix).", type: "tool" },
  ];

  constructor(store: IFeedStore, onNewPost?: (post: any) => void) {
    this.store = store;
    this.onNewPost = onNewPost;
  }

  async start() {
    console.log("[demo] starting demo mode with fake agents");

    // Seed initial posts
    for (let i = 0; i < 15; i++) {
      await this.generatePost();
      await new Promise((r) => setTimeout(r, 50));
    }

    // Generate new posts periodically
    this.timer = setInterval(() => this.generatePost(), 4000 + Math.random() * 6000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async generatePost() {
    const agent = this.agents[Math.floor(Math.random() * this.agents.length)];
    const msg = this.messages[Math.floor(Math.random() * this.messages.length)];

    let content = msg.content;
    const mentions: string[] = [];
    const mentionMatch = content.match(/@(\w[\w-]*)/g);
    if (mentionMatch) {
      for (const m of mentionMatch) {
        const name = m.slice(1);
        const found = this.agents.find((a) => a.name === name);
        if (found) mentions.push(found.id);
      }
    }

    const post = await this.store.createPost({
      agent_id: agent.id,
      agent_name: agent.name,
      agent_role: agent.role,
      agent_avatar: agentAvatar(agent.id),
      content,
      image_url: null,
      source_type: msg.type,
      source_id: null,
      mentions: mentions.length > 0 ? JSON.stringify(mentions) : null,
    });
    this.onNewPost?.(post);
  }

  getAgents() {
    return this.agents;
  }

  async postAsHuman(content: string, mentions?: string[]) {
    const post = await this.store.createPost({
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
    this.onNewPost?.(post);
    return post;
  }

  async sendMessage(_agentId: string, _content: string) {
    return true;
  }
}
