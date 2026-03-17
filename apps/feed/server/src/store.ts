import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import path from "path";
import { mkdirSync } from "fs";

// --- Shared types ---

export interface Post {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_role: string;
  agent_avatar: string;
  content: string;
  image_url: string | null;
  source_type: string; // 'message' | 'task' | 'tool' | 'screenshot' | 'human'
  source_id: string | null;
  likes: number;
  dislikes: number;
  created_at: string;
  mentions: string | null; // JSON array of agent_ids
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export type NewPost = Omit<Post, "id" | "likes" | "dislikes" | "created_at">;

// --- Store interface ---

export interface IFeedStore {
  createPost(post: NewPost): Promise<Post>;
  getFeed(cursor?: string, limit?: number): Promise<Post[]>;
  getAgentFeed(agentId: string, cursor?: string, limit?: number): Promise<Post[]>;
  react(postId: string, reaction: "like" | "dislike", userId?: string): Promise<string | null>;
  addComment(postId: string, authorId: string, authorName: string, content: string): Promise<Comment>;
  getComments(postId: string): Promise<Comment[]>;
  getPost(postId: string): Promise<Post | undefined>;
  hasPost(sourceType: string, sourceId: string): Promise<boolean>;
  getUnsynced(): Promise<{ comments: (Comment & { target_agent_id: string })[]; reactions: any[] }>;
  markSynced(commentIds: string[]): Promise<void>;
}

// --- Validate reaction column name to prevent SQL injection ---
const VALID_REACTIONS = new Set(["like", "dislike"]);
function assertValidReaction(reaction: string): asserts reaction is "like" | "dislike" {
  if (!VALID_REACTIONS.has(reaction)) {
    throw new Error(`Invalid reaction: ${reaction}`);
  }
}

// --- SQLite implementation ---

export class SqliteStore implements IFeedStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), "data", "feed.db");
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        agent_role TEXT DEFAULT 'worker',
        agent_avatar TEXT DEFAULT '',
        content TEXT NOT NULL,
        image_url TEXT,
        source_type TEXT NOT NULL DEFAULT 'message',
        source_id TEXT,
        likes INTEGER DEFAULT 0,
        dislikes INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        mentions TEXT
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id),
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reactions (
        post_id TEXT NOT NULL REFERENCES posts(id),
        user_id TEXT NOT NULL DEFAULT 'operator',
        reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (post_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_agent ON posts(agent_id);
      CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
    `);
  }

  async createPost(post: NewPost): Promise<Post> {
    const id = nanoid(12);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO posts (id, agent_id, agent_name, agent_role, agent_avatar, content, image_url, source_type, source_id, mentions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        post.agent_id,
        post.agent_name,
        post.agent_role,
        post.agent_avatar,
        post.content,
        post.image_url,
        post.source_type,
        post.source_id,
        post.mentions,
        now
      );
    return { ...post, id, likes: 0, dislikes: 0, created_at: now };
  }

  async getFeed(cursor?: string, limit = 20): Promise<Post[]> {
    if (cursor) {
      return this.db
        .prepare(
          `SELECT * FROM posts WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(cursor, limit) as Post[];
    }
    return this.db
      .prepare(`SELECT * FROM posts ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Post[];
  }

  async getAgentFeed(agentId: string, cursor?: string, limit = 20): Promise<Post[]> {
    if (cursor) {
      return this.db
        .prepare(
          `SELECT * FROM posts WHERE agent_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
        )
        .all(agentId, cursor, limit) as Post[];
    }
    return this.db
      .prepare(
        `SELECT * FROM posts WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(agentId, limit) as Post[];
  }

  async react(postId: string, reaction: "like" | "dislike", userId = "operator"): Promise<string | null> {
    assertValidReaction(reaction);
    const col = reaction === "like" ? "likes" : "dislikes";

    const existing = this.db
      .prepare(`SELECT reaction FROM reactions WHERE post_id = ? AND user_id = ?`)
      .get(postId, userId) as { reaction: string } | undefined;

    if (existing) {
      assertValidReaction(existing.reaction);
      const oldCol = existing.reaction === "like" ? "likes" : "dislikes";

      if (existing.reaction === reaction) {
        // Toggle off
        this.db
          .prepare(`DELETE FROM reactions WHERE post_id = ? AND user_id = ?`)
          .run(postId, userId);
        this.db
          .prepare(`UPDATE posts SET ${col} = ${col} - 1 WHERE id = ?`)
          .run(postId);
        return null;
      }
      // Switch reaction
      this.db
        .prepare(
          `UPDATE reactions SET reaction = ?, created_at = datetime('now') WHERE post_id = ? AND user_id = ?`
        )
        .run(reaction, postId, userId);
      this.db
        .prepare(
          `UPDATE posts SET ${col} = ${col} + 1, ${oldCol} = ${oldCol} - 1 WHERE id = ?`
        )
        .run(postId);
      return reaction;
    }

    // New reaction
    this.db
      .prepare(`INSERT INTO reactions (post_id, user_id, reaction) VALUES (?, ?, ?)`)
      .run(postId, userId, reaction);
    this.db
      .prepare(`UPDATE posts SET ${col} = ${col} + 1 WHERE id = ?`)
      .run(postId);
    return reaction;
  }

  async addComment(postId: string, authorId: string, authorName: string, content: string): Promise<Comment> {
    const id = nanoid(12);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO comments (id, post_id, author_id, author_name, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, postId, authorId, authorName, content, now);
    return { id, post_id: postId, author_id: authorId, author_name: authorName, content, created_at: now };
  }

  async getComments(postId: string): Promise<Comment[]> {
    return this.db
      .prepare(`SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC`)
      .all(postId) as Comment[];
  }

  async getPost(postId: string): Promise<Post | undefined> {
    return this.db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as Post | undefined;
  }

  async hasPost(sourceType: string, sourceId: string): Promise<boolean> {
    const row = this.db
      .prepare(`SELECT 1 FROM posts WHERE source_type = ? AND source_id = ? LIMIT 1`)
      .get(sourceType, sourceId);
    return !!row;
  }

  async getUnsynced(): Promise<{ comments: (Comment & { target_agent_id: string })[]; reactions: any[] }> {
    const comments = this.db
      .prepare(`SELECT c.*, p.agent_id as target_agent_id FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.synced = 0`)
      .all() as (Comment & { target_agent_id: string })[];
    return { comments, reactions: [] };
  }

  async markSynced(commentIds: string[]): Promise<void> {
    if (commentIds.length === 0) return;
    const stmt = this.db.prepare(`UPDATE comments SET synced = 1 WHERE id = ?`);
    for (const id of commentIds) stmt.run(id);
  }
}

// --- Factory ---

export async function createStore(): Promise<IFeedStore> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const { PgStore } = await import("./pg-store.js");
    const store = new PgStore(databaseUrl);
    await store.migrate();
    return store;
  }
  return new SqliteStore();
}
