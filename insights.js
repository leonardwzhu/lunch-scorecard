// Streaks, the weekly recap and taste twins, all worked out from the ratings already loaded.
// app.js calls LunchInsights.build(...) and renders what it returns.
(function () {
  "use strict";

  // People can vote from more than one browser, so the same typed name counts as one person.
  function personKey(id, name) {
    const n = (name || "").trim().toLowerCase();
    return n ? "n:" + n : "id:" + id;
  }

  // Ties list everyone: "Kevin", "Kevin & Julie", "Kevin, Julie & Shea", "Kevin, Julie, Shea + 2 more".
  function joinNames(names) {
    if (names.length <= 1) return names[0] || "";
    if (names.length <= 3) return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
    return names.slice(0, 3).join(", ") + " + " + (names.length - 3) + " more";
  }
  const similarity = (gap) => Math.round((1 - gap / 4) * 100);
  // Everyone sharing the best value, comparing what people see on screen (rounded), not hidden decimals.
  function tiedBest(arr, valueOf) {
    if (!arr.length) return [];
    const best = valueOf(arr[0]);
    return arr.filter((x) => valueOf(x) === best);
  }

  function build({ votes, absences, reactions, days, myId, myName, isMe, today, isHidden }) {
    const people = new Map();
    const person = (id, name) => {
      const k = personKey(id, name);
      let p = people.get(k);
      if (!p) { p = { key: k, name: (name || "").trim(), ids: new Set(), acted: new Set(), ratings: new Map(), out: new Set() }; people.set(k, p); }
      p.ids.add(id);
      if (name && name.trim()) p.name = name.trim();
      return p;
    };
    votes.forEach((v) => { const p = person(v.voter_id, v.voter_name); p.acted.add(v.day); p.ratings.set(v.day, v); });
    absences.forEach((a) => { const p = person(a.voter_id, a.voter_name); p.acted.add(a.day); p.out.add(a.day); });

    const isMine = isMe || ((id) => id === myId);
    // You're found by this device's ids, or else by the name you go by (a device that hasn't synced yet).
    const me = [...people.values()].find((p) => [...p.ids].some(isMine)) ||
      (myName && (myName || "").trim() ? people.get(personKey(null, myName)) : null) || null;
    const display = (p) => (p === me ? "You" : p.name || "Someone without a name");

    // Lunch days: any day with a named lunch, a rating or an out-of-office entry. Weekends drop out on their own.
    const lunchDays = [...new Set([...Object.keys(days), ...votes.map((v) => v.day), ...absences.map((a) => a.day)])].sort();

    const dayStats = {};
    votes.forEach((v) => {
      const s = dayStats[v.day] || (dayStats[v.day] = { sum: 0, n: 0 });
      s.sum += v.stars; s.n++;
    });
    Object.values(dayStats).forEach((s) => { s.avg = s.sum / s.n; });

    // ---------- streaks ----------
    // Consecutive lunch days someone rated or marked themselves out. Today doesn't break a streak until it's over.
    function streak(p) {
      let n = 0;
      for (let i = lunchDays.length - 1; i >= 0; i--) {
        const d = lunchDays[i];
        if (p.acted.has(d)) n++;
        else if (d === today) continue;
        else break;
      }
      return n;
    }
    const streaks = new Map();
    people.forEach((p) => streaks.set(p.key, streak(p)));
    const streakFor = (id, name) => streaks.get(personKey(id, name)) || 0;

    // ---------- taste twins ----------
    // Average gap between two people's ratings on lunches they both rated (0 = identical taste, 4 = opposite).
    function compare(a, b) {
      let gap = 0, n = 0;
      a.ratings.forEach((r, d) => { const o = b.ratings.get(d); if (o) { gap += Math.abs(r.stars - o.stars); n++; } });
      return n ? { gap: gap / n, shared: n } : null;
    }
    const MIN_SHARED = 2;
    let mine = [];
    if (me) {
      people.forEach((p) => {
        if (p === me) return;
        const c = compare(me, p);
        if (c && c.shared >= MIN_SHARED) mine.push({ name: display(p), ...c });
      });
      mine.sort((x, y) => x.gap - y.gap || y.shared - x.shared);
    }
    let furthestPair = null;
    const list = [...people.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const c = compare(list[i], list[j]);
      if (!c || c.shared < MIN_SHARED) continue;
      const pair = { a: display(list[i]), b: display(list[j]), aReal: list[i].name || "Someone", bReal: list[j].name || "Someone", ...c };
      if (!furthestPair || c.gap > furthestPair.gap || (c.gap === furthestPair.gap && c.shared > furthestPair.shared)) furthestPair = pair;
    }
    // Your twin(s): everyone tied for the highest similarity; least alike: everyone tied for the lowest.
    const group = (arr) => arr.length ? { name: joinNames(arr.map((x) => x.name)), names: arr.map((x) => x.name), gap: arr[0].gap, shared: arr[0].shared, count: arr.length } : null;
    const twins = tiedBest(mine, (x) => similarity(x.gap));
    const opps = mine.length > 1 ? tiedBest(mine.slice().reverse(), (x) => similarity(x.gap)) : [];
    // Most alike pair(s) in the office, again keeping ties.
    const pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const c = compare(list[i], list[j]);
      if (c && c.shared >= MIN_SHARED) pairs.push({ a: display(list[i]), b: display(list[j]), aReal: list[i].name || "Someone", bReal: list[j].name || "Someone", ...c });
    }
    pairs.sort((x, y) => x.gap - y.gap || y.shared - x.shared);
    const topPairs = tiedBest(pairs, (x) => similarity(x.gap));
    // One pair reads "You & Kevin"; several read "You & Kevin, Julie & Shea and Emily & andrew" ("You" always first).
    const pairText = (x, real) => { const a = real ? x.aReal : x.a, b = real ? x.bReal : x.b; return b === "You" ? b + " & " + a : a + " & " + b; };
    const joinPairs = (ps) => ps.length <= 1 ? ps.join("") : ps.slice(0, -1).join(", ") + " and " + ps[ps.length - 1];
    const closest = topPairs.length ? Object.assign({}, topPairs[0], {
      label: joinPairs(topPairs.slice(0, 3).map((x) => pairText(x, false))) + (topPairs.length > 3 ? " + " + (topPairs.length - 3) + " more pairs" : ""),
      labelReal: joinPairs(topPairs.slice(0, 3).map((x) => pairText(x, true))) + (topPairs.length > 3 ? " + " + (topPairs.length - 3) + " more pairs" : ""),
      count: topPairs.length }) : null;
    const opposite = opps.length && twins.length && similarity(opps[0].gap) < similarity(twins[0].gap) ? group(opps) : null;
    const taste = { mine, twin: group(twins), opposite, closestPair: closest, furthestPair, myRated: me ? me.ratings.size : 0 };

    // ---------- weekly recap ----------
    function recap(monday, weekDates, lunchName, forTeams) {
      // In the Teams message, "You" would be wrong for everyone else, so use real names there.
      const show = (p) => (forTeams ? p.name || "Someone" : display(p));
      const inWeek = new Set(weekDates);
      const shownDays = lunchDays.filter((d) => inWeek.has(d) && !isHidden(d));
      const hiddenCount = lunchDays.filter((d) => inWeek.has(d) && isHidden(d) && dayStats[d]).length;
      const rated = shownDays.filter((d) => dayStats[d]);

      const lunches = rated.map((d) => ({ day: d, name: lunchName(d), avg: dayStats[d].avg, n: dayStats[d].n }));
      const byAvg = lunches.slice().sort((a, b) => b.avg - a.avg || b.n - a.n);
      const best = byAvg[0] || null;
      const worst = byAvg.length > 1 ? byAvg[byAvg.length - 1] : null;

      const shown = new Set(rated);
      const weekVotes = votes.filter((v) => shown.has(v.day));
      const net = (v) => reactions.filter((x) => x.day === v.day && x.rated_voter_id === v.voter_id).reduce((s, x) => s + x.value, 0);

      let comment = null;
      weekVotes.forEach((v) => {
        if (!v.comment) return;
        const score = net(v);
        if (score < 1) return;
        if (!comment || score > comment.score) comment = { text: v.comment, by: show(person(v.voter_id, v.voter_name)), score, day: v.day };
      });

      // Per-person stats for the awards (at least 2 ratings that week to qualify).
      const stats = new Map();
      weekVotes.forEach((v) => {
        const p = person(v.voter_id, v.voter_name);
        const s = stats.get(p) || { n: 0, sum: 0, off: 0, agreed: 0 };
        s.n++; s.sum += v.stars; s.off += Math.abs(v.stars - dayStats[v.day].avg); s.agreed += net(v);
        stats.set(p, s);
      });
      const qualified = [...stats.entries()].filter(([, s]) => s.n >= 2).map(([p, s]) => ({ name: show(p), n: s.n, avg: s.sum / s.n, off: s.off / s.n }));
      // Awards go to everyone tied for the top spot (compared at the 1 decimal shown).
      const pick = (arr, cmp, val) => {
        if (arr.length < 2) return null;
        const tied = tiedBest(arr.slice().sort(cmp), (x) => val(x).toFixed(1));
        return Object.assign({}, tied[0], { name: joinNames(tied.map((x) => x.name)), names: tied.map((x) => x.name) });
      };
      const harshest = pick(qualified, (a, b) => a.avg - b.avg || b.n - a.n, (x) => x.avg);
      const easiest = pick(qualified, (a, b) => b.avg - a.avg || b.n - a.n, (x) => x.avg);
      const contrarian = pick(qualified, (a, b) => b.off - a.off || b.n - a.n, (x) => x.off);
      const agreedAll = [...stats.entries()].map(([p, s]) => ({ name: show(p), score: s.agreed })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
      const agreedTied = tiedBest(agreedAll, (x) => x.score);
      const agreed = agreedTied.length ? { name: joinNames(agreedTied.map((x) => x.name)), score: agreedTied[0].score, names: agreedTied.map((x) => x.name) } : null;

      // Longest current streak; everyone tied for it shares the award.
      let hot = null;
      people.forEach((p) => {
        const n = streaks.get(p.key);
        if (n < 2) return;
        if (!hot || n > hot.n) hot = { n, names: [show(p)] };
        else if (n === hot.n) hot.names.push(show(p));
      });
      if (hot) hot.name = hot.names.length > 3 ? hot.names.slice(0, 3).join(", ") + " + " + (hot.names.length - 3) + " more" : hot.names.join(" & ").replace(/ & (?=.* & )/g, ", ");

      const outCount = absences.filter((a) => shown.has(a.day)).length;
      return { monday, ranked: byAvg, best, worst, comment, harshest, easiest, contrarian, agreed, hot, lunches: rated.length, ratings: weekVotes.length, outCount, hiddenCount };
    }

    return { streakFor, myStreak: me ? streaks.get(me.key) || 0 : 0, taste, recap };
  }

  window.LunchInsights = { build };
})();
