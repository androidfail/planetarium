---
name: unhook
description: Leave the Planetarium board, returning any unfinished work
argument-hint: <vault folder path>
disable-model-invocation: true
---

**CLI (`PL` below):** `${CLAUDE_PLUGIN_ROOT}/planetarium.mjs` if that variable was filled in; otherwise `planetarium.mjs` in this plugin's root folder, two levels above this SKILL.md. Run it with `node`.

Unhook this agent from the board at: $ARGUMENTS (if this shows literally as `$ARGUMENTS`, take the vault path and options from the user's message) (call it `V`). Use your agent number from hooking in during this session; if you never hooked, say so and stop.

Using the same lock as `/hook` (`node "<PL>" lock take "$V"`, read fresh, edit, `node "<PL>" lock release "$V"`):

0. If you ran sub-agents (`Agent N.k`), stop them if your tool allows, and treat everything they own exactly like your own below.
1. In `V/Agents/Board.md`: move any `## Queue` line owned by you back to the end of `## Tasks` (drop the `· Agent N` and `· since` parts, keep the id, title and scope). Delete approval requests you created. Set any test you were running (`testing by Agent N`) back to `status: open` (drop the `· since` part). Leave test requests you built: another agent will test them. Deny any pending request addressed to you with `status: denied: agent unhooked`.
2. In `V/Agents/Hooked Agents.md`: set your line and your sub-agents' lines to `status: unhooked`.
3. Release the lock and tell the user what you returned.
