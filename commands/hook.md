---
description: Hook this agent into a Planetarium board (Obsidian vault) and work through its tasks
argument-hint: <vault folder path> [subagents=N]
---

Arguments: $ARGUMENTS
The first argument is the vault path; call it `V`. An optional `subagents=N` (default 0) lets you run up to N sub-agents at once (see **Sub-agents**). The board is `V/Agents/Board.md`; the agent log is `V/Agents/Hooked Agents.md`. If they don't exist, stop and tell the user to run `/createboard <path>` first.

Other agents edit these files at the same time. Follow these rules exactly.

## Lock (every write to Board.md or Hooked Agents.md)

Take the lock (shell). It waits for other agents and clears a lock older than 2 minutes:

```bash
node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" lock take "<vault path>"
```

It prints `LOCKED <time>` (use that time for any timestamp you write). `NOT LOCKED` → run it again. Holding the lock: **Read the file fresh** (never edit from an older read), make your edit, then release right away:

```bash
node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" lock release "<vault path>"
```

Never hold the lock while doing task work. Current time without locking: `node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" lock now`.
If `${CLAUDE_PLUGIN_ROOT}` did not expand, find the planetarium plugin's `planetarium.mjs` (Glob `**/planetarium/**/planetarium.mjs` under `~/.claude/plugins` or `~/.omp/plugins`) and use that path.

## Join

Under the lock: read `Hooked Agents.md`, take the highest top-level `Agent N` number + 1 (ignore sub-agent ids like `Agent 2.1`; `Agent 1` if none), append
`- Agent N · hooked <time> · status: active`, release. You are now **Agent N** for the rest of this session — say so to the user.

## Line formats (keep exactly; the live board parses them)

