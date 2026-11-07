#!/usr/bin/env node
// Planetarium CLI, used by the /createboard, /hook, /unhook and /serveboard commands. Plain Node 18+, no dependencies.
//
//   node planetarium.mjs create <vault>             set up a board (keeps your notes, installs/updates the Obsidian plugin + theme)
//   node planetarium.mjs lock take|release <vault>  board write lock shared by all agents
//   node planetarium.mjs lock now                   current time in board format
//   node planetarium.mjs serve start|stop <vault>   share a read-only live board with devices on your Wi-Fi/LAN
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { networkInterfaces } from "node:os";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(ROOT, "obsidian-plugin");
const pad = (n) => String(n).padStart(2, "0");
const now = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
const [cmd, sub, vaultArg] = process.argv.slice(2);

// ---------------- create ----------------

function mergeJson(file, fallback, fn) {
  let data = fallback;
  if (existsSync(file)) {
    try { data = JSON.parse(readFileSync(file, "utf8") || "null") ?? fallback; }
    catch { console.error(`! ${file} is not valid JSON, left unchanged`); return; }
  }
  writeFileSync(file, JSON.stringify(fn(data), null, 2) + "\n");
}

function create(vault) {
  const obs = join(vault, ".obsidian");
  mkdirSync(vault, { recursive: true });
  cpSync(join(ROOT, "vault"), vault, { recursive: true, force: false, errorOnExist: false }); // never overwrite notes
  cpSync(PLUGIN, join(obs, "plugins", "planetarium"), { recursive: true, force: true }); // ours: always update
  cpSync(join(ROOT, "vault", ".obsidian", "snippets", "planetarium-theme.css"), join(obs, "snippets", "planetarium-theme.css"), { force: true });

  // Boards made by the pre-release "agent-board" version: switch them over.
  const home = join(vault, "Agents", "Board Home.md");
  const homeText = readFileSync(home, "utf8");
  if (homeText.includes("```agent-board")) {
    writeFileSync(home, homeText.replace("```agent-board", "```planetarium").replace("- ab-page", "- pl-page"));
    console.log("migrated Board Home to the Planetarium block");
  }

  mergeJson(join(obs, "community-plugins.json"), [], (d) => {
    const list = (Array.isArray(d) ? d : []).filter((p) => p !== "agent-board");
    return list.includes("planetarium") ? list : [...list, "planetarium"];
  });
  mergeJson(join(obs, "appearance.json"), {}, (d) => {
    const s = new Set((d.enabledCssSnippets || []).filter((x) => x !== "agent-board-theme"));
    s.add("planetarium-theme");
    return { theme: "obsidian", ...d, enabledCssSnippets: [...s] };
  });

  for (const f of ["Agents/Board.md", "Agents/Hooked Agents.md", "Agents/Board Home.md", ".obsidian/plugins/planetarium/main.js"])
    if (!existsSync(join(vault, f))) die(`! missing ${f}`, 3);
  console.log(`board ready at ${join(vault, "Agents")}`);
}

// ---------------- lock ----------------

async function lock(action, vault) {
  if (action === "now") { console.log(now()); return; }
  if (!vault) die("usage: lock take|release <vault> | lock now");
  const dir = join(vault, "Agents", ".lock");
  if (action === "release") { rmSync(dir, { recursive: true, force: true }); console.log("RELEASED"); return; }
  if (action !== "take") die("usage: lock take|release <vault> | lock now");
  for (let i = 0; i < 90; i++) {
    try { mkdirSync(dir); console.log(`LOCKED ${now()}`); return; } // mkdir is atomic: exactly one agent wins
    catch (e) {
      if (e.code !== "EEXIST") die(`lock error: ${e.message}`);
      try { if (Date.now() - statSync(dir).mtimeMs > 120000) rmSync(dir, { recursive: true, force: true }); } catch {} // stale after 2 min
    }
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
  }
  die("NOT LOCKED: board busy for too long, try again", 2);
}

// ---------------- serve ----------------

const PORT = Number(process.env.PLANETARIUM_PORT) || 8787;
const stateFile = (vault) => join(vault, "Agents", ".planetarium-serve.json");

// Real Wi-Fi/Ethernet addresses only (skip VPN/CGNAT, link-local and virtual adapters).
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (/virtual|vethernet|wsl|vmware|hyper-v|docker|loopback|tailscale|zerotier/i.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const [x, y] = a.address.split(".").map(Number);
      if (x === 169 && y === 254) continue;
      if (x === 100 && y >= 64 && y <= 127) continue;
      out.push(a.address);
    }
  }
  return out;
}

