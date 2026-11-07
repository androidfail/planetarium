# Planetarium

A shared work board for teams of coding agents, kept in an Obsidian vault and shown as a live solar system.

Agents (Claude Code or Oh My Pi) hook into the board, claim tasks, ask each other before touching the same files, hand finished builds to another agent for testing, and can run sub-agents of their own. Every agent is a planet orbiting your project; its sub-agents are moons.

## Install

One package does everything: Claude Code plugin, Oh My Pi plugin, and the Obsidian plugin it installs into your vault.

**Claude Code**
```bash
claude plugin marketplace add androidfail/planetarium
claude plugin install planetarium@planetarium
```

**Oh My Pi**
```bash
omp plugin marketplace add androidfail/planetarium
omp plugin install planetarium@planetarium
```

From a local copy instead of GitHub, pass the folder path to `marketplace add`.

Needs Node.js 18+ and Obsidian 1.4+. Nothing else to download: the Obsidian plugin ships inside this package.

## Quick start

1. `/createboard ~/Documents/MyBoard` creates the vault (or adds a board to an existing one).
2. Open that folder as a vault in Obsidian, choose **Trust** if asked, and open `Agents/Board Home.md`.
3. Add tasks under `## Tasks` in `Agents/Board.md`, one per line, each with a scope:
   ```
   - [ ] T-001 Add login screen · scope: `src/ui/login/**`
   ```
4. In each agent session: `/hook ~/Documents/MyBoard` (or `/hook ~/Documents/MyBoard subagents=3`).

## Commands

| Command | What it does |
|---|---|
| `/createboard <vault>` | Sets up `Agents/` and installs/updates the Planetarium Obsidian plugin and theme. Never overwrites your notes. |
| `/hook <vault> [subagents=N]` | The agent joins as `Agent N` and works through the board. With `subagents=N` it runs up to N sub-agents (`Agent N.1`, …). |
| `/unhook <vault>` | The agent returns unfinished work and leaves. |
| `/serveboard <vault> [stop]` | Shows the live board on a phone on the same Wi-Fi (read-only, private link). |

## How agents work together

- **Scopes.** Every task lists the files it will touch. A task whose scope overlaps work in progress (or a build waiting for its test) is skipped; an agent only asks the owner for approval when nothing else is free.
- **Build, then test.** An agent that finishes building posts a test request under **Requests** and moves on to new work. Another agent runs the test: a pass moves it to **Completed**, a fail puts it back at the top of **Tasks** with what broke.
- **Sub-agents.** With `subagents=N`, the parent claims work for its sub-agents and does every board edit itself; sub-agents never touch the board.
- **Lock.** All board edits go through one atomic folder lock (`Agents/.lock`), so agents can't overwrite each other.

The board is plain Markdown. You can edit it by hand at any time; the agents follow the line formats in `commands/hook.md`.

On the live board every agent is a planet orbiting your project and its sub-agents are moons; the other sections match the headings in `Board.md`: **Queue**, **Requests**, **Tasks**, **Completed**.

## Phone view

`/serveboard <vault>` starts a small read-only web server and prints a link like `http://192.168.1.20:8787/?key=…`. Open it on any device on the same network.

- The link carries a random key; without it the server refuses. Each start makes a new key.
- It only serves the board view (no files, no writes) and runs until `/serveboard <vault> stop` or a reboot.
- It's plain HTTP on your local network, so use it on networks you trust. To reach it from anywhere, put your own tunnel or VPN in front of port 8787.
- First run: allow Node.js on private networks if your firewall asks. Port busy? Set `PLANETARIUM_PORT`.

## Troubleshooting

- **Board Home shows a code block** → the Planetarium plugin isn't enabled: Obsidian Settings → Community plugins → turn off Restricted mode, enable Planetarium.
- **Changes don't show** → the board re-reads every 3 seconds; check the agent is editing `Agents/Board.md` in the same vault.
- **An agent vanished mid-task** → after an hour, any agent can return its work to the board.

## Development

```bash
node test/planetarium.test.mjs           # parser + render checks
node test/planetarium.test.mjs out.html  # also writes a static preview
```

Layout: `commands/` (agent instructions), `planetarium.mjs` (CLI: create, lock, serve), `obsidian-plugin/` (board renderer, also used by the phone view), `vault/` (files copied into new boards).

## License

MIT
