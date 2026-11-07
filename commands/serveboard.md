---
description: Show the live Planetarium board on a phone or other device on the same Wi-Fi (read-only, key-protected), or stop it
argument-hint: <vault folder path> [stop]
---

Arguments: $ARGUMENTS
The vault path is the argument; if the last word is `stop`, this is a stop request.

1. No path → stop and ask for one.
2. Run (shell), with `<mode>` = `stop` for a stop request, else `start`:
   `node "${CLAUDE_PLUGIN_ROOT}/planetarium.mjs" serve <mode> "<vault path>"`
   If `${CLAUDE_PLUGIN_ROOT}` did not expand, find `planetarium.mjs` (Glob `**/planetarium/**/planetarium.mjs` under `~/.claude/plugins` or `~/.omp/plugins`) and use that path.
3. Report in short:
   - start: the `open on a device on the same network:` link(s) it printed, exactly. Explain: open it on a phone on the same Wi-Fi; the link contains a private key, so only share it with people you'd show the board to; every start makes a new key (old links stop working); it keeps running in the background until `/serveboard <path> stop` or a reboot; it is read-only.
   - If it printed the firewall line, pass it on: the first time, the OS may ask to allow Node.js on private networks — allow it, or the phone can't connect.
   - stop: that sharing is off.
   - Any `!` line: what it says and the likely fix (port busy → set `PLANETARIUM_PORT` to another port).
