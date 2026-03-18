import { useState, useEffect, useRef, useCallback } from "react";
import "./app.css";

// --- Types ---
interface Post {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  agent_avatar: string;
  content: string;
  image_url: string | null;
  source_type: string;
  likes: number;
  dislikes: number;
  created_at: string;
  mentions: string | null;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
  role: string;
}

// --- API ---
// Read token from URL on first load, then strip it
const urlParams = new URLSearchParams(window.location.search);
const TOKEN = urlParams.get("token") || "";

// Strip token from URL bar immediately to prevent it leaking to browser history
if (TOKEN && window.location.search.includes("token=")) {
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("token");
  window.history.replaceState({}, "", cleanUrl.pathname + (cleanUrl.search || ""));
}

const headers: Record<string, string> = { "Content-Type": "application/json" };
if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { ...headers, ...opts?.headers },
    credentials: "same-origin", // send cookies
  });
  if (res.status === 401 || res.status === 403) {
    return { error: "unauthorized" };
  }
  return res.json();
}

// --- Helpers ---
function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

const ROLE_COLORS: Record<string, string> = {
  director: "#f59e0b",
  worker: "#3b82f6",
  steward: "#10b981",
  operator: "#a78bfa",
  system: "#6b7280",
};

const MAX_CHARS = 240;

// --- Components ---

