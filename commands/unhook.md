---
description: Leave the Planetarium board, returning any unfinished work
argument-hint: <vault folder path>
---

Unhook this agent from the board at: $ARGUMENTS (call it `V`). Use your agent number from `/hook` in this session; if you never hooked, say so and stop.

Using the same lock as `/hook` (`node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" lock take "$V"`, read fresh, edit, `node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" lock release "$V"`):

0. If you ran sub-agents (`Agent N.k`), stop them if your tool allows, and treat everything they own exactly like your own below.
1. In `V/Agents/Board.md`: move any `## Queue` line owned by you back to the end of `## Tasks` (drop the `· Agent N` and `· since` parts, keep the id, title and scope). Delete approval requests you created. Set any test you were running (`testing by Agent N`) back to `status: open` (drop the `· since` part). Leave test requests you built: another agent will test them. Deny any pending request addressed to you with `status: denied: agent unhooked`.
2. In `V/Agents/Hooked Agents.md`: set your line and your sub-agents' lines to `status: unhooked`.
3. Release the lock and tell the user what you returned.
