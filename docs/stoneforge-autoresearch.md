# Autoresearch for Stoneforge

**Can an agentic orchestration system optimize its own orchestration?**

---

## The Karpathy Pattern

Autoresearch: an AI agent modifies `train.py`, trains for 5 minutes, measures `val_bpb`, iterates. ~100 experiments overnight. No human.

Three properties make it work:
1. A **modifiable surface** (code)
2. A **fixed budget** (5 min GPU)
3. A **scalar metric** (validation loss)

The question isn't whether stoneforge can use autoresearch to tune simulation parameters (that's Pro's job). The question is: **can stoneforge apply autoresearch to its own agentic orchestration layer?**

The modifiable surface isn't `train.py`. It's the Director's system prompt. The dispatch policy. The playbook decomposition. The inter-agent communication protocol. The steward trigger conditions. The merge strategy.

The metric isn't `val_bpb`. It's task completion quality, time-to-merge, handoff count, orphan rate, test pass rate on first attempt.

---

## What Stoneforge Actually Decides

Looking at the code, stoneforge makes a surprising number of implicit policy decisions that are currently hardcoded:

| Decision | Current Policy | Could Be |
|----------|---------------|----------|
| Worker selection | First available | Scored by task affinity, past performance, domain match |
| Task decomposition | Director's judgment (prompt) | Structured decomposition templates, auto-tuned granularity |
| Branch naming | `{agent}/{taskId}/{slug}` | Semantic, clustered, or content-addressed |
| Merge strategy | Always squash | Squash vs merge vs rebase, context-dependent |
| Spawn priority | Ephemeral > Steward > Persistent | Dynamic based on queue depth and task type |
| Worktree isolation | Per-agent per-task | Shared worktrees for related tasks, pooled for independent |
| Orphan recovery | Resume N times, then recovery steward | Predictive: detect failure patterns before session dies |
| Steward triggers | Cron + event conditions | Learned triggers based on workspace state patterns |
| Session duration | Fixed timeout per role | Adaptive: extend for complex tasks, shorten for simple |
| Test command | `npm test` | Per-task test selection, progressive test suites |

Every row is a knob. Autoresearch turns them.

---

## Direction 1: Orchestration Policy Search

**The modifiable surface:** `DispatchService` scoring function + `AgentPoolService` spawn priorities + `MergeStewardService` merge strategy.

**The metric:** Composite of:
- Task completion rate (higher = better)
- Time from OPEN to MERGED (lower = better)
- Handoff count per task (lower = better)
- Orphan rate (lower = better)
- Test pass rate on first merge attempt (higher = better)

**The budget:** N tasks through the system with policy variant X.

```
Experiment loop:
1. Generate policy variant (worker scoring function, spawn priorities, merge strategy)
2. Run a batch of tasks through the orchestration with that policy
3. Measure composite metric
4. Record, iterate
```

This is the most direct autoresearch analog. The "training" is running real tasks through the system. The "loss" is orchestration quality. The agent modifies the policy, not `train.py`.

**What you'd learn:**
- Does task-affinity-based worker assignment outperform round-robin?
- What's the optimal maxConcurrentTasks per worker type?
- Does rebase merge produce fewer conflicts than squash?
- What orphan detection threshold minimizes wasted sessions?

---

## Direction 2: Linguistic Meta-Language

This is the weird one. And the most interesting.

Stoneforge agents communicate through natural language messages in channels. A Director writes something like: "Please implement the user authentication endpoint. The spec is in PLAN.md. Use JWT tokens. Write tests." A Worker reads this and executes.

Natural language is **bandwidth-limited and ambiguous**. Autoresearch asks: what if agents developed a compressed symbolic protocol for inter-agent coordination?

**Not a programming language.** A *meta-language* — symbols that compress recurring patterns of agentic communication into tokens that carry more information per byte.

Consider what the Director actually communicates:

```
Natural language (current):
"Implement JWT auth endpoint in src/api/auth.ts. Read the existing
middleware pattern in src/middleware/. Write unit tests. The schema
is in src/types/auth.ts. Don't modify the database layer."

Symbolic equivalent (learned):
@impl(src/api/auth.ts)
  ^pattern(src/middleware/)
  +test(unit)
  &schema(src/types/auth.ts)
  !touch(src/db/)
```

The symbols aren't hand-designed. They're *discovered* through autoresearch:

```
Experiment loop:
1. Generate a candidate symbolic vocabulary (start with natural language, compress)
2. Run tasks using symbolic dispatch messages
3. Measure: task completion quality + worker confusion rate + message token count
4. Iterate on the vocabulary
```