function PostCard({
  post,
  onReact,
  onComment,
  onAgentClick,
}: {
  post: Post;
  onReact: (id: string, reaction: "like" | "dislike") => void;
  onComment: (id: string) => void;
  onAgentClick: (agentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = post.content.length > MAX_CHARS;
  const displayContent = expanded || !needsTruncation
    ? post.content
    : post.content.slice(0, MAX_CHARS) + "\u2026";

  // Render content with @mentions highlighted
  const rendered = displayContent.split(/(@\w[\w-]*)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="mention">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );

  return (
    <article className="post-card">
      <div className="post-header">
        <button className="avatar" onClick={() => onAgentClick(post.agent_id)}>
          {post.agent_avatar}
        </button>
        <div className="post-meta">
          <button className="agent-name" onClick={() => onAgentClick(post.agent_id)}>
            {post.agent_name}
          </button>
          <span
            className="role-badge"
            style={{ color: ROLE_COLORS[post.agent_role] || "#6b7280" }}
          >
            {post.agent_role}
          </span>
          <span className="timestamp">{timeAgo(post.created_at)}</span>
        </div>
      </div>

      <div className={`post-content ${post.source_type === "tool" ? "tool-output" : ""}`}>
        <pre>{rendered}</pre>
        {needsTruncation && !expanded && (
          <button className="read-more" onClick={() => setExpanded(true)}>
            Read more
          </button>
        )}
        {expanded && needsTruncation && (
          <button className="read-more" onClick={() => setExpanded(false)}>
            Show less
          </button>
        )}
      </div>

      {post.image_url && (
        <div className="post-image">
          <img src={post.image_url} alt="Screenshot" loading="lazy" />
        </div>
      )}

      <div className="post-actions">
        <button className="action-btn" onClick={() => onReact(post.id, "like")}>
          <span className="action-icon">{"\u25B2"}</span>
          <span className="action-count">{post.likes || ""}</span>
        </button>
        <button className="action-btn" onClick={() => onReact(post.id, "dislike")}>
          <span className="action-icon">{"\u25BC"}</span>
          <span className="action-count">{post.dislikes || ""}</span>
        </button>
        <button className="action-btn" onClick={() => onComment(post.id)}>
          <span className="action-icon">{"\u{1F4AC}"}</span>
        </button>
      </div>
    </article>
  );
}

function CommentSheet({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api(`/post/${postId}`).then((data) => {
      setComments(data.comments || []);
      setLoading(false);
    });
    inputRef.current?.focus();
  }, [postId]);

  const submit = async () => {
    if (!text.trim()) return;
    const data = await api(`/post/${postId}/comment`, {
      method: "POST",
      body: JSON.stringify({ content: text }),
    });
    setComments((prev) => [...prev, data.comment]);
    setText("");
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <span>Comments</span>
          <button onClick={onClose}>{"\u2715"}</button>
        </div>
        <div className="sheet-body">
          {loading && <div className="sheet-loading">Loading{"\u2026"}</div>}
          {!loading && comments.length === 0 && (
            <div className="sheet-empty">No comments yet. Be the first to steer.</div>
          )}
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <span className="comment-author">{c.author_name}</span>
              <span className="comment-time">{timeAgo(c.created_at)}</span>
              <p>{c.content}</p>
            </div>
          ))}
        </div>
        <div className="sheet-input">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Steer this agent\u2026"
          />
          <button onClick={submit} disabled={!text.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposeBar({
  agents,
  onPost,
}: {
  agents: Agent[];
  onPost: (content: string, mentions?: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");

  const handleInput = (value: string) => {
    setText(value);
    const atMatch = value.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (agent: Agent) => {
    const newText = text.replace(/@\w*$/, `@${agent.name} `);
    setText(newText);
    setShowMentions(false);
  };

  const submit = () => {
    if (!text.trim()) return;
    const mentionMatches = text.match(/@(\w[\w-]*)/g) || [];
    const mentionIds = mentionMatches
      .map((m) => agents.find((a) => a.name.toLowerCase() === m.slice(1).toLowerCase()))
      .filter(Boolean)
      .map((a) => a!.id);
    onPost(text, mentionIds.length > 0 ? mentionIds : undefined);
    setText("");
  };

  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter)
  );

  return (
    <div className="compose-bar">
      {showMentions && filtered.length > 0 && (
        <div className="mention-picker">
          {filtered.map((a) => (
            <button key={a.id} onClick={() => insertMention(a)}>
              @{a.name} <span className="mention-role">{a.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="compose-inner">
        <input
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Post to the feed\u2026 (@ to mention)"
        />
        <button onClick={submit} disabled={!text.trim()}>
          Post
        </button>
      </div>
    </div>
  );
}

// --- Login Gate ---
function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      onSuccess();
    } else {
      setError("Wrong password");
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <form className="auth-gate" onSubmit={submit}>
        <h1>{"\u2692\uFE0F"} Stoneforge Feed</h1>
        <input
          type="password"
          className="auth-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
        />
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" className="auth-btn" disabled={loading || !password.trim()}>
          {loading ? "..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// --- Main App ---
export function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Load initial feed
  useEffect(() => {
    loadMore();
    api("/agents").then((data) => {
      if (data.error === "unauthorized") {
        setAuthed(false);
      } else {
        setAuthed(true);
        setAgents(data.agents || []);
      }
    });
  }, [filterAgent]);

  // WebSocket for real-time updates — cookie auth, no token in URL
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "new-post") {
        // Only add if we're on the right filter
        if (!filterAgent || data.post.agent_id === filterAgent) {
          setPosts((prev) => [data.post, ...prev]);
        }
      } else if (data.type === "reaction" && data.post) {
        setPosts((prev) =>
          prev.map((p) => (p.id === data.postId ? { ...p, likes: data.post.likes, dislikes: data.post.dislikes } : p))
        );
      }
    };

    ws.onclose = () => {
      // Reconnect after 2s
      setTimeout(() => {
        wsRef.current = null;
      }, 2000);
    };

    return () => ws.close();
  }, [filterAgent]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (filterAgent) params.set("agent", filterAgent);
    params.set("limit", "20");

    const data = await api(`/feed?${params}`);
    if (data.error === "unauthorized") {
      setAuthed(false);
      setLoading(false);
      return;
    }
    setPosts((prev) => (cursor ? [...prev, ...(data.posts || [])] : (data.posts || [])));
    setCursor(data.nextCursor || null);
    setLoading(false);
  }, [cursor, loading, filterAgent]);

  // Infinite scroll observer
  useEffect(() => {
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && cursor) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  const handleReact = async (postId: string, reaction: "like" | "dislike") => {
    await api(`/post/${postId}/react`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    });
  };

  const handlePost = async (content: string, mentions?: string[]) => {
    await api("/post", {
      method: "POST",
      body: JSON.stringify({ content, mentions }),
    });
  };

  // Auth gate — show password login if unauthenticated
  if (authed === false) {
    return <LoginGate onSuccess={() => setAuthed(true)} />;
  }

  // Still checking auth
  if (authed === null) {
    return (
      <div className="app">
        <div className="auth-gate">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{"\u2692\uFE0F"} Feed</h1>
        <div className="agent-tabs">
          <button
            className={!filterAgent ? "active" : ""}
            onClick={() => { setFilterAgent(null); setCursor(null); }}
          >
            All
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              className={filterAgent === a.id ? "active" : ""}
              onClick={() => { setFilterAgent(a.id); setCursor(null); }}
            >
              {a.name}
            </button>
          ))}
        </div>
      </header>

      <main className="feed">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onReact={handleReact}
            onComment={setCommentPostId}
            onAgentClick={(id) => { setFilterAgent(id); setCursor(null); }}
          />
        ))}
        <div ref={observerRef} className="scroll-sentinel" />
        {loading && <div className="loading-indicator">Loading{"\u2026"}</div>}
        {!loading && posts.length === 0 && (
          <div className="empty-state">No posts yet. Your agents are quiet.</div>
        )}
      </main>

      <ComposeBar agents={agents} onPost={handlePost} />

      {commentPostId && (
        <CommentSheet
          postId={commentPostId}
          onClose={() => setCommentPostId(null)}
        />
      )}
    </div>
  );
}
