// ── Editor Mock Data ──
// Types and mock data for the Editor page

// ── Types ──

export interface EditorFileEntry {
  type: 'file' | 'folder'
  name: string
  path: string
  children?: EditorFileEntry[]
  language?: string
  size?: string
  lastCommitMessage?: string
  lastCommitDate?: string
  lastCommitAuthor?: string
  agentModified?: boolean
}

export interface EditorFileContent {
  path: string
  content: string
  language: string
  lines: number
  size: string
}

export interface EditorBlameBlock {
  startLine: number
  endLine: number
  author: string
  authorAvatar?: string
  isAgent?: boolean
  commitSha: string
  commitMessage: string
  date: string
}

export interface EditorSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'export' | 'method'
  line: number
  endLine?: number
  indent?: number
}

export interface AgentFileChange {
  filePath: string
  agentName: string
  agentId: string
  sessionId: string
  taskId: string
  taskTitle: string
  mrId?: string
  changedAt: string
  commitMessage: string
  reasoning: string
  changedLines: { start: number; end: number; type: 'add' | 'modify' }[]
}

export interface AgentSession {
  sessionId: string
  agentName: string
  taskId: string
  taskTitle: string
  mrId?: string
  timestamp: string
  filesChanged: { path: string; additions: number; deletions: number }[]
}

export interface EditorTab {
  id: string
  filePath: string
  isPinned: boolean
  isModified: boolean
  scrollPosition?: number
}

export interface EditorNavigationContext {
  type: 'mr' | 'ci' | 'task' | 'direct'
  sourceId?: string
  sourceLabel?: string
  branch?: string
  relatedFiles?: string[]
}

// ── File Tree ──