**The hypothesis:** A learned symbolic dispatch language would:
- Reduce dispatch message tokens by 80%+
- Reduce worker misinterpretation (ambiguity → precision)
- Enable faster channel scanning (Director reviews worker status in symbols, not paragraphs)
- Create a *readable audit trail* that's denser than natural language

**The linguistic meta-language isn't just compression.** It's the emergence of a *shared ontology* between agents. When Director and Worker converge on what `@impl` means vs `@fix` vs `@refactor`, they've built a shared conceptual vocabulary that makes coordination faster and more precise.

This parallels how human teams develop jargon — not to exclude outsiders, but because domain-specific terms carry more meaning per syllable than general language. Autoresearch accelerates jargon formation from months to hours.

**Implementation in stoneforge:**

The dispatch notification metadata already has structure:
```typescript
// Current: free-form message field
metadata: { type: 'dispatch-notification', taskId, priority, message: "..." }

// With meta-language: structured symbolic dispatch
metadata: { type: 'dispatch-notification', taskId, priority,
            symbols: ["@impl", "^pattern", "+test:unit", "!touch"],
            refs: { pattern: "src/middleware/", touch: "src/db/" } }
```

The `RoleDefinitionService` stores each agent's system prompt as a Document. The meta-language vocabulary becomes part of the role definition — a shared dictionary that both Director and Worker reference.

---

## Direction 3: Symbolic Prompting

Role definitions in stoneforge are system prompts stored as Documents. The Director's prompt shapes how it decomposes tasks. The Worker's prompt shapes how it approaches execution. The Steward's prompt shapes how it evaluates merge readiness.

Currently these are hand-written natural language. Autoresearch could iterate on them.

**The modifiable surface:** Role definition system prompts.

**The metric:** Same composite as Direction 1 (completion rate, time-to-merge, handoff count, orphan rate).

But the interesting variant isn't just optimizing natural language prompts. It's exploring whether **structured symbolic prompts** outperform prose:

```markdown
## Current Director prompt (prose)
You are a Director agent. Your job is to decompose tasks into subtasks,
assign them to workers, and track progress. When a task is too large,
break it into pieces. When a worker is stuck, reassign the task...

## Symbolic Director prompt (structured)
ROLE: Director
DECOMPOSE: task.complexity > threshold → split(task, max_subtasks=4)
ASSIGN: score(worker, task) = affinity(worker.history, task.domain) × availability(worker)
ESCALATE: task.handoff_count > 2 → recovery_steward
MERGE: task.test_pass ∧ task.review_approved → squash_merge
MONITOR: poll(5s) { orphan_check, stuck_check, capacity_check }
```

**The hypothesis:** Symbolic prompts produce more consistent agent behavior because they eliminate the ambiguity of natural language instructions. An LLM reading `DECOMPOSE: task.complexity > threshold → split(task, max_subtasks=4)` has less room for interpretation drift than one reading "break large tasks into smaller pieces."

Autoresearch tests this: run the same task batch with prose prompts vs symbolic prompts vs hybrid prompts, measure behavior consistency across runs.

---

## Direction 4: Agentic Meta-Patterns

The Director/Worker/Steward topology is fixed. But should it be?

**Current topology:**
```
Human → Director → Workers (1:N)
                 → Stewards (cron/event triggered)
```

**Alternative topologies autoresearch could discover:**

```
Hierarchical:     Human → Director → Sub-Directors → Workers
Peer-to-peer:     Human → Worker Pool (self-organizing, no Director)
Specialist:       Human → Director → {Frontend Workers, Backend Workers, Test Workers}
Pipeline:         Human → Architect → Implementer → Reviewer → Merger
Swarm:            Human → N Workers with emergent coordination via shared state
```

**The modifiable surface:** Agent count, role assignments, channel topology, and the dispatch routing rules.

**The metric:** Same composite, but also measuring coordination overhead (total inter-agent messages per task completed).

**What you'd test:**
- Does a Sub-Director for test tasks reduce merge failures?
- Does removing the Director entirely (Workers self-assign from queue) work for simple tasks?
- Does a dedicated "Reviewer" role between Worker and Merge Steward improve first-pass quality?
- At what task complexity does hierarchical decomposition outperform flat dispatch?

---

## Direction 5: Playbook Evolution

Playbooks are stoneforge's reusable workflow definitions — variables, steps, triggers. Currently hand-authored.

**The autoresearch pattern:**

```
Experiment loop:
1. Take a completed task history (what the Director actually did)
2. Extract the implicit playbook (decomposition pattern, file targets, test strategy)
3. Formalize as a Playbook definition
4. Run new similar tasks with vs without the playbook
5. Measure: does the playbook improve time-to-merge and reduce handoffs?
6. If yes, save to playbooks/ directory
7. If no, discard and iterate on the formalization
```

