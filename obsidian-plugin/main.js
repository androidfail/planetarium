// Planetarium: Obsidian plugin that draws ```planetarium``` code blocks as a live solar-system board.
// Block body = board folder (default "Agents"). Re-reads Board.md and Hooked Agents.md every 3 s, ticks clocks every 1 s.
// The same render() is used by `planetarium.mjs serve` for the phone view.
const obsidian = (() => {
  try { return require("obsidian"); }
  catch { return { Plugin: class {}, MarkdownRenderChild: class {} }; } // only outside Obsidian (node self-test, web view)
})();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- parsing (format documented in commands/hook.md) ----------

const ID = "(\\d+(?:\\.\\d+)?)"; // "2" or sub-agent "2.1"

function parseItem(line) {
  const body = line.replace(/^\s*-\s+(\[[ xX]\]\s+)?/, "");
  const parts = body.split(/\s+·\s+/);
  const head = parts.shift();
  const idm = head.match(/^([TR]-\d+)\s*(.*)$/);
  const it = { id: idm ? idm[1] : "", title: idm ? idm[2] : head, scope: [], raw: body };
  for (const p of parts) {
    let m;
    if (p === "test") it.test = true;
    else if ((m = p.match(new RegExp(`^built by Agent ${ID}$`)))) it.builder = m[1];
    else if (it.test && !it.task && (m = p.match(/^(T-\d+)\s*(.*)$/))) { it.task = m[1]; it.taskTitle = m[2]; }
    else if ((m = p.match(new RegExp(`^Agent ${ID} → Agent ${ID}$`)))) { it.from = m[1]; it.to = m[2]; }
    else if ((m = p.match(new RegExp(`^Agent ${ID}(?: \\(waiting on ([^)]+)\\))?$`)))) { it.agent = m[1]; if (m[2]) it.waiting = m[2]; }
    else if ((m = p.match(/^scope:\s*(.*)$/))) it.scope = (m[1].match(/`[^`]+`/g) || [m[1]]).map((s) => s.replace(/`/g, "")).filter(Boolean);
    else if ((m = p.match(/^since (.*)$/))) it.since = m[1].trim();
    else if ((m = p.match(/^status:\s*(.*)$/))) {
      it.status = m[1].trim();
      const t = it.status.match(new RegExp(`^testing by Agent ${ID}`));
      if (t) it.tester = t[1];
    }
    else if ((m = p.match(/^notes:\s*(.*)$/))) it.notes = m[1];
    else if (/^\d{4}-\d\d-\d\d/.test(p)) it.done = p.trim();
    else it.detail = it.detail ? it.detail + " · " + p : p;
  }
  return it;
}

function parseBoard(text) {
  const s = { tasks: [], queue: [], requests: [], completed: [] };
  let cur = null, inComment = false;
  for (const line of text.split(/\r?\n/)) {
    if (inComment) { if (line.includes("-->")) inComment = false; continue; }
    if (line.includes("<!--")) { if (!line.includes("-->")) inComment = true; continue; }
    const h = line.match(/^##\s+(\w+)/);
    if (h) { cur = h[1].toLowerCase(); continue; }
    if (cur in s && /^\s*-\s+\S/.test(line)) s[cur].push(parseItem(line));
  }
  return s;
}

function parseAgents(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(new RegExp(`^\\s*-\\s+Agent ${ID}\\s+·\\s+hooked ([^·]+?)\\s+·\\s+status:\\s*(\\w+)`));
    if (m) out.push({ n: m[1], hooked: m[2], status: m[3].toLowerCase() });
  }
  return out;
}

// ---------- helpers ----------

// Each agent gets its own planet colour; a sub-agent (moon) is a lighter shade of its parent.
const hue = (id) => Math.round((parseInt(String(id), 10) * 137.508 + 200) % 360);
const isSub = (id) => String(id).includes(".");
const toDate = (s) => new Date(String(s).trim().replace(" ", "T"));

