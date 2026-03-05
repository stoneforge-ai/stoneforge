---
title: "Introducing Stoneforge: Open-Source Orchestration for AI Coding Agents"
published: true
description: "Run multiple AI coding agents in parallel without the coordination tax. Automatic dispatch, merging, and recovery. Works with Claude Code, Codex, and OpenCode."
tags: multiagent, opensource, ai, coding
canonical_url: https://stoneforge.ai/blog/introducing-stoneforge/
cover_image: https://stoneforge.ai/blog/images/stoneforge.png
---

**TL;DR:** Stoneforge is an open-source platform that orchestrates multiple AI coding agents in parallel. A Director plans tasks, workers execute in isolated git worktrees, stewards test and merge, and a daemon keeps it all moving. Works with Claude Code, Codex, and OpenCode. [GitHub](https://github.com/stoneforge-ai/stoneforge)

---

It's Tuesday night. You have four terminals arranged across two monitors. In the first, Claude is implementing the payment integration you described twenty minutes ago. In the second, another instance is building the admin dashboard. The third is supposed to be writing API tests, but it stalled ten minutes ago and you haven't checked why yet. The fourth just finished its task, you think, but you forgot to tell it to commit and push before you closed the session.

You open a fifth terminal to deal with the fourth's orphaned work. While you're there, you notice that the payment agent and the test agent have both modified the same utility file. Different changes. Same file. Neither knows about the other. You're about to have a merge conflict on code that you didn't write, in a file you haven't looked at today.

You alt-tab back to the admin dashboard agent. It's asking a question about the data model that you answered in the payment agent's session, but there's no way for that context to travel between them. You re-explain it. You check the payment agent. It hit the context window limit. The harness auto-compacted the conversation, and now it's making choices that contradict the architecture you discussed half an hour ago. You can see the quality degrading in real time.

Two hours in. You haven't written a line of code. You've been managing context windows, preventing file conflicts, re-explaining decisions, recovering orphaned work, and alt-tabbing between sessions until your brain feels like it's running its own garbage collection. You've never worked so hard while writing none of the code.

This is the coordination tax. And it scales with every agent you add.

Stoneforge takes its name from a fantasy world created to think about this problem. In that world, someone discovers a furnace hot enough to make stone malleable, shapeable by hand instead of chisel. A revolutionary technology. But when the first teams of artisans try to forge stone together, they fail catastrophically. Multiple artisans at the same forge, no defined processes, no way to prevent two people from shaping the same block in incompatible ways. One artisan shapes an archway to the wrong curvature. The fracture is small, barely visible, but forged stone carries stress differently than carved stone. The crack propagates through the join, into the foundation, across the entire structure. They call the wreckage *the Shattering* — proof that the technology had outpaced the processes needed to wield it.

A single bad merge from one agent can ripple through your codebase the same way.

<figure>
<img alt="The Shattering — multiple artisans working the same stone block without coordination, conflicting shapes, cracked joins, tools scattered" src="https://stoneforge.ai/blog/images/the-shattering.png?v=2" loading="lazy" />
<figcaption>Before the stoneforge: no isolation, no coordination, no shared records. Every agent shaping the same code at the same time.</figcaption>
</figure>

The Shattering ends when someone builds infrastructure that makes collaboration automatic: a system of shared records, isolated workbenches, and a coordination mechanism that keeps artisans productive without requiring them to watch each other. That system is the stoneforge.

The rest of this post explains how Stoneforge works, organized around the problems above.

<figure>
<img alt="The coordinated stoneforge — Director at the planning table, Workers at separate isolated benches, Steward at the inspection station, the Pulse mechanism on the wall" src="https://stoneforge.ai/blog/images/stoneforge.png?v=2" loading="lazy" />
<figcaption>The Great Forge of Mount Verath at peak operation. Director, Workers, Steward, and the Pulse — the four roles that turn chaos into coordination.</figcaption>
</figure>

## How Stoneforge compares to Claude Code Agent Teams

Claude Code now has an experimental [agent teams](https://docs.anthropic.com/en/docs/claude-code/agent-teams) feature. The two projects solve similar problems but make very different tradeoffs.

Agent teams stores state in ephemeral file-based task lists. Stoneforge event-sources everything to SQLite + JSONL, so state survives restarts and you get a full audit trail. Agent teams is terminal-only; Stoneforge gives you a web dashboard with live agent output, kanban boards, and metrics. For branch isolation, agent teams tells you to "avoid editing the same file." Stoneforge gives each worker its own git worktree automatically. Merging in agent teams is manual. In Stoneforge, stewards run tests and squash-merge without you touching anything.

Stoneforge also supports multiple providers (Claude Code, OpenCode, OpenAI Codex) and lets you split agents across multiple Claude MAX/Pro plans to get around rate limits. Agent teams is Claude-only.

## You describe what you want. Agents build it in parallel.

You open the Director Panel in the Stoneforge dashboard and type: *"Build me an authentication system with OAuth, session management, and a login UI."*

That's it.

The Director is a persistent agent session. It doesn't write code. It plans. It receives your goal and decomposes it into discrete tasks with priorities, descriptions, and dependency ordering:

1. Design the auth API schema (priority 1, no dependencies)
2. Implement OAuth endpoints (priority 2, blocked by task 1)
3. Build the login UI (priority 2, blocked by task 1)
4. Write integration tests (priority 3, blocked by tasks 2 and 3)

Each task gets a rich description: not just "implement OAuth," but enough context for a worker agent to understand the approach, the constraints, and the reasoning behind this decomposition. The Director writes each description so that a worker can start without needing to ask you what you meant.

These tasks start in a **draft plan**. Draft plans are invisible to the dispatch system. This prevents a race condition where the daemon assigns task 2 to a worker before the Director finishes wiring the dependency that blocks it on task 1. Once the Director finishes setting priorities and dependencies, it activates the plan. Tasks become dispatchable.

A background process called the **dispatch daemon** polls every five seconds. Each cycle, it scans for unblocked tasks that need workers. It finds "Design the auth API schema" (priority 1, no blockers) and assigns it to an idle worker. The worker spins up in its own isolated environment and starts coding.

When task 1 completes, tasks 2 and 3 unblock automatically. The daemon assigns them to two different workers in the next cycle. They execute in parallel. Neither knows about the other, and neither needs to.

<figure>
<img alt="Orchestration flow — from your goal through the Director, task pool, parallel workers in worktrees, to the Merge Steward" src="https://stoneforge.ai/blog/images/workflow.png?v=2" loading="lazy" />
<figcaption>Your goal flows through the Director into a prioritized task pool. The dispatch daemon assigns ready tasks to idle workers in isolated worktrees. Stewards merge the results.</figcaption>
</figure>

If you have thirty tasks you need done and don't want to fully specify each one up front, Stoneforge supports **backlog processing**. Dump tasks quickly (one-line descriptions are fine) and send them to the Director in batches. The Director enriches each one with full descriptions, assigns priorities, and wires dependency graphs. You provide the intent; the Director handles decomposition.

Not everything fits into the automated dispatch pipeline. **Persistent workers** can be spun up for one-off, interactive sessions that you drive directly. They stay at their bench across multiple tasks, building long-term familiarity with the project's codebase. You control what they work on. They're useful for exploratory work, debugging, or anything where you want to stay hands-on.

## Nobody touches each other's code

Without Stoneforge, two agents working on the same repository means two agents can edit the same file at the same time. One finishes, commits. The other finishes, tries to commit, and hits a conflict. Or worse: the second agent commits without realizing the file changed, silently overwriting the other's work. You've lost work this way.

Some developers handle this by carefully partitioning their codebase: "Agent 1 works on the backend, Agent 2 works on the frontend, and never shall they overlap." This works until an agent touches a shared utility, a config file, a type definition, or a package manifest. The overlap surfaces are larger than they appear.

In Stoneforge, every worker gets its own **git worktree**. A worktree is a full checkout of your repository on a separate branch, in a separate directory, with its own working tree. The worker edits files, runs commands, installs dependencies, all in its own space. Other workers can't see its changes until they're merged.

The worktree path follows a deterministic pattern: `agent/{worker-name}/{task-id}-{slug}`. Worker `e-worker-1` assigned to task `el-3a8f` with title "Implement login" gets the worktree at `.claude/worktrees/agent/e-worker-1/el-3a8f-implement-login`. The paths are predictable and easy to debug — you can `cd` into any worker's directory and see exactly what it's doing.

### Why not containers?

Docker containers provide stronger isolation, but at a cost that doesn't make sense for coding agents. Containers take seconds to spin up. Worktrees take milliseconds. Containers need Docker installed and running. Worktrees need git, which you already have. Containers duplicate `node_modules`, build caches, and the entire filesystem. Worktrees share them.

### Why not separate remote instances?

Some teams spin up VPS instances, cloud sandboxes, or remote dev environments for each agent. This works, but the overhead compounds. You're paying for provisioning, managing SSH keys, syncing filesystems, and dealing with network latency on every agent interaction. Every file read, every command execution, every git operation goes over the network. And you're paying cloud costs for each instance, cleaning them up when agents finish, and troubleshooting sync issues when local and remote state diverge.

Worktrees are local and create instantly. Spin up a dozen without provisioning anything. Agents share the same filesystem and can reference the same project artifacts without sync delays.

### Why worktrees, specifically

The conflict surface for coding agents is git, not the operating system. Two agents can safely share a machine, a filesystem, even `node_modules`, as long as they're on different branches in different directories. That's what worktrees give you: git-level isolation without OS-level overhead.

<figure>
<img alt="Three separate benches around a shared quarry — each artisan shapes their own copy of the source stone independently" src="https://stoneforge.ai/blog/images/workers.png?v=2" loading="lazy" />
<figcaption>Each worker operates in its own git worktree — a separate copy of the repo on a separate branch. They share the source stone but never interfere with each other's work.</figcaption>
</figure>

## When an agent fails, the next one picks up where it left off

Your worker is implementing OAuth. It's been going for forty minutes. The context window is filling up. Somewhere around the 70% mark, the harness auto-compacts: it summarizes prior conversation history into a compressed representation, freeing up token space.

The compression threw away the nuanced discussion about why you chose PKCE over implicit flow. It lost the edge case the agent discovered where refresh tokens expire during a database migration. It dropped the architectural decision about separating the token store from the session store. The agent keeps running, but its decisions start drifting. It re-introduces a pattern you explicitly discussed and rejected. It asks a question you already answered twenty minutes ago. It's operating on a lobotomized version of the conversation, and it's still consuming a significant chunk of the context window just storing the compressed summary, leaving less room for new reasoning.

This is how most setups work. Agents degrade silently until output quality drops below usefulness, and you end up starting a new session from scratch, reconstructing the context by hand.

### The Passing of the Chisel

In Stoneforge, workers hand off cleanly *before* degradation begins. When a worker approaches its context limit, it performs a structured handoff:

1. **Commit and push** whatever it has. The code is preserved on its branch.
2. **Write handoff notes** to the task: what was completed, what's remaining, blockers encountered, and decisions made along the way.
3. **Preserve the branch and worktree** path in the task's metadata.
4. **Unassign itself** and exit.

The dispatch daemon assigns the task to the next available worker. That worker spawns fresh: full context window, zero compaction debt. It resumes in the same directory, on the same branch, with all previous commits visible and the handoff notes waiting.

The next worker picks up with all the code the previous worker wrote and a structured summary of their progress and decisions. Context accumulates across handoffs.

<figure>
<img alt="The Passing of the Chisel — one artisan steps away from a half-finished stone, handoff note secured on the bench, another artisan approaching" src="https://stoneforge.ai/blog/images/passing-chisel.png?v=2" loading="lazy" />
<figcaption>The Passing of the Chisel. When a worker approaches its context limit, it commits its progress, writes handoff notes, and steps away. The next worker picks up with a fresh context window and full history.</figcaption>
</figure>

Handoff history builds up on each task as an array. Each entry records the session ID, handoff message, branch name, and timestamp. If a task goes through three workers, you can trace exactly what each one did, why each one stopped, and where each one left off.

### Resuming a conversation

Sometimes a handoff note isn't clear enough. Maybe the previous worker mentioned a "CORS configuration issue" but didn't explain what they tried. In Stoneforge, the next worker (or you) can **resume the previous agent's session** to ask clarifying questions. You're having a conversation with the agent that did the work, in the context where it did the work. This turns an ambiguous handoff into a direct transfer of understanding.

### Recovery from the unexpected

Handoffs are the clean path. But agents also fail in messier ways.

**Server restarts.** Your machine reboots, or you restart the Stoneforge server. Workers mid-task become orphaned: assigned tasks with no active session. On startup, the daemon's first action is orphan recovery. For each orphaned worker, it attempts to resume the previous session using the saved provider session ID. If that works, the worker continues where it was. If resume fails, the daemon spawns a fresh session on the same branch and worktree with full task context and handoff notes. After three failed resume attempts, the task stays in review status as a safety valve. It won't loop forever.

**Rate limits.** When a worker hits an API rate limit, the daemon automatically puts it on cooldown. During cooldown, the worker is skipped during dispatch, so no spawn attempts are wasted. Workers on other provider plans keep going. The task stays in the queue, ready for the next available worker.

**Follow development:** [@notadamking on X](https://x.com/notadamking)

## Code ships to main without you touching anything

A worker finishes its task. It commits, pushes its branch, and marks the task as ready for review. In most multi-agent setups, this is where you get pulled back in: reviewing the diff, running tests, resolving conflicts, merging to main. The merge bottleneck is where parallel workflows collapse into sequential human work.

Stoneforge's **merge steward** handles this end-to-end.

The merge steward runs in a temporary detached worktree, a separate checkout at your target branch. It never touches the main repository's working directory or HEAD. The process:

1. Create a temporary worktree checked out at `origin/main` (or your configured target branch)
2. Squash-merge the worker's branch into the temporary worktree
3. Merge conflict? The steward resolves simple conflicts itself. If the conflict requires code restructuring, it creates a fix task for the next available worker
4. Run the configured test command
5. Tests pass? Push the merged commit to the target branch and clean up
6. Tests fail? Create a fix task with the test failure output attached

If tests pass, the code ships and the branch gets deleted. You didn't touch anything.

<figure>
<img alt="The merge flow — full branch lifecycle from worker commit through steward inspection to squash-merge, depicted as the Steward's workbench process" src="https://stoneforge.ai/blog/images/merge-flow.png?v=2" loading="lazy" />
<figcaption>A worker's branch moves through the steward's inspection sequence: commit, temporary worktree checkout, squash-merge, test, and either ship to main or create a fix task and re-queue.</figcaption>
</figure>

### Concurrent merges without locking

Multiple merge stewards can process different branches simultaneously. The temporary worktree approach means the main repository is never locked.

An optimistic locking mechanism prevents two stewards from claiming the same task. Status transitions follow a locked sequence: `pending → testing → merging → merged`. If a steward tries to claim a task another steward already took, it receives a `MergeStatusConflictError` and backs off. No coordination needed between stewards. The status system handles contention.

### Configurable merge target

The target branch is configurable. You don't have to merge directly to `main`.

Configure the merge steward to target a `staging` branch. Let agents merge freely there, accumulating changes throughout the day. Then you review groups of changes together and promote to `main` when you're satisfied. This gives you a natural review gate at whatever granularity makes sense for your project, without slowing down individual agent merges.

You can also set **GitHub as the merge provider**. Instead of merging locally, the steward pushes the worker's branch and opens a Pull Request. If your repo has a CI/CD pipeline configured, it runs automatically against the PR. This lets you plug Stoneforge into your team's existing review and deployment infrastructure. Agent work flows through the same PR process as human work.

Beyond the merge provider, you can configure the merge strategy (squash or regular), auto-push behavior, branch deletion after merge, and the test command with its timeout. Defaults: squash-merge, auto-push, auto-delete, `npm test` with a five-minute timeout.

## What the daemon does

Everything described so far (the Director creating plans, workers picking up tasks, the merge steward processing completed work) is coordinated by a single background process: the **dispatch daemon**.

Its two most important jobs:

**It keeps agents working.** Every five seconds, the daemon scans for idle workers and unblocked tasks. It matches them by priority. Idle workers pick up available tasks within seconds, highest priority first.

Priority isn't just the number on the task. The daemon walks up the dependency graph. A low-priority task that blocks five downstream tasks gets bumped above a high-priority task that blocks nothing. The graph traversal goes up to ten levels deep and considers the most urgent priority across all dependents. This means the system naturally prioritizes work that unblocks the most progress, without you having to manually adjust priorities.

**It keeps code shipping.** Every cycle, the daemon checks for completed tasks awaiting review and dispatches merge stewards to process them. Code doesn't sit in a branch waiting for you to notice it's done.

### The full cycle

Dispatch is the headline, but the daemon does more. Each five-second cycle runs seven phases in strict sequence:

1. **Orphan recovery:** Check for workers assigned to tasks without active sessions. Attempt to resume or re-spawn.
2. **Message routing:** Forward pending messages to agents based on their role and session state.
3. **Steward scheduling:** Check cron-scheduled and event-triggered steward workflows. Fire any that are due.
4. **Workflow advancement:** Check running workflows for completed steps and advance them.
5. **Reconciliation:** Catch tasks in broken states: work marked complete but never merged, tasks closed but still flagged as pending.
6. **Worker dispatch:** Scan for unblocked, unassigned tasks with the highest effective priority. Match them to idle workers.
7. **Merge steward dispatch:** Find completed tasks in review status. Assign merge stewards.

Strict sequencing matters: orphans are recovered before new work is dispatched. Messages are routed before stewards fire. Reconciliation runs before dispatch so no broken task accidentally gets assigned to a worker. Each phase's output feeds the next.

<figure>
<img alt="The dispatch daemon's seven-phase polling cycle — a circular clockwork mechanism showing all phases from orphan recovery through worker dispatch and merge steward dispatch to reconciliation" src="https://stoneforge.ai/blog/images/the-pulse.png?v=2" loading="lazy" />
<figcaption>The Pulse's seven-phase cycle runs every five seconds. Worker dispatch and merge steward dispatch are the two active-work phases; the others are housekeeping that keeps the system healthy.</figcaption>
</figure>

### Agent pools

When running many agents, you may want to limit concurrency to manage API costs, prevent resource exhaustion, or split agents across provider plans.

A pool has a `maxSize` and a list of `agentTypes` that filter which agents count against it. You can filter by role, worker mode, steward focus, and provider. Pools are independent; each pool manages its own capacity. If one pool is full, agents matching other pools with available capacity can still spawn.

Each agent type within a pool can have its own `maxSize` and **priority**. For example, a pool limited to 5 total agents might allow up to 3 merge stewards and up to 4 workers. If merge stewards are set to a higher priority than workers, the daemon will spawn a merge steward before a new worker when the pool is near capacity, ensuring completed code gets merged before new work begins.

Directors are never pool-managed. They're persistent sessions and don't compete for worker slots.

## Nothing gets lost

Today, managing knowledge across agent sessions is manual labor. You remind agents to save what they learned in markdown files. You reorganize those files as the project evolves. You carefully select which documents to feed into each new session to build the right context window. Every time you start a new agent, you're reconstructing state from scattered files, hoping you didn't forget the one document that contains a critical decision from three days ago.

And when you forget? The agent makes decisions without context. It re-implements something that already exists. It contradicts an architectural choice it never knew about. You lose an hour debugging a problem that shouldn't have happened.

Stoneforge automates all of this. Every task, document, message, dependency, and agent action is automatically recorded in a persistent, structured data layer called **the Quarry**. Agents don't need reminders to save their work, and new sessions don't need hand-curated context. The system captures everything automatically and surfaces it through the Documentation Directory, searchable task descriptions, and the knowledge base.

### Two databases, one source of truth

Stoneforge stores everything twice. Both layers are necessary.

**JSONL is the source of truth.** Every state change appends an immutable record to `.stoneforge/sync/elements.jsonl`. These files are text: line-based, human-readable. You can commit them to git, diff them, merge them across branches, and read them with any text editor.

```jsonl
{"type":"element","id":"el-abc123","elementType":"task","title":"Implement OAuth","status":"closed","priority":1,"assignee":"worker-1","createdBy":"director-1"}
{"type":"element","id":"el-def456","elementType":"task","title":"Build login UI","status":"in_progress","priority":2,"assignee":"worker-2","createdBy":"director-1"}
{"type":"element","id":"el-ghi789","elementType":"task","title":"Write integration tests","status":"open","priority":3,"createdBy":"director-1"}
```

Three tasks, three lines. Each element is stored once with its latest state — human-readable, mergeable across git branches, and recoverable from any point in your git history.

**SQLite is the cache.** It gives you indexed queries, FTS5 full-text search, the blocked cache, and sub-millisecond lookups. But it's disposable. Delete the `.db` file and rebuild from JSONL in seconds with `sf sync import`.

Why not just SQLite? Binary files don't diff. They don't merge across branches. If they corrupt, you lose everything. Why not just JSONL? Scanning a flat file for one task by ID is slow at scale. Full-text search needs indexes. Dependency graph traversal needs joins.

<figure>
<img alt="The dual record system — permanent wall-carvings deep in the quarry (JSONL) and expendable clay tablets at the entrance (SQLite)" src="https://stoneforge.ai/blog/images/dual-records.png?v=2" loading="lazy" />
<figcaption>JSONL files are the permanent record — append-only, human-readable, git-mergeable. SQLite is the expendable cache, rebuilt from JSONL on demand.</figcaption>
</figure>

### Event sourcing

Every mutation is an immutable record. Not just the current state, but the complete history of how every element arrived at its current state.

Need to debug a task stuck in a strange state? Tell the Director to look into it. The Director queries the event log, traces every action taken on that task (who was assigned, when they handed off, what they reported, which steward processed it) and gives you a diagnosis. You don't have to piece together the timeline yourself.

The event log is also accessible directly via `sf task events el-abc123` if you want to inspect it yourself. Worker 1 was assigned at 10:05. It handed off at 10:45 with notes about a CORS issue. Worker 2 picked it up at 10:50. It completed at 11:30. The merge steward squash-merged at 11:32. Tests passed. Every step attributed and timestamped.

The event log doubles as a diagnostic tool. When something goes wrong in a multi-agent system, you need to know what happened, and the event log has the full record.

Agent sessions themselves are stored in SQLite and attached to their tasks. The Director or a human operator can inspect exactly what an agent did during a session: the reasoning, the decisions, the commands it ran. Not just what changed, but *why* it changed.

### Conflict resolution

When JSONL files merge across git branches, conflicts resolve deterministically. Content hash comparison (SHA256, excluding timestamps and sync metadata) detects identical changes. Tags always merge as a union, so you never lose tags during sync. Closed status is sticky: if one side closed a task, the closed version wins regardless of timestamp. For dependencies, removal wins: if one side deleted a dependency, it stays deleted.

### The blocked cache

Checking "is this task blocked?" by walking the dependency graph every five seconds would be slow. Stoneforge keeps a **blocked cache**, a materialized view in SQLite that stores every blocked element, what's blocking it, and its previous status. When a dependency is added or a blocker closes, the cache recomputes. Invalidation cascades through parent-child hierarchies so transitive blocking stays correct. Cycle detection (BFS, up to 100 levels) runs before adding any blocking dependency.

### Elements

Everything in Stoneforge is an **element**, the fundamental unit the system tracks. Tasks, documents, messages, plans, workflows, playbooks, libraries, dependencies, entities, teams. All share the same base fields (ID, type, timestamps, tags, metadata) and all flow through the same event-sourced storage layer. The same sync, conflict resolution, and audit trail apply to every element type.

## Your agents can talk to each other

Agent 2 discovers a bug in the authentication module while implementing the dashboard. That bug affects Agent 3's work on the API tests. How does this information travel?

In most setups: through you. Agent 2 mentions the bug in its terminal output. You read it, context-switch to Agent 3's terminal, explain the issue. You are the human message bus between your agents.

Stoneforge has a **channel-based messaging system** that lets agents communicate directly. Workers report issues to the Director. The Director checks for duplicates before creating tasks. Stewards escalate problems they can't fix. Information flows where it needs to go without routing through your attention.

### Channels

Two types. **Direct channels** are one-to-one. The name is deterministic (sorted entity IDs joined with a colon) so the same pair always resolves to the same channel. Membership is locked. **Group channels** support multiple members with configurable visibility (public or private) and join policy (open, invite-only, or request-based). Moderators control membership.

For example, the Director might create a group channel called `auth-implementation` and add the two workers building OAuth and the login UI, plus you. Worker 1 posts that it chose PKCE over implicit flow and explains why. Worker 2 reads that and adjusts its token handling accordingly. You chime in that the refresh token lifetime should be 7 days, not 30. Both workers see it. The decision is captured in a channel that anyone (agent or human) can reference later.

### Immutable messages

Messages cannot be edited or deleted. Any attempt throws a `MessageImmutableError`.

This isn't arbitrary strictness. An agent might read a message, act on its contents, and then the message gets edited. From the agent's perspective, the edit never happened. It already made decisions based on the original text. Immutability guarantees that what an agent read is what was said. The record is reliable.

### Messages as searchable knowledge

Message content is stored as a separate Document element via `contentRef`. This means message content appears in full-text search results. When you search for a past discussion or decision, like searching Slack for "why did we choose Postgres over MySQL?", message conversations surface alongside documents and task descriptions. Discussions become indexed, searchable knowledge.

Threading via `threadId` keeps conversations organized. Attachments support up to 100 Document references per message.

### Inbox

Each agent has an inbox tracking unread messages with three source types: `direct`, `mention`, and `thread_reply`. Items progress through unread → read → archived. You (the human operator) have an inbox too. When agents need human input, their messages land in your inbox for human-in-the-loop decisions.

### Smart message routing

The daemon routes messages based on each agent's role and current session state.

**Busy ephemeral workers** don't get interrupted. Non-dispatch messages stay unread in their inbox. Focused work shouldn't be broken by a message that can wait. When the worker finishes its task and goes idle, the daemon spawns a **triage session**: it groups unread messages by channel, picks one, creates a temporary worktree, and spawns the agent with a triage prompt listing all pending messages. The agent can respond, create tasks, escalate to the Director, or acknowledge. One channel per session. Remaining channels are handled in subsequent poll cycles.

**Persistent workers and Directors** with active sessions receive messages forwarded directly as user input, but only after two minutes of inactivity from the human operator. If you're actively typing or giving instructions, messages queue up and wait. This prevents agent messages from interrupting your flow mid-thought. Once you pause, queued messages are delivered. A duplicate guard prevents double-forwarding.

<figure>
<img alt="Message routing — how the dispatch daemon routes messages differently for busy workers, idle workers, persistent workers, and Directors" src="https://stoneforge.ai/blog/images/message-routing.png?v=2" loading="lazy" />
<figcaption>Messages route differently based on each agent's role and session state. Busy workers aren't interrupted. Idle workers get triage sessions. Persistent workers and Directors receive messages directly.</figcaption>
</figure>

## A knowledge base that agents actually use

You write a specification document. An agent implements half of it and doesn't update the spec. The next agent reads the stale spec and re-implements what was already built. You spend thirty minutes figuring out what happened, then another twenty updating the spec yourself. The specification was supposed to save time. Instead it created a coordination failure because nobody enforced the discipline of keeping it current.

Stoneforge solves this with a knowledge base that agents are required to read before starting work and update before stepping away. The discipline is built into the system.

### The Documentation Directory

Every agent, when it starts a session, reads the **Documentation Directory**, a master index of all project knowledge. Specifications, decision logs, technique references, tutorials, runbooks, changelogs. The Directory tells the agent what knowledge exists and where to find it. Agents search for anything relevant to their current task before writing code.

<figure>
<img alt="The guild archive — stone shelves of scrolls organized into labeled libraries, an artisan consulting the Documentation Directory at a reading desk" src="https://stoneforge.ai/blog/images/guild-archive.png?v=2" loading="lazy" />
<figcaption>Every agent reads the Documentation Directory before starting work. Specifications, decision logs, and references are indexed and searchable — knowledge that accumulates instead of scattering across terminals.</figcaption>
</figure>

Documents have categories (spec, prd, decision-log, tutorial, reference, runbook, and more), content types (text, markdown, JSON), and immutability flags that can lock a document against further edits when it shouldn't change.

### Context that accumulates

Tasks don't store descriptions inline. They reference a Document via `descriptionRef`. This is the same pattern messages use with `contentRef`, and for the same reason: task descriptions become part of the codebase-wide knowledge graph, searchable and indexed alongside every other document. When an agent searches for "OAuth implementation" or "CORS configuration," it finds relevant task descriptions, message conversations, and specification documents in the same results.

Task descriptions can be rich markdown, any length, and versioned separately from the task itself. This pattern pays off during handoffs. When a worker hands off, handoff notes append to this description Document. The next worker doesn't just get a task title. It gets the original specification plus every accumulated observation from every worker that preceded it. Context grows with the task.

### Versioning

Every document update creates a new version linked to its predecessor. The chain can be walked backward to any previous version. View the full history with `sf document history <id>`, see a specific version with `sf document show <id> --doc-version 2`, or roll back by creating a new version with old content. Rolling back doesn't erase history; it creates version N+1. You always know how the project's understanding evolved.

### Libraries

Documents are organized into libraries through parent-child dependencies. A library can hold documents and sub-libraries. Documents can belong to multiple libraries. Cycle detection prevents circular containment. Full library paths resolve naturally: `documentation/api-reference/authentication`.

### Search

Two modes.

**Full-text search** uses SQLite FTS5 with Porter stemming and Unicode support. Results rank by BM25 relevance. An adaptive top-K filter uses elbow detection on score gaps to find the natural quality cutoff, so you get the relevant results without an arbitrary limit.

**Semantic search** is optional. Enable it for vector embedding-based similarity search. When both modes are active, hybrid search combines rankings using Reciprocal Rank Fusion (k=60). You get both keyword precision and semantic similarity in the same query.

### Docs stewards

Documentation left untended decays. File paths in docs stop matching real paths. Internal links break. CLI commands drift from the actual command surface. Types described in docs don't match the source code.

Docs stewards patrol for this automatically. They run six verification categories in parallel: file paths, internal links, exports, CLI commands, type fields, and API methods. When they find problems, they create a worktree, fix the docs, commit, and merge back. The documentation improves in accuracy over time instead of degrading.

### Blending with your organization's knowledge

Stoneforge documents sync bidirectionally with **Notion**, **Obsidian** (via local folder sync), and **local markdown folders**. Documents created by agents flow into your organization's existing knowledge base. Your team's Notion workspace stays current because agents update the same docs. Your agents get access to organizational knowledge they'd otherwise never see: product specs, design decisions, architectural guidelines that live outside the codebase.

## The quality gates you don't have to run

You've seen two steward types already: **merge stewards** handle code integration, and **docs stewards** handle documentation accuracy. Stoneforge runs two more.

### Recovery stewards

Tasks get stuck. A worker was assigned but its session died without performing a handoff. A task was closed but never merged. A task has been "in progress" with no activity for hours. Recovery stewards diagnose these states and take action: restart the session, create a recovery task for the next worker, or roll back the task to an assignable state.

### Custom stewards

Register a steward with `--focus custom`, attach a playbook, and configure triggers. The steward runs your playbook when triggered. Some examples of what this enables:

**Daily task digest.** A cron-triggered steward runs every morning, summarizes progress across all active plans, identifies blocked work, and posts a digest to a group channel or your inbox.

**Post-task CI/CD.** An event-triggered steward fires on `task_closed`, runs your deployment pipeline, and creates a rollback task if the deploy fails.

**Code quality audit.** A steward that scans recently merged code for patterns you care about (test coverage gaps, outdated dependencies, security concerns) and creates prioritized tasks for anything that needs attention.

**Dependency update monitor.** A steward that periodically checks for outdated packages and creates upgrade tasks, ready for the next idle worker to pick up. Dependencies get updated as part of your normal work queue instead of piling up as unreviewed PRs.

I'm building toward a **workflow marketplace** where Stoneforge users can share and monetize their custom playbooks. A deployment pipeline that took you a week to perfect becomes a one-click install for the next team. The best workflows surface through community use, and creators get paid when others adopt them.

### Triggers

The trigger system supports both **cron triggers** (standard five-field expressions like `0 3 * * *` for 3 AM daily, or `*/5 * * * *` for every five minutes) and **event triggers** (fire on specific system events with filterable conditions running in a strict sandbox). A steward triggered on `task_closed` with condition `task.tags.includes('needs-deploy')` only fires for tasks with that tag.

Steward sessions have safety guardrails. An idle timeout (default two minutes) kills stewards that stop producing output. A max duration timeout (default thirty minutes) stops runaway sessions. The scheduler prevents overlapping runs: if a cron-triggered steward is still executing when the next cron fires, it skips.

<figure>
<img alt="The Four Stewards — an infographic showing four specialized inspection niches, each with a distinct steward archetype and their tools of the trade" src="https://stoneforge.ai/blog/images/four-stewards.png?v=2" loading="lazy" />
<figcaption>Four steward types run quality gates automatically: merge stewards integrate code, docs stewards verify accuracy, recovery stewards handle stuck tasks, and custom stewards run your playbooks.</figcaption>
</figure>

## Configuration and providers

Every team's workflow is different. Stoneforge is configurable at every layer.

### Providers

Your Director might work best on Claude. Your workers might be cheaper on OpenAI Codex. Your docs steward might run on OpenCode. Mix them.

Three providers are built in:

- **Claude Code** (default): Headless sessions via `@anthropic-ai/claude-agent-sdk`. Interactive sessions via node-pty.
- **OpenCode**: Headless via `@opencode-ai/sdk`. Interactive via CLI.
- **OpenAI Codex**: Headless via JSON-RPC over stdio. Interactive via Codex CLI.

Each provider handles its own authentication. Stoneforge doesn't store API keys. Set the provider per agent at registration (`--provider opencode`) or per session.

Models are configurable per agent or per provider. Your Director can run on Claude Opus for stronger planning and reasoning, while workers use Claude Sonnet for faster, cheaper execution. Your merge stewards can run on GPT Codex while your docs stewards use the latest GLM model. Match the model to the job. Use the most capable model where it matters and optimize for cost everywhere else.

<figure>
<img alt="The Provider's Compact — three artisans from different traditions working side by side, distinct tools but shared infrastructure and compatible output" src="https://stoneforge.ai/blog/images/providers-compact.png?v=2" loading="lazy" />
<figcaption>Different providers, identical infrastructure. Claude Code, OpenCode, and OpenAI Codex work side by side, producing compatible output through the same dispatch system.</figcaption>
</figure>

### Multi-plan scaling

Running ten agents on a single Claude MAX plan will hit rate limits. Stoneforge lets you split agents across plans using executable paths.

Each agent can specify a custom executable path pointing to a wrapper script that sets a plan-specific config directory. Configure these per agent or at the workspace level through the dashboard, along with fallback paths for when a primary executable is unavailable. If one plan's workers are rate-limited, workers on other plans keep going. Your throughput scales with your subscriptions.

### Custom prompts

Each agent role has a built-in prompt that's sent as the first user message when the session starts, not as a system prompt, because agents follow instructions delivered this way more reliably. Override any of them per-project by placing `.md` files in `.stoneforge/prompts/`. File names match built-in names: `director.md`, `worker.md`, `persistent-worker.md`, `steward-base.md`, `steward-merge.md`, and more. Prompts support template variables: `{{baseBranch}}` is replaced with the detected target branch at render time.

### Plugins

The CLI supports third-party plugins that extend Stoneforge's functionality and make new capabilities available to your agents. A plugin might add a new command surface, integrate with an internal tool, or expose domain-specific utilities that workers can call during task execution. Plugins are the extension point for anything that doesn't fit into prompts, playbooks, or provider configuration.

Like playbooks, I plan to open a **plugin marketplace**, a single place to discover, install, and share extensions. Between the workflow marketplace for playbooks and the plugin marketplace for CLI extensions, the goal is an ecosystem where teams share what works.

### External sync for tasks

Your team doesn't have to abandon their existing project management tools. Stoneforge tasks sync bidirectionally with **GitHub Issues/PRs** and **Linear**.

A task created in Linear by your PM shows up in Stoneforge's dispatch queue, ready for a worker to pick up. A task completed by an agent closes the corresponding GitHub issue. Push, pull, or bidirectional, your choice. Conflict resolution is configurable: last-write-wins, local-wins, remote-wins, or manual tagging for human resolution.

Combined with document sync (Notion, Obsidian, local folders), Stoneforge integrates into your existing workflows rather than replacing them.

## Durable workflows

Some processes need to run in order with durable state. If you've used **Temporal** or **Inngest**, Stoneforge workflows will feel familiar: define a sequence of steps, run it, and if any step fails, the workflow's state is preserved. Fix the issue, reopen the failed task, and the workflow resumes from exactly that point. No re-running completed steps. No lost progress.

A **playbook** is a reusable template. It defines a sequence of steps, template variables with types and defaults, conditions that include or skip steps based on variable values, and inheritance (one playbook can extend another, overriding or adding steps).

A **workflow** is a running instance of a playbook. When you create one, Stoneforge resolves inheritance, validates variables, evaluates step conditions, creates tasks for each step, wires blocking dependencies based on `dependsOn` declarations, and links everything through parent-child relationships.

Steps come in two types. **Task steps** are regular Stoneforge tasks dispatched to workers through the normal dispatch system. **Function steps** run TypeScript, Python, or shell commands with configurable timeouts. Dependencies between steps are standard blocking dependencies. The same dispatch system handles ordering automatically.

Workflows can be ephemeral (one-off, not persisted) or durable (fully event-sourced, resumable across server restarts). Progress is the aggregate status of child tasks, not a separate counter that can drift.

## One screen to see everything

Everything described above is visible and controllable from a single web dashboard at `http://localhost:3457`.

<figure>
<img alt="The Director's chamber — overlooking the workshop floor, status crystals on the desk, a network of speaking stones on the wall" src="https://stoneforge.ai/blog/images/directors-chamber.png?v=2" loading="lazy" />
<figcaption>The Director's chamber — a single view of the entire operation. Status crystals track agents and tasks. Speaking stones map the communication topology. Your dashboard at localhost:3457.</figcaption>
</figure>

The sidebar organizes the interface by function:

**Overview**
- **Activity:** Live terminal output from every running agent. Watch workers code, stewards merge, and the Director plan in real time.
- **Inbox:** A Linear-like message inbox. When agents need human input, their messages land here. Review, respond, or delegate.
- **Editor:** An in-browser code editor built on Monaco with LSP support. Check a file, trace an issue, or make a quick edit without opening your IDE.

**Work**
- **Tasks:** List and kanban views. Filter, sort, bulk-operate. See what's blocked, what's in progress, what's ready for review.
- **Merge Requests:** The review queue for agent pull requests. Watch merge stewards process them or intervene manually.
- **Plans:** Groups of related tasks with progress tracking. See the auth system plan at 60%: two tasks in progress, one blocked.
- **Workflows:** Durable step sequences with status and resumable state.

**Orchestration**
- **Agents:** Register, start, stop. View the topology of your agent fleet. See pools and their current capacity.
- **Workspaces:** A tmux-like terminal multiplexer with saved layouts. Arrange agent sessions side by side.

**Collaborate**
- **Messages:** Channel-based communication. Read agent conversations and respond.
- **Documents:** The searchable knowledge base. Browse, search, and edit the Documentation Directory.

**Analytics**
- **Metrics:** Task throughput, agent efficiency, queue health. Identify bottlenecks.

### The Director Panel

The Director Panel lives in the right sidebar. It's an interactive terminal for your Director session. Start, stop, resume. See the unread inbox count. Give goals. Ask questions. Adjust plans mid-flight.

### Real-time control

The dashboard connects via WebSocket. The event broadcaster polls the database every 500ms and pushes updates to connected clients. Tasks take minutes, so half a second of latency is imperceptible.

You can watch ephemeral worker sessions as they run and send messages to workers mid-task. Start or stop the dispatch daemon at any time. Flip autopilot on and off as you see fit. Emergency stop all workers if something goes wrong.

## The tradeoffs I made

These are the tradeoffs I chose, and why.

**Polling over pub/sub.** The dispatch daemon polls every five seconds instead of using a message queue. That's up to five seconds of latency between a task becoming ready and a worker picking it up. For a system where tasks take minutes, that's fine. Polling is simpler to build, debug, and operate. The interval is configurable down to one second.

**SQLite over Postgres.** Everything is local. No database server to manage. Works offline. Teams running Stoneforge on separate machines can sync through the JSONL layer via git or through external sync providers like GitHub and Linear. Each instance rebuilds its own SQLite cache locally.

**Worktrees over containers.** Worktrees create in milliseconds, share `node_modules` and build caches, and don't need Docker. The isolation is at the git level, which is where multi-agent conflicts actually happen. Stronger isolation adds overhead without a corresponding benefit.

**No approval gates by default.** Agents run with permissions bypassed. No confirmation dialogs. If five agents each need approval for every file write, you've built a sequential system with extra steps. Code review happens at the merge steward level, not at permission prompts. If your workflow requires approval gates, you can add them through custom prompts, plugins, or custom stewards.

**Immutable messages, mutable tasks.** Messages are an audit trail: they can never be edited or deleted. Tasks change constantly. Their status, priority, and description shift throughout their lifecycle. Different data, different mutability rules.

**Event sourcing with the storage cost.** Every mutation is an immutable record. The event log grows without limit. No archival or pruning exists yet. Full auditability in exchange for ever-growing storage. A future release will add support for archiving history to object storage.

**Three identity modes.** Soft mode (name-based, no cryptographic verification) is the default because most single-developer setups don't need Ed25519 signatures on every mutation. Cryptographic mode is there for teams that do. Hybrid mode accepts both during transition.

## Get started

```bash
npm install -g @stoneforge/smithy
cd your-project
sf init
sf serve
```

Open `http://localhost:3457`. Register a Director from the Agents page. Start the Director, give it your goal through the Director Panel. Register a few ephemeral workers and a merge steward. The dispatch daemon starts automatically.

The Director creates a plan, the daemon assigns tasks to workers in isolated worktrees, and stewards merge the results. You watch from the dashboard.

Stoneforge will use every token you give it, as long as you give it enough work to churn through. One plan is enough to get started. When you're ready to scale, it can handle multiple Claude MAX or Codex plans running concurrently across the same codebase. If one agent handles your workload today, you don't need this yet.

---

Remember the five terminals, the re-explained decisions, the merge conflicts on code you never touched? Stoneforge replaces all of that with a system that lets you ship better software with less effort.

The Director plans, workers execute in isolation, the daemon dispatches, and stewards merge and verify. The knowledge base grows with every session, the system recovers from failures on its own, and every action is tracked from backlog to merged code.

The coordination tax is gone.

**GitHub:** [stoneforge-ai/stoneforge](https://github.com/stoneforge-ai/stoneforge) — a star helps others find it.

[RSS feed](https://stoneforge.ai/rss.xml) · [Discord](https://discord.gg/NBCaUUv8Vm) · [Follow on X](https://x.com/stoneforgeai)