```
## Tasks
- [ ] T-007 Add login screen · scope: `src/ui/login/**`
- [ ] T-005 Shop UI · scope: `src/ui/shop/**` · notes: test failed: buy button does nothing
## Queue
- [ ] T-004 Refactor save system · Agent 2 · scope: `src/data/**` · since 2026-11-07 14:02
- [ ] T-009 Profile fields · Agent 3 (waiting on R-002) · scope: `src/data/profile.lua` · since 2026-11-07 14:10
## Requests
- R-002 · Agent 3 → Agent 2 · T-009 touches `src/data/profile.lua` · status: pending
- R-003 · test · T-006 Net retries · built by Agent 1 · scope: `src/net/**` · status: open · notes: run net tests, check reconnect
- R-004 · test · T-008 Save migration · built by Agent 2 · scope: `src/data/migrate.lua` · status: testing by Agent 3 · since 2026-11-07 14:40
## Completed
- [x] T-006 Net retries · Agent 1 · 2026-11-07 15:01 · notes: tested by Agent 3: reconnect works
```

Multiple scopes: ``scope: `a/**`, `b.lua` ``. Ignore anything inside `<!-- -->`.

Two kinds of request: **approval** (`Agent X → Agent Y`, for overlapping scopes) and **test** (`· test ·`, open to any agent).

**In use** scopes = every Queue item plus every test request (open or testing). A task overlaps when its scope shares a file with an in-use scope, or one path/glob contains the other.

## Work loop

Never sit idle waiting: whenever you'd wait, look for other work first.

1. **Pick work** (under the lock), in this order:
   a. **A test you can run now:** the first test request with `status: open` that you did **not** build. Set it to `status: testing by Agent N · since <time>`. Release. Go to step 4.
   b. **A task with no overlap:** the first item in `## Tasks` whose scope overlaps nothing in use.
      - No `T-` id → give it the next free number across the whole board. No `scope:` → write one (files/folders you expect to touch, as globs).
      - Move it to `## Queue` as `Agent N` with `since <time>`. Release. Go to step 3 (build).
   c. **Only if every remaining task overlaps:** take the first one that overlaps only Queue items (not tests). Move it to `## Queue` as `Agent N (waiting on R-x, R-y)`, add one approval request per overlapping agent (next free `R-` number, `status: pending`). Release. Go to step 2.
   d. Nothing to take (only your own open tests left, or tasks blocked by tests) → set your log line `status: idle`, wait ~1 minute (answering requests, step 5), retry from 1. If nothing changes for 10 minutes and Tasks is empty, take one of your **own** open tests (a), and once no work is left at all, tell the user you're done.
2. **Waiting for approval:** re-read the board about every 30 s (no lock needed to read).
   - All your requests `status: approved` → under the lock, change your Queue line to plain `Agent N`, delete those request lines, release, build (step 3).
   - Any `status: denied: <reason>` → under the lock, move the task back to the end of `## Tasks`, delete your request lines, release, go to step 1 (skip that task this round).
   - No answer after 10 minutes → same as denied. Never start without approval.
   - Deadlock: if the agent you wait on is itself waiting on a request from you, the higher-numbered agent backs off (same as denied).
3. **Build, then hand off the test** (under the lock when done):
   - Remove your Queue line and add a test request to `## Requests`:
     `- R-x · test · T-x title · built by Agent N · scope: <same scope> · status: open · notes: <what to run/check>`
   - Nothing testable (docs, notes, config with no behaviour) → move it straight to the top of `## Completed` instead, with `notes: no test needed: <why>`.
   - Release, then go back to step 1 for new work. **Do not wait for the test.**
4. **Test** (a test request you set to `testing by Agent N`): run the checks in its notes plus whatever the change needs. Don't fix code while testing. Then, under the lock, remove the request line and:
   - **Pass** → add to the top of `## Completed`: `- [x] T-x title · Agent <builder> · <time> · notes: tested by Agent N: <one line>`.
   - **Fail** → add the task to the **top** of `## Tasks` with its id, title and scope plus `notes: test failed: <what broke>`, so the next free agent fixes it first.
   Release, go to step 1.
5. **Answer approval requests to you:** between steps (and while waiting), read `## Requests`. For each `→ Agent N` (you) `status: pending`: approve if your remaining changes won't clash with theirs, else deny with a short reason. Edit under the lock: `status: approved` or `status: denied: <reason>`.
6. **Dead agents:** a Queue item or `testing by` test whose `since` is over 1 hour old and whose agent is `unhooked` or missing from the log may be reset by anyone (under the lock): Queue item back to `## Tasks`, test back to `status: open`.

While working, keep your log line `status: active`.

## Sub-agents (only with `subagents=N`, N ≥ 1)

You are the **parent**. Use your harness's sub-agent tool (Claude Code: Agent tool; Oh My Pi: task tool) to run up to N jobs in parallel while you keep the board moving.

- **Ids:** `Agent N.1`, `Agent N.2`, … in the order you start them; never reuse one in this session.
- **Only you touch the board.** Sub-agents never read or edit `Board.md` / `Hooked Agents.md` and never take the lock. You do every claim, hand-off and result for them, under the lock as usual.
- **Starting one:** pick work with the normal order (step 1 a–b only: a test it can run, or a task with no overlap — never a task that needs approval). Each job's scope must not overlap anything in use, including your other sub-agents' jobs. Under the lock, write the claim with the sub-agent's id (`· Agent N.k ·` in Queue, or `status: testing by Agent N.k`) and add `- Agent N.k · hooked <time> · status: active` to `Hooked Agents.md`. Release, then start the sub-agent (in the background if your tool allows) with a self-contained brief:
  - Build job: "You are Agent N.k. Build T-x <title>. Only change files in scope <scope>. Notes: <notes>. Don't run the full test pass. Reply with: what you changed, whether there is anything to test, and what a tester should run/check."
  - Test job: "You are Agent N.k. Test T-x <title> (scope <scope>). Run <test notes> and whatever the change needs. Don't change code. Reply PASS or FAIL with one line of evidence."
- **When one reports back:** do the normal step 3 (build → test request with `built by Agent N.k`, or straight to Completed) or step 4 (test → Completed / back to top of Tasks) for it, and set its log line to `status: unhooked`. Then start a new sub-agent if there is work.
- **Sub-agent failed or gave no usable answer:** put its task back at the end of `## Tasks` (or its test back to `status: open`), set its log line `status: unhooked`.
- **Approvals:** requests about a sub-agent's job are addressed to its id (`→ Agent N.k`); you answer them as the parent.
- **Your own work:** you may also take one job yourself, but answering requests and handling sub-agent results comes first.
- A sub-agent may test work built by another of your sub-agents (they don't share context), but never its own build.
- Before you go idle or unhook, wait for running sub-agents to report back and handle their results.