function ago(s, now) {
  const d = toDate(s);
  if (isNaN(d)) return "";
  let sec = Math.max(0, Math.floor((now - d) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  sec %= 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

// Hand-drawn 24×24 line icons.
const ICONS = {
  logo: '<circle cx="12" cy="12" r="4.2"/><ellipse cx="12" cy="12" rx="10.5" ry="3.6" transform="rotate(-22 12 12)"/><circle cx="21" cy="8.2" r="1.3" class="pl-fill"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 2.4"/><circle cx="12" cy="12" r="10.5" stroke-dasharray="1.2 3"/><circle cx="18.9" cy="10.8" r="1.6" class="pl-fill"/><circle cx="4.3" cy="16" r="1.1" class="pl-fill"/>',
  rocket: '<path d="M12 2.5c3.2 2.4 4.6 6 4.4 10.2L14.6 15H9.4l-1.8-2.3C7.4 8.5 8.8 4.9 12 2.5z"/><circle cx="12" cy="8.8" r="1.7"/><path d="M8 11.8 5.2 14.6l.6 3.4L9.4 15M16 11.8l2.8 2.8-.6 3.4L14.6 15"/><path d="M10.6 17.4 12 21.5l1.4-4.1"/>',
  comms: '<path d="M12 13v8M8.5 21h7"/><circle cx="12" cy="11" r="1.8"/><path d="M8.7 7.7a4.7 4.7 0 0 0 0 6.6M15.3 7.7a4.7 4.7 0 0 1 0 6.6M5.9 4.9a8.6 8.6 0 0 0 0 12.2M18.1 4.9a8.6 8.6 0 0 1 0 12.2"/>',
  chart: '<path d="m4.5 17.5 5-8.5 5 4.5 5-9"/><circle cx="4.5" cy="17.5" r="1.4" class="pl-fill"/><circle cx="9.5" cy="9" r="1.4" class="pl-fill"/><circle cx="14.5" cy="13.5" r="1.4" class="pl-fill"/><circle cx="19.5" cy="4.5" r="1.4" class="pl-fill"/><path d="M3 21.5h18" stroke-dasharray="1 2.2"/>',
  flag: '<path d="M2.5 20.5c4.5-3.6 14.5-3.6 19 0"/><path d="M9 18.6V4"/><path d="M9 4.5h8.5l-2.2 3.2 2.2 3.3H9"/><circle cx="15.5" cy="19.6" r=".6" class="pl-fill"/><circle cx="5.6" cy="19.2" r=".5" class="pl-fill"/>',
  test: '<path d="M9.5 3h5M10.5 3v6.2L5.6 18.4A1.8 1.8 0 0 0 7.2 21h9.6a1.8 1.8 0 0 0 1.6-2.6L13.5 9.2V3"/><path d="M7.6 15h8.8"/>',
};
const icon = (k, cls = "") => `<svg class="pl-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;
const mini = (id, cls = "") => id == null ? "" : `<span class="pl-mini ${isSub(id) ? "pl-moonlet" : ""} ${cls}" style="--h:${hue(id)}" title="Agent ${esc(id)}"></span>`;
const chip = (t) => `<span class="pl-chip">${esc(t)}</span>`;
const empty = (t) => `<p class="pl-empty">${t}</p>`;
const clock = (since, now) => `<span class="pl-clock" data-since="${esc(since || "")}">${ago(since, now)}</span>`;

function card(kind, iconKey, title, subtitle, count, inner) {
  return `<section class="pl-card pl-${kind}"><div class="pl-world"></div>
    <header>${icon(iconKey)}<div class="pl-titles"><h3>${title}</h3><span>${subtitle}</span></div><span class="pl-count">${count}</span></header>
    <div class="pl-list">${inner}</div></section>`;
}

// ---------- render ----------

function render(board, agents, now) {
  const working = new Set(board.queue.filter((q) => !q.waiting).map((q) => q.agent));
  const waiting = new Set(board.queue.filter((q) => q.waiting).map((q) => q.agent));
  const testing = new Set(board.requests.filter((r) => r.tester).map((r) => r.tester));
  const stateOf = (a) => a.status === "unhooked" ? "unhooked"
    : working.has(a.n) ? "working" : testing.has(a.n) ? "testing" : waiting.has(a.n) ? "waiting" : a.status;

  const top = agents.filter((a) => !isSub(a.n));
  const live = top.filter((a) => a.status !== "unhooked");
  const subsOf = (a) => agents.filter((s) => s.n.startsWith(a.n + ".") && s.status !== "unhooked");

  // Solar system: one orbit per live agent, moons for its running sub-agents. Lit side always faces the star.
  const span = 64 / Math.max(live.length, 1);
  const system = `<div class="pl-system" role="img" aria-label="${live.length} active agents">
    <div class="pl-star"></div>
    ${live.map((a, i) => {
      const t = 28 + i * 13;
      const moons = subsOf(a).map((s, k) =>
        `<span class="pl-moon-orbit pl-${stateOf(s)}" style="--mr:${30 + k * 10}px;--mt:${5 + k * 2.5}s;--ma:${k * 140}deg"><span class="pl-moon" style="--h:${hue(s.n)}"></span></span>`).join("");
      return `<div class="pl-orbit pl-${stateOf(a)}" style="--r:${Math.min(30 + (i + 1) * span, 96)}%;--t:${t}s;--a:${Math.round((i * 137.5 + 20) % 360)}deg">
        <div class="pl-orbiter"><span class="pl-planet" style="--h:${hue(a.n)}"></span>${moons}</div></div>`;
    }).join("")}
  </div>`;

  const legend = top.length ? top.map((a) => {
    const subs = subsOf(a);
    const subHtml = subs.length ? `<div class="pl-subs">${subs.map((s) =>
      `<span class="pl-sub pl-${stateOf(s)}" title="Agent ${esc(s.n)}: ${stateOf(s)}">${mini(s.n)}<i>${esc(s.n)}</i></span>`).join("")}</div>` : "";
    return `<div class="pl-agent pl-${stateOf(a)}">${mini(a.n)}<div class="pl-main"><b>Agent ${esc(a.n)}</b>
      <small>${stateOf(a)}${subs.length ? ` · ${subs.length} moon${subs.length > 1 ? "s" : ""}` : ""}</small>${subHtml}</div></div>`;
  }).join("") : empty("No agents hooked yet. Run the hook skill from your agent (/hook in Claude Code).");

  const queueHtml = board.queue.length ? board.queue.map((q) => {
    const stale = (now - toDate(q.since)) / 3600000 > 1;
    return `<div class="pl-row ${q.waiting ? "pl-wait" : ""} ${stale ? "pl-stale" : ""}">
      ${mini(q.agent)}<div class="pl-main"><b>${esc(q.id)}</b> ${esc(q.title)}
      <div class="pl-chips">${q.scope.map(chip).join("")}</div></div>
      <div class="pl-side">${q.waiting ? `<span class="pl-tag">waiting on ${esc(q.waiting)}</span>` : ""}${clock(q.since, now)}</div></div>`;
  }).join("") : empty("Queue is empty.");

  const taskHtml = board.tasks.length ? board.tasks.map((t) => {
    const failed = /^test failed/i.test(t.notes || "");
    return `<div class="pl-row ${failed ? "pl-failed" : ""}"><span class="pl-starpt"></span><div class="pl-main"><b>${esc(t.id)}</b> ${esc(t.title)}
     ${t.notes ? `<small>${esc(t.notes)}</small>` : ""}
     <div class="pl-chips">${t.scope.length ? t.scope.map(chip).join("") : `<span class="pl-chip pl-noscope">no scope</span>`}</div></div></div>`;
  }).join("") : empty("No tasks left.");

  const testHtml = (r) => {
    const run = !!r.tester;
    return `<div class="pl-row pl-req pl-test ${run ? "pl-running" : "pl-open"}">
      ${icon("test", "pl-rowicon")}<div class="pl-main"><b>${esc(r.id)}</b> Test ${esc(r.task || "")} ${esc(r.taskTitle || "")}
      <small>${mini(r.builder, "pl-inline")} built by Agent ${esc(r.builder ?? "?")}${r.notes ? " · " + esc(r.notes) : ""}</small>
      <div class="pl-chips">${r.scope.map(chip).join("")}</div></div>
      <div class="pl-side">${run ? `<span class="pl-tag">${mini(r.tester, "pl-inline")} testing · Agent ${esc(r.tester)}</span>${clock(r.since, now)}` : `<span class="pl-tag">needs tester</span>`}</div></div>`;
  };
  const reqHtml = board.requests.length ? board.requests.map((r) => {
    if (r.test) return testHtml(r);
    const st = (r.status || "pending").toLowerCase();
    const cls = st.startsWith("approved") ? "pl-ok" : st.startsWith("denied") ? "pl-no" : "pl-pending";
    return `<div class="pl-row pl-req ${cls}">${mini(r.from)}<span class="pl-arrow">⟶</span>${mini(r.to)}
      <div class="pl-main"><b>${esc(r.id)}</b> Agent ${esc(r.from)} → Agent ${esc(r.to)}<small>${esc(r.detail || "")}</small></div>
      <span class="pl-tag">${esc(st)}</span></div>`;
  }).join("") : empty("No open requests.");

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const doneToday = board.completed.filter((c) => (c.done || "").startsWith(today)).length;
  const doneHtml = board.completed.length ? board.completed.slice(0, 10).map((c) =>
    `<div class="pl-row pl-done">${mini(c.agent, "pl-dim")}<div class="pl-main"><b>${esc(c.id)}</b> ${esc(c.title)}
     ${c.notes ? `<small>${esc(c.notes)}</small>` : ""}</div><span class="pl-time">${esc((c.done || "").slice(11) || c.done || "")}</span></div>`
  ).join("") : empty("Nothing completed yet.");

  const openReq = board.requests.filter((r) => r.test || !/^(approved|denied)/i.test(r.status || "")).length;
  const tests = board.requests.filter((r) => r.test).length;
  const activeCount = agents.filter((a) => a.status !== "unhooked").length;

  return `<div class="pl-board">
    <div class="pl-head">${icon("logo", "pl-logo")}<h2>Planetarium</h2>
      <div class="pl-stats"><span><b>${activeCount}</b> agents</span><span><b>${board.queue.length}</b> in queue</span><span><b>${tests}</b> awaiting tests</span><span><b>${doneToday}</b> completed today</span></div></div>
    <div class="pl-grid">
    ${card("agents", "orbit", "Agents", "planets are agents, moons are sub-agents", activeCount, `<div class="pl-orbit-wrap">${system}<div class="pl-legend">${legend}</div></div>`)}
    ${card("queue", "rocket", "Queue", "being worked on", board.queue.length, queueHtml)}
    ${card("requests", "comms", "Requests", "approvals and tests", openReq, reqHtml)}
    ${card("tasks", "chart", "Tasks", "not started", board.tasks.length, taskHtml)}
    ${card("completed", "flag", "Completed", "done", `${doneToday} today`, doneHtml)}
    </div>
  </div>`;
}

// ---------- Obsidian ----------

class BoardChild extends obsidian.MarkdownRenderChild {
  constructor(el, app, dir) {
    super(el);
    this.app = app;
    this.dir = dir;
    this.last = "";
  }
  async read(path) {
    const a = this.app.vault.adapter;
    return (await a.exists(path)) ? a.read(path) : null;
  }
  async refresh() {
    const [b, a] = await Promise.all([this.read(`${this.dir}/Board.md`), this.read(`${this.dir}/Hooked Agents.md`)]);
    const key = (b || "") + "\0" + (a || "");
    if (key === this.last) return;
    this.last = key;
    this.containerEl.innerHTML = b == null ? `<p class="pl-empty">No ${esc(this.dir)}/Board.md found. Run /createboard.</p>`
      : render(parseBoard(b), parseAgents(a || ""), new Date());
  }
  tick() {
    const now = new Date();
    for (const el of this.containerEl.querySelectorAll(".pl-clock")) el.textContent = ago(el.dataset.since, now);
  }
  onload() {
    this.refresh();
    this.registerInterval(window.setInterval(() => this.refresh(), 3000));
    this.registerInterval(window.setInterval(() => this.tick(), 1000));
  }
}

class PlanetariumPlugin extends obsidian.Plugin {
  onload() {
    this.registerMarkdownCodeBlockProcessor("planetarium", (src, el, ctx) => {
      ctx.addChild(new BoardChild(el, this.app, src.trim() || "Agents"));
    });
    // Notes drawn before this plugin loaded keep showing raw code; redraw open board notes once.
    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const text = leaf.view.getViewData ? leaf.view.getViewData() : "";
        if (!text.includes("```planetarium")) continue;
        if (leaf.rebuildView) leaf.rebuildView();
        else { const s = leaf.getViewState(); leaf.setViewState({ type: "empty" }).then(() => leaf.setViewState(s)); }
      }
    });
  }
}

module.exports = PlanetariumPlugin;
module.exports.lib = { parseBoard, parseAgents, render, ago };
