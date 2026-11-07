---
description: Set up a Planetarium board in an Obsidian vault folder (creates the folder, installs the board plugin and theme)
argument-hint: <vault folder path>
---

Set up a Planetarium board at: $ARGUMENTS

1. If no path was given, stop and ask for one.
2. Run (shell): `node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" create "<path>"`
   If `${CLAUDE_PLUGIN_ROOT}` did not expand, find `planetarium.mjs` (Glob `**/planetarium/**/planetarium.mjs` under `~/.claude/plugins` or `~/.omp/plugins`) and run that.
   It copies the board files without overwriting your notes, installs/updates the bundled Planetarium Obsidian plugin (draws the live board) and enables the `planetarium-theme` snippet and dark mode. Running it again on an existing board just updates the plugin and theme.
3. If it printed a `!` line, tell the user that line and what to do about it.
4. Tell the user, in short:
   - Board created at `<path>/Agents`. Add tasks under `## Tasks` in `Board.md`, each with a `scope:` (the files/folders it touches).
   - Open `<path>` as a vault in Obsidian. If it asks whether to trust the vault's plugins, choose Trust (turns off Restricted mode so Planetarium runs). If Obsidian already had this vault open, reload it (Ctrl/Cmd+P → "Reload app without saving").
   - Open `Agents/Board Home.md` for the live board. Agents join with `/hook <path>` (add `subagents=N` to let one agent run N sub-agents).
   - `/serveboard <path>` shows the board on a phone on the same Wi-Fi.