export const mockEditorFileTree: EditorFileEntry[] = [
  {
    type: 'folder', name: 'packages', path: 'packages',
    lastCommitMessage: 'Add PKCE authentication flow', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha',
    children: [
      {
        type: 'folder', name: 'smithy', path: 'packages/smithy',
        lastCommitMessage: 'Add PKCE authentication flow', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha',
        children: [
          {
            type: 'folder', name: 'src', path: 'packages/smithy/src',
            lastCommitMessage: 'Add PKCE authentication flow', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha',
            children: [
              {
                type: 'folder', name: 'auth', path: 'packages/smithy/src/auth',
                lastCommitMessage: 'Add PKCE authentication flow', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha',
                children: [
                  { type: 'file', name: 'index.ts', path: 'packages/smithy/src/auth/index.ts', language: 'typescript', size: '0.4 KB', lastCommitMessage: 'Re-export auth modules', lastCommitDate: '5 days ago', lastCommitAuthor: 'Adam King' },
                  { type: 'file', name: 'pkce.ts', path: 'packages/smithy/src/auth/pkce.ts', language: 'typescript', size: '2.4 KB', lastCommitMessage: 'Add PKCE challenge generation', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha', agentModified: true },
                  { type: 'file', name: 'pkce-callback.ts', path: 'packages/smithy/src/auth/pkce-callback.ts', language: 'typescript', size: '1.8 KB', lastCommitMessage: 'Add PKCE callback handler', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha', agentModified: true },
                  { type: 'file', name: 'session.ts', path: 'packages/smithy/src/auth/session.ts', language: 'typescript', size: '3.1 KB', lastCommitMessage: 'Fix session refresh race condition', lastCommitDate: '2 days ago', lastCommitAuthor: 'Adam King' },
                ],
              },
              {
                type: 'folder', name: 'api', path: 'packages/smithy/src/api',
                lastCommitMessage: 'Add rate limiting middleware', lastCommitDate: '1 day ago', lastCommitAuthor: 'Director Beta',
                children: [
                  { type: 'file', name: 'routes.ts', path: 'packages/smithy/src/api/routes.ts', language: 'typescript', size: '4.2 KB', lastCommitMessage: 'Add rate limiting middleware', lastCommitDate: '1 day ago', lastCommitAuthor: 'Director Beta', agentModified: true },
                  { type: 'file', name: 'middleware.ts', path: 'packages/smithy/src/api/middleware.ts', language: 'typescript', size: '2.8 KB', lastCommitMessage: 'Add rate limiting middleware', lastCommitDate: '1 day ago', lastCommitAuthor: 'Director Beta', agentModified: true },
                  { type: 'file', name: 'types.ts', path: 'packages/smithy/src/api/types.ts', language: 'typescript', size: '1.5 KB', lastCommitMessage: 'Define API response types', lastCommitDate: '1 week ago', lastCommitAuthor: 'Adam King' },
                ],
              },
              { type: 'file', name: 'server.ts', path: 'packages/smithy/src/server.ts', language: 'typescript', size: '1.9 KB', lastCommitMessage: 'Configure graceful shutdown', lastCommitDate: '3 days ago', lastCommitAuthor: 'Adam King' },
              { type: 'file', name: 'config.ts', path: 'packages/smithy/src/config.ts', language: 'typescript', size: '1.2 KB', lastCommitMessage: 'Add PKCE config options', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha', agentModified: true },
            ],
          },
          { type: 'file', name: 'package.json', path: 'packages/smithy/package.json', language: 'json', size: '1.1 KB', lastCommitMessage: 'Add crypto dependency', lastCommitDate: '14 min ago', lastCommitAuthor: 'Director Alpha' },
          { type: 'file', name: 'tsconfig.json', path: 'packages/smithy/tsconfig.json', language: 'json', size: '0.6 KB', lastCommitMessage: 'Enable strict mode', lastCommitDate: '2 weeks ago', lastCommitAuthor: 'Adam King' },
        ],
      },
    ],
  },
  {
    type: 'folder', name: 'apps', path: 'apps',
    lastCommitMessage: 'Update dashboard layout', lastCommitDate: '6 hours ago', lastCommitAuthor: 'Adam King',
    children: [
      {
        type: 'folder', name: 'smithy-web', path: 'apps/smithy-web',
        lastCommitMessage: 'Update dashboard layout', lastCommitDate: '6 hours ago', lastCommitAuthor: 'Adam King',
        children: [
          { type: 'file', name: 'package.json', path: 'apps/smithy-web/package.json', language: 'json', size: '2.3 KB', lastCommitMessage: 'Bump React to 19', lastCommitDate: '1 week ago', lastCommitAuthor: 'Adam King' },
          { type: 'file', name: 'vite.config.ts', path: 'apps/smithy-web/vite.config.ts', language: 'typescript', size: '0.8 KB', lastCommitMessage: 'Add proxy config for API', lastCommitDate: '3 days ago', lastCommitAuthor: 'Adam King' },
        ],
      },
    ],
  },
  { type: 'file', name: '.gitignore', path: '.gitignore', size: '0.3 KB', lastCommitMessage: 'Add coverage to gitignore', lastCommitDate: '2 weeks ago', lastCommitAuthor: 'Adam King' },
  { type: 'file', name: 'README.md', path: 'README.md', language: 'markdown', size: '3.2 KB', lastCommitMessage: 'Update setup instructions', lastCommitDate: '4 days ago', lastCommitAuthor: 'Adam King' },
  { type: 'file', name: 'turbo.json', path: 'turbo.json', language: 'json', size: '0.5 KB', lastCommitMessage: 'Configure turbo cache', lastCommitDate: '2 weeks ago', lastCommitAuthor: 'Adam King' },
]

// ── File Contents ──

export const mockEditorFiles: Record<string, EditorFileContent> = {
  'packages/smithy/src/auth/pkce.ts': {
    path: 'packages/smithy/src/auth/pkce.ts',
    language: 'typescript',
    lines: 77,
    size: '2.4 KB',
    content: `import { randomBytes, createHash } from 'crypto'

interface PKCEChallenge {
  codeVerifier: string
  codeChallenge: string
  method: 'S256'
}

/**
 * Generate a PKCE challenge pair for OAuth2 authorization.
 * Uses S256 method (SHA-256 hash of the code verifier).
 */
export function generatePKCEChallenge(): PKCEChallenge {
  // Generate a cryptographically random code verifier
  const codeVerifier = randomBytes(32)
    .toString('base64url')
    .slice(0, 128)

  // Hash the verifier with SHA-256 to create the challenge
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return {
    codeVerifier,
    codeChallenge,
    method: 'S256',
  }
}

/**
 * Validate a PKCE code verifier against a stored challenge.
 */
export function validatePKCEVerifier(
  codeVerifier: string,
  storedChallenge: string,
): boolean {
  const computed = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  return computed === storedChallenge
}

/**
 * Exchange an authorization code for tokens using PKCE.
 */
export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(\`Token exchange failed: \${response.status}\`)
  }

  return response.json()
}

// Re-export types
export type { PKCEChallenge }`,
  },
  'packages/smithy/src/auth/pkce-callback.ts': {
    path: 'packages/smithy/src/auth/pkce-callback.ts',
    language: 'typescript',
    lines: 52,
    size: '1.8 KB',
    content: `import { exchangeCodeForToken, validatePKCEVerifier } from './pkce'
import { createSession, type SessionOptions } from './session'

interface CallbackParams {
  code: string
  state: string
  storedState: string
  codeVerifier: string
  storedChallenge: string
  redirectUri: string
}

/**
 * Handle the OAuth2 PKCE callback.
 * Validates state, verifies PKCE challenge, exchanges code for tokens,
 * and creates a new session.
 */
export async function handlePKCECallback(
  params: CallbackParams,
  sessionOpts?: Partial<SessionOptions>,
): Promise<{ sessionId: string; accessToken: string }> {
  // Verify the state parameter matches to prevent CSRF
  if (params.state !== params.storedState) {
    throw new Error('OAuth state mismatch — possible CSRF attack')
  }

  // Validate the PKCE code verifier against the stored challenge
  if (!validatePKCEVerifier(params.codeVerifier, params.storedChallenge)) {
    throw new Error('PKCE verification failed — code verifier does not match challenge')
  }

  // Exchange the authorization code for tokens
  const { accessToken, refreshToken } = await exchangeCodeForToken(
    params.code,
    params.codeVerifier,
    params.redirectUri,
  )

  // Create a new session with the obtained tokens
  const session = await createSession({
    accessToken,
    refreshToken,
    expiresIn: 3600,
    ...sessionOpts,
  })

  return {
    sessionId: session.id,
    accessToken,
  }
}

export type { CallbackParams }`,
  },
  'packages/smithy/src/auth/session.ts': {
    path: 'packages/smithy/src/auth/session.ts',
    language: 'typescript',
    lines: 89,
    size: '3.1 KB',
    content: `import { EventEmitter } from 'events'

export interface SessionOptions {
  accessToken: string
  refreshToken: string
  expiresIn: number
  userId?: string
}

export interface Session {
  id: string
  accessToken: string
  refreshToken: string
  expiresAt: Date
  userId?: string
  createdAt: Date
}

const sessions = new Map<string, Session>()
const emitter = new EventEmitter()

let refreshTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Create a new authenticated session.
 */
export async function createSession(opts: SessionOptions): Promise<Session> {
  const id = crypto.randomUUID()
  const session: Session = {
    id,
    accessToken: opts.accessToken,
    refreshToken: opts.refreshToken,
    expiresAt: new Date(Date.now() + opts.expiresIn * 1000),
    userId: opts.userId,
    createdAt: new Date(),
  }

  sessions.set(id, session)
  scheduleRefresh(session)
  emitter.emit('session:created', session)

  return session
}

/**
 * Get an active session by ID.
 */
export function getSession(id: string): Session | undefined {
  const session = sessions.get(id)
  if (!session) return undefined

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    sessions.delete(id)
    emitter.emit('session:expired', id)
    return undefined
  }

  return session
}

/**
 * Destroy a session and clean up timers.
 */
export function destroySession(id: string): boolean {
  const existed = sessions.delete(id)
  if (existed) {
    emitter.emit('session:destroyed', id)
  }
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  return existed
}

/**
 * Schedule an automatic token refresh before expiration.
 */
function scheduleRefresh(session: Session): void {
  const refreshAt = session.expiresAt.getTime() - Date.now() - 60_000
  if (refreshAt <= 0) return

  refreshTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      })

      if (!response.ok) throw new Error('Refresh failed')

      const { access_token, expires_in } = await response.json()
      session.accessToken = access_token
      session.expiresAt = new Date(Date.now() + expires_in * 1000)
      scheduleRefresh(session)
      emitter.emit('session:refreshed', session)
    } catch {
      emitter.emit('session:refresh-failed', session.id)
    }
  }, refreshAt)
}

export { emitter as sessionEmitter }`,
  },
  'packages/smithy/src/auth/index.ts': {
    path: 'packages/smithy/src/auth/index.ts',
    language: 'typescript',
    lines: 8,
    size: '0.4 KB',
    content: `export { generatePKCEChallenge, validatePKCEVerifier, exchangeCodeForToken } from './pkce'
export type { PKCEChallenge } from './pkce'

export { handlePKCECallback } from './pkce-callback'
export type { CallbackParams } from './pkce-callback'

export { createSession, getSession, destroySession, sessionEmitter } from './session'
export type { Session, SessionOptions } from './session'`,
  },
  'packages/smithy/src/api/routes.ts': {
    path: 'packages/smithy/src/api/routes.ts',
    language: 'typescript',
    lines: 68,
    size: '4.2 KB',
    content: `import { Router, type Request, type Response } from 'express'
import { rateLimiter } from './middleware'
import type { ApiResponse, PaginatedResponse } from './types'

const router = Router()

// Apply rate limiting to all API routes
router.use(rateLimiter({ windowMs: 60_000, maxRequests: 100 }))

/**
 * GET /api/tasks — List all tasks with pagination
 */
router.get('/tasks', async (req: Request, res: Response<PaginatedResponse>) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
  const offset = (page - 1) * limit

  // TODO: Replace with actual database query
  const tasks = await db.tasks.findMany({ skip: offset, take: limit })
  const total = await db.tasks.count()

  res.json({
    data: tasks,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
})

/**
 * POST /api/tasks — Create a new task
 */
router.post('/tasks', async (req: Request, res: Response<ApiResponse>) => {
  const { title, description, priority, assignee, labels } = req.body

  if (!title?.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }

  const task = await db.tasks.create({
    data: { title, description, priority: priority || 'medium', assignee, labels: labels || [] },
  })

  res.status(201).json({ data: task })
})

/**
 * PATCH /api/tasks/:id — Update a task
 */
router.patch('/tasks/:id', async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params
  const updates = req.body

  const task = await db.tasks.update({ where: { id }, data: updates })
  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }

  res.json({ data: task })
})

/**
 * DELETE /api/tasks/:id — Delete a task
 */
router.delete('/tasks/:id', async (req: Request, res: Response<ApiResponse>) => {
  const { id } = req.params
  const deleted = await db.tasks.delete({ where: { id } })

  if (!deleted) {
    return res.status(404).json({ error: 'Task not found' })
  }

  res.status(204).end()
})

export { router as apiRouter }`,
  },
  'packages/smithy/src/api/middleware.ts': {
    path: 'packages/smithy/src/api/middleware.ts',
    language: 'typescript',
    lines: 54,
    size: '2.8 KB',
    content: `import type { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  message?: string
}

const requestCounts = new Map<string, { count: number; resetAt: number }>()

/**
 * Rate limiting middleware using a sliding window counter.
 * Tracks requests per IP address within the configured time window.
 */
export function rateLimiter(opts: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()

    let entry = requestCounts.get(key)

    // Reset window if expired
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      requestCounts.set(key, entry)
    }

    entry.count++

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', opts.maxRequests)
    res.setHeader('X-RateLimit-Remaining', Math.max(0, opts.maxRequests - entry.count))
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000))

    if (entry.count > opts.maxRequests) {
      return res.status(429).json({
        error: opts.message || 'Too many requests, please try again later',
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      })
    }

    next()
  }
}

/**
 * Request logging middleware.
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  const start = Date.now()
  _res.on('finish', () => {
    const duration = Date.now() - start
    console.log(\`\${req.method} \${req.path} \${_res.statusCode} \${duration}ms\`)
  })
  next()
}`,
  },
  'packages/smithy/src/api/types.ts': {
    path: 'packages/smithy/src/api/types.ts',
    language: 'typescript',
    lines: 28,
    size: '1.5 KB',
    content: `export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T = unknown> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, string[]>
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RouteDefinition {
  method: HttpMethod
  path: string
  handler: string
  middleware?: string[]
}`,
  },
  'packages/smithy/src/config.ts': {
    path: 'packages/smithy/src/config.ts',
    language: 'typescript',
    lines: 32,
    size: '1.2 KB',
    content: `export interface AppConfig {
  port: number
  host: string
  auth: {
    pkceEnabled: boolean
    clientId: string
    authorizeUrl: string
    tokenUrl: string
    redirectUri: string
    scopes: string[]
  }
  database: {
    url: string
    poolSize: number
  }
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || '0.0.0.0',
    auth: {
      pkceEnabled: true,
      clientId: process.env.AUTH_CLIENT_ID || '',
      authorizeUrl: process.env.AUTH_AUTHORIZE_URL || '',
      tokenUrl: process.env.AUTH_TOKEN_URL || '',
      redirectUri: process.env.AUTH_REDIRECT_URI || 'http://localhost:3000/callback',
      scopes: ['openid', 'profile', 'email'],
    },
    database: {
      url: process.env.DATABASE_URL || '',
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
    },
  }
}`,
  },
  'packages/smithy/src/server.ts': {
    path: 'packages/smithy/src/server.ts',
    language: 'typescript',
    lines: 42,
    size: '1.9 KB',
    content: `import express from 'express'
import { loadConfig } from './config'
import { apiRouter } from './api/routes'
import { requestLogger } from './api/middleware'

const config = loadConfig()
const app = express()

// Middleware
app.use(express.json())
app.use(requestLogger)

// Routes
app.use('/api', apiRouter)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Graceful shutdown
const server = app.listen(config.port, config.host, () => {
  console.log(\`Server running on \${config.host}:\${config.port}\`)
})

function shutdown(signal: string) {
  console.log(\`Received \${signal}, shutting down gracefully...\`)
  server.close(() => {
    console.log('HTTP server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))`,
  },
  'packages/smithy/package.json': {
    path: 'packages/smithy/package.json',
    language: 'json',
    lines: 24,
    size: '1.1 KB',
    content: `{
  "name": "@stoneforge/smithy",
  "version": "0.8.2",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "express": "^4.21.0",
    "crypto": "^1.0.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "vitest": "^2.1.0",
    "@types/express": "^5.0.0"
  }
}`,
  },
  'README.md': {
    path: 'README.md',
    language: 'markdown',
    lines: 38,
    size: '3.2 KB',
    content: `# Stoneforge

Agentic software development platform.

## Quick Start

\`\`\`bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Run tests
pnpm test
\`\`\`

## Architecture

\`\`\`
packages/
  smithy/          # Core backend server
    src/
      auth/        # Authentication (PKCE, sessions)
      api/         # REST API routes and middleware
apps/
  smithy-web/      # Dashboard frontend (React)
\`\`\`

## Development

This is a monorepo managed by Turborepo. Each package can be developed independently.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| \`PORT\` | Server port | \`3000\` |
| \`DATABASE_URL\` | Database connection string | — |
| \`AUTH_CLIENT_ID\` | OAuth client ID | — |

## License

MIT`,
  },
}

// ── Symbol Data ──

export const mockEditorSymbols: Record<string, EditorSymbol[]> = {
  'packages/smithy/src/auth/pkce.ts': [
    { name: 'PKCEChallenge', kind: 'interface', line: 3, endLine: 7 },
    { name: 'generatePKCEChallenge', kind: 'function', line: 13, endLine: 31 },
    { name: 'validatePKCEVerifier', kind: 'function', line: 36, endLine: 44 },
    { name: 'exchangeCodeForToken', kind: 'function', line: 49, endLine: 68 },
  ],
  'packages/smithy/src/auth/pkce-callback.ts': [
    { name: 'CallbackParams', kind: 'interface', line: 4, endLine: 12 },
    { name: 'handlePKCECallback', kind: 'function', line: 19, endLine: 50 },
  ],
  'packages/smithy/src/auth/session.ts': [
    { name: 'SessionOptions', kind: 'interface', line: 3, endLine: 8 },
    { name: 'Session', kind: 'interface', line: 10, endLine: 17 },
    { name: 'createSession', kind: 'function', line: 27, endLine: 42 },
    { name: 'getSession', kind: 'function', line: 47, endLine: 58 },
    { name: 'destroySession', kind: 'function', line: 63, endLine: 72 },
    { name: 'scheduleRefresh', kind: 'function', line: 77, endLine: 89 },
  ],
  'packages/smithy/src/api/routes.ts': [
    { name: 'GET /tasks', kind: 'function', line: 13, endLine: 25 },
    { name: 'POST /tasks', kind: 'function', line: 30, endLine: 43 },
    { name: 'PATCH /tasks/:id', kind: 'function', line: 48, endLine: 58 },
    { name: 'DELETE /tasks/:id', kind: 'function', line: 63, endLine: 68 },
  ],
  'packages/smithy/src/api/middleware.ts': [
    { name: 'RateLimitOptions', kind: 'interface', line: 3, endLine: 7 },
    { name: 'rateLimiter', kind: 'function', line: 14, endLine: 41 },
    { name: 'requestLogger', kind: 'function', line: 46, endLine: 54 },
  ],
}

// ── Blame Data ──

export const mockEditorBlame: Record<string, EditorBlameBlock[]> = {
  'packages/smithy/src/auth/pkce.ts': [
    { startLine: 1, endLine: 1, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 2, endLine: 2, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 3, endLine: 7, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 8, endLine: 12, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 13, endLine: 31, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 32, endLine: 35, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
    { startLine: 36, endLine: 44, author: 'Adam King', commitSha: 'b7e43d1', commitMessage: 'Add PKCE verifier validation', date: '2 hours ago' },
    { startLine: 45, endLine: 48, author: 'Adam King', commitSha: 'b7e43d1', commitMessage: 'Add PKCE verifier validation', date: '2 hours ago' },
    { startLine: 49, endLine: 68, author: 'Director Alpha', isAgent: true, commitSha: 'c2d89f4', commitMessage: 'Add token exchange', date: '14 min ago' },
    { startLine: 69, endLine: 77, author: 'Director Alpha', isAgent: true, commitSha: 'a3f21c8', commitMessage: 'Add PKCE challenge generation', date: '14 min ago' },
  ],
  'packages/smithy/src/auth/session.ts': [
    { startLine: 1, endLine: 17, author: 'Adam King', commitSha: 'd4a12b3', commitMessage: 'Initial session module', date: '2 weeks ago' },
    { startLine: 18, endLine: 26, author: 'Adam King', commitSha: 'd4a12b3', commitMessage: 'Initial session module', date: '2 weeks ago' },
    { startLine: 27, endLine: 42, author: 'Adam King', commitSha: 'e5f23c4', commitMessage: 'Add session creation with events', date: '1 week ago' },
    { startLine: 43, endLine: 58, author: 'Adam King', commitSha: 'd4a12b3', commitMessage: 'Initial session module', date: '2 weeks ago' },
    { startLine: 59, endLine: 72, author: 'Adam King', commitSha: 'f6a34d5', commitMessage: 'Fix session refresh race condition', date: '2 days ago' },
    { startLine: 73, endLine: 89, author: 'Adam King', commitSha: 'f6a34d5', commitMessage: 'Fix session refresh race condition', date: '2 days ago' },
  ],
}

// ── Agent Annotations ──

export const mockAgentChanges: AgentFileChange[] = [
  {
    filePath: 'packages/smithy/src/auth/pkce.ts',
    agentName: 'Director Alpha',
    agentId: 'director-alpha',
    sessionId: 'session-a1',
    taskId: 'SF-142',
    taskTitle: 'Implement PKCE Authentication',
    mrId: 'MR-42',
    changedAt: '14 min ago',
    commitMessage: 'Add PKCE challenge generation',
    reasoning: 'Implementing PKCE (Proof Key for Code Exchange) for OAuth2 per RFC 7636. Using S256 method with crypto.randomBytes for secure verifier generation.',
    changedLines: [
      { start: 1, end: 31, type: 'add' },
      { start: 49, end: 68, type: 'add' },
      { start: 69, end: 77, type: 'add' },
    ],
  },
  {
    filePath: 'packages/smithy/src/auth/pkce-callback.ts',
    agentName: 'Director Alpha',
    agentId: 'director-alpha',
    sessionId: 'session-a1',
    taskId: 'SF-142',
    taskTitle: 'Implement PKCE Authentication',
    mrId: 'MR-42',
    changedAt: '14 min ago',
    commitMessage: 'Add PKCE callback handler',
    reasoning: 'Created the callback handler to complete the OAuth2 PKCE flow. Validates state parameter for CSRF protection, verifies the PKCE challenge, then exchanges the code for tokens.',
    changedLines: [
      { start: 1, end: 52, type: 'add' },
    ],
  },
  {
    filePath: 'packages/smithy/src/config.ts',
    agentName: 'Director Alpha',
    agentId: 'director-alpha',
    sessionId: 'session-a1',
    taskId: 'SF-142',
    taskTitle: 'Implement PKCE Authentication',
    mrId: 'MR-42',
    changedAt: '14 min ago',
    commitMessage: 'Add PKCE config options',
    reasoning: 'Added PKCE-related configuration fields (clientId, authorizeUrl, tokenUrl, redirectUri, scopes) to the application config.',
    changedLines: [
      { start: 7, end: 15, type: 'add' },
      { start: 23, end: 29, type: 'modify' },
    ],
  },
  {
    filePath: 'packages/smithy/src/api/routes.ts',
    agentName: 'Director Beta',
    agentId: 'director-beta',
    sessionId: 'session-b1',
    taskId: 'SF-155',
    taskTitle: 'Add Rate Limiting',
    mrId: 'MR-45',
    changedAt: '1 day ago',
    commitMessage: 'Add rate limiting middleware',
    reasoning: 'Applied rate limiting to all API routes as a security measure. Using a sliding window counter with configurable window size and max requests.',
    changedLines: [
      { start: 8, end: 8, type: 'add' },
    ],
  },
  {
    filePath: 'packages/smithy/src/api/middleware.ts',
    agentName: 'Director Beta',
    agentId: 'director-beta',
    sessionId: 'session-b1',
    taskId: 'SF-155',
    taskTitle: 'Add Rate Limiting',
    mrId: 'MR-45',
    changedAt: '1 day ago',
    commitMessage: 'Add rate limiting middleware',
    reasoning: 'Implemented sliding window rate limiting per IP address. Returns standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset) and 429 status when exceeded.',
    changedLines: [
      { start: 1, end: 54, type: 'add' },
    ],
  },
]

export const mockAgentSessions: AgentSession[] = [
  {
    sessionId: 'session-a1',
    agentName: 'Director Alpha',
    taskId: 'SF-142',
    taskTitle: 'Implement PKCE Authentication',
    mrId: 'MR-42',
    timestamp: '14 min ago',
    filesChanged: [
      { path: 'packages/smithy/src/auth/pkce.ts', additions: 77, deletions: 0 },
      { path: 'packages/smithy/src/auth/pkce-callback.ts', additions: 52, deletions: 0 },
      { path: 'packages/smithy/src/config.ts', additions: 9, deletions: 2 },
    ],
  },
  {
    sessionId: 'session-b1',
    agentName: 'Director Beta',
    taskId: 'SF-155',
    taskTitle: 'Add Rate Limiting',
    mrId: 'MR-45',
    timestamp: '1 day ago',
    filesChanged: [
      { path: 'packages/smithy/src/api/routes.ts', additions: 1, deletions: 0 },
      { path: 'packages/smithy/src/api/middleware.ts', additions: 54, deletions: 0 },
    ],
  },
]

// ── Helper: flatten file tree to path list ──

export function flattenFileTree(entries: EditorFileEntry[], result: EditorFileEntry[] = []): EditorFileEntry[] {
  for (const entry of entries) {
    result.push(entry)
    if (entry.children) {
      flattenFileTree(entry.children, result)
    }
  }
  return result
}

// ── Helper: find entry by path ──

export function findEntryByPath(entries: EditorFileEntry[], path: string): EditorFileEntry | undefined {
  for (const entry of entries) {
    if (entry.path === path) return entry
    if (entry.children) {
      const found = findEntryByPath(entry.children, path)
      if (found) return found
    }
  }
  return undefined
}

// ── Helper: get children of a folder path ──

export function getChildrenAtPath(entries: EditorFileEntry[], folderPath: string): EditorFileEntry[] {
  if (folderPath === '' || folderPath === '/') return entries
  const folder = findEntryByPath(entries, folderPath)
  return folder?.children || []
}
