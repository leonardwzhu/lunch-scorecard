(function () {
  "use strict";
  const MIN_REVIEW = 3; // characters; every new or changed rating needs a short written review
  const LABELS = ["", "1 · Burnt", "2 · Underbaked", "3 · Fine", "4 · Golden", "5 · Perfectly caramelised"];

  // A caramelised biscuit: a wide rounded rectangle with a crimped edge, a raised inner border and a few
  // sugar specks. Drawn once and reused everywhere a rating shows. (A generic biscuit, no brand marks.)
  const COOKIE_PATH = (() => {
    const x0 = 4, y0 = 4, w = 56, h = 38, r = 7, amp = 1.05, bumpLen = 4.2, P = Math.PI;
    const line = (ax, ay, bx, by, nx, ny) => ({ len: Math.hypot(bx - ax, by - ay), at: (t) => [ax + (bx - ax) * t, ay + (by - ay) * t, nx, ny] });
    const arc = (cx, cy, a0, a1) => ({ len: Math.abs(a1 - a0) * r, at: (t) => { const a = a0 + (a1 - a0) * t; return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)]; } });
    const parts = [
      line(x0 + r, y0, x0 + w - r, y0, 0, -1), arc(x0 + w - r, y0 + r, -P / 2, 0),
      line(x0 + w, y0 + r, x0 + w, y0 + h - r, 1, 0), arc(x0 + w - r, y0 + h - r, 0, P / 2),
      line(x0 + w - r, y0 + h, x0 + r, y0 + h, 0, 1), arc(x0 + r, y0 + h - r, P / 2, P),
      line(x0, y0 + h - r, x0, y0 + r, -1, 0), arc(x0 + r, y0 + r, P, 1.5 * P),
    ];
    const total = parts.reduce((a, q) => a + q.len, 0);
    const bumps = Math.round(total / bumpLen), N = bumps * 8, pts = [];
    for (let i = 0; i < N; i++) {
      let d = (i / N) * total, k = 0;
      while (k < parts.length - 1 && d > parts[k].len) { d -= parts[k].len; k++; }
      const [x, y, nx, ny] = parts[k].at(Math.min(1, d / parts[k].len));
      const off = amp * Math.cos((2 * P * bumps * i) / N); // the crimp: little waves all the way round
      pts.push((x + nx * off).toFixed(2) + " " + (y + ny * off).toFixed(2));
    }
    return "M" + pts.join("L") + "Z";
  })();
  const SPECKS = [[17, 16], [27, 13.5], [40, 15], [48, 21], [21, 29], [34, 31.5], [45, 30], [30, 22.5], [13, 23]];
  // One shared "baked" gradient: lighter in the middle, toasty at the edges.
  document.body.insertAdjacentHTML("afterbegin",
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    '<radialGradient id="ckBake" cx="50%" cy="42%" r="68%"><stop offset="0" style="stop-color:var(--cookie-light)"/>' +
    '<stop offset="0.62" style="stop-color:var(--cookie)"/><stop offset="1" style="stop-color:var(--cookie-edge)"/></radialGradient></defs></svg>');
  // A face pressed into the biscuit: 1 frowns, 3 is unsure, 5 grins with happy eyes.
  function face(n) {
    const curve = [0, -4.2, -1.8, 0.6, 3.2, 5.4][n] || 0;
    const eyes = n >= 5
      ? '<path d="M23.5 19.6 q2.5 -2.8 5 0"/><path d="M35.5 19.6 q2.5 -2.8 5 0"/>'
      : n <= 1
        ? '<path d="M23.8 17.6 l4.2 1.4"/><path d="M40.2 17.6 l-4.2 1.4"/><circle cx="26" cy="20.2" r="1.15"/><circle cx="38" cy="20.2" r="1.15"/>'
        : '<circle cx="26" cy="19.4" r="1.25"/><circle cx="38" cy="19.4" r="1.25"/>';
    const mouth = '<path d="M' + (n >= 5 ? "23.5" : "25") + " 27.2 Q32 " + (27.2 + curve * 1.6).toFixed(1) + " " + (n >= 5 ? "40.5" : "39") + ' 27.2"/>';
    const g = eyes + mouth;
    return '<g class="ck-face-hi" transform="translate(0.6 0.7)">' + g + '</g><g class="ck-face">' + g + "</g>";
  }
  function cookie(on, opts) {
    const o = opts || {};
    const specks = o.face ? SPECKS.filter(([x, y]) => Math.abs(x - 32) > 11 || Math.abs(y - 23) > 8) : SPECKS;
    const detail = o.dots === false ? "" :
      '<rect class="ck-hi" x="11.3" y="10.3" width="41.4" height="25.4" rx="3.4"/><g class="ck-dots">' +
      specks.map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="0.85"/>').join("") + "</g>" + (o.face ? face(o.face) : "");
    return '<svg viewBox="0 0 64 46" aria-hidden="true"' + (on ? "" : ' class="off"') + ">" +
      '<path class="ck-body" d="' + COOKIE_PATH + '"/><rect class="ck-ring" x="10.5" y="9.5" width="43" height="27" rx="4"/>' + detail + "</svg>";
  }
  function cookieEl(on, opts) { const t = document.createElement("template"); t.innerHTML = cookie(on, opts); return t.content.firstChild; }

  const hero = cookieEl(true, { face: 5 }); hero.classList.add("hero-cookie"); document.getElementById("heroCookie").appendChild(hero);
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
  // Make this browser the same person as the given ids (first = the one new ratings go under).
  // Everything this browser did before still counts as yours.
  function adoptIds(ids) {
    ids = ids.filter(Boolean);
    if (!ids.length) return false;
    aliasIds = [...new Set([voterId, ...aliasIds, ...ids.slice(1)])].filter((x) => x && x !== ids[0]).slice(0, 20);
    voterId = ids[0];
    store("lunch.voterId", voterId);
    store("lunch.aliasIds", JSON.stringify(aliasIds));
    store("lunch.syncDone", "1");
    return true;
  }

  (function adoptDeviceLink() {
    const m = /^#device=([A-Za-z0-9-]{8,64}(?:\.[A-Za-z0-9-]{8,64}){0,20})$/.exec(location.hash);
    if (!m) return;
    const ids = m[1].split(".");
    history.replaceState(null, "", location.pathname + location.search);
    if (ids[0] === voterId) { state0.linkNote = "This browser is already linked to you."; return; }
    adoptIds(ids);
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
    oooVotes: [], oooOn: false, // up/down votes on out-of-office meals (006_out_of_office_votes.sql)
    extras: true,   // false until the 002 SQL has been run in Supabase
    loaded: false, pick: 0, dirty: false, editing: false, confirmingAway: false,
  };

  // ---------- stars ----------
  const starsEl = $("stars");
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "star"; b.id = "star" + i;
    b.setAttribute("role", "radio"); b.setAttribute("aria-label", i + " biscuit" + (i > 1 ? "s" : ""));
    b.innerHTML = cookie(false, { face: i });
    b.addEventListener("click", () => {
      state.pick = i; state.dirty = true; paintStars(); updateSubmit();
      $("voteStatus").textContent = "";
      if ($("comment").value.trim().length < MIN_REVIEW) $("comment").focus({ preventScroll: true });
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
    label.textContent = !canVoteDay() ? "Voting is closed for this day" : (v ? LABELS[v] : "Tap a biscuit to rate");
    label.classList.toggle("idle", !v || !canVoteDay());
  }

  const myVote = (day) => state.votes.find((v) => v.day === day && isMe(v.voter_id));
  // Tapping a cookie saves on its own; this button only appears for an unsaved comment or name change.
  // A rating saves together with a short written review, which is required.
  function updateSubmit() {
    const mv = myVote(state.day);
    const comment = $("comment").value.trim(), name = $("voterName").value.trim();
    const changed = !mv || mv.stars !== state.pick || comment !== (mv.comment || "") || name !== (mv.voter_name || "");
    const open = state.sb && canVoteDay() && !myAbsence(state.day);
    $("saveRow").hidden = !(open && (state.pick || comment) && changed);
    const short = comment.length < MIN_REVIEW;
    $("submitVote").disabled = !state.pick || short;
    $("submitVote").textContent = mv ? "Update rating" : "Save rating";
    $("saveHint").textContent = !state.pick ? "Tap a biscuit to pick your score."
      : short ? "Write a short review to save your rating." : "";
  }
  $("comment").addEventListener("input", () => { state.dirty = true; updateSubmit(); });
  $("voterName").addEventListener("input", () => { store("lunch.name", $("voterName").value.trim()); updateSubmit(); });

  // Known name shows as "Rating as Kevin · Change" instead of a text box. The box only shrinks on load or
  // after a save, never while you're mid-way through, so the biscuits don't jump out from under your finger.
  let editingName = false;
  function renderName() {
    const name = $("voterName").value.trim();
    const chip = !!name && !editingName;
    $("nameField").hidden = !editingName; $("nameChip").hidden = !chip; // no name yet: the "Who's this?" card asks
    if (chip) $("nameChipText").textContent = name;
  }
  $("nameChange").addEventListener("click", () => { editingName = true; renderName(); $("voterName").focus(); $("voterName").select(); });
  $("voterName").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("voterName").blur(); } });

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
    if (saveTimer) { clearTimeout(saveTimer); saveVote(); } // finish a just-tapped rating for the day you're leaving
    if (d !== state.day && !calm()) { // slide the ballot in from the direction you moved
      const inner = document.querySelector(".ballot .inner");
      inner.classList.remove("slide-next", "slide-prev"); void inner.offsetWidth;
      inner.classList.add(d > state.day ? "slide-next" : "slide-prev");
      clearTimeout(inner._t); inner._t = setTimeout(() => inner.classList.remove("slide-next", "slide-prev"), 500);
    }
    state.day = d; state.editing = false; state.confirmingAway = false;
    $("resultsPill").hidden = true; // it points at a different day's results
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

  // Suggest lunch names used before, most recent first, so repeat lunches keep one spelling.
  let lunchNamesKey = "";
  function pastLunchNames() {
    const seen = new Map();
    Object.keys(state.days).sort().reverse().forEach((d) => {
      const n = (state.days[d] || "").trim(); if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    });
    return [...seen.values()];
  }
  function renderLunchNames() {
    const names = pastLunchNames(), key = names.join("|");
    if (key === lunchNamesKey) return;
    lunchNamesKey = key;
    $("lunchNames").replaceChildren(...names.map((n) => { const o = document.createElement("option"); o.value = n; return o; }));
  }
  $("lunchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    let name = $("lunchInput").value.trim().slice(0, 80);
    const same = pastLunchNames().find((n) => n.toLowerCase() === name.toLowerCase());
    if (same) name = same; // "pokeworks" becomes the existing "Pokeworks"
    if (!name || !state.sb) return;
    const { error } = await state.sb.from("days").upsert({ day: state.day, lunch: name, updated_at: new Date().toISOString() });
    if (error) { banner("The lunch name didn't save: " + error.message); return; }
    state.days[state.day] = name; state.editing = false; render();
  });

  // ---------- voting ----------
  let saving = false;
  let saveTimer = null, savePending = false;
  function scheduleSave() {
    clearTimeout(saveTimer);
    if (!state.sb || !canVoteDay() || myAbsence(state.day)) return;
    $("voteStatus").className = "status"; $("voteStatus").textContent = "";
    saveTimer = setTimeout(saveVote, 450); // a quick change of mind becomes one save
  }
  $("voteForm").addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(saveTimer); saveVote(); });

  async function saveVote() {
    saveTimer = null;
    if (saving) { savePending = true; return; }
    if (!state.pick || !state.sb || !canVoteDay()) return;
    if (!knownName()) { askWho("Tell us your name first, then save your rating."); return; }
    if ($("comment").value.trim().length < MIN_REVIEW) { updateSubmit(); $("comment").focus(); return; }
    const firstToday = !myVote(state.day);
    const synced = autoSyncByName($("voterName").value);
    const existing = myVote(state.day); // after a sync, this can be a rating made on another device
    if (synced && existing) {
      // Keep what they already wrote unless they typed something new, and keep their name's spelling.
      if (!$("comment").value.trim() && existing.comment) $("comment").value = existing.comment;
      if (existing.voter_name && existing.voter_name.toLowerCase() === $("voterName").value.trim().toLowerCase()) $("voterName").value = existing.voter_name;
    }
    if (synced) store("lunch.name", $("voterName").value.trim());
    saving = true; $("submitVote").disabled = true;
    const status = $("voteStatus"); status.className = "status"; status.textContent = "Saving…";
    const savedDay = state.day;
    const row = {
      day: state.day, voter_id: (existing || {}).voter_id || voterId,
      voter_name: $("voterName").value.trim().slice(0, 40),
      stars: state.pick, comment: $("comment").value.trim().slice(0, 200),
      updated_at: new Date().toISOString(),
    };
    const { error } = await state.sb.from("votes").upsert(row);
    saving = false;
    if (error) {
      status.className = "status err";
      status.textContent = "Didn't save. Check your connection and tap again.";
      updateSubmit(); return;
    }
    mergeVote(row); state.dirty = false;
    if (row.voter_name) editingName = false;
    if (state.day === savedDay) { status.className = "status ok"; status.textContent = "Saved ✓"; }
    crumbBurst($("star" + row.stars));
    render(); updateSubmit();
    if (firstToday) offerResults();
    if (savePending) { savePending = false; saveVote(); }
  }

  // On phones the results are further down the page, so point to them after your first rating.
  let resultsSeen = null;
  function offerResults() {
    const card = $("tallyTitle").closest("section");
    if (matchMedia("(min-width: 960px)").matches) return;
    const r = card.getBoundingClientRect();
    if (r.top < innerHeight * 0.7) return; // already on screen
    $("resultsPill").hidden = false;
    if (!resultsSeen && "IntersectionObserver" in window) {
      resultsSeen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) $("resultsPill").hidden = true; }, { threshold: 0.25 });
      resultsSeen.observe(card);
    }
  }
  $("resultsPill").addEventListener("click", () => {
    $("resultsPill").hidden = true;
    $("tallyTitle").closest("section").scrollIntoView({ behavior: calm() ? "auto" : "smooth", block: "start" });
  });

  // ---------- "I wasn't in the office" ----------
  $("awayBtn").addEventListener("click", () => { state.confirmingAway = true; renderAway(); $("awayYes").focus(); });
  $("awayNo").addEventListener("click", () => { state.confirmingAway = false; renderAway(); });
  $("awayYes").addEventListener("click", async () => {
    if (!state.sb) return;
    if (!knownName()) { askWho("Tell us your name first, then mark yourself out."); return; }
    autoSyncByName($("voterName").value);
    if (myVote(state.day) || myAbsence(state.day)) { state.confirmingAway = false; render(); return; }
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
    $("ateForm").hidden = !(away && state.canShareAte);
    if (away && document.activeElement !== $("ateInput") && $("ateForm").dataset.day !== state.day) {
      $("ateInput").value = away.ate || "";
      $("ateSave").textContent = away.ate ? "Update" : "Share";
      $("ateStatus").textContent = "";
      $("ateForm").dataset.day = state.day;
    }
    if (!away) delete $("ateForm").dataset.day;
    renderGhost(away);
  }

  // ---------- ghost votes: out-of-office people say how much they like the place (never counted) ----------
  function renderGhost(away) {
    const box = $("ghostBox");
    box.hidden = !(away && state.canGhost && canVoteDay());
    if (box.hidden) return;
    const lunch = state.days[state.day];
    $("ghostLabel").textContent = "Ghost vote: how much do you like " + (lunch || "this lunch") + "?";
    const wrap = $("ghostStars"), cur = away.ghost || 0;
    wrap.replaceChildren();
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "ghost-btn" + (i <= cur ? " on" : "");
      b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(i === cur));
      b.setAttribute("aria-label", "Ghost vote " + i + " biscuit" + (i > 1 ? "s" : ""));
      b.appendChild(cookieEl(i <= cur, { face: i }));
      b.addEventListener("click", () => saveGhost(away, i === cur ? null : i));
      wrap.appendChild(b);
    }
  }
  async function saveGhost(away, value) {
    const st = $("ghostStatus");
    const before = away.ghost;
    away.ghost = value; renderGhost(away); // show it right away
    st.className = "status"; st.textContent = "Saving…";
    const { error } = await state.sb.from("absences").update({ ghost: value }).eq("day", away.day).eq("voter_id", away.voter_id);
    if (error) { away.ghost = before; renderGhost(away); st.className = "status err"; st.textContent = "Didn't save. Try again."; return; }
    st.className = "status ok"; st.textContent = value ? "Ghost vote saved ✓" : "Ghost vote removed";
    renderTally(); renderBoard();
  }
  const ghostsFor = (day) => state.absences.filter((a) => a.day === day && a.ghost >= 1 && a.ghost <= 5);
  function ghostMini(n) {
    const span = el("span", "ghost-mini"); span.setAttribute("aria-label", "ghost vote " + n + " out of 5");
    for (let k = 1; k <= 5; k++) span.appendChild(cookieEl(k <= n, { dots: false }));
    return span;
  }
  $("ateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const away = myAbsence(state.day), st = $("ateStatus");
    if (!away || !state.sb) return;
    const ate = $("ateInput").value.trim().slice(0, 120);
    $("ateSave").disabled = true; st.className = "status"; st.textContent = "Sharing…";
    const { error } = await state.sb.from("absences").update({ ate }).eq("day", away.day).eq("voter_id", away.voter_id);
    $("ateSave").disabled = false;
    if (error) { st.className = "status err"; st.textContent = "Didn't save. Check your connection and try again."; return; }
    away.ate = ate;
    st.className = "status ok"; st.textContent = ate ? "Shared ✓" : "Removed";
    $("ateSave").textContent = ate ? "Update" : "Share";
    renderTally();
  });

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
    $("dateLabel").textContent = isToday && lunchToday === today ? "Today · " + pretty(state.day, { month: "short", day: "numeric" }) : pretty(state.day, { weekday: "short", month: "short", day: "numeric" });
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
    renderName(); renderLunchNames();
    renderCal(); renderSync(); renderAway(); renderStreak(); renderTally(); renderBoard(); renderRecap(); renderTaste(); renderShare();
  }

  // "8 ratings" / "2 out of office": hover, focus or tap to see who. Names only, never scores.
  function namesPop(label, heading, ids) {
    const attr = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const names = ids.map((r) => (isMe(r.voter_id) ? "You" : (r.voter_name || "A coworker")));
    return '<button type="button" class="out-count" data-tip="' + attr(heading + ":\n" + names.join(names.length > 10 ? ", " : "\n")) +
      '" aria-label="' + attr(label + ": " + names.join(", ")) + '">' + label + "</button>";
  }
  // For a repeat lunch: how it did the previous time it was served (only if you can already see that day).
  function previousVisit(day) {
    const name = (state.days[day] || "").trim().toLowerCase();
    if (!name) return null;
    const prev = Object.keys(state.days).filter((d) => d < day && (state.days[d] || "").trim().toLowerCase() === name && ratingsFor(d).length).sort().pop();
    if (!prev || resultsHidden(prev)) return null;
    return { day: prev, avg: avg(ratingsFor(prev)) };
  }
  function trendBits(now, before) {
    const r1 = (x) => Number(x.toFixed(1)); // compare the numbers people actually see
    const diff = Math.round((r1(now) - r1(before)) * 10) / 10;
    if (Math.abs(diff) < 0.05) return { cls: "same", text: "same as before" };
    return diff > 0 ? { cls: "up", text: "↑ " + diff.toFixed(1) } : { cls: "down", text: "↓ " + Math.abs(diff).toFixed(1) };
  }
  function ghostLine(day) {
    if (!state.canGhost) return "";
    const g = ghostsFor(day);
    if (!g.length) return "";
    const ga = g.reduce((t, a) => t + a.ghost, 0) / g.length;
    const attr = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const lines = g.map((a) => (isMe(a.voter_id) ? "You" : (a.voter_name || "A coworker")) + ": " + a.ghost);
    const label = g.length === 1 ? "1 person who was out" : g.length + " people who were out";
    return '<p class="ghostline">Ghost votes from ' +
      '<button type="button" class="out-count" data-tip="' + attr("Ghost votes:\n" + lines.join("\n")) + '" aria-label="' + attr(label + ": " + lines.join(", ")) + '">' + label + "</button>" +
      ": " + ga.toFixed(1) + " · not counted</p>";
  }
  function lastTimeLine(day, now) {
    const pv = previousVisit(day);
    if (!pv) return "";
    const t = trendBits(now, pv.avg);
    return '<p class="lasttime">Last time: ' + pv.avg.toFixed(1) + " on " + pretty(pv.day, { weekday: "short", month: "short", day: "numeric" }) +
      ' <span class="trend ' + t.cls + '">' + t.text + "</span></p>";
  }

  // A 1-5 scale: a dot at the average, a faint band from the lowest to the highest rating.
  // Used on the leaderboard and in the weekly recap so every score reads on the same ruler.
  function scoreStrip(avgV, lo, hi, tip) {
    const pos = (x) => ((Math.min(5, Math.max(1, x)) - 1) / 4) * 100;
    const s = el("span", "strip has-tip"); s.tabIndex = 0; s.dataset.tip = tip;
    s.setAttribute("role", "img"); s.setAttribute("aria-label", tip.replace(/\n/g, ". "));
    for (let k = 1; k <= 5; k++) { const t = el("i", "tick"); t.style.left = pos(k) + "%"; s.appendChild(t); }
    const r = el("i", "range"); r.style.left = pos(lo) + "%"; r.style.width = Math.max(0, pos(hi) - pos(lo)) + "%"; s.appendChild(r);
    const d = el("i", "dot"); d.style.left = pos(avgV) + "%"; s.appendChild(d);
    return s;
  }
  const spreadOf = (rs) => ({ lo: Math.min(...rs.map((r) => r.stars)), hi: Math.max(...rs.map((r) => r.stars)) });

  function renderTally() {
    const body = $("tallyBody");
    if (!state.loaded) return;
    const rs = ratingsFor(state.day);
    if (resultsHidden(state.day)) {
      const n = rs.length;
      playOnce(body, state.day + "|locked");
      body.innerHTML = '<div class="locked">' + cookie(false, { face: 3 }) + '<div><p class="locked-title">Rate it to see the results</p><p class="empty-note">' +
        (n ? namesPop(n + (n === 1 ? " coworker" : " coworkers"), "Rated so far", rs) + (n === 1 ? " has" : " have") + " rated this lunch. Results appear once you've added yours" + (state.extras ? ", or said you were out of the office." : ".")
           : "Nobody has rated this lunch yet. Be the first to tap a biscuit above.") + "</p></div></div>";
      return;
    }
    if (!rs.length) { body.innerHTML = '<p class="empty-note">No ratings for this day yet.' + (canVoteDay() && !myAbsence(state.day) ? " Be the first to tap a biscuit above." : "") + "</p>" + ghostLine(state.day); renderAtHome(body); return; }
    const counts = [0, 0, 0, 0, 0, 0]; rs.forEach((r) => counts[r.stars]++);
    const max = Math.max(...counts);
    let html = '<div class="tally"><div class="badge">' + cookie(true, { dots: false }) + '<div><span class="num">' + avg(rs).toFixed(1) + '</span><span class="of">OUT OF 5</span></div></div><div class="dist">';
    const myStars = (myVote(state.day) || {}).stars;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    for (let i = 5; i >= 1; i--) {
      const who = rs.filter((r) => r.stars === i).map((r) => (isMe(r.voter_id) ? "You" : (r.voter_name || "A coworker")));
      const share = Math.round((counts[i] / rs.length) * 100);
      const tip = LABELS[i] + "\n" + (who.length ? who.join(", ") : "Nobody");
      html += '<div class="row has-tip' + (i === myStars ? " me" : "") + '" tabindex="0" data-tip="' + esc(tip) + '" aria-label="' + esc(i + " biscuits: " + counts[i] + " (" + share + "%). " + (who.join(", ") || "Nobody")) + '">' +
        '<span class="lbl">' + i + cookie(true, { dots: false }) + '</span><span class="bar"><i style="width:' + (max ? (counts[i] / max) * 100 : 0) + '%"></i></span>' +
        '<span class="cnt">' + counts[i] + (counts[i] ? ' <small>' + share + "%</small>" : "") + "</span></div>";
    }
    const outList = state.absences.filter((a) => a.day === state.day);
    const out = outList.length;
    const outBtn = out ? " · " + namesPop(out + " out of office", "Out of office", outList) : "";
    html += '</div><span class="sub">' + namesPop(rs.length + " rating" + (rs.length > 1 ? "s" : ""), "Rated by", rs) + " so far" + outBtn + "</span></div>";
    html += lastTimeLine(state.day, avg(rs));
    html += ghostLine(state.day);
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
      sc.setAttribute("role", "img"); sc.setAttribute("aria-label", r.stars + " out of 5 biscuits");
      const st = state.ins ? state.ins.streakFor(r.voter_id, r.voter_name) : 0;
      if (st >= 2) { const c = document.createElement("span"); c.className = "streak-chip"; c.textContent = "🔥 " + st; c.title = st + " lunches in a row"; who.appendChild(c); }
      li.style.setProperty("--i", list.children.length);
      li.append(avatar(r.voter_name, r.voter_id), mid, sc); list.appendChild(li);
    });
    renderAtHome(body);
  }

  // What the out-of-office crowd had instead, so they're part of the day too.
  function renderAtHome(body) {
    if (!state.canShareAte) return;
    const out = state.absences.filter((a) => a.day === state.day);
    const shared = out.filter((a) => (a.ate || "").trim());
    if (!shared.length) {
      if (myAbsence(state.day)) { const p = el("p", "pending", "Nobody who was out has shared their lunch yet. Be the first above!"); const box = el("div", "athome"); box.append(el("h3", null, "Meanwhile, out of office"), p); body.appendChild(box); }
      return;
    }
    const box = el("div", "athome"), ul = el("ul");
    box.append(el("h3", null, "Meanwhile, out of office"), ul);
    shared.forEach((a, i) => {
      const li = el("li"); li.style.setProperty("--i", i);
      const mid = el("div");
      mid.append(el("div", "who", isMe(a.voter_id) ? "You" : (a.voter_name || "A coworker")), el("div", "had", a.ate));
      if (state.canGhost && a.ghost) { const gv = el("div", "ghostvote", "ghost vote"); gv.appendChild(ghostMini(a.ghost)); mid.appendChild(gv); }
      if (state.oooOn) mid.appendChild(oooVoteRow(a));
      li.append(avatar(a.voter_name, a.voter_id), mid); ul.appendChild(li);
    });
    const quiet = out.length - shared.length;
    if (quiet) box.appendChild(el("p", "pending", quiet + " more " + (quiet === 1 ? "was" : "were") + " out and didn't say what they had."));
    body.appendChild(box);
  }

  // ---------- up/down votes on out-of-office meals (same buttons as on ratings) ----------
  function oooTally(a) {
    let up = 0, down = 0, mine = 0, mineId = null; const upBy = [], downBy = [];
    state.oooVotes.forEach((x) => {
      if (x.day !== a.day || x.ooo_voter_id !== a.voter_id) return;
      const who = isMe(x.voter_id) ? "You" : (x.voter_name || "A coworker");
      if (x.value === 1) { up++; upBy.push(who); } else if (x.value === -1) { down++; downBy.push(who); }
      if (isMe(x.voter_id)) { mine = x.value; mineId = x.voter_id; }
    });
    return { up, down, mine, mineId, upBy, downBy };
  }
  function oooVoteRow(a) {
    const t = oooTally(a), own = isMe(a.voter_id);
    const row = el("div", "react");
    const whose = own ? "your meal" : (a.voter_name || "this coworker") + "'s meal";
    [[1, "up", t.up, t.upBy, "Upvoted by "], [-1, "down", t.down, t.downBy, "Downvoted by "]].forEach(([val, cls, n, by, byLabel]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "react-btn " + cls + (t.mine === val ? " mine" : "");
      const off = own || !state.sb;
      b.classList.toggle("off", off);
      if (off) b.setAttribute("aria-disabled", "true");
      b.setAttribute("aria-pressed", String(t.mine === val));
      const list = by.length ? byLabel + by.join(", ") : (val === 1 ? "No upvotes yet" : "No downvotes yet");
      b.dataset.tip = list + (own ? " · You can't vote on your own meal" : "");
      b.setAttribute("aria-label", (val === 1 ? "Upvote " : "Downvote ") + whose + ". " + list);
      b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + (val === 1 ? "M8 3l5 6H3z" : "M8 13L3 7h10z") + '"/></svg>';
      b.appendChild(el("span", n ? null : "zero", String(n)));
      b.addEventListener("click", () => { if (!off) voteOoo(a, val); });
      row.appendChild(b);
    });
    return row;
  }
  async function voteOoo(a, value) {
    const t = oooTally(a);
    const row = { day: a.day, ooo_voter_id: a.voter_id, voter_id: t.mineId || voterId,
      voter_name: $("voterName").value.trim().slice(0, 40), value: t.mine === value ? 0 : value };
    const prev = state.oooVotes.slice();
    mergeRow(state.oooVotes, row, ["day", "ooo_voter_id", "voter_id"]); renderTally(); // show it right away
    const { error } = await state.sb.from("ooo_votes").upsert(row);
    if (error) { state.oooVotes = prev; renderTally(); banner("Your vote didn't save. Check your connection and try again."); }
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
      const c = document.createElement("span"); c.textContent = n; if (!n) c.className = "zero"; b.appendChild(c);
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
    if (!rows.length) { body.innerHTML = '<p class="empty-note">Lunches show up here, ranked by average biscuits, once people start rating them.</p>' + hiddenNote; return; }
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
      if (state.canGhost) {
        const g = r.days.flatMap((d) => ghostsFor(d));
        if (g.length) sm.textContent += " · " + g.length + " ghost vote" + (g.length > 1 ? "s" : "") + " (" + (g.reduce((t, a) => t + a.ghost, 0) / g.length).toFixed(1) + ")";
      }
      tdD.appendChild(sm);
      const sp = spreadOf(r.ratings);
      tdD.appendChild(scoreStrip(r.avg, sp.lo, sp.hi, "Average " + r.avg.toFixed(1) + " · lowest " + sp.lo + " · highest " + sp.hi + "\n" +
        r.ratings.length + " rating" + (r.ratings.length > 1 ? "s" : "") + (r.days.length > 1 ? " across " + r.days.length + " visits" : "")));
      const tdA = document.createElement("td"); tdA.className = "avg";
      const av = document.createElement("span"); av.textContent = r.avg.toFixed(1); av.appendChild(cookieEl(true, { dots: false }));
      av.setAttribute("aria-label", r.avg.toFixed(1) + " out of 5"); tdA.appendChild(av);
      if (r.days.length > 1) { // served more than once: latest visit vs the one before
        const ds = r.days.slice().sort(), dayAvg = (d) => avg(ratingsFor(d));
        const t = trendBits(dayAvg(ds[ds.length - 1]), dayAvg(ds[ds.length - 2]));
        const tr2 = document.createElement("span"); tr2.className = "trend " + t.cls; tr2.textContent = t.cls === "same" ? "=" : t.text.replace(" ", "");
        tr2.title = "Last visit vs the one before: " + t.text; tr2.setAttribute("aria-label", tr2.title); tdA.appendChild(tr2);
      }
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
      reactions: state.reactions, days, myId: voterId, myName: $("voterName").value.trim() || store("lunch.name") || "", isMe, today, isHidden: resultsHidden,
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

  const tied = (x) => !!(x && x.names && x.names.length > 1);
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
      const card = (cls, label, x) => { const d = el("div", cls); d.append(el("span", "eyebrow", label), el("span", "big-name", x.name), el("span", "detail", x.avg.toFixed(1) + " biscuits · " + short(x.day))); return d; };
      pod.appendChild(card("best", "Lunch of the week", r.best));
      if (r.worst) pod.appendChild(card("worst", "Biggest letdown", r.worst));
      body.appendChild(pod);
    }
    if (r.ranked && r.ranked.length >= 2) { // every lunch of the week on the same 1-5 ruler, in date order
      const g = el("div", "glance"); g.appendChild(el("span", "eyebrow", "Week at a glance"));
      const ul = el("ul");
      r.ranked.slice().sort((a, b) => a.day.localeCompare(b.day)).forEach((x) => {
        const li = el("li"); const rs2 = ratingsFor(x.day); const sp = spreadOf(rs2);
        li.append(el("span", "d", pretty(x.day, { weekday: "short" })), el("span", "nm", x.name),
          scoreStrip(x.avg, sp.lo, sp.hi, x.name + " · " + short(x.day) + "\nAverage " + x.avg.toFixed(1) + " · lowest " + sp.lo + " · highest " + sp.hi + " · " + x.n + " ratings"),
          el("span", "v", x.avg.toFixed(1)));
        ul.appendChild(li);
      });
      g.appendChild(ul); body.appendChild(g);
    }
    if (r.comment) {
      const q = el("blockquote", "quote");
      q.append(el("p", null, "\u201C" + r.comment.text + "\u201D"), el("span", null, r.comment.by + " · +" + r.comment.score + " · comment of the week"));
      body.appendChild(q);
    }
    const awards = [
      r.hot && [r.hot.names.length > 1 ? "Hottest streaks" : "Hottest streak", r.hot.name, "🔥 " + r.hot.n + " lunches in a row"],
      r.agreed && ["Most agreed-with", r.agreed.name, "+" + r.agreed.score + " from coworkers" + (tied(r.agreed) ? " each" : "")],
      r.harshest && [tied(r.harshest) ? "Harshest critics" : "Harshest critic", r.harshest.name, "Averaged " + r.harshest.avg.toFixed(1) + " biscuits" + (tied(r.harshest) ? " each" : "")],
      r.easiest && ["Easiest to please", r.easiest.name, "Averaged " + r.easiest.avg.toFixed(1) + " biscuits" + (tied(r.easiest) ? " each" : "")],
      r.contrarian && [tied(r.contrarian) ? "Contrarians" : "Contrarian", r.contrarian.name, r.contrarian.off.toFixed(1) + " biscuits off the group, on average"],
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

  // The recap for Teams: plain and tidy. Copied as rich text (bold headings, a real link) with a plain-text twin.
  function recapForTeams() {
    const monday = state.recapMonday;
    const r = state.ins.recap(monday, weekDates(monday), lunchNameOf, true);
    const days = weekDates(monday);
    const md = (d, withMonth) => parseYmd(d).toLocaleDateString(undefined, withMonth ? { month: "short", day: "numeric" } : { day: "numeric" });
    const first = days[0], last = days[days.length - 1];
    const range = first.slice(0, 7) === last.slice(0, 7) ? md(first, true) + "–" + md(last) : md(first, true) + " – " + md(last, true);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const link = location.href.split("#")[0].split("?")[0];
    const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

    const blocks = [];
    if (r.ranked && r.ranked.length)
      blocks.push({ head: "Rankings", lines: r.ranked.map((x, i) => (i + 1) + ". " + x.name + " · " + x.avg.toFixed(1) + " (" + plural(x.n, "rating") + ")") });
    if (r.comment)
      blocks.push({ head: "Comment of the week", lines: ["\u201C" + r.comment.text + "\u201D (" + r.comment.by + ", +" + r.comment.score + ")"] });
    const awards = [];
    if (r.hot) awards.push("Longest streak: " + r.hot.name + " (" + plural(r.hot.n, "lunch").replace("lunchs", "lunches") + ")");
    if (r.agreed) awards.push("Most agreed-with: " + r.agreed.name);
    if (r.harshest) awards.push((tied(r.harshest) ? "Harshest critics: " : "Harshest critic: ") + r.harshest.name + " (avg " + r.harshest.avg.toFixed(1) + ")");
    if (r.easiest) awards.push("Easiest to please: " + r.easiest.name + " (avg " + r.easiest.avg.toFixed(1) + ")");
    if (r.contrarian) awards.push((tied(r.contrarian) ? "Contrarians: " : "Contrarian: ") + r.contrarian.name);
    const pair = state.ins.taste.closestPair;
    if (pair) awards.push("Taste twins: " + pair.labelReal + " (" + similarity(pair.gap) + "% alike)");
    if (awards.length) blocks.push({ head: "Awards", lines: awards });

    const stats = plural(r.lunches, "lunch").replace("lunchs", "lunches") + " · " + plural(r.ratings, "rating") + (r.outCount ? " · " + r.outCount + " out of office" : "");
    const title = "Lunch recap · " + range;
    const text = [title, ""].concat(...blocks.map((b) => [b.head, ...b.lines, ""])).concat([stats, "Rate lunches: " + link]).join("\n");
    const html = "<p><b>" + esc(title) + "</b></p>" +
      blocks.map((b) => "<p><b>" + esc(b.head) + "</b><br>" + b.lines.map(esc).join("<br>") + "</p>").join("") +
      "<p>" + esc(stats) + "<br><a href=\"" + esc(link) + "\">Rate lunches</a></p>";
    return { text, html };
  }
  $("copyRecap").addEventListener("click", () => {
    if (!state.ins) return;
    const { text, html } = recapForTeams(), st = $("recapStatus"), pre = $("recapText");
    pre.textContent = text; pre.hidden = false; // show a preview of what was copied
    const done = () => { st.className = "status ok"; st.textContent = "Copied. Paste it in Teams."; };
    const fallback = () => { const rg = document.createRange(); rg.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); st.className = "status"; st.textContent = "Text selected. Press Ctrl+C to copy."; };
    if (!navigator.clipboard) return fallback();
    const plain = () => navigator.clipboard.writeText(text).then(done, fallback);
    if (window.ClipboardItem && navigator.clipboard.write) {
      navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]).then(done, plain);
    } else plain();
  });

  const similarity = (gap) => Math.round((1 - gap / 4) * 100);
  // Four quick figures: how much you've rated, how you rate compared with everyone, your streak.
  function renderMyNumbers(body) {
    const mine = state.votes.filter((v) => isMe(v.voter_id) && !isNoLunchDay(v.day));
    if (!mine.length) return;
    const seen = state.votes.filter((v) => !resultsHidden(v.day) && !isNoLunchDay(v.day));
    const myAvg = avg(mine), office = seen.length ? avg(seen) : myAvg;
    const diff = Math.round((Number(myAvg.toFixed(1)) - Number(office.toFixed(1))) * 10) / 10;
    const tile = (label, value, note) => { const d = el("div", "tile"); d.append(el("span", "tile-label", label), el("span", "tile-value", value)); if (note) d.appendChild(el("span", "tile-note", note)); return d; };
    const row = el("div", "tiles");
    row.append(
      tile("Lunches rated", String(mine.length)),
      tile("Your average", myAvg.toFixed(1), diff === 0 ? "Same as the office" : Math.abs(diff).toFixed(1) + (diff > 0 ? " above" : " below") + " the office"),
      tile("Office average", office.toFixed(1)),
      tile("Streak", String(state.ins ? state.ins.myStreak : 0), "lunches in a row"));
    body.appendChild(row);
  }

  function renderTaste() {
    const body = $("tasteBody"), ins = state.ins;
    if (!state.loaded || !ins) return;
    const t = ins.taste;
    body.replaceChildren();
    playOnce(body, (t.twin ? t.twin.name : "") + "|" + t.mine.length);
    renderMyNumbers(body);
    if (t.twin) {
      const box = el("div", "twin");
      const pair = el("span", "pair"); pair.append(cookieEl(true), cookieEl(true));
      const txt = el("div"); txt.append(el("span", "eyebrow", t.twin.count > 1 ? "Your taste twins (tied)" : "Your taste twin"), el("div", "big-name", t.twin.name),
        el("div", "detail", t.twin.count > 1 ? similarity(t.twin.gap) + "% alike each" : similarity(t.twin.gap) + "% alike across " + t.twin.shared + " lunches you both rated"));
      box.append(pair, txt); body.appendChild(box);
      if (t.mine.length > 1) {
        const ul = el("ul", "alike");
        t.mine.forEach((m) => {
          const li = el("li"); const bar = el("span", "bar"); const fill = el("i"); fill.style.width = similarity(m.gap) + "%"; bar.appendChild(fill);
          const nm = el("span", "nm", m.name); nm.appendChild(el("small", null, " · " + m.shared));
          li.append(nm, bar, el("span", "pct", similarity(m.gap) + "%"));
          if (t.twin.names && t.twin.names.includes(m.name)) li.classList.add("top");
          li.title = m.shared + " lunches you both rated"; ul.appendChild(li);
        });
        body.appendChild(ul);
      }
      if (t.opposite) {
        const pct = similarity(t.opposite.gap);
        body.appendChild(el("p", "empty-note", "Least alike: " + t.opposite.name + " (" + pct + "% alike" + (t.opposite.count > 1 ? " each" : "") + "). " +
          (pct >= 75 ? "Even so, you " + (t.opposite.count > 1 ? "all" : "two") + " agree most of the time." : pct >= 50 ? "You often see lunch differently." : "You " + (t.opposite.count > 1 ? "all" : "two") + " rarely agree.")));
      }
    } else {
      body.appendChild(el("p", "empty-note", t.myRated >= 2
        ? "Nobody has rated the same two lunches as you yet. Check back after a few more lunches."
        : "Rate at least two lunches to find out who in the office shares your taste."));
    }
    if (t.closestPair) {
      const p = t.closestPair;
      body.appendChild(el("p", "recap-foot", "Most alike in the office: " + p.label + " (" + similarity(p.gap) + "% alike" + (p.count > 1 ? " each" : " over " + p.shared + " lunches") + ")."));
    }
  }

  function renderShare() {
    const cfg = window.LUNCH_CONFIG || {};
    const lunch = state.days[lunchToday];
    $("shareText").textContent = "🍽️ Lunch poll for " + pretty(lunchToday) + (cfg.teamName ? " (" + cfg.teamName + ")" : "") +
      (lunch ? ": " + lunch : "") + "\nHow was it? Rate it 1–5 biscuits here: " + location.href.split("#")[0].split("?")[0];
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

  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".out-count, .has-tip");
    document.querySelectorAll(".out-count.open, .has-tip.open").forEach((b) => { if (b !== btn) b.classList.remove("open"); });
    if (btn) btn.classList.toggle("open");
  });

  // ---------- "voted before?" sync by name ----------
  const hasHistory = () => state.votes.some((v) => isMe(v.voter_id)) || state.absences.some((a) => isMe(a.voter_id));
  // Every id that has rated or marked itself out under this name, most recently active first.
  function idsForName(name) {
    const n = (name || "").trim().toLowerCase();
    if (!n) return [];
    const last = new Map();
    [...state.votes, ...state.absences].forEach((r) => {
      if ((r.voter_name || "").trim().toLowerCase() !== n) return;
      const prev = last.get(r.voter_id);
      if (!prev || prev < r.day) last.set(r.voter_id, r.day);
    });
    return [...last.entries()].sort((a, b) => b[1].localeCompare(a[1])).map((e) => e[0]);
  }
  function showLinkNote(text) { const el = $("linkNote"); el.textContent = text; el.hidden = !text; }
  function syncTo(name, ids) {
    adoptIds(ids);
    const n = state.votes.filter((v) => isMe(v.voter_id)).length;
    showLinkNote("Synced! This browser now has your " + n + " rating" + (n === 1 ? "" : "s") + " as " + name + ", plus your streak and results.");
  }
  // A new device voting under a name someone already used is that person: sync first, so nobody gets two ratings for a day.
  function autoSyncByName(name) {
    if (hasHistory()) return false;
    const ids = idsForName(name);
    if (!ids.length || ids.some(isMe)) return false;
    const named = [...state.votes, ...state.absences].find((r) => r.voter_id === ids[0] && r.voter_name);
    syncTo(named ? named.voter_name.trim() : name.trim(), ids);
    $("syncBox").hidden = true;
    return true;
  }

  function renderSync() {
    $("syncBox").hidden = true; // replaced by the single "Who's this?" card
    renderWho();
  }

  // ---------- "Who's this?": the one place a new browser gives its name ----------
  const knownName = () => $("voterName").value.trim() || (store("lunch.name") || "").trim();
  function renderWho() {
    $("whoBox").hidden = !(state.loaded && state.sb && !knownName());
  }
  function askWho(msg) {
    renderWho();
    const st = $("whoStatus"); st.className = "status err"; st.textContent = msg || "";
    $("whoBox").scrollIntoView({ block: "center", behavior: calm() ? "auto" : "smooth" });
    $("whoName").focus({ preventScroll: true });
  }
  $("whoForm").addEventListener("submit", (e) => {
    e.preventDefault();
    let name = $("whoName").value.trim().slice(0, 40);
    if (!name) { $("whoStatus").className = "status err"; $("whoStatus").textContent = "Type your name to continue."; return; }
    const ids = hasHistory() ? [] : idsForName(name);
    if (ids.length && !ids.some(isMe)) { // someone already rates with this name: this browser becomes them
      const named = [...state.votes, ...state.absences].find((r) => ids.includes(r.voter_id) && r.voter_name);
      if (named) name = named.voter_name.trim();
      syncTo(name, ids);
    } else {
      showWelcome(true); // a new face: show how it works
    }
    $("voterName").value = name; store("lunch.name", name); store("lunch.syncDone", "1");
    $("whoStatus").textContent = ""; $("whoBox").hidden = true;
    loadMyVoteIntoForm(); render(); renderQotd();
  });
  $("syncForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("syncName").value.trim(), st = $("syncStatus");
    if (!name) { st.className = "status err"; st.textContent = "Type the name you used when you rated before."; return; }
    const ids = idsForName(name);
    if (!ids.length) {
      st.className = "status err";
      st.textContent = "No ratings under \u201C" + name + "\u201D yet. Check the spelling, or tap I'm new here.";
      return;
    }
    st.textContent = "";
    const named = [...state.votes, ...state.absences].find((r) => ids.includes(r.voter_id) && (r.voter_name || "").trim().toLowerCase() === name.toLowerCase());
    const spelled = named ? named.voter_name.trim() : name;
    syncTo(spelled, ids);
    $("voterName").value = spelled; store("lunch.name", spelled);
    $("syncBox").hidden = true;
    loadMyVoteIntoForm(); render();
  });
  // "I'm new here" swaps the sync prompt for a short welcome that explains the app.
  function showWelcome(show) {
    $("welcomeBox").hidden = !show;
    if (show) { $("syncBox").hidden = true; $("welcomeBox").scrollIntoView({ block: "nearest", behavior: calm() ? "auto" : "smooth" }); $("welcomeOk").focus({ preventScroll: true }); }
  }
  $("syncSkip").addEventListener("click", () => { store("lunch.syncDone", "1"); showWelcome(true); });
  $("welcomeOk").addEventListener("click", () => { showWelcome(false); $("voterName").focus(); });
  $("howBtn").addEventListener("click", () => showWelcome($("welcomeBox").hidden));
  // Name the actual lunch days, e.g. "Monday to Thursday".
  (function () {
    const order = LUNCH_WEEKDAYS.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const name = (w) => new Date(2024, 0, 1 + ((w + 6) % 7)).toLocaleDateString(undefined, { weekday: "long" }); // Jan 1 2024 was a Monday
    const run = order.every((w, i) => i === 0 || ((w + 6) % 7) === ((order[i - 1] + 6) % 7) + 1);
    $("howDays").textContent = order.length > 2 && run ? name(order[0]) + " to " + name(order[order.length - 1]) : order.map(name).join(", ");
  })();

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

  // ---------- question of the day (config.js → questions; shown on that date only) ----------
  const CONFIG_QUESTIONS = ((window.LUNCH_CONFIG || {}).questions) || {};
  let dbQuestions = {}; // day -> question, from the questions table (009_question_admin.sql)
  const questionFor = (d) => dbQuestions[d] || CONFIG_QUESTIONS[d] || "";
  let qotdAnswers = [], qotdOn = false;
  function renderQotd() {
    const card = $("qotdCard");
    const QUESTION = questionFor(today);
    card.hidden = !(QUESTION && qotdOn);
    if (card.hidden) return;
    $("qotdQuestion").textContent = QUESTION;
    const mine = qotdAnswers.find((a) => isMe(a.voter_id));

    if (document.activeElement !== $("qotdInput") && !$("qotdInput").dataset.dirty) $("qotdInput").value = mine ? mine.answer : "";
    $("qotdSave").textContent = mine ? "Update" : "Share";
    const list = $("qotdList"); list.replaceChildren();
    const sorted = qotdAnswers.slice().sort((a, b) => (isMe(b.voter_id) - isMe(a.voter_id)) || String(a.updated_at).localeCompare(String(b.updated_at)));
    if (!sorted.length) { const p = el("p", "qotd-empty", "No answers yet. Be the first!"); list.appendChild(p); return; }
    sorted.forEach((a) => {
      const li = el("li"); const mid = el("div");
      mid.append(el("div", "who", isMe(a.voter_id) ? "You" : (a.voter_name || "A coworker")), el("div", "ans", a.answer));
      li.append(avatar(a.voter_name, a.voter_id), mid); list.appendChild(li);
    });
  }
  $("qotdInput").addEventListener("input", () => { $("qotdInput").dataset.dirty = "1"; });
  $("qotdForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answer = $("qotdInput").value.trim().slice(0, 200), st = $("qotdStatus");
    const name = knownName().slice(0, 40);
    if (!answer) { st.className = "status err"; st.textContent = "Type an answer first."; return; }
    if (!name) { st.className = "status"; st.textContent = ""; askWho("Tell us your name first, then share your answer."); return; }
    const mine = qotdAnswers.find((a) => isMe(a.voter_id));
    const row = { day: today, voter_id: mine ? mine.voter_id : voterId, voter_name: name, answer, updated_at: new Date().toISOString() };
    $("qotdSave").disabled = true; st.className = "status"; st.textContent = "Sharing…";
    const { error } = await state.sb.from("answers").upsert(row);
    $("qotdSave").disabled = false;
    if (error) { st.className = "status err"; st.textContent = "Didn't save. Check your connection and try again."; return; }
    mergeRow(qotdAnswers, row, ["day", "voter_id"]); delete $("qotdInput").dataset.dirty;
    st.className = "status ok"; st.textContent = mine ? "Updated ✓" : "Shared ✓";
    renderQotd();
  });
  async function loadQotd() {
    if (!state.sb) return;
    const q = await state.sb.from("questions").select("day, question");
    if (!q.error) { dbQuestions = {}; q.data.forEach((r) => { dbQuestions[r.day] = r.question; }); }
    renderAdmin();
    if (!questionFor(today)) { renderQotd(); return; }
    const { data, error } = await state.sb.from("answers").select("day, voter_id, voter_name, answer, updated_at").eq("day", today);
    qotdOn = !error; // from 008_question_of_the_day.sql
    qotdAnswers = error ? [] : data;
    renderQotd();
  }

  // ---------- owner tools: add questions of the day (private link: #admin=<key>) ----------
  let adminToken = store("lunch.adminToken") || "", isAdmin = false, confirmDel = null;
  (function readAdminLink() {
    const m = /^#admin=([a-f0-9]{16,128})$/.exec(location.hash);
    if (!m) return;
    adminToken = m[1]; store("lunch.adminToken", adminToken);
    history.replaceState(null, "", location.pathname + location.search); // keep the key out of the address bar
  })();
  async function checkAdmin() {
    if (!adminToken || !state.sb) return;
    const { data, error } = await state.sb.rpc("is_admin", { token: adminToken });
    isAdmin = !error && data === true;
    if (!error && data === false) { store("lunch.adminToken", ""); adminToken = ""; banner("That owner link didn't work. Run supabase/009_question_admin.sql again to see the right one."); }
    renderAdmin();
  }
  function renderAdmin() {
    const card = $("adminCard");
    card.hidden = !isAdmin;
    if (!isAdmin) return;
    if (!$("qDate").value) $("qDate").value = isNoLunchDay(today) ? stepWorkday(today, 1) : (questionFor(today) ? stepWorkday(today, 1) : today);
    const list = $("qList"); list.replaceChildren();
    const days = Object.keys(dbQuestions).sort();
    const upcoming = days.filter((d) => d >= today), past = days.filter((d) => d < today).slice(-5).reverse();
    if (!days.length) { list.appendChild(el("li", "admin-empty", "No questions yet. Add one above.")); return; }
    const row = (d, isPast) => {
      const li = el("li", isPast ? "past" : (d === today ? "today" : ""));
      li.append(el("span", "qd", d === today ? "Today" : pretty(d, { weekday: "short", month: "short", day: "numeric" })), el("span", "qq", dbQuestions[d]));
      const edit = el("button", "linkbtn subtle", "Edit"); edit.type = "button";
      edit.addEventListener("click", () => { $("qDate").value = d; $("qText").value = dbQuestions[d]; $("qText").focus(); });
      const del = el("button", "linkbtn subtle del", confirmDel === d ? "Confirm delete" : "Delete"); del.type = "button";
      del.addEventListener("click", async () => {
        if (confirmDel !== d) { confirmDel = d; renderAdmin(); return; }
        confirmDel = null;
        const { error } = await state.sb.rpc("delete_question", { token: adminToken, d });
        if (error) { $("qStatus").className = "status err"; $("qStatus").textContent = "Couldn't delete it. Try again."; return; }
        delete dbQuestions[d]; renderAdmin(); renderQotd();
        $("qStatus").className = "status ok"; $("qStatus").textContent = "Deleted";
      });
      const acts = el("span", "qa"); acts.append(edit, del); li.appendChild(acts);
      return li;
    };
    if (upcoming.length) { list.appendChild(el("li", "admin-head", "Upcoming")); upcoming.forEach((d) => list.appendChild(row(d, false))); }
    if (past.length) { list.appendChild(el("li", "admin-head", "Recent")); past.forEach((d) => list.appendChild(row(d, true))); }
  }
  $("qForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = $("qDate").value, q = $("qText").value.trim(), st = $("qStatus");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { st.className = "status err"; st.textContent = "Pick a date."; return; }
    if (q.length < 3) { st.className = "status err"; st.textContent = "Type a question (at least 3 characters)."; return; }
    $("qSave").disabled = true; st.className = "status"; st.textContent = "Saving…";
    const { error } = await state.sb.rpc("set_question", { token: adminToken, d, q });
    $("qSave").disabled = false;
    if (error) { st.className = "status err"; st.textContent = "Couldn't save it. Try again."; return; }
    dbQuestions[d] = q; $("qText").value = "";
    st.className = "status ok"; st.textContent = "Saved for " + (d === today ? "today" : pretty(d, { weekday: "long", month: "short", day: "numeric" })) + " ✓";
    renderAdmin();
    if (d === today) loadQotd();
  });
  $("adminOff").addEventListener("click", () => { store("lunch.adminToken", ""); adminToken = ""; isAdmin = false; renderAdmin(); });

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
    let [a, x] = await Promise.all([
      state.sb.from("absences").select("day, voter_id, voter_name, ate, ghost").limit(10000),
      state.sb.from("rating_votes").select("day, rated_voter_id, voter_id, value").limit(50000),
    ]);
    state.canGhost = !a.error;
    if (a.error) a = await state.sb.from("absences").select("day, voter_id, voter_name, ate").limit(10000); // before 007 is run
    state.canShareAte = !a.error;
    if (a.error) a = await state.sb.from("absences").select("day, voter_id, voter_name").limit(10000); // before 005 is run
    state.extras = !a.error && !x.error;
    state.absences = a.error ? [] : a.data;
    state.reactions = x.error ? [] : x.data;
    const o = await state.sb.from("ooo_votes").select("day, ooo_voter_id, voter_id, voter_name, value").limit(20000);
    state.oooOn = !o.error; // from 006_out_of_office_votes.sql; the page works without it
    state.oooVotes = o.error ? [] : o.data;
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
  loadQotd().then(checkAdmin);

  // Live updates while the page is open.
  state.sb.channel("lunch")
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, (p) => {
      if (p.new && p.new.day) { mergeVote(p.new); if (!state.dirty) loadMyVoteIntoForm(); render(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "absences" }, (p) => {
      if (p.new && p.new.day) { mergeRow(state.absences, p.new, ["day", "voter_id"]); render(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "ooo_votes" }, (p) => {
      if (p.new && p.new.day) { mergeRow(state.oooVotes, p.new, ["day", "ooo_voter_id", "voter_id"]); renderTally(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "rating_votes" }, (p) => {
      if (p.new && p.new.day) { mergeRow(state.reactions, p.new, ["day", "rated_voter_id", "voter_id"]); renderTally(); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "questions" }, () => { loadQotd(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "answers" }, (p) => {
      if (p.new && p.new.day === today) { mergeRow(qotdAnswers, p.new, ["day", "voter_id"]); renderQotd(); }
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
