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

  const state0 = { linkNote: "" };
  // ---------- this browser's voter identity (no login) ----------
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }
  let voterId = store("lunch.voterId");
  if (!voterId) {
    voterId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now().toString(36));
    store("lunch.voterId", voterId);
  }
  // Ids this browser has used before linking to another device. They still count as "you".
  let aliasIds = [];
  try { aliasIds = JSON.parse(store("lunch.aliasIds") || "[]").filter((x) => typeof x === "string"); } catch (e) { aliasIds = []; }
  const isMe = (id) => !!id && (id === voterId || aliasIds.includes(id));

  // Opening a personal link (#device=<id>.<id>...) makes this browser the same person as the other device.
  (function adoptDeviceLink() {
    const m = /^#device=([A-Za-z0-9-]{8,64}(?:\.[A-Za-z0-9-]{8,64}){0,20})$/.exec(location.hash);
    if (!m) return;
    const ids = m[1].split(".");
    history.replaceState(null, "", location.pathname + location.search);
    if (ids[0] === voterId) { state0.linkNote = "This browser is already linked to you."; return; }
    aliasIds = [...new Set([voterId, ...aliasIds, ...ids.slice(1)])].filter((x) => x && x !== ids[0]);
    voterId = ids[0];
    store("lunch.voterId", voterId);
    store("lunch.aliasIds", JSON.stringify(aliasIds));
    state0.linkNote = "This browser is now linked to you. Your ratings, streak and results from your other device show here too.";
  })();

  $("voterName").value = store("lunch.name") || "";

  const today = ymd(new Date());
  const earliestVoteDay = shift(today, -MAX_BACK_DAYS);
  // Only days with an office lunch count (set in config.js; 1 = Monday ... 4 = Thursday). Other days are skipped everywhere.
  const LUNCH_WEEKDAYS = ((window.LUNCH_CONFIG || {}).lunchWeekdays || [1, 2, 3, 4]).filter((n) => n >= 0 && n <= 6);
  const isNoLunchDay = (d) => !LUNCH_WEEKDAYS.includes(parseYmd(d).getDay()); // "weekend" = any day without lunch
  function stepWorkday(d, dir) { for (let i = 0; i < 7; i++) { d = shift(d, dir); if (!isNoLunchDay(d)) return d; } return d; }
  const lunchToday = isNoLunchDay(today) ? stepWorkday(today, -1) : today; // on a no-lunch day, the last lunch
  function mondayOf(d) { const w = parseYmd(d).getDay(); return shift(d, w === 0 ? -6 : 1 - w); }
  const state = {
    day: lunchToday, sb: null, recapMonday: mondayOf(lunchToday), ins: null,
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
  const myAbsence = (day) => state.absences.find((a) => a.day === day && isMe(a.voter_id));
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

  const myVote = (day) => state.votes.find((v) => v.day === day && isMe(v.voter_id));
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
  // ---------- calendar ----------
  const monthStart = (d) => d.slice(0, 8) + "01";
  function shiftMonth(m, n) { const d = parseYmd(m); d.setMonth(d.getMonth() + n, 1); return ymd(d); }
  function earliestMonth() {
    const all = [...Object.keys(state.days), ...state.votes.map((v) => v.day)].sort();
    return monthStart(all[0] || lunchToday);
  }
  $("dateLabel").addEventListener("click", () => {
    state.calOpen = !state.calOpen;
    if (state.calOpen) state.calMonth = monthStart(state.day);
    renderCal();
    if (state.calOpen) { const sel = document.querySelector(".cal-day.selected") || document.querySelector(".cal-day:not(:disabled)"); if (sel) sel.focus(); }
  });
  $("calPrev").addEventListener("click", () => { state.calMonth = shiftMonth(state.calMonth, -1); renderCal(); });
  $("calNext").addEventListener("click", () => { state.calMonth = shiftMonth(state.calMonth, 1); renderCal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.calOpen) { state.calOpen = false; renderCal(); $("dateLabel").focus(); } });
  // ← → step between lunches (not while typing in a box).
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "radio")) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); setDay(stepWorkday(state.day, -1)); }
    else { const n = stepWorkday(state.day, 1); if (n <= today) { e.preventDefault(); setDay(n); } }
  });

  function renderCal() {
    const cal = $("cal"), btn = $("dateLabel");
    cal.hidden = !state.calOpen; btn.setAttribute("aria-expanded", String(!!state.calOpen));
    if (!state.calOpen) { delete $("calGrid").dataset.animKey; return; }
    const m = state.calMonth || monthStart(state.day);
    $("calMonth").textContent = parseYmd(m).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    $("calPrev").disabled = m <= earliestMonth();
    $("calNext").disabled = m >= monthStart(today);

    const cols = LUNCH_WEEKDAYS.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
    const grid = $("calGrid");
    playOnce(grid, m);
    grid.style.gridTemplateColumns = "repeat(" + cols.length + ", minmax(0, 1fr))";
    grid.replaceChildren();
    cols.forEach((w) => {
      const h = document.createElement("div"); h.className = "cal-dow"; h.setAttribute("role", "columnheader");
      const sample = new Date(2024, 0, 1 + ((w + 6) % 7)); // Jan 1 2024 was a Monday
      h.textContent = sample.toLocaleDateString(undefined, { weekday: "short" });
      grid.appendChild(h);
    });
    const month = m.slice(0, 7);
    const lastDay = shift(shiftMonth(m, 1), -1);
    for (let mon = mondayOf(m); mon <= lastDay; mon = shift(mon, 7)) {
      if (!cols.some((w) => shift(mon, (w + 6) % 7).slice(0, 7) === month)) continue; // week has no lunch days this month
      cols.forEach((w) => {
        const d = shift(mon, (w + 6) % 7);
        if (d.slice(0, 7) !== month) { const pad = document.createElement("div"); pad.className = "cal-pad"; grid.appendChild(pad); return; }
        const b = document.createElement("button"); b.type = "button"; b.className = "cal-day";
        const future = d > today;
        const lunch = state.days[d];
        const rated = myVote(d), out = myAbsence(d);
        const hasData = !!lunch || state.votes.some((v) => v.day === d) || state.absences.some((a) => a.day === d);
        const todo = !rated && !out && votingOpen(d) && !future && (hasData || d === lunchToday);
        if (rated) b.classList.add("rated"); else if (out) b.classList.add("out"); else if (todo) b.classList.add("todo");
        if (!hasData && !future && d !== lunchToday) b.classList.add("quiet");
        if (d === lunchToday) b.classList.add("today");
        if (d === state.day) { b.classList.add("selected"); b.setAttribute("aria-current", "date"); }
        b.disabled = future;
        const n = document.createElement("span"); n.className = "n"; n.textContent = parseYmd(d).getDate();
        const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = lunch || (hasData ? "Unnamed" : "");
        const mark = document.createElement("i"); mark.className = "mark";
        b.append(n, nm, mark);
        const status = rated ? "you rated it " + rated.stars + " out of 5" : out ? "you were out of the office" : todo ? "you haven't rated it yet" : future ? "coming up" : !hasData ? "no ratings" : "voting closed";
        b.setAttribute("aria-label", pretty(d) + ", " + (lunch || "no lunch named") + ", " + status);
        b.title = (lunch || "No lunch named") + " · " + status.charAt(0).toUpperCase() + status.slice(1);
        b.addEventListener("click", () => { state.calOpen = false; setDay(d); renderCal(); $("dateLabel").focus(); });
        b.style.setProperty("--i", grid.querySelectorAll(".cal-day").length);
        grid.appendChild(b);
      });
    }
  }

  // ---------- motion ----------
  // Animations play only when something meaningful changes (a new day, results unlocking), never on
  // every live refresh. Everything is skipped for people who've asked their system to reduce motion.
  const calm = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  function playOnce(el, key, cls) {
    cls = cls || "reveal";
    if (!el || el.dataset.animKey === key) return false;
    el.dataset.animKey = key;
    if (calm()) return false;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    clearTimeout(el._animT); el._animT = setTimeout(() => el.classList.remove(cls), 1600);
    return true;
  }
  function countUp(el, to, digits) {
    if (!el || calm()) return;
    const start = performance.now(), dur = 900;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = (to * eased).toFixed(digits);
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = (0).toFixed(digits); requestAnimationFrame(step);
  }
  function crumbBurst(from) {
    if (!from || calm()) return;
    const r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 14; i++) {
      const c = document.createElement("span"); c.className = "crumb";
      const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
      c.style.left = cx + "px"; c.style.top = cy + "px";
      c.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      c.style.setProperty("--dy", Math.sin(ang) * dist - 30 + "px");
      c.style.setProperty("--s", (0.5 + Math.random() * 0.8).toFixed(2));
      c.style.animationDelay = Math.random() * 60 + "ms";
      document.body.appendChild(c); setTimeout(() => c.remove(), 1100);
    }
  }

  function setDay(d) {
    if (d !== state.day && !calm()) { // slide the ballot in from the direction you moved
      const inner = document.querySelector(".ballot .inner");
      inner.classList.remove("slide-next", "slide-prev"); void inner.offsetWidth;
      inner.classList.add(d > state.day ? "slide-next" : "slide-prev");
      clearTimeout(inner._t); inner._t = setTimeout(() => inner.classList.remove("slide-next", "slide-prev"), 500);
    }
    state.day = d; state.editing = false; state.confirmingAway = false;
    loadMyVoteIntoForm();
    $("voteStatus").textContent = ""; $("voteStatus").className = "status";
    render();
  }
  $("prevDay").addEventListener("click", () => setDay(stepWorkday(state.day, -1)));
  $("nextDay").addEventListener("click", () => { const n = stepWorkday(state.day, 1); if (n <= today) setDay(n); });
  $("goToday").addEventListener("click", () => setDay(lunchToday));

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
      day: state.day, voter_id: (myVote(state.day) || {}).voter_id || voterId,
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
    crumbBurst($("submitVote"));
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
  // People who react have rated or marked themselves out that day, so their name comes from there.
  function nameOf(id, day) {
    if (isMe(id)) return "You";
    const same = state.votes.find((v) => v.voter_id === id && v.day === day) || state.absences.find((a) => a.voter_id === id && a.day === day);
    if (same && same.voter_name) return same.voter_name;
    const any = state.votes.find((v) => v.voter_id === id && v.voter_name) || state.absences.find((a) => a.voter_id === id && a.voter_name);
    return any ? any.voter_name : "Someone without a name";
  }
  function tallyReactions(day, rated) {
    let up = 0, down = 0, mine = 0, t_mineId = null; const upBy = [], downBy = [];
    reactionsFor(day, rated).forEach((x) => {
      if (x.value === 1) { up++; upBy.push(nameOf(x.voter_id, day)); }
      else if (x.value === -1) { down++; downBy.push(nameOf(x.voter_id, day)); }
      if (isMe(x.voter_id)) { mine = x.value; t_mineId = x.voter_id; }
    });
    return { up, down, mine, mineId: t_mineId, net: up - down, upBy, downBy };
  }
  async function react(day, rated, value) {
    if (!state.sb || isMe(rated)) return;
    const cur = tallyReactions(day, rated).mine;
    const row = { day, rated_voter_id: rated, voter_id: tallyReactions(day, rated).mineId || voterId, value: cur === value ? 0 : value };
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
    const isToday = state.day === lunchToday;
    $("dateLabel").textContent = isToday && lunchToday === today ? "Today · " + pretty(state.day, { month: "short", day: "numeric" }) : pretty(state.day);
    $("nextDay").disabled = stepWorkday(state.day, 1) > today;
    $("goToday").hidden = isToday;
    $("lunchEyebrow").textContent = isToday && lunchToday === today ? "On the menu today" : "On the menu that day";

    const lunch = state.days[state.day];
    const nameEl = $("lunchName");
    nameEl.textContent = lunch || (state.loaded ? "Nobody has named this lunch yet" : "Loading…");
    nameEl.classList.toggle("empty", !lunch);
    nameEl.hidden = state.editing;
    $("lunchForm").hidden = !state.editing;
    $("editLunch").hidden = state.editing || !state.sb;
    $("editLunch").textContent = lunch ? "Change name" : "Name this lunch";

    computeInsights();
    renderCal(); renderAway(); renderStreak(); renderTally(); renderBoard(); renderRecap(); renderTaste(); renderShare();
  }

  function renderTally() {
    const body = $("tallyBody");
    if (!state.loaded) return;
    const rs = ratingsFor(state.day);
    if (resultsHidden(state.day)) {
      const n = rs.length;
      playOnce(body, state.day + "|locked");
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
    if (playOnce(body, state.day + "|open")) countUp(body.querySelector(".badge .num"), avg(rs), 1);
    const list = $("voterList");
    if (state.extras) {
      rs.forEach((r) => { r._score = tallyReactions(r.day, r.voter_id); });
      rs.sort((a, b) => b._score.net - a._score.net || String(b.updated_at).localeCompare(String(a.updated_at)));
    }
    rs.forEach((r) => {
      const li = document.createElement("li");
      const mid = document.createElement("div");
      const who = document.createElement("div"); who.className = "who";
      who.textContent = isMe(r.voter_id) ? "You" : (r.voter_name || "A coworker");
      mid.appendChild(who);
      if (r.comment) { const n = document.createElement("div"); n.className = "note"; n.textContent = r.comment; mid.appendChild(n); }
      if (state.extras) mid.appendChild(reactionRow(r));
      const sc = document.createElement("div"); sc.className = "score";
      for (let k = 1; k <= 5; k++) sc.appendChild(cookieEl(k <= r.stars, { dots: false }));
      sc.setAttribute("role", "img"); sc.setAttribute("aria-label", r.stars + " out of 5 cookies");
      const st = state.ins ? state.ins.streakFor(r.voter_id, r.voter_name) : 0;
      if (st >= 2) { const c = document.createElement("span"); c.className = "streak-chip"; c.textContent = "🔥 " + st; c.title = st + " lunches in a row"; who.appendChild(c); }
      li.style.setProperty("--i", list.children.length);
      li.append(avatar(r.voter_name, r.voter_id), mid, sc); list.appendChild(li);
    });
  }

  function reactionRow(r) {
    const t = r._score || tallyReactions(r.day, r.voter_id);
    const own = isMe(r.voter_id);
    const row = document.createElement("div"); row.className = "react";
    const who = isMe(r.voter_id) ? "your rating" : (r.voter_name || "this coworker") + "'s rating";
    [[1, "up", t.up, "Agree with ", t.upBy, "Upvoted by "], [-1, "down", t.down, "Disagree with ", t.downBy, "Downvoted by "]].forEach(([val, cls, n, verb, by, byLabel]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "react-btn " + cls + (t.mine === val ? " mine" : "");
      const off = own || !state.sb;
      b.classList.toggle("off", off);
      if (off) b.setAttribute("aria-disabled", "true"); // not `disabled`, so hovering still shows who voted
      b.setAttribute("aria-pressed", String(t.mine === val));
      const list = by.length ? byLabel + by.join(", ") : (val === 1 ? "No upvotes yet" : "No downvotes yet");
      b.dataset.tip = list + (own ? " · You can't vote on your own rating" : "");
      b.setAttribute("aria-label", verb + who + ". " + list);
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (val === 1 ? "M8 3l5 6H3z" : "M8 13L3 7h10z") + '"/></svg>';
      const c = document.createElement("span"); c.textContent = n; b.appendChild(c);
      b.addEventListener("click", () => { if (!off) react(r.day, r.voter_id, val); });
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
      tr.style.setProperty("--i", i);
      tr.append(tdR, tdD, tdA); tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.replaceChildren(table);
    playOnce(body, rows.map((r) => r.name).join("|") + "|" + hiddenDays);
    if (hiddenNote) body.insertAdjacentHTML("beforeend", hiddenNote);
  }

  // ---------- streaks, recap, taste twins (see insights.js) ----------
  function computeInsights() {
    if (!state.loaded || !window.LunchInsights) { state.ins = null; return; }
    const workdays = (d) => !isNoLunchDay(d);
    const days = {}; Object.keys(state.days).filter(workdays).forEach((d) => { days[d] = state.days[d]; });
    state.ins = LunchInsights.build({
      votes: state.votes.filter((v) => workdays(v.day)),
      absences: state.absences.filter((a) => workdays(a.day)),
      reactions: state.reactions, days, myId: voterId, isMe, today, isHidden: resultsHidden,
    });
  }

  function renderStreak() {
    const el = $("streakLine"); const ins = state.ins;
    const n = ins ? ins.myStreak : 0;
    const doneToday = myVote(lunchToday) || myAbsence(lunchToday);
    if (!n || state.day !== lunchToday) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = doneToday
      ? "🔥 You're on a " + n + "-lunch streak. Out-of-office days count too."
      : "🔥 Rate " + (lunchToday === today ? "today's" : pretty(lunchToday, { weekday: "long" }) + "'s") + " lunch (or mark yourself out) to keep your " + n + "-lunch streak going.";
  }

  const weekDates = (monday) => [0, 1, 2, 3, 4, 5, 6].map((i) => shift(monday, i)).filter((d) => !isNoLunchDay(d));
  const lunchNameOf = (d) => state.days[d] || "Unnamed lunch";
  const short = (d) => pretty(d, { weekday: "short", month: "short", day: "numeric" });
  $("prevWeek").addEventListener("click", () => { state.recapPicked = true; state.recapMonday = shift(state.recapMonday, -7); renderRecap(); });
  $("nextWeek").addEventListener("click", () => { state.recapPicked = true; if (state.recapMonday < mondayOf(lunchToday)) { state.recapMonday = shift(state.recapMonday, 7); renderRecap(); } });

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function renderRecap() {
    const body = $("recapBody"), ins = state.ins, monday = state.recapMonday;
    const thisWeek = monday === mondayOf(lunchToday);
    $("weekLabel").textContent = thisWeek ? "This week" : "Week of " + pretty(monday, { month: "short", day: "numeric" });
    $("nextWeek").disabled = thisWeek;
    $("recapStatus").textContent = ""; $("recapText").hidden = true;
    if (!state.loaded || !ins) return;
    const r = ins.recap(monday, weekDates(monday), lunchNameOf, false);
    playOnce(body, monday + "|" + r.lunches + "|" + r.ratings);
    // Early in the week there's nothing to recap yet, so start on last week instead.
    if (!state.recapPicked && thisWeek && !r.lunches && !r.hiddenCount) { state.recapPicked = true; state.recapMonday = shift(monday, -7); return renderRecap(); }
    state.recapPicked = true;
    $("copyRecap").hidden = !r.lunches;
    body.replaceChildren();
    if (!r.lunches) {
      body.appendChild(el("p", "empty-note", r.hiddenCount
        ? "Rate this week's lunches (or mark yourself out) to see the recap."
        : "No lunches were rated this week."));
      return;
    }
    if (r.best) {
      const pod = el("div", "podium");
      const card = (cls, label, x) => { const d = el("div", cls); d.append(el("span", "eyebrow", label), el("span", "big-name", x.name), el("span", "detail", x.avg.toFixed(1) + " cookies · " + short(x.day))); return d; };
      pod.appendChild(card("best", "Lunch of the week", r.best));
      if (r.worst) pod.appendChild(card("worst", "Biggest letdown", r.worst));
      body.appendChild(pod);
    }
    if (r.comment) {
      const q = el("blockquote", "quote");
      q.append(el("p", null, "\u201C" + r.comment.text + "\u201D"), el("span", null, r.comment.by + " · +" + r.comment.score + " · comment of the week"));
      body.appendChild(q);
    }
    const awards = [
      r.hot && [r.hot.names.length > 1 ? "Hottest streaks" : "Hottest streak", r.hot.name, "🔥 " + r.hot.n + " lunches in a row"],
      r.agreed && ["Most agreed-with", r.agreed.name, "+" + r.agreed.score + " from coworkers"],
      r.harshest && ["Harshest critic", r.harshest.name, "Averaged " + r.harshest.avg.toFixed(1) + " cookies"],
      r.easiest && ["Easiest to please", r.easiest.name, "Averaged " + r.easiest.avg.toFixed(1) + " cookies"],
      r.contrarian && ["Contrarian", r.contrarian.name, r.contrarian.off.toFixed(1) + " cookies off the group, on average"],
    ].filter(Boolean);
    if (awards.length) {
      const ul = el("ul", "awards");
      awards.forEach(([label, who, detail], n) => { const li = el("li"); li.style.setProperty("--n", n); li.append(el("span", "eyebrow", label), el("span", "who", who), el("span", "detail", detail)); ul.appendChild(li); });
      body.appendChild(ul);
    }
    let foot = r.lunches + " lunch" + (r.lunches > 1 ? "es" : "") + " · " + r.ratings + " rating" + (r.ratings === 1 ? "" : "s") + (r.outCount ? " · " + r.outCount + " out of office" : "");
    if (r.hiddenCount) foot += ". " + r.hiddenCount + " more lunch" + (r.hiddenCount > 1 ? "es join" : " joins") + " once you've rated " + (r.hiddenCount > 1 ? "them" : "it") + ".";
    body.appendChild(el("p", "recap-foot", foot));
  }

  function recapForTeams() {
    const monday = state.recapMonday;
    const r = state.ins.recap(monday, weekDates(monday), lunchNameOf, true);
    const L = ["🍪 Lunch recap · week of " + pretty(monday, { month: "short", day: "numeric" })];
    if (r.best) L.push("🏆 Lunch of the week: " + r.best.name + " (" + r.best.avg.toFixed(1) + ")");
    if (r.worst) L.push("😬 Biggest letdown: " + r.worst.name + " (" + r.worst.avg.toFixed(1) + ")");
    if (r.comment) L.push("💬 Comment of the week: \u201C" + r.comment.text + "\u201D (" + r.comment.by + ", +" + r.comment.score + ")");
    if (r.hot) L.push("🔥 Hottest streak: " + r.hot.name + " (" + r.hot.n + " lunches in a row)");
    if (r.agreed) L.push("👍 Most agreed-with: " + r.agreed.name + " (+" + r.agreed.score + ")");
    if (r.harshest) L.push("🧐 Harshest critic: " + r.harshest.name + " (avg " + r.harshest.avg.toFixed(1) + ")");
    if (r.easiest) L.push("🥰 Easiest to please: " + r.easiest.name + " (avg " + r.easiest.avg.toFixed(1) + ")");
    if (r.contrarian) L.push("🙃 Contrarian: " + r.contrarian.name);
    const pair = state.ins.taste.closestPair;
    if (pair) L.push("👯 Taste twins: " + pair.aReal + " & " + pair.bReal + " (" + similarity(pair.gap) + "% alike)");
    L.push(r.lunches + " lunches · " + r.ratings + " ratings" + (r.outCount ? " · " + r.outCount + " out of office" : ""));
    L.push("Rate today's lunch: " + location.href.split("#")[0].split("?")[0]);
    return L.join("\n");
  }
  $("copyRecap").addEventListener("click", () => {
    if (!state.ins) return;
    const text = recapForTeams(), st = $("recapStatus"), pre = $("recapText");
    pre.textContent = text;
    const fallback = () => { pre.hidden = false; const rg = document.createRange(); rg.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); st.className = "status"; st.textContent = "Text selected. Press Ctrl+C to copy."; };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => { st.className = "status ok"; st.textContent = "Copied. Paste it in Teams."; }, fallback);
  });

  const similarity = (gap) => Math.round((1 - gap / 4) * 100);
  function renderTaste() {
    const body = $("tasteBody"), ins = state.ins;
    if (!state.loaded || !ins) return;
    const t = ins.taste;
    body.replaceChildren();
    playOnce(body, (t.twin ? t.twin.name : "") + "|" + t.mine.length);
    if (t.twin) {
      const box = el("div", "twin");
      const pair = el("span", "pair"); pair.append(cookieEl(true), cookieEl(true));
      const txt = el("div"); txt.append(el("span", "eyebrow", "Your taste twin"), el("div", "big-name", t.twin.name),
        el("div", "detail", similarity(t.twin.gap) + "% alike across " + t.twin.shared + " lunches you both rated"));
      box.append(pair, txt); body.appendChild(box);
      if (t.mine.length > 1) {
        const ul = el("ul", "alike");
        t.mine.forEach((m) => {
          const li = el("li"); const bar = el("span", "bar"); const fill = el("i"); fill.style.width = similarity(m.gap) + "%"; bar.appendChild(fill);
          li.append(el("span", "nm", m.name), bar, el("span", "pct", similarity(m.gap) + "%"));
          li.title = m.shared + " lunches in common"; ul.appendChild(li);
        });
        body.appendChild(ul);
      }
      if (t.opposite && t.opposite.gap > t.twin.gap) body.appendChild(el("p", "empty-note", "Least alike: " + t.opposite.name + ". You two rarely agree."));
    } else {
      body.appendChild(el("p", "empty-note", t.myRated >= 2
        ? "Nobody has rated the same two lunches as you yet. Check back after a few more lunches."
        : "Rate at least two lunches to find out who in the office shares your taste."));
    }
    if (t.closestPair) {
      const p = t.closestPair;
      body.appendChild(el("p", "recap-foot", "Most alike in the office: " + p.a + " & " + p.b + " (" + similarity(p.gap) + "% alike over " + p.shared + " lunches)."));
    }
  }

  function renderShare() {
    const cfg = window.LUNCH_CONFIG || {};
    const lunch = state.days[lunchToday];
    $("shareText").textContent = "🍽️ Lunch poll for " + pretty(lunchToday) + (cfg.teamName ? " (" + cfg.teamName + ")" : "") +
      (lunch ? ": " + lunch : "") + "\nHow was it? Rate it 1–5 cookies here: " + location.href.split("#")[0].split("?")[0];
  }
  $("copyShare").addEventListener("click", () => {
    const text = $("shareText").textContent, st = $("copyStatus");
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("shareText")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); st.className = "status"; st.textContent = "Text selected. Press Ctrl+C to copy."; };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => { st.className = "status ok"; st.textContent = "Copied"; }, fallback);
  });

  // ---------- the rent joke: the button just asks ----------
  $("rentJoke").addEventListener("click", (e) => {
    e.stopPropagation();
    const b = $("rentBubble"), open = b.hidden;
    b.hidden = !open; $("rentJoke").setAttribute("aria-expanded", String(open));
    if (open) logRentClick();
  });
  // Each click is logged for the owner to see in Supabase (supabase/003_rent_clicks.sql). The page can't read the log.
  function logRentClick() {
    if (!state.sb) return;
    if (store("lunch.rentClickDay") === today) return; // one click per person per day (the database checks too)
    const typed = $("voterName").value.trim();
    const known = state.votes.find((v) => isMe(v.voter_id) && v.voter_name) || state.absences.find((a) => isMe(a.voter_id) && a.voter_name);
    const name = (typed || (known && known.voter_name) || "").slice(0, 40);
    state.sb.from("rent_clicks").insert({ voter_id: voterId, voter_name: name, click_day: today })
      .then(({ error }) => { if (!error || error.code === "23505") store("lunch.rentClickDay", today); }, () => {});
  }
  document.addEventListener("click", (e) => {
    if (!$("rentBubble").hidden && !e.target.closest(".hero-side")) { $("rentBubble").hidden = true; $("rentJoke").setAttribute("aria-expanded", "false"); }
  });

  // ---------- personal link for other devices ----------
  function deviceLink() {
    return location.href.split("#")[0].split("?")[0] + "#device=" + [voterId, ...aliasIds].slice(0, 21).join(".");
  }
  $("deviceBtn").addEventListener("click", () => {
    const panel = $("devicePanel"), open = panel.hidden;
    panel.hidden = !open; $("deviceBtn").setAttribute("aria-expanded", String(open));
    if (open) { $("deviceLink").textContent = deviceLink(); $("deviceStatus").textContent = ""; }
  });
  $("copyDevice").addEventListener("click", () => {
    const text = deviceLink(), st = $("deviceStatus");
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("deviceLink")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); st.className = "status"; st.textContent = "Link selected. Press Ctrl+C to copy."; };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => { st.className = "status ok"; st.textContent = "Copied. Open it on your other device."; }, fallback);
  });
  if (state0.linkNote) { $("linkNote").textContent = state0.linkNote; $("linkNote").hidden = false; }

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
    if (!$("voterName").value.trim()) { // e.g. a newly linked device: use the name on your latest rating
      const mine = state.votes.filter((v) => isMe(v.voter_id) && v.voter_name).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0];
      if (mine) { $("voterName").value = mine.voter_name; store("lunch.name", mine.voter_name); updateSubmit(); }
    }
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
