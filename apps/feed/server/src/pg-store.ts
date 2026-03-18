import pg from "pg";
import { nanoid } from "nanoid";
import type { IFeedStore, Post, Comment, NewPost } from "./store.js";

const { Pool } = pg;

const VALID_REACTIONS = new Set(["like", "dislike"]);
function assertValidReaction(reaction: string): asserts reaction is "like" | "dislike" {
  if (!VALID_REACTIONS.has(reaction)) {
    throw new Error(`Invalid reaction: ${reaction}`);
  }
}

export class PgStore implements IFeedStore {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      // rejectUnauthorized: false is the documented pattern for Railway/Neon managed Postgres
      // (self-signed certs). Only applied when connecting to those providers.
      ssl: databaseUrl.includes("railway") || databaseUrl.includes("neon")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
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
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        mentions TEXT
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id),
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS reactions (
        post_id TEXT NOT NULL REFERENCES posts(id),
        user_id TEXT NOT NULL DEFAULT 'operator',
        reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
        created_at TEXT NOT NULL DEFAULT (NOW()::text),
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
    await this.pool.query(
      `INSERT INTO posts (id, agent_id, agent_name, agent_role, agent_avatar, content, image_url, source_type, source_id, mentions, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, post.agent_id, post.agent_name, post.agent_role, post.agent_avatar,
       post.content, post.image_url, post.source_type, post.source_id, post.mentions, now]
    );
    return { ...post, id, likes: 0, dislikes: 0, created_at: now };
  }

  async getFeed(cursor?: string, limit = 20): Promise<Post[]> {
    if (cursor) {
      const { rows } = await this.pool.query(
        `SELECT * FROM posts WHERE created_at < $1 ORDER BY created_at DESC LIMIT $2`,
        [cursor, limit]
      );
      return rows;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM posts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async getAgentFeed(agentId: string, cursor?: string, limit = 20): Promise<Post[]> {
    if (cursor) {
      const { rows } = await this.pool.query(
        `SELECT * FROM posts WHERE agent_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3`,
        [agentId, cursor, limit]
      );
      return rows;
    }
    const { rows } = await this.pool.query(
      `SELECT * FROM posts WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [agentId, limit]
    );
    return rows;
  }

  async react(postId: string, reaction: "like" | "dislike", userId = "operator"): Promise<string | null> {
    assertValidReaction(reaction);
    const col = reaction === "like" ? "likes" : "dislikes";

    const { rows } = await this.pool.query(
      `SELECT reaction FROM reactions WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    const existing = rows[0] as { reaction: string } | undefined;

    if (existing) {
      assertValidReaction(existing.reaction);
      const oldCol = existing.reaction === "like" ? "likes" : "dislikes";

      if (existing.reaction === reaction) {
        await this.pool.query(
          `DELETE FROM reactions WHERE post_id = $1 AND user_id = $2`,
          [postId, userId]
        );
        await this.pool.query(
          `UPDATE posts SET ${col} = ${col} - 1 WHERE id = $1`,
          [postId]
        );
        return null;
      }
      await this.pool.query(
        `UPDATE reactions SET reaction = $1, created_at = NOW()::text WHERE post_id = $2 AND user_id = $3`,
        [reaction, postId, userId]
      );
      await this.pool.query(
        `UPDATE posts SET ${col} = ${col} + 1, ${oldCol} = ${oldCol} - 1 WHERE id = $1`,
        [postId]
      );
      return reaction;
    }

    await this.pool.query(
      `INSERT INTO reactions (post_id, user_id, reaction) VALUES ($1, $2, $3)`,
      [postId, userId, reaction]
    );
    await this.pool.query(
      `UPDATE posts SET ${col} = ${col} + 1 WHERE id = $1`,
      [postId]
    );
    return reaction;
  }

  async addComment(postId: string, authorId: string, authorName: string, content: string): Promise<Comment> {
    const id = nanoid(12);
    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO comments (id, post_id, author_id, author_name, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, postId, authorId, authorName, content, now]
    );
    return { id, post_id: postId, author_id: authorId, author_name: authorName, content, created_at: now };
  }

  async getComments(postId: string): Promise<Comment[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC`,
      [postId]
    );
    return rows;
  }

  async getPost(postId: string): Promise<Post | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM posts WHERE id = $1`,
      [postId]
    );
    return rows[0];
  }

  async hasPost(sourceType: string, sourceId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM posts WHERE source_type = $1 AND source_id = $2 LIMIT 1`,
      [sourceType, sourceId]
    );
    return rows.length > 0;
  }

  async getUnsynced(): Promise<{ comments: (Comment & { target_agent_id: string })[]; reactions: any[] }> {
    const { rows } = await this.pool.query(
      `SELECT c.*, p.agent_id as target_agent_id FROM comments c JOIN posts p ON c.post_id = p.id WHERE c.synced = 0`
    );
    return { comments: rows, reactions: [] };
  }

  async markSynced(commentIds: string[]): Promise<void> {
    if (commentIds.length === 0) return;
    const placeholders = commentIds.map((_, i) => `$${i + 1}`).join(",");
    await this.pool.query(
      `UPDATE comments SET synced = 1 WHERE id IN (${placeholders})`,
      commentIds
    );
  }
}
