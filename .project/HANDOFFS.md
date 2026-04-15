# Interwall — Desktop ↔ Server Sonnet Dispatch Protocol

Single-agent operating model: desktop main agent (you) is both coach
and executor. Sandbox-first; push directly to `v2` when the edit is
obvious. Delegate heavy work (multi-file grep, docker-exec test runs,
long research) to a Sonnet 4.6 running on the server terminal via
files in `.project/handoffs/`.

NOT auto-loaded. Read this file once at the start of a session that
plans to dispatch.

---

## Why file-based

- Desktop session cannot SSH to the server (port 22 not exposed).
- Desktop CAN push to `origin/v2`. Server CAN pull and push.
- Therefore the handoff medium is git.
- Server Sonnet writes its report to a file and pushes. Desktop pulls
  and reads. No paste-through-human in the loop.

## Directory layout

    .project/handoffs/
      T-XXX-primer.md          # desktop writes, commits, pushes
      T-XXX-report.yaml        # server Sonnet writes, commits, pushes
      T-XXX-scratch/           # optional: server's working notes,
                               # not required for verification

## Desktop side (you) — dispatch a task

1. Draft the primer per `.project/PRIMER-TEMPLATE.md`. Keep it
   self-contained (inline every D-### rationale, every column the
   task needs from init.sql). The server Sonnet will NOT load
   CLAUDE.md @imports — it has none. First message IS the context.
2. Prepend the fire-and-forget header to the primer:

        # T-XXX primer (Tier N, Sonnet 4.6)
        # Desktop-dispatched YYYY-MM-DD HH:MM local
        # Run on server with:
        #   claude --model claude-sonnet-4-6 \
        #     < .project/handoffs/T-XXX-primer.md
        # Report back to: .project/handoffs/T-XXX-report.yaml
        # When done: git add -A && git commit -m "chore(handoff): T-XXX report" && git push origin HEAD:v2

3. Write to `.project/handoffs/T-XXX-primer.md`, commit with message
   `chore(handoff): dispatch T-XXX`, push `HEAD:v2`.
4. Tell the user: "T-XXX dispatched — run the command in the primer
   header on the server."
5. Either wait for user signal, or proceed with unrelated work. Do
   NOT sit idle polling.

## Server Sonnet side — what the primer must make it do

Primer must be explicit because Sonnet has no project memory:

- CLAUDE.md on the server repo stays minimal (identity + paths +
  invariants + push rules). No `.project/*.md` @imports.
- Every fact Sonnet needs to complete the task must be in the primer,
  inline. Cite D-###s with their one-line body pasted, not a pointer.
- Primer's "Done report schema" section: paste the relevant subset
  of REPORT-SCHEMA.md inline. Sonnet writes the YAML to
  `.project/handoffs/T-XXX-report.yaml`, commits, pushes.
- Primer's last instruction is always the commit+push sequence.

## Desktop side — verify a report

1. `git pull origin v2`.
2. Read `.project/handoffs/T-XXX-report.yaml`.
3. Run the REPORT-SCHEMA.md verification rules in your head:
   all `cases_failed == 0`, `touched_legacy == false`, etc.
4. If green: mark T-XXX DONE in TODO.md (append ` → DONE YYYY-MM-DD`
   inline), commit as `chore(process): mark T-XXX done`, push.
   Move the full entry to TODO-ARCHIVE.md at stream end, not per task.
5. If red or deviated: amend the primer with the correction, bump to
   `T-XXX-primer-v2.md`, dispatch again.

## KV cache discipline

- System prompt + CLAUDE.md are the stable prefix. Do NOT edit
  CLAUDE.md mid-session to inject task context — that busts the
  cache.
- Per-task context goes in the first user message of a fresh turn,
  or in the primer file (which the server Sonnet reads as its first
  message).
- Desktop session: when context fills, `/compact` and resume from
  TODO.md "Now" section + the last report's `next_ready` field.

## When NOT to dispatch

- Trivial edits (one file, under 30 lines, no test suite). Just do it
  in the sandbox and push.
- Decision drafting (appending a new D-###). Desktop job.
- Primer authoring itself. Desktop job.
- Verification of a returned report. Desktop job.

Dispatch is for: multi-file implementation + test suite + cold-rebuild
verification, research that would fill desktop context, long docker
exec chains, any Tier 1/Tier 2 task that follows PRIMER-TEMPLATE.

## Server CLI assumption

The server has `claude` (Claude Code CLI) installed and authenticated.
Model flag is `--model claude-sonnet-4-6`. If that changes, update
this file and every outstanding primer header.