This is **playbook distillation** — the system watches successful task completions and extracts reusable patterns. The Director doesn't need to learn a new playbook; the system *infers* playbooks from the Director's successful behavior and offers them back.

Over time, the playbooks/ directory becomes a learned library of orchestration patterns, each empirically validated by autoresearch.

---

## Direction 6: Boss-Level Self-Optimization

Stoneforge-boss manages multiple workspaces. It decides:
- Startup order (currently sequential)
- Port allocation (currently static)
- Health check intervals (currently none)
- Resource allocation (currently uniform)

**The autoresearch pattern at the boss level:**

```
modifiable surface:  workspace startup config, health check intervals,
                     restart policies, feed sync intervals
metric:              workspace uptime, restart count, sync lag,
                     total resource usage (memory/CPU)
budget:              24-hour observation window
```

This is lighter than the agent-level experiments but still useful. Could boss learn that workspace X always crashes after Y hours and preemptively restart it? Could it learn that workspace A and B contend for resources and should stagger startups?

---

## The Meta-Insight

Karpathy's autoresearch optimizes a neural network by having an AI modify the training code. That's one level of meta.

Stoneforge autoresearch would optimize an *agentic system* by having agents modify their own *orchestration protocols*. That's two levels of meta.

The system that assigns tasks to workers would itself be a task assigned to a worker.

This creates a recursive structure:
1. **Level 0:** Workers complete tasks (code changes)
2. **Level 1:** Director optimizes how workers complete tasks (orchestration)
3. **Level 2:** Autoresearch optimizes how the Director optimizes (meta-orchestration)

Level 2 is where the interesting stuff happens. It's where the linguistic meta-language emerges, where playbooks self-generate, where the system discovers that a pipeline topology works better than a star topology for refactoring tasks but worse for bug fixes.

---

## Implementation: What's Actually Buildable Today

### Phase 1: Metric Collection (prerequisite, ~1 day)
Add instrumentation to stoneforge's orchestration layer:
- Task lifecycle events (created → assigned → in_progress → review → merged)
- Timestamps at each transition
- Handoff count, orphan count, test pass/fail per task
- Inter-agent message count per task
- Store in a `metrics` table or append-only JSONL

### Phase 2: Policy Variants (~2 days)
Make the hardcoded policies configurable:
- Worker scoring function (pluggable in DispatchService)
- Merge strategy (pluggable in MergeStewardService)
- Spawn priority weights (configurable in AgentPoolService)
- Store active policy config in `.stoneforge/policy.yaml`

### Phase 3: Autoresearch Loop (~3 days)
Build the outer loop:
```python
# stoneforge-autoresearch.py
for experiment in range(N):
    policy = mutate(current_best_policy)
    write_policy("policy.yaml", policy)
    run_task_batch(tasks, timeout=300)  # 5 min budget per task
    metrics = collect_metrics()
    score = composite_score(metrics)
    if score > best_score:
        best_score = score
        best_policy = policy
    log(experiment, policy, score)
```

### Phase 4: Symbolic Language Emergence (~1 week)
- Start with natural language dispatch messages
- After each successful task, extract communication patterns
- Compress recurring patterns into symbols
- Test compressed dispatch vs natural language dispatch
- Iterate on the vocabulary

### Phase 5: Playbook Distillation (~ongoing)
- Watch completed tasks
- Extract implicit playbooks
- Validate via re-execution
- Accumulate validated playbooks

---

## Why This Matters Beyond Stoneforge

If an agentic system can optimize its own orchestration through autoresearch, it demonstrates something general: **agentic meta-learning**. The system doesn't just complete tasks — it learns *how to complete tasks better* by experimenting with its own coordination protocols.

This is different from fine-tuning a model. You're not changing weights. You're changing the *topology and protocol* of a multi-agent system based on empirical evidence from its own operation. The agents are the same LLMs — what changes is how they're connected, what they're told, and how work flows between them.

The linguistic meta-language direction is particularly interesting because it suggests that multi-agent systems, given enough iterations, will naturally evolve domain-specific communication protocols that are more efficient than natural language — just as human organizations do. Autoresearch just accelerates the process from months to hours.

Stoneforge is the right place to test this because it already has:
- A well-defined agent topology (Director/Worker/Steward)
- Structured communication (channels, dispatch metadata)
- Observable outcomes (task completion, merge success)
- Configurable policies (role definitions, playbooks, steward triggers)
- The entity system to track everything

It's an orchestration system that already contains all the hooks needed to study its own orchestration. It just needs the outer loop.
