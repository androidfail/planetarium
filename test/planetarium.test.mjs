// Self-checks for Planetarium. Run: node test/planetarium.test.mjs [preview.html]
// 1) board parser + renderer, 2) CLI: create (incl. old agent-board migration), lock race, key-protected serve.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = join(root, "planetarium.mjs");
const api = createRequire(import.meta.url)(join(root, "obsidian-plugin", "main.js")).lib;

// ---------- parser + render ----------
const board = `# Planetarium Board
## Tasks
<!--
- [ ] T-999 ignored example · scope: \`x\`
-->
- [ ] T-007 Add login screen · scope: \`src/ui/login/**\`
- [ ] Untitled task with no scope
- [ ] T-005 Shop UI · scope: \`src/ui/shop/**\` · notes: test failed: buy button does nothing
## Queue
- [ ] T-004 Refactor save system · Agent 2 · scope: \`src/data/**\` · since 2026-11-07 14:02
- [ ] T-010 Icons · Agent 2.1 · scope: \`assets/icons/**\` · since 2026-11-07 14:25
- [ ] T-009 Profile fields · Agent 3 (waiting on R-002) · scope: \`src/data/profile.lua\`, \`src/data/schema.lua\` · since 2026-11-07 14:10
## Requests
- R-002 · Agent 3 → Agent 2 · T-009 touches \`src/data/profile.lua\` · status: pending
- R-001 · Agent 1 → Agent 2 · T-003 touches \`src/net/**\` · status: denied: mid-refactor
- R-003 · test · T-006 Net retries · built by Agent 2.2 · scope: \`src/net/**\` · status: open · notes: run net tests
- R-004 · test · T-008 Save migration · built by Agent 2 · scope: \`src/data/migrate.lua\` · status: testing by Agent 1 · since 2026-11-07 14:20
## Completed
- [x] T-003 Net retries · Agent 1 · 2026-11-07 13:40 · notes: added backoff
`;
const agents = `# Hooked Agents
- Agent 1 · hooked 2026-11-07 13:00 · status: idle
- Agent 2 · hooked 2026-11-07 13:05 · status: active
- Agent 3 · hooked 2026-11-07 14:08 · status: active
- Agent 4 · hooked 2026-11-07 12:00 · status: unhooked
- Agent 2.1 · hooked 2026-11-07 14:25 · status: active
- Agent 2.2 · hooked 2026-11-07 14:00 · status: unhooked
`;

const b = api.parseBoard(board);
assert.equal(b.tasks.length, 3, "comment example must be skipped");
assert.deepEqual(b.tasks[0].scope, ["src/ui/login/**"]);
assert.equal(b.tasks[1].id, "");
assert.equal(b.tasks[2].notes, "test failed: buy button does nothing");
assert.equal(b.queue[0].agent, "2");
assert.equal(b.queue[0].since, "2026-11-07 14:02");
assert.equal(b.queue[1].agent, "2.1");
assert.equal(b.queue[2].waiting, "R-002");
assert.deepEqual(b.queue[2].scope, ["src/data/profile.lua", "src/data/schema.lua"]);
assert.equal(b.requests[0].from, "3");
assert.equal(b.requests[0].to, "2");
assert.equal(b.requests[0].status, "pending");
assert.equal(b.requests[1].status, "denied: mid-refactor");
assert.equal(b.requests[2].test, true);
assert.equal(b.requests[2].builder, "2.2");
assert.equal(b.requests[2].task, "T-006");
assert.equal(b.requests[2].taskTitle, "Net retries");
assert.equal(b.requests[2].tester, undefined);
assert.equal(b.requests[3].tester, "1");
assert.equal(b.requests[3].since, "2026-11-07 14:20");
assert.equal(b.completed[0].agent, "1");
assert.equal(b.completed[0].notes, "added backoff");
const a = api.parseAgents(agents);
assert.equal(a.length, 6);
assert.equal(a[4].n, "2.1");

