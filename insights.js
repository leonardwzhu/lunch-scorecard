// Streaks, the weekly recap and taste twins, all worked out from the ratings already loaded.
// app.js calls LunchInsights.build(...) and renders what it returns.
(function () {
  "use strict";

  // People can vote from more than one browser, so the same typed name counts as one person.
  function personKey(id, name) {
    const n = (name || "").trim().toLowerCase();
    return n ? "n:" + n : "id:" + id;
  }

  function build({ votes, absences, reactions, days, myId, isMe, today, isHidden }) {
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
    const me = [...people.values()].find((p) => [...p.ids].some(isMine)) || null;
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
    let closestPair = null, furthestPair = null;
    const list = [...people.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const c = compare(list[i], list[j]);
      if (!c || c.shared < MIN_SHARED) continue;
      const pair = { a: display(list[i]), b: display(list[j]), aReal: list[i].name || "Someone", bReal: list[j].name || "Someone", ...c };
      if (!closestPair || c.gap < closestPair.gap || (c.gap === closestPair.gap && c.shared > closestPair.shared)) closestPair = pair;
      if (!furthestPair || c.gap > furthestPair.gap || (c.gap === furthestPair.gap && c.shared > furthestPair.shared)) furthestPair = pair;
    }
    const taste = { mine, twin: mine[0] || null, opposite: mine.length > 1 ? mine[mine.length - 1] : null, closestPair, furthestPair, myRated: me ? me.ratings.size : 0 };

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
      const pick = (arr, cmp) => (arr.length >= 2 ? arr.slice().sort(cmp)[0] : null);
      const harshest = pick(qualified, (a, b) => a.avg - b.avg || b.n - a.n);
      const easiest = pick(qualified, (a, b) => b.avg - a.avg || b.n - a.n);
      const contrarian = pick(qualified, (a, b) => b.off - a.off || b.n - a.n);
      const agreed = [...stats.entries()].map(([p, s]) => ({ name: show(p), score: s.agreed })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score)[0] || null;

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
      return { monday, best, worst, comment, harshest, easiest, contrarian, agreed, hot, lunches: rated.length, ratings: weekVotes.length, outCount, hiddenCount };
    }

    return { streakFor, myStreak: me ? streaks.get(me.key) || 0 : 0, taste, recap };
  }

  window.LunchInsights = { build };
})();
