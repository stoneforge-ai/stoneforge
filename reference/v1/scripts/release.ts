import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PackageInfo {
  name: string
  dir: string
  level: number
}

type BumpType = 'patch' | 'minor' | 'major'

interface CliArgs {
  bump: BumpType | undefined
  githubRelease: boolean
  dryRun: boolean
  tag: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dirname, '..')

const PACKAGES: PackageInfo[] = [
  // Level 0 — no internal deps
  { name: '@stoneforge/core', dir: 'packages/core', level: 0 },
  { name: '@stoneforge/ui', dir: 'packages/ui', level: 0 },
  // Level 1
  { name: '@stoneforge/storage', dir: 'packages/storage', level: 1 },
  // Level 2
  { name: '@stoneforge/quarry', dir: 'packages/quarry', level: 2 },
  // Level 3
  { name: '@stoneforge/shared-routes', dir: 'packages/shared-routes', level: 3 },
  { name: '@stoneforge/smithy', dir: 'packages/smithy', level: 3 },
]

const STONEFORGE_SCOPE = '@stoneforge/'

const DEP_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`

function step(n: number, total: number, msg: string) {
  console.log(`\n${bold(`[${n}/${total}]`)} ${msg}`)
}

function ok(msg: string) {
  console.log(`  ${green('✓')} ${msg}`)
}

function fail(msg: string): never {
  console.error(`  ${red('✗')} ${msg}`)
  process.exit(1)
}

function run(cmd: string, opts: { cwd?: string; dryRun?: boolean } = {}): string {
  if (opts.dryRun) {
    console.log(`  ${dim(`[dry-run] ${cmd}`)}`)
    return ''
  }
  return execSync(cmd, { cwd: opts.cwd ?? ROOT, encoding: 'utf-8', stdio: 'pipe' }).trim()
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writeJson(path: string, data: Record<string, any>) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

// ─── Version logic ───────────────────────────────────────────────────────────

function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = current.split('.').map(Number)
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

// ─── workspace:* replacement ─────────────────────────────────────────────────

function replaceWorkspaceProtocol(pkgJson: Record<string, any>, version: string) {
  for (const field of DEP_FIELDS) {
    const deps = pkgJson[field]
    if (!deps) continue
    for (const key of Object.keys(deps)) {
      if (key.startsWith(STONEFORGE_SCOPE) && deps[key] === 'workspace:*') {
        deps[key] = `^${version}`
      }
    }
  }
}

function restoreWorkspaceProtocol(pkgJson: Record<string, any>) {
  for (const field of DEP_FIELDS) {
    const deps = pkgJson[field]
    if (!deps) continue
    for (const key of Object.keys(deps)) {
      if (key.startsWith(STONEFORGE_SCOPE) && deps[key] !== 'workspace:*') {
        deps[key] = 'workspace:*'
      }
    }
  }
}

// ─── CLI parsing ─────────────────────────────────────────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let bump: BumpType | undefined
  let githubRelease = false
  let dryRun = false
  let tag = 'latest'

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--bump':
        bump = args[++i] as BumpType
        if (!['patch', 'minor', 'major'].includes(bump)) {
          fail(`Invalid bump type: ${bump}. Must be patch, minor, or major.`)
        }
        break
      case '--github-release':
        githubRelease = true
        break
      case '--dry-run':
        dryRun = true
        break
      case '--tag':
        tag = args[++i]
        if (!tag) fail('--tag requires a value')
        break
      default:
        fail(`Unknown argument: ${args[i]}`)
    }
  }

  return { bump, githubRelease, dryRun, tag }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs()
  const totalSteps = opts.githubRelease ? 8 : 7

  if (opts.dryRun) {
    console.log(bold('\n🏜️  DRY RUN — no changes will be made\n'))
  }

  // ── 1. Preflight ──────────────────────────────────────────────────────────

  step(1, totalSteps, 'Preflight checks...')

  const status = run('git status --porcelain')
  if (status) {
    fail('Git working tree is not clean. Commit or stash changes first.')
  }
  ok('Git working tree clean')

  try {
    const user = run('npm whoami')
    ok(`NPM authenticated as ${bold(user)}`)
  } catch {
    fail('Not authenticated with NPM. Run `npm login` first.')
  }

  if (opts.githubRelease) {
    try {
      run('gh --version')
      ok('GitHub CLI available')
    } catch {
      fail('GitHub CLI (gh) not found. Install it or remove --github-release.')
    }
  }

  // ── 2. Compute version ────────────────────────────────────────────────────

  const rootPkgPath = resolve(ROOT, 'package.json')
  const rootPkg = readJson(rootPkgPath)
  const currentVersion = rootPkg.version as string
  const newVersion = opts.bump ? bumpVersion(currentVersion, opts.bump) : currentVersion

  if (opts.bump) {
    step(2, totalSteps, `Bumping ${bold(currentVersion)} → ${bold(newVersion)} (${opts.bump})`)
  } else {
    step(2, totalSteps, `Releasing ${bold(currentVersion)} (no version bump)`)
  }

  // ── 3. Update versions ────────────────────────────────────────────────────

  step(3, totalSteps, 'Updating package versions...')

  if (opts.bump) {
    // Update root
    rootPkg.version = newVersion
    if (!opts.dryRun) writeJson(rootPkgPath, rootPkg)
    ok(`root ${currentVersion} → ${newVersion}`)
  }

  // Update each package
  for (const pkg of PACKAGES) {
    const pkgPath = resolve(ROOT, pkg.dir, 'package.json')
    const pkgJson = readJson(pkgPath)
    if (opts.bump) {
      pkgJson.version = newVersion
    }
    replaceWorkspaceProtocol(pkgJson, newVersion)
    if (!opts.dryRun) writeJson(pkgPath, pkgJson)
    ok(`${pkg.name} ${currentVersion} → ${newVersion}`)
  }

  // ── 4. Build ──────────────────────────────────────────────────────────────

  step(4, totalSteps, 'Building all packages...')

  if (opts.dryRun) {
    console.log(`  ${dim('[dry-run] pnpm run build')}`)
    console.log(`  ${dim('[dry-run] pnpm --filter @stoneforge/smithy-web run build:web')}`)
  } else {
    try {
      execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' })
      ok('Build succeeded')
    } catch {
      fail('Build failed. Fix errors before releasing.')
    }

    // Build the web UI and copy assets into packages/smithy/web/ so they
    // are included in the published @stoneforge/smithy package (used by `sf serve`).
    // This is separate from the standard `build` task because smithy-web's
    // `build` script only outputs to apps/smithy-web/dist/.
    try {
      execSync('pnpm --filter @stoneforge/smithy-web run build:web', { cwd: ROOT, stdio: 'inherit' })
      ok('Web UI built and copied to packages/smithy/web/')
    } catch {
      fail('Web UI build failed. Fix errors before releasing.')
    }
  }

  // ── 5. Publish ────────────────────────────────────────────────────────────

  step(5, totalSteps, 'Publishing to NPM...')

  const maxLevel = Math.max(...PACKAGES.map((p) => p.level))
  for (let level = 0; level <= maxLevel; level++) {
    const pkgsAtLevel = PACKAGES.filter((p) => p.level === level)
    for (const pkg of pkgsAtLevel) {
      const cwd = resolve(ROOT, pkg.dir)
      if (opts.dryRun) {
        run(`npm publish --dry-run --access public --tag ${opts.tag}`, { cwd })
        ok(`${pkg.name}@${newVersion} ${dim('(dry-run)')}`)
      } else {
        try {
          run(`npm publish --access public --tag ${opts.tag}`, { cwd })
          ok(`${pkg.name}@${newVersion} published`)
        } catch (e) {
          fail(`Failed to publish ${pkg.name}: ${e}`)
        }
      }
    }
  }

  // ── 6. Restore workspace:* ────────────────────────────────────────────────

  step(6, totalSteps, 'Restoring workspace protocol...')

  for (const pkg of PACKAGES) {
    const pkgPath = resolve(ROOT, pkg.dir, 'package.json')
    const pkgJson = readJson(pkgPath)
    restoreWorkspaceProtocol(pkgJson)
    if (!opts.dryRun) writeJson(pkgPath, pkgJson)
  }
  ok('All workspace:* references restored')

  // ── 7. Git commit & tag ───────────────────────────────────────────────────

  step(7, totalSteps, 'Git commit & tag...')

  if (opts.bump) {
    const filesToAdd = [
      'package.json',
      ...PACKAGES.map((p) => `${p.dir}/package.json`),
    ]

    if (opts.dryRun) {
      console.log(`  ${dim(`[dry-run] git add ${filesToAdd.join(' ')}`)}`)
      console.log(`  ${dim(`[dry-run] git commit -m "release: v${newVersion}"`)}`)
      console.log(`  ${dim(`[dry-run] git tag v${newVersion}`)}`)
      console.log(`  ${dim('[dry-run] git push && git push --tags')}`)
    } else {
      run(`git add ${filesToAdd.join(' ')}`)
      run(`git commit -m "release: v${newVersion}"`)
      run(`git tag v${newVersion}`)
      run('git push && git push --tags')
      ok(`Committed and tagged ${bold(`v${newVersion}`)}`)
    }
  } else {
    if (opts.dryRun) {
      console.log(`  ${dim(`[dry-run] git tag v${newVersion}`)}`)
      console.log(`  ${dim('[dry-run] git push --tags')}`)
    } else {
      run(`git tag v${newVersion}`)
      run('git push --tags')
      ok(`Tagged ${bold(`v${newVersion}`)}`)
    }
  }

  // ── 8. GitHub release ─────────────────────────────────────────────────────

  if (opts.githubRelease) {
    step(8, totalSteps, 'Creating GitHub release...')

    if (opts.dryRun) {
      console.log(`  ${dim(`[dry-run] gh release create v${newVersion} --generate-notes --title "v${newVersion}"`)}`)
    } else {
      try {
        run(`gh release create v${newVersion} --generate-notes --title "v${newVersion}"`)
        ok(`GitHub release v${newVersion} created`)
      } catch (e) {
        fail(`Failed to create GitHub release: ${e}`)
      }
    }
  }

  console.log(`\n${green(bold('Done!'))} Released ${bold(`v${newVersion}`)} 🎉\n`)
}

main()
