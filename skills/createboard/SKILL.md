---
name: createboard
description: Set up a Planetarium board in an Obsidian vault folder (creates the folder, installs the board plugin and theme)
argument-hint: <vault folder path>
disable-model-invocation: true
---

**CLI (`PL` below):** `${CLAUDE_PLUGIN_ROOT}/planetarium.mjs` if that variable was filled in; otherwise `planetarium.mjs` in this plugin's root folder, two levels above this SKILL.md. Run it with `node`.

Set up a Planetarium board at: $ARGUMENTS (if this shows literally as `$ARGUMENTS`, take the vault path and options from the user's message)

1. If no path was given, stop and ask for one.
2. Run (shell): `node "<PL>" create "<path>"`
   It copies the board files without overwriting your notes, installs/updates the bundled Planetarium Obsidian plugin (draws the live board) and enables the `planetarium-theme` snippet and dark mode. Running it again on an existing board just updates the plugin and theme.
3. If it printed a `!` line, tell the user that line and what to do about it.
4. Tell the user, in short:
   - Board created at `<path>/Agents`. Add tasks under `## Tasks` in `Board.md`, each with a `scope:` (the files/folders it touches).
   - Open `<path>` as a vault in Obsidian. If it asks whether to trust the vault's plugins, choose Trust (turns off Restricted mode so Planetarium runs). If Obsidian already had this vault open, reload it (Ctrl/Cmd+P → "Reload app without saving").
   - Open `Agents/Board Home.md` for the live board. Agents join with `/hook <path>` (add `subagents=N` to let one agent run N sub-agents).
   - `/serveboard <path>` shows the board on a phone on the same Wi-Fi.
