(function () {
  "use strict";
  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
  const LABELS = ["", "1 · Skip it", "2 · Meh", "3 · Fine", "4 · Good", "5 · Order it again"];
  const MAX_BACK_DAYS = 7; // matches the votes_recent_day check in supabase/schema.sql
  const $ = (id) => document.getElementById(id);

  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function shift(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function pretty(s, opts) { return parseYmd(s).toLocaleDateString(undefined, opts || { weekday: "long", month: "short", day: "numeric" }); }

  // ---------- this browser's voter identity (no login) ----------
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }
  let voterId = store("lunch.voterId");
  if (!voterId) {
    voterId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now().toString(36));
    store("lunch.voterId", voterId);
  }
  $("voterName").value = store("lunch.name") || "";

  const today = ymd(new Date());
  const earliestVoteDay = shift(today, -MAX_BACK_DAYS);
  const state = {
    day: today, sb: null,
    days: {},    // date -> lunch name
    votes: [],   // rows from the votes table
    loaded: false, pick: 0, dirty: false, editing: false,
  };

  // ---------- stars ----------
  const starsEl = $("stars");
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "star"; b.id = "star" + i;
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", i + " star" + (i > 1 ? "s" : ""));
    b.innerHTML = STAR_SVG;
    b.addEventListener("click", () => { state.pick = i; state.dirty = true; paintStars(); updateSubmit(); });
    b.addEventListener("mouseenter", () => paintStars(i));
    b.addEventListener("mouseleave", () => paintStars());
    starsEl.appendChild(b);
  }
  function canVoteDay() { return state.day >= earliestVoteDay && state.day <= today; }
  function paintStars(hover) {
    const v = hover || state.pick;
    for (let i = 1; i <= 5; i++) {
      const b = $("star" + i);
      b.classList.toggle("on", i <= v);
      b.setAttribute("aria-checked", String(i === state.pick));
      b.disabled = !state.sb || !canVoteDay();
    }
    $("starLabel").textContent = !canVoteDay() ? "Voting is closed for this day" : (v ? LABELS[v] : "Pick a rating");
  }

  const myVote = (day) => state.votes.find((v) => v.day === day && v.voter_id === voterId);
  function updateSubmit() {
    const mv = myVote(state.day);
    const name = $("voterName").value.trim();
    const changed = state.pick && (!mv || mv.stars !== state.pick || (mv.comment || "") !== $("comment").value.trim() || (mv.voter_name || "") !== name);
    $("submitVote").disabled = !state.sb || !canVoteDay() || !changed;
    $("submitVote").textContent = mv ? "Update rating" : "Submit rating";
  }
  $("comment").addEventListener("input", () => { state.dirty = true; updateSubmit(); });
  $("voterName").addEventListener("input", () => { store("lunch.name", $("voterName").value.trim()); updateSubmit(); });

  function loadMyVoteIntoForm() {
    const mv = myVote(state.day);
    state.pick = mv ? mv.stars : 0;
    $("comment").value = mv ? (mv.comment || "") : "";
    state.dirty = false;
    paintStars(); updateSubmit();
  }

  // ---------- day navigation ----------
  function setDay(d) {
    state.day = d; state.editing = false;
    loadMyVoteIntoForm();
    $("voteStatus").textContent = ""; $("voteStatus").className = "status";
    render();
  }
  $("prevDay").addEventListener("click", () => setDay(shift(state.day, -1)));
  $("nextDay").addEventListener("click", () => { if (state.day < today) setDay(shift(state.day, 1)); });
  $("goToday").addEventListener("click", () => setDay(today));

  // ---------- lunch name ----------
  $("editLunch").addEventListener("click", () => {
    state.editing = true;
    $("lunchInput").value = state.days[state.day] || "";
    render(); $("lunchInput").focus();
  });
  $("cancelLunch").addEventListener("click", () => { state.editing = false; render(); });
  $("lunchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("lunchInput").value.trim().slice(0, 80);
    if (!name || !state.sb) return;
    const { error } = await state.sb.from("days").upsert({ day: state.day, lunch: name, updated_at: new Date().toISOString() });
    if (error) { banner("The lunch name didn't save: " + error.message); return; }
    state.days[state.day] = name; state.editing = false; render();
  });

  // ---------- voting ----------
  let saving = false;
  $("voteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (saving || !state.pick || !state.sb || !canVoteDay()) return;
    saving = true; $("submitVote").disabled = true;
    const status = $("voteStatus"); status.className = "status"; status.textContent = "Saving…";
    const row = {
      day: state.day, voter_id: voterId,
      voter_name: $("voterName").value.trim().slice(0, 40),
      stars: state.pick, comment: $("comment").value.trim().slice(0, 200),
      updated_at: new Date().toISOString(),
    };
    const { error } = await state.sb.from("votes").upsert(row);
    saving = false;
    if (error) {
      status.className = "status err";
      status.textContent = "Your rating didn't save. Check your connection and try again.";
      updateSubmit(); return;
    }
    mergeVote(row); state.dirty = false;
    status.className = "status ok"; status.textContent = "Saved. Thanks for rating.";
    render(); updateSubmit();
  });

  function mergeVote(row) {
    const i = state.votes.findIndex((v) => v.day === row.day && v.voter_id === row.voter_id);
    if (i >= 0) state.votes[i] = row; else state.votes.push(row);
  }
  function banner(msg) { const b = $("banner"); b.textContent = msg; b.hidden = !msg; }

  // ---------- rendering ----------
  function ratingsFor(day) {
    return state.votes.filter((v) => v.day === day && v.stars >= 1 && v.stars <= 5)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }
  const avg = (xs) => xs.reduce((a, x) => a + x.stars, 0) / xs.length;

  function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
  function avatar(name, id) {
    const el = document.createElement("span"); el.className = "avatar";
    el.style.background = "hsl(" + hue(id) + " 45% 42%)";
    el.textContent = (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function render() {
    const isToday = state.day === today;
    $("dateLabel").textContent = isToday ? "Today · " + pretty(state.day, { month: "short", day: "numeric" }) : pretty(state.day);
    $("nextDay").disabled = state.day >= today;
    $("goToday").hidden = isToday;
    $("lunchEyebrow").textContent = isToday ? "On the menu today" : "On the menu that day";

    const lunch = state.days[state.day];
    const nameEl = $("lunchName");
    nameEl.textContent = lunch || (state.loaded ? "Nobody has named this lunch yet" : "Loading…");
    nameEl.classList.toggle("empty", !lunch);
    nameEl.hidden = state.editing;
    $("lunchForm").hidden = !state.editing;
    $("editLunch").hidden = state.editing || !state.sb;
    $("editLunch").textContent = lunch ? "Change name" : "Name this lunch";

    renderTally(); renderBoard(); renderShare();
  }

  function renderTally() {
    const body = $("tallyBody");
    if (!state.loaded) return;
    const rs = ratingsFor(state.day);
    if (!rs.length) { body.innerHTML = '<p class="empty-note">No ratings for this day yet. Be the first to pick some stars above.</p>'; return; }
    const counts = [0, 0, 0, 0, 0, 0]; rs.forEach((r) => counts[r.stars]++);
    const max = Math.max(...counts);
    let html = '<div class="tally"><div class="big"><span class="num">' + avg(rs).toFixed(1) + '</span><span class="sub">out of 5 · ' + rs.length + " rating" + (rs.length > 1 ? "s" : "") + '</span></div><div class="dist">';
    for (let i = 5; i >= 1; i--) html += '<div class="row"><span>' + i + '★</span><span class="bar"><i style="width:' + (max ? (counts[i] / max) * 100 : 0) + '%"></i></span><span>' + counts[i] + "</span></div>";
    html += '</div></div><ul class="voters" id="voterList"></ul>';
    body.innerHTML = html;
    const list = $("voterList");
    rs.forEach((r) => {
      const li = document.createElement("li");
      const mid = document.createElement("div");
      const who = document.createElement("div"); who.className = "who";
      who.textContent = r.voter_id === voterId ? "You" : (r.voter_name || "A coworker");
      mid.appendChild(who);
      if (r.comment) { const n = document.createElement("div"); n.className = "note"; n.textContent = r.comment; mid.appendChild(n); }
      const sc = document.createElement("div"); sc.className = "score"; sc.textContent = "★".repeat(r.stars);
      sc.setAttribute("aria-label", r.stars + " out of 5");
      li.append(avatar(r.voter_name, r.voter_id), mid, sc); list.appendChild(li);
    });
  }

  function renderBoard() {
    const body = $("boardBody");
    if (!state.loaded) return;
    const groups = {};
    const allDays = new Set([...Object.keys(state.days), ...state.votes.map((v) => v.day)]);
    allDays.forEach((d) => {
      const rs = ratingsFor(d); if (!rs.length) return;
      const name = state.days[d] || "Unnamed lunch";
      const key = name.trim().toLowerCase();
      const g = groups[key] || (groups[key] = { name, days: [], ratings: [] });
      g.days.push(d); g.ratings.push(...rs);
    });
    const rows = Object.values(groups).map((g) => ({ ...g, avg: avg(g.ratings) }))
      .sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length);
    if (!rows.length) { body.innerHTML = '<p class="empty-note">Lunches show up here, ranked by average stars, once people start rating them.</p>'; return; }
    const table = document.createElement("table"); table.className = "board";
    table.innerHTML = '<thead><tr><th>#</th><th>Lunch</th><th style="text-align:right">Avg</th></tr></thead>';
    const tb = document.createElement("tbody");
    rows.forEach((r, i) => {
      const tr = document.createElement("tr"); if (i < 3) tr.className = "top";
      const last = r.days.sort().slice(-1)[0];
      const tdR = document.createElement("td"); tdR.className = "rank"; tdR.textContent = i + 1;
      const tdD = document.createElement("td"); tdD.className = "dish"; tdD.textContent = r.name;
      if (r.avg >= 4.5 && r.ratings.length >= 3) { const p = document.createElement("span"); p.className = "pill good"; p.textContent = "crowd favorite"; tdD.appendChild(p); }
      if (r.avg < 2.5 && r.ratings.length >= 3) { const p = document.createElement("span"); p.className = "pill bad"; p.textContent = "retire it"; tdD.appendChild(p); }
      const sm = document.createElement("small");
      sm.textContent = (r.days.length > 1 ? "Served " + r.days.length + " times · last " : "Served ") + pretty(last, { month: "short", day: "numeric" }) + " · " + r.ratings.length + " rating" + (r.ratings.length > 1 ? "s" : "");
      tdD.appendChild(sm);
      const tdA = document.createElement("td"); tdA.className = "avg"; tdA.textContent = r.avg.toFixed(1) + " ★";
      tr.append(tdR, tdD, tdA); tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.replaceChildren(table);
  }

  function renderShare() {
    const cfg = window.LUNCH_CONFIG || {};
    const lunch = state.days[today];
    $("shareText").textContent = "🍽️ Lunch poll for " + pretty(today) + (cfg.teamName ? " (" + cfg.teamName + ")" : "") +
      (lunch ? ": " + lunch : "") + "\nHow was it? Rate it 1–5 stars here: " + location.href.split("#")[0].split("?")[0];
  }
  $("copyShare").addEventListener("click", () => {
    const text = $("shareText").textContent, st = $("copyStatus");
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("shareText")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); st.className = "status"; st.textContent = "Text selected. Press Ctrl+C to copy."; };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => { st.className = "status ok"; st.textContent = "Copied"; }, fallback);
  });

  // ---------- boot ----------
  paintStars(); render();

  const cfg = window.LUNCH_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    const b = $("banner");
    b.className = "setup"; b.hidden = false;
    b.innerHTML = "<p><strong>This poll isn't connected to a database yet.</strong></p><p>Add your Supabase URL and anon key to <code>config.js</code>, then run <code>supabase/schema.sql</code> in the Supabase SQL Editor. The README has the steps.</p>";
    state.loaded = true; render(); return;
  }

  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  async function loadAll() {
    const [d, v] = await Promise.all([
      state.sb.from("days").select("day, lunch"),
      state.sb.from("votes").select("day, voter_id, voter_name, stars, comment, updated_at").limit(10000),
    ]);
    if (d.error || v.error) {
      banner("Couldn't load the results: " + (d.error || v.error).message + ". Reload the page to try again.");
      return;
    }
    banner("");
    state.days = {}; d.data.forEach((r) => { state.days[r.day] = r.lunch; });
    state.votes = v.data;
    const first = !state.loaded;
    state.loaded = true;
    if (first || !state.dirty) loadMyVoteIntoForm();
    render();
  }

  const timer = setTimeout(() => { if (!state.loaded) banner("Results are taking a while to load. They'll appear as soon as they arrive."); }, 10000);
  loadAll().finally(() => clearTimeout(timer));

  // Live updates while the page is open.
  state.sb.channel("lunch")
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, (p) => {
      if (p.new && p.new.day) { mergeVote(p.new); if (!state.dirty) loadMyVoteIntoForm(); render(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "days" }, (p) => {
      if (p.new && p.new.day) { state.days[p.new.day] = p.new.lunch; render(); }
    })
    .subscribe();

  // Refresh when someone comes back to the tab the next day.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ymd(new Date()) !== today) location.reload();
  });
})();
