# Interwall — Desktop Orchestrator Playbook

Session-start read for the desktop main agent (you). Complements
HANDOFFS.md (transport), PROCESS.md (gating), PRIMER-TEMPLATE.md
(primer shape), REPORT-SCHEMA.md (report shape). Do not duplicate
those — this file is the operating loop only.

NOT auto-loaded. Read once at session start.

---

## Your role

Orchestrator + primer author + verifier. You think, the server
Sonnet executes. You write code ONLY when the change is one file /
<30 lines / no new deps / no tests needed. Everything else dispatches.

## Session start checklist (60 seconds, CLI-first)

    cd /Users/ottogen/interwall/.claude/worktrees/gracious-dewdney   # v2 lives here, NOT repo root
    git fetch origin && git status -sb                                # sync state
    git pull --ff-only                                                 # if behind
    ls .project/handoffs/                                              # pending primers/reports
    sed -n '41,55p' .project/TODO.md                                   # "Now" section only
    git log --oneline origin/v2 -8                                     # recent traction

Do NOT cat full .project/*.md at session start. Load on demand.

## Dispatch a task (the loop)

1. **Plan in head.** If you can't name the task in one sentence,
   re-read TODO.md "Now" + the last report's `next_ready` field.
2. **Research gaps with CLI, not Reads.** `grep -rn`, `wc -l`,
   `sed -n 'A,Bp'`, `head -n 25`, `git log -S "symbol"`. Only spawn
   a Sonnet Explore subagent if the gap spans >5 files AND the facts
   can't fit in a structured 10-bullet answer.
3. **Write the primer** per PRIMER-TEMPLATE.md §1-8, + the adversarial
   block. Save to `.project/handoffs/T-XXX-primer.md`.
4. **Header** (verbatim, always `--dangerously-skip-permissions`):

        # T-XXX primer (Tier N, Sonnet 4.6)
        # Run on server with:
        #   claude --dangerously-skip-permissions --model claude-sonnet-4-6 \
        #     < .project/handoffs/T-XXX-primer.md
        # Report to: .project/handoffs/T-XXX-report.yaml
        # When done: git add -A && git commit -m "chore(handoff): T-XXX report" && git push origin HEAD:v2

5. **Commit** `chore(handoff): dispatch T-XXX`, `git push origin HEAD:v2`.
6. **Tell the user**: one line, command to run.
7. **Verify report** on return: schema fields green, cases_failed == 0,
   cold_rebuild_survival verified, touched_legacy false. Mark TODO.md
   inline `→ DONE YYYY-MM-DD`, commit `chore(process): mark T-XXX done`.

## Primer rules (session-learned — apply on every primer)

- **Facts manifest, not read-once manifest.** Name the specific facts
  the agent needs (column names, function signatures, status enum
  values). Let the agent choose the extraction CLI. Never tell it to
  "read file X" — that's what blew context in T-B02.
- **Inline the short stuff** (D-### bodies under 5 lines, one-line
  status flows). Pointer-only for long stuff (DECISIONS.md entry
  group, full SQL file). Agent uses `sed -n 'A,Bp' <file>` to fetch.
- **Scope fence is a list of file paths**, not prose. In/out, explicit.
- **Cold-rebuild block only when needed** per PRIMER-TEMPLATE.md §7.
- **Commit sequence** suggested, one logical change each. End with
  `git push origin HEAD:v2`.
- **Always `--dangerously-skip-permissions`** in the header.

## When NOT to dispatch (do it yourself)

- Marking TODO.md DONE after verifying a report.
- Appending a D-### to DECISIONS.md.
- A one-file fix under 30 lines with obvious diff.
- Primer authoring / revision.
- Recovery finisher primers (tiny, stateful — see below).

## Subagent rules (orchestrator side, desktop session)

- **Sonnet only.** `subagent_type: Explore` with `model: sonnet`
  explicit. Opus subagents are forbidden this project.
- **Threshold**: spawn only if research spans >5 files or the answer
  structure matters (table of column shapes, version sweep across
  migrations). For a single grep, just grep.
- **Brief shape**: one concrete question, structured 10-bullet answer
  format, total output budget stated (<500 lines).

## Recovery patterns

**Agent ran out of context mid-task, work uncommitted on server FS.**
Write a 30-line "finisher" primer: don't re-research; just enumerate
the remaining commit-test-push steps with exact commands. Header
points at the same report YAML path. Commit as `chore(handoff):
T-XXX finisher`. Cheapest path; preserves the agent's in-progress
diff.

**Agent session died, FS lost.** Redispatch the original primer —
it's validated up to the wall. Check the primer for what caused the
context blow (usually a too-large read-once manifest) before re-running.

**Report returns `status: deviated` or red tests.** Amend primer to
`T-XXX-primer-v2.md`, cite the deviation in the header. Do not edit
the original primer in place (audit trail).

## Anti-patterns (session-observed)

- Reading .project/*.md whole at session start — they're long; load on demand.
- Listing 15 files in a read-once manifest — agent context evaporates before coding.
- Dispatching a 2-line edit — overhead > work.
- Asking the user "should I proceed" after every dispatch — fire and move on to verification when report lands.
- Editing CLAUDE.md to inject task context — busts KV cache; use primer.

## Branching rules (no-conflict discipline)

- **`v2` is the only write target.** Agents push v2. Desktop pushes v2.
  `main` is read-only locally; it only advances via GitHub PR merges
  from v2. Never commit directly to `main`.
- **Never merge `main` → `v2` mid-stream.** Until the rebuild ships,
  main only receives v2. If a PR lands, resync v2 immediately:

        git fetch origin && git checkout v2
        git merge --ff-only origin/main   # expected: Already up to date
                                           # (because main ≡ v2 at merge time)

  If fast-forward fails, someone committed to main directly — stop
  and investigate before continuing.
- **One worktree per live branch.** `gracious-dewdney` holds v2. The
  main repo dir holds `main` for read-only reference. Everything else
  in `.claude/worktrees/` is stale and should be pruned
  (`git worktree remove <path>` + `git branch -D <branch>`).
- **No feature branches for rebuild work.** T-### tasks commit
  directly to v2 via the handoff primer. Branching adds merge cost
  that the rebuild doesn't benefit from at this team size.

## Worktree gotcha

The `v2` branch is checked out in a worktree
(`.claude/worktrees/gracious-dewdney`), not the main repo dir.
Always `cd` to the worktree before any git op. `git checkout v2` from
the main dir fails with "already used by worktree".

## KV cache discipline

System prompt + CLAUDE.md = stable prefix. Never edit CLAUDE.md
mid-session. Per-task context goes in the first user message or the
primer. When desktop context fills past ~60%, `/compact` and resume
from TODO.md "Now" + last report's `next_ready` / `notes_to_human`.