function runServer(vault, key) {
  const { parseBoard, parseAgents, render } = createRequire(import.meta.url)(join(PLUGIN, "main.js")).lib;
  const css = () => readFileSync(join(PLUGIN, "styles.css"));
  const read = (f) => { try { return readFileSync(join(vault, "Agents", f), "utf8"); } catch { return null; } };
  const fragment = () => {
    const b = read("Board.md");
    return b == null ? `<p class="pl-empty">No Agents/Board.md found.</p>` : render(parseBoard(b), parseAgents(read("Hooked Agents.md") || ""), new Date());
  };
  const keyBuf = Buffer.from(key);
  const ok = (k) => { const b = Buffer.from(String(k || "")); return b.length === keyBuf.length && timingSafeEqual(b, keyBuf); };
  const cookieKey = (req) => (/(?:^|;\s*)pl_key=([^;]+)/.exec(req.headers.cookie || "") || [])[1];

  const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#050814"><title>Planetarium</title>
<link rel="stylesheet" href="styles.css">
<style>html,body{margin:0;background:#050814;min-height:100%}body{padding:10px}.pl-board{min-height:calc(100vh - 20px);box-sizing:border-box}</style>
</head><body><div id="b">${body}</div><script>
const el = document.getElementById("b");
let last = el.innerHTML;
setInterval(async () => {
  try { const r = await fetch("board", { cache: "no-store" }); if (r.ok) { const t = await r.text(); if (t !== last) { last = t; el.innerHTML = t; } } } catch {}
}, 3000);
const ago = (s) => { const d = new Date(String(s).trim().replace(" ", "T")); if (isNaN(d)) return "";
  let x = Math.max(0, Math.floor((Date.now() - d) / 1000)); const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60); x %= 60;
  return h ? h + "h " + String(m).padStart(2, "0") + "m" : m + "m " + String(x).padStart(2, "0") + "s"; };
setInterval(() => { for (const c of document.querySelectorAll(".pl-clock")) c.textContent = ago(c.dataset.since); }, 1000);
</script></body></html>`;

  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };
    const send = (code, type, body, extra = {}) => { res.writeHead(code, { ...headers, "content-type": type, ...extra }); res.end(body); };
    if (req.method !== "GET") return send(405, "text/plain", "read-only");
    // First visit carries ?key=…; swap it for a cookie and drop it from the address bar.
    if (url.searchParams.has("key")) {
      if (!ok(url.searchParams.get("key"))) return send(401, "text/plain", "wrong key");
      return send(303, "text/plain", "", { location: "/", "set-cookie": `pl_key=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000` });
    }
    if (!ok(cookieKey(req))) return send(401, "text/html; charset=utf-8", "<p style='font-family:system-ui'>Planetarium: open the full link printed by <code>/serveboard</code>.</p>");
    if (url.pathname === "/") return send(200, "text/html; charset=utf-8", page(fragment()));
    if (url.pathname === "/board") return send(200, "text/html; charset=utf-8", fragment());
    if (url.pathname === "/styles.css") return send(200, "text/css; charset=utf-8", css());
    send(404, "text/plain", "not found");
  });
  server.on("error", (e) => die(e.code === "EADDRINUSE" ? `port ${PORT} is busy` : e.message, 2));
  server.listen(PORT, "0.0.0.0", () => writeFileSync(stateFile(vault), JSON.stringify({ pid: process.pid, port: PORT, key })));
  const bye = () => { try { rmSync(stateFile(vault), { force: true }); } finally { process.exit(0); } };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

function stopServer(vault) {
  const f = stateFile(vault);
  if (!existsSync(f)) return false;
  try { process.kill(JSON.parse(readFileSync(f, "utf8")).pid); } catch {}
  rmSync(f, { force: true });
  return true;
}

async function serve(action, vault) {
  if (!vault) die("usage: serve start|stop <vault>");
  if (action === "stop") { console.log(stopServer(vault) ? "stopped" : "was not running"); return; }
  if (action === "run") return runServer(vault, process.env.PLANETARIUM_KEY || die("missing key"));
  if (action !== "start") die("usage: serve start|stop <vault>");
  if (!existsSync(join(vault, "Agents", "Board.md"))) die(`! no Agents/Board.md in ${vault}`);
  if (stopServer(vault)) console.log("restarting (old server stopped)");
  const key = randomBytes(18).toString("base64url"); // new key every start: old links stop working
  spawn(process.execPath, [fileURLToPath(import.meta.url), "serve", "run", vault], {
    detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, PLANETARIUM_KEY: key },
  }).unref();
  for (let i = 0; i < 20 && !existsSync(stateFile(vault)); i++) await new Promise((r) => setTimeout(r, 250));
  if (!existsSync(stateFile(vault))) die(`! server did not start (port ${PORT} busy? set PLANETARIUM_PORT)`, 2);
  const ips = lanAddresses();
  console.log(`serving read-only on port ${PORT}`);
  if (!ips.length) console.log(`! no Wi-Fi/LAN address found; on this PC: http://127.0.0.1:${PORT}/?key=${key}`);
  for (const ip of ips) console.log(`open on a device on the same network: http://${ip}:${PORT}/?key=${key}`);
  console.log("If it won't load on your phone: allow Node.js on private networks in your firewall.");
}

// ---------------- main ----------------

const vault = vaultArg && resolve(vaultArg);
if (cmd === "create") { if (!sub) die("usage: create <vault>"); create(resolve(sub)); }
else if (cmd === "lock") await lock(sub, vault);
else if (cmd === "serve") await serve(sub, vault);
else die("usage: node planetarium.mjs create <vault> | lock take|release <vault> | lock now | serve start|stop <vault>");
