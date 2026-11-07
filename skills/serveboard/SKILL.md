---
name: serveboard
description: Show the live Planetarium board on a phone or other device on the same Wi-Fi (read-only, key-protected), or stop it
argument-hint: <vault folder path> [stop]
disable-model-invocation: true
---

**CLI (`PL` below):** `${CLAUDE_PLUGIN_ROOT}/planetarium.mjs` if that variable was filled in; otherwise `planetarium.mjs` in this plugin's root folder, two levels above this SKILL.md. Run it with `node`.

Arguments: $ARGUMENTS (if this shows literally as `$ARGUMENTS`, take the vault path and options from the user's message)
The vault path is the argument; if the last word is `stop`, this is a stop request.

1. No path → stop and ask for one.
2. Run (shell), with `<mode>` = `stop` for a stop request, else `start`:
   `node "<PL>" serve <mode> "<vault path>"`
3. Report in short:
   - start: the `open on a device on the same network:` link(s) it printed, exactly. Explain: open it on a phone on the same Wi-Fi; the link contains a private key, so only share it with people you'd show the board to; every start makes a new key (old links stop working); it keeps running in the background until `/serveboard <path> stop` or a reboot; it is read-only.
   - If it printed the firewall line, pass it on: the first time, the OS may ask to allow Node.js on private networks — allow it, or the phone can't connect.
   - stop: that sharing is off.
   - Any `!` line: what it says and the likely fix (port busy → set `PLANETARIUM_PORT` to another port).