const html = api.render(b, a, new Date("2026-11-07T14:30"));
assert.match(html, /pl-agent pl-working/);
assert.match(html, /pl-agent pl-waiting/);
assert.match(html, /pl-agent pl-testing/, "idle-logged agent running a test shows as testing");
assert.equal((html.match(/class="pl-orbit /g) || []).length, 3, "one orbit per live top-level agent");
assert.equal((html.match(/class="pl-moon-orbit /g) || []).length, 1, "one moon for the running sub-agent");
assert.match(html, /pl-sub pl-working[^>]*title="Agent 2\.1/);
assert.ok(!html.includes('title="Agent 2.2:'), "finished sub-agent is hidden");
assert.match(html, /pl-test pl-open/);
assert.match(html, /pl-test pl-running/);
assert.match(html, /pl-row pl-failed/);
assert.match(html, /<h3>Comms<\/h3><span>approvals &amp; tests<\/span><\/div><span class="pl-count">3</);
assert.match(html, /<h3>Orbit<\/h3><span>agents<\/span><\/div><span class="pl-count">4</, "3 top-level + 1 running sub");
assert.ok(!html.includes("T-999"));
assert.ok(!/<script|<img/i.test(api.render(api.parseBoard("## Tasks\n- [ ] T-1 <script>x</script> · scope: `<img onerror=1>`"), [], new Date())), "text is escaped");
console.log("ok  parser + render");

if (process.argv[2]) {
  const css = readFileSync(join(root, "obsidian-plugin", "styles.css"), "utf8");
  writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Planetarium preview</title>
<style>body{margin:0;padding:16px;background:#050814}${css}</style>${html}`);
  console.log("    preview written to", process.argv[2]);
}

// ---------- CLI ----------
const tmp = mkdtempSync(join(tmpdir(), "planetarium-test-"));
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });
try {
  // create: fresh vault, then re-run keeps notes
  const v = join(tmp, "vault");
  run("create", v);
  for (const f of ["Agents/Board.md", "Agents/Board Home.md", ".obsidian/plugins/planetarium/main.js", ".obsidian/snippets/planetarium-theme.css"])
    assert.ok(existsSync(join(v, f)), f);
  assert.deepEqual(JSON.parse(readFileSync(join(v, ".obsidian/community-plugins.json"), "utf8")), ["planetarium"]);
  appendFileSync(join(v, "Agents/Board.md"), "- [ ] T-1 mine · scope: `a`\n");
  run("create", v);
  assert.match(readFileSync(join(v, "Agents/Board.md"), "utf8"), /T-1 mine/, "re-run keeps the user's board");

  // create: migrates a pre-release agent-board vault
  const old = join(tmp, "old");
  mkdirSync(join(old, "Agents"), { recursive: true });
  mkdirSync(join(old, ".obsidian"), { recursive: true });
  writeFileSync(join(old, "Agents/Board Home.md"), "---\ncssclasses:\n  - ab-page\n---\n```agent-board\nAgents\n```\n");
  writeFileSync(join(old, ".obsidian/community-plugins.json"), '["dataview","agent-board"]');
  writeFileSync(join(old, ".obsidian/appearance.json"), '{"enabledCssSnippets":["agent-board-theme","mine"]}');
  run("create", old);
  assert.match(readFileSync(join(old, "Agents/Board Home.md"), "utf8"), /```planetarium[\s\S]*/);
  assert.deepEqual(JSON.parse(readFileSync(join(old, ".obsidian/community-plugins.json"), "utf8")), ["dataview", "planetarium"]);
  assert.deepEqual(JSON.parse(readFileSync(join(old, ".obsidian/appearance.json"), "utf8")).enabledCssSnippets, ["mine", "planetarium-theme"]);

  // lock: 5 racing agents never overlap
  const log = join(tmp, "lock.log");
  await Promise.all([1, 2, 3, 4, 5].map((i) => new Promise((done) => {
    const p = spawn(process.execPath, ["-e", `
      const { execFileSync } = require("node:child_process"); const fs = require("node:fs");
      const run = (...a) => execFileSync(process.execPath, [${JSON.stringify(cli)}, ...a]);
      run("lock", "take", ${JSON.stringify(v)});
      fs.appendFileSync(${JSON.stringify(log)}, "in\\n"); const t = Date.now(); while (Date.now() - t < 250);
      fs.appendFileSync(${JSON.stringify(log)}, "out\\n");
      run("lock", "release", ${JSON.stringify(v)});`]);
    p.on("exit", done);
  })));
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 10);
  lines.forEach((l, i) => assert.equal(l, i % 2 ? "out" : "in", "lock let two agents in at once"));
  assert.match(run("lock", "now"), /^\d{4}-\d\d-\d\d \d\d:\d\d/);
  console.log("ok  create, migration, lock");

  // serve: key required, cookie after first visit, read-only
  process.env.PLANETARIUM_PORT = "18787";
  const out = execFileSync(process.execPath, [cli, "serve", "start", v], { encoding: "utf8", env: { ...process.env } });
  const key = JSON.parse(readFileSync(join(v, "Agents/.planetarium-serve.json"), "utf8")).key;
  assert.ok(out.includes(key) || out.includes("no Wi-Fi"), "prints a link with the key");
  const base = "http://127.0.0.1:18787";
  assert.equal((await fetch(`${base}/`)).status, 401, "no key → refused");
  assert.equal((await fetch(`${base}/?key=wrong`, { redirect: "manual" })).status, 401);
  const first = await fetch(`${base}/?key=${key}`, { redirect: "manual" });
  assert.equal(first.status, 303);
  const cookie = first.headers.get("set-cookie").split(";")[0];
  const page = await fetch(`${base}/`, { headers: { cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /T-1<\/b> mine/);
  assert.equal((await fetch(`${base}/board`, { method: "POST", headers: { cookie } })).status, 405);
  assert.equal((await fetch(`${base}/../Agents/Board.md`, { headers: { cookie } })).status, 404);
  assert.match(run("serve", "stop", v), /stopped/);
  console.log("ok  serve (key, cookie, read-only)");
} finally {
  try { run("serve", "stop", join(tmp, "vault")); } catch {}
  rmSync(tmp, { recursive: true, force: true });
}
console.log("all checks passed");
