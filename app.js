(function () {
  "use strict";
  const LABELS = ["", "1 · Stale", "2 · Crumbly", "3 · Fine", "4 · Tasty", "5 · Dunk-worthy"];

  // A scalloped cookie, drawn once and reused everywhere a rating shows.
  const COOKIE_PATH = (() => {
    const pts = [];
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r = 21 + 1.3 * Math.cos(a * 16);
      pts.push((24 + r * Math.cos(a)).toFixed(2) + " " + (24 + r * Math.sin(a)).toFixed(2));
    }
    return "M" + pts.join("L") + "Z";
  })();
  function cookie(on, opts) {
    const o = opts || {};
    const dots = o.dots === false ? "" :
      '<g class="ck-dots"><circle cx="17" cy="19" r="1.5"/><circle cx="30" cy="17" r="1.5"/><circle cx="24" cy="26" r="1.5"/><circle cx="31" cy="30" r="1.5"/><circle cx="16" cy="30" r="1.5"/></g>';
    return '<svg viewBox="0 0 48 48" aria-hidden="true"' + (on ? "" : ' class="off"') + (o.cls ? ' data-k="' + o.cls + '"' : "") + '>' +
      '<path class="ck-body" d="' + COOKIE_PATH + '"/><circle class="ck-ring" cx="24" cy="24" r="16.5"/>' + dots + "</svg>";
  }
  function cookieEl(on, opts) { const t = document.createElement("template"); t.innerHTML = cookie(on, opts); return t.content.firstChild; }

  const hero = cookieEl(true); hero.classList.add("hero-cookie"); document.getElementById("heroCookie").appendChild(hero);
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
    absences: [],   // who was out of the office, per day
    reactions: [],  // up/down votes on people's ratings
    extras: true,   // false until the 002 SQL has been run in Supabase
    loaded: false, pick: 0, dirty: false, editing: false, confirmingAway: false,
  };

  // ---------- stars ----------
  const starsEl = $("stars");
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "star"; b.id = "star" + i;
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", i + " cookie" + (i > 1 ? "s" : ""));
    b.innerHTML = cookie(false);
    b.addEventListener("click", () => {
      state.pick = i; state.dirty = true; paintStars(); updateSubmit();
      for (let j = 1; j <= i; j++) { const s = $("star" + j); s.classList.remove("pop"); void s.offsetWidth; s.style.animationDelay = (j - 1) * 40 + "ms"; s.classList.add("pop"); }
    });
    b.addEventListener("mouseenter", () => paintStars(i));
    b.addEventListener("mouseleave", () => paintStars());
    starsEl.appendChild(b);
  }
  function votingOpen(d) { return d >= earliestVoteDay && d <= today; }
  function canVoteDay() { return votingOpen(state.day); }
  // Results stay hidden until you've rated that day (once voting closes, anyone can see them).
  function resultsHidden(d) { return votingOpen(d) && !myVote(d) && !myAbsence(d); }
  const myAbsence = (day) => state.absences.find((a) => a.day === day && a.voter_id === voterId);
  function paintStars(hover) {
    const v = hover || state.pick;
    for (let i = 1; i <= 5; i++) {
      const b = $("star" + i);
      b.classList.toggle("on", i <= v);
      b.firstChild.classList.toggle("off", i > v);
      b.setAttribute("aria-checked", String(i === state.pick));
      b.disabled = !state.sb || !canVoteDay() || !!myAbsence(state.day);
    }
    const label = $("starLabel");
    label.textContent = !canVoteDay() ? "Voting is closed for this day" : (v ? LABELS[v] : "Tap a cookie");
    label.classList.toggle("idle", !v || !canVoteDay());
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
    state.day = d; state.editing = false; state.confirmingAway = false;
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

  // ---------- "I wasn't in the office" ----------
  $("awayBtn").addEventListener("click", () => { state.confirmingAway = true; renderAway(); $("awayYes").focus(); });
  $("awayNo").addEventListener("click", () => { state.confirmingAway = false; renderAway(); });
  $("awayYes").addEventListener("click", async () => {
    if (!state.sb || myVote(state.day) || myAbsence(state.day)) return;
    $("awayYes").disabled = true;
    const row = { day: state.day, voter_id: voterId, voter_name: $("voterName").value.trim().slice(0, 40) };
    const { error } = await state.sb.from("absences").insert(row);
    $("awayYes").disabled = false;
    if (error && error.code !== "23505") { // 23505: already saved
      $("awayMsg").textContent = "That didn't save. Check your connection and try again."; return;
    }
    mergeRow(state.absences, row, ["day", "voter_id"]);
    state.confirmingAway = false; render();
  });

  function renderAway() {
    const away = myAbsence(state.day);
    const voted = myVote(state.day);
    $("voteForm").hidden = !!away;
    $("awayNote").hidden = !away;
    const offer = state.sb && state.extras && state.loaded && canVoteDay() && !voted && !away;
    $("awayBox").hidden = !offer;
    $("awayBtn").hidden = state.confirmingAway;
    $("awayConfirm").hidden = !state.confirmingAway;
    $("awayMsg").textContent = "";
  }

  // ---------- up/down votes on ratings ----------
  const reactionsFor = (day, rated) => state.reactions.filter((x) => x.day === day && x.rated_voter_id === rated);
  function tallyReactions(day, rated) {
    let up = 0, down = 0, mine = 0;
    reactionsFor(day, rated).forEach((x) => {
      if (x.value === 1) up++; else if (x.value === -1) down++;
      if (x.voter_id === voterId) mine = x.value;
    });
    return { up, down, mine, net: up - down };
  }
  async function react(day, rated, value) {
    if (!state.sb || rated === voterId) return;
    const cur = tallyReactions(day, rated).mine;
    const row = { day, rated_voter_id: rated, voter_id: voterId, value: cur === value ? 0 : value };
    const prev = state.reactions.slice();
    mergeRow(state.reactions, row, ["day", "rated_voter_id", "voter_id"]); renderTally(); // show it right away
    const { error } = await state.sb.from("rating_votes").upsert(row);
    if (error) { state.reactions = prev; renderTally(); banner("Your vote didn't save. Check your connection and try again."); }
  }
  function mergeRow(list, row, keys) {
    const i = list.findIndex((x) => keys.every((k) => x[k] === row[k]));
    if (i >= 0) list[i] = Object.assign({}, list[i], row); else list.push(row);
  }

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
    const h = hue(id); el.style.background = "hsl(" + (8 + (h % 40)) + " " + (35 + (h % 25)) + "% " + (30 + (h % 4) * 6) + "%)";
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

    renderAway(); renderTally(); renderBoard(); renderShare();
  }

  function renderTally() {
    const body = $("tallyBody");
    if (!state.loaded) return;
    const rs = ratingsFor(state.day);
    if (resultsHidden(state.day)) {
      const n = rs.length;
      body.innerHTML = '<div class="locked">' + cookie(false) + '<div><p class="locked-title">Rate it to see the results</p><p class="empty-note">' +
        (n ? n + (n === 1 ? " coworker has" : " coworkers have") + " rated this lunch. Results appear once you've added yours" + (state.extras ? ", or said you were out of the office." : ".")
           : "Nobody has rated this lunch yet. Be the first to tap a cookie above.") + "</p></div></div>";
      return;
    }
    if (!rs.length) { body.innerHTML = '<p class="empty-note">No ratings for this day yet.' + (canVoteDay() && !myAbsence(state.day) ? " Be the first to tap a cookie above." : "") + "</p>"; return; }
    const counts = [0, 0, 0, 0, 0, 0]; rs.forEach((r) => counts[r.stars]++);
    const max = Math.max(...counts);
    let html = '<div class="tally"><div class="badge">' + cookie(true, { dots: false }) + '<div><span class="num">' + avg(rs).toFixed(1) + '</span><span class="of">OUT OF 5</span></div></div><div class="dist">';
    for (let i = 5; i >= 1; i--) html += '<div class="row"><span class="lbl">' + i + cookie(true, { dots: false }) + '</span><span class="bar"><i style="width:' + (max ? (counts[i] / max) * 100 : 0) + '%"></i></span><span>' + counts[i] + "</span></div>";
    const out = state.absences.filter((a) => a.day === state.day).length;
    html += '</div><span class="sub">' + rs.length + " rating" + (rs.length > 1 ? "s" : "") + " so far" + (out ? " · " + out + " out of office" : "") + "</span></div>";
    html += '<ul class="voters" id="voterList"></ul>';
    body.innerHTML = html;
    const list = $("voterList");
    if (state.extras) {
      rs.forEach((r) => { r._score = tallyReactions(r.day, r.voter_id); });
      rs.sort((a, b) => b._score.net - a._score.net || String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    rs.forEach((r) => {
      const li = document.createElement("li");
      const mid = document.createElement("div");
      const who = document.createElement("div"); who.className = "who";
      who.textContent = r.voter_id === voterId ? "You" : (r.voter_name || "A coworker");
      mid.appendChild(who);
      if (r.comment) { const n = document.createElement("div"); n.className = "note"; n.textContent = r.comment; mid.appendChild(n); }
      if (state.extras) mid.appendChild(reactionRow(r));
      const sc = document.createElement("div"); sc.className = "score";
      for (let k = 1; k <= 5; k++) sc.appendChild(cookieEl(k <= r.stars, { dots: false }));
      sc.setAttribute("role", "img"); sc.setAttribute("aria-label", r.stars + " out of 5 cookies");
      li.append(avatar(r.voter_name, r.voter_id), mid, sc); list.appendChild(li);
    });
  }

  function reactionRow(r) {
    const t = r._score || tallyReactions(r.day, r.voter_id);
    const own = r.voter_id === voterId;
    const row = document.createElement("div"); row.className = "react";
    const who = r.voter_id === voterId ? "your rating" : (r.voter_name || "this coworker") + "'s rating";
    [[1, "up", t.up, "Agree with "], [-1, "down", t.down, "Disagree with "]].forEach(([val, cls, n, verb]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "react-btn " + cls + (t.mine === val ? " mine" : "");
      b.disabled = own || !state.sb;
      b.setAttribute("aria-pressed", String(t.mine === val));
      b.setAttribute("aria-label", verb + who + " (" + n + ")");
      b.title = own ? "You can't vote on your own rating" : (t.mine === val ? "Take back your vote" : verb + "this");
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (val === 1 ? "M8 3l5 6H3z" : "M8 13L3 7h10z") + '"/></svg>';
      const c = document.createElement("span"); c.textContent = n; b.appendChild(c);
      b.addEventListener("click", () => react(r.day, r.voter_id, val));
      row.appendChild(b);
    });
    return row;
  }

  function renderBoard() {
    const body = $("boardBody");
    if (!state.loaded) return;
    const groups = {};
    const allDays = new Set([...Object.keys(state.days), ...state.votes.map((v) => v.day)]);
    let hiddenDays = 0;
    allDays.forEach((d) => {
      const rs = ratingsFor(d); if (!rs.length) return;
      if (resultsHidden(d)) { hiddenDays++; return; }
      const name = state.days[d] || "Unnamed lunch";
      const key = name.trim().toLowerCase();
      const g = groups[key] || (groups[key] = { name, days: [], ratings: [] });
      g.days.push(d); g.ratings.push(...rs);
    });
    const rows = Object.values(groups).map((g) => ({ ...g, avg: avg(g.ratings) }))
      .sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length);
    const hiddenNote = hiddenDays ? '<p class="empty-note board-note">' + (hiddenDays === 1 ? "1 recent lunch joins" : hiddenDays + " recent lunches join") + " the leaderboard once you've rated " + (hiddenDays === 1 ? "it" : "them") + ".</p>" : "";
    if (!rows.length) { body.innerHTML = '<p class="empty-note">Lunches show up here, ranked by average cookies, once people start rating them.</p>' + hiddenNote; return; }
    const table = document.createElement("table"); table.className = "board";
    table.innerHTML = '<thead><tr><th>#</th><th>Lunch</th><th style="text-align:right">Avg</th></tr></thead>';
    const tb = document.createElement("tbody");
    rows.forEach((r, i) => {
      const tr = document.createElement("tr"); if (i < 3) tr.className = i === 0 ? "top first" : "top";
      const last = r.days.sort().slice(-1)[0];
      const tdR = document.createElement("td"); tdR.className = "rank"; tdR.textContent = i + 1;
      const tdD = document.createElement("td"); tdD.className = "dish"; tdD.textContent = r.name;
      if (r.avg >= 4.5 && r.ratings.length >= 3) { const p = document.createElement("span"); p.className = "pill good"; p.textContent = "crowd favorite"; tdD.appendChild(p); }
      if (r.avg < 2.5 && r.ratings.length >= 3) { const p = document.createElement("span"); p.className = "pill bad"; p.textContent = "retire it"; tdD.appendChild(p); }
      const sm = document.createElement("small");
      sm.textContent = (r.days.length > 1 ? "Served " + r.days.length + " times · last " : "Served ") + pretty(last, { month: "short", day: "numeric" }) + " · " + r.ratings.length + " rating" + (r.ratings.length > 1 ? "s" : "");
      tdD.appendChild(sm);
      const tdA = document.createElement("td"); tdA.className = "avg";
      const av = document.createElement("span"); av.textContent = r.avg.toFixed(1); av.appendChild(cookieEl(true, { dots: false }));
      av.setAttribute("aria-label", r.avg.toFixed(1) + " out of 5"); tdA.appendChild(av);
      tr.append(tdR, tdD, tdA); tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.replaceChildren(table);
    if (hiddenNote) body.insertAdjacentHTML("beforeend", hiddenNote);
  }

  function renderShare() {
    const cfg = window.LUNCH_CONFIG || {};
    const lunch = state.days[today];
    $("shareText").textContent = "🍽️ Lunch poll for " + pretty(today) + (cfg.teamName ? " (" + cfg.teamName + ")" : "") +
      (lunch ? ": " + lunch : "") + "\nHow was it? Rate it 1–5 cookies here: " + location.href.split("#")[0].split("?")[0];
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
    // These tables come from supabase/002_out_of_office_and_rating_votes.sql; the page still works without them.
    const [a, x] = await Promise.all([
      state.sb.from("absences").select("day, voter_id, voter_name").limit(10000),
      state.sb.from("rating_votes").select("day, rated_voter_id, voter_id, value").limit(50000),
    ]);
    state.extras = !a.error && !x.error;
    state.absences = a.error ? [] : a.data;
    state.reactions = x.error ? [] : x.data;
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
    .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, (p) => {
      if (p.new && p.new.day) { mergeRow(state.absences, p.new, ["day", "voter_id"]); render(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rating_votes" }, (p) => {
      if (p.new && p.new.day) { mergeRow(state.reactions, p.new, ["day", "rated_voter_id", "voter_id"]); renderTally(); }
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
