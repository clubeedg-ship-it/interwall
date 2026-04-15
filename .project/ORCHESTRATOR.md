# Interwall — Orchestrator Workflow

Read this once at session start. This is the working loop for the main
agent on `v2`.

Related files:
- `CLAUDE.md` — minimal always-loaded invariants
- `.project/TODO.md` — execution order and current focus
- `.project/DECISIONS.md` — locked design calls and software choice
- `.project/HANDOFFS.md` — only read when dispatching to server Sonnet
- `.project/PROCESS.md` — durable gates and review standards

Do not preload the whole `.project/` tree. Load only the file needed for
the task in front of you.

---

## 1. Current project reality

Interwall is no longer in exploration mode.

- Stream A backend foundation is substantially defined / landed.
- Stream B ingestion is the active backend track.
- Stream C UI rebuild is the next large track.
- The highest-value context is design and software cherry-picking in
  `DECISIONS.md`, then the next executable work in `TODO.md`.

The old coach/operator ritual created more context traffic than useful
work. The default model is now:

- one senior main agent
- one active branch: `v2`
- one active worktree:
  `/Users/ottogen/interwall/.claude/worktrees/gracious-dewdney`
- optional delegation to server Sonnet only when the task is genuinely
  expensive or long-running

---

## 2. Session start

    cd /Users/ottogen/interwall/.claude/worktrees/gracious-dewdney
    git status -sb
    sed -n '1,80p' .project/TODO.md

Then decide what kind of session this is:

- design / planning
- direct implementation
- delegated implementation
- verification / cleanup

Do NOT read `PLAN.md`, `DECISIONS.md`, `PROCESS.md`, and templates by
default. Pull only the one you need.

---

## 3. Default operating loop

1. Read `TODO.md` "Now" and the target task entry.
2. Load only the design entries that constrain that task from
   `DECISIONS.md`.
3. Inspect code with CLI.
4. Decide: do it here, or dispatch.
5. If doing it here: implement, test, commit.
6. If dispatching: write a small primer per `HANDOFFS.md`, then verify
   the return.

The main agent is both coach and executor. Delegation is a tool, not the
default posture.

---

## 4. When to work directly

Work directly in the main session when the task is any of:

- design shaping or software/tool choice
- doc cleanup, handoff cleanup, TODO/DECISIONS maintenance
- one-file or obvious multi-file changes
- work where the code inspection is cheap and the test loop is local
- anything where the main difficulty is judgment, not typing

This includes most planning around Stream B and nearly all sequencing /
design prep for Stream C.

---

## 5. When to dispatch

Dispatch to server Sonnet only when at least one is true:

- the task needs long docker / DB / rebuild execution on the real server
- the task is mostly bounded implementation with clear acceptance checks
- the task spans enough files that local context would get polluted
- the task is batchable execution work after design is already settled

Do NOT dispatch:

- tiny fixes
- design discussions
- DECISIONS / TODO edits
- primer-writing itself
- any task whose main risk is choosing the right design

If the task still contains design uncertainty, the main agent resolves
that first. Sonnet should execute settled work, not discover the plan.

---

## 6. Model strategy

Use models by role, not by habit.

### Main agent

Use the strongest model available for:

- design decisions
- architecture and software cherry-picking
- sequencing work across streams
- reviewing returned work
- writing the first serious handoff for a task cluster

This is the scarce-but-high-leverage spend.

### Server Sonnet

Use a faster / cheaper execution model for:

- implementing already-specified backend tasks
- running server-native tests and rebuild checks
- writing bounded multi-file diffs
- returning structured verification

This is the cheap typing / testing / iteration engine.

### Practical rule

Do not run "two seniors" by default.

If the coach already knows what to do, adding a second senior operator
usually duplicates reasoning cost. The sweet spot for this repo is:

- one senior coach/main agent
- zero or one fast execution agent

Only use a second senior pass for milestone review, risky migrations, or
when a returned implementation conflicts with the intended design.

---

## 7. Handoff standard

Primers must be short and factual.

A good primer contains:

- task sentence
- scope fence
- exact facts to extract
- only the relevant D-### summaries
- acceptance checks
- exact report path

A bad primer contains:

- full project history
- whole-doc dumps
- 10-file read-once manifests
- design debate that the main agent should have settled first

If a primer exceeds what a competent engineer would need to start the
task, it is too big.

---

## 8. Branch and worktree discipline

- `v2` is the only active write branch for rebuild work.
- `gracious-dewdney` is the active worktree.
- repo root `main` is reference only unless explicitly needed.
- stale Claude worktrees are historical context, not active workflow.

Before any git operation that matters, confirm you are in:

    /Users/ottogen/interwall/.claude/worktrees/gracious-dewdney

---

## 9. Context discipline

The failure mode to avoid is context rot caused by restating the system.

Rules:

- keep `CLAUDE.md` minimal
- do not dump `.project/*.md` into first messages
- let `TODO.md` point to the next task
- let `DECISIONS.md` carry durable design choices
- let primers carry only task-local execution context
- create handoffs only at real boundaries: session pause, dispatch, or
  blocked state

If a handoff is trying to reconstruct the entire project, the workflow
has already failed upstream.

---

## 10. Recommended workflow from here

For the next phase of this repo:

1. Main agent drives Stream B design and task batching.
2. Server Sonnet executes only the bounded Stream B implementation tasks.
3. Main agent prepares Stream C by tightening design choices and
   reducing ambiguity before any large UI execution run.
4. Use handoffs sparingly and make them task-cluster oriented, not
   atomic-task oriented.

Current bias:

- design here
- execute there
- verify here

That is enough structure for this rebuild without recreating GSD in
markdown.
