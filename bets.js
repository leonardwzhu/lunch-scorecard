// Biscuit Bets: a daily over/under game with pretend biscuits.
// Everyone starts with 100. Before you see a lunch's results you bet over or under the day's line;
// bets settle once the day is over, on the average of everyone else's ratings (never your own).
(function () {
  "use strict";
  const START = 100, BAILOUT = 20;
  // People can vote from more than one browser, so the same typed name is one person (same rule as insights.js).
  const key = (id, name) => { const n = (name || "").trim().toLowerCase(); return n ? "n:" + n : "id:" + id; };
  const avg = (vs) => vs.reduce((a, v) => a + v.stars, 0) / vs.length;
  const roundLine = (x) => Math.min(4.5, Math.max(1.5, Math.round(x * 2) / 2));

  // The line: how this restaurant did before, or the office average for somewhere new.
  function lineFor(day, days, votes) {
    const name = (days[day] || "").trim().toLowerCase();
    const before = votes.filter((v) => v.day < day);
    if (name) {
      const same = before.filter((v) => (days[v.day] || "").trim().toLowerCase() === name);
      if (same.length) return { line: roundLine(avg(same)), why: "how it scored before" };
    }
    if (before.length) return { line: roundLine(avg(before)), why: "the office average" };
    return { line: 3.5, why: "a fresh start" };
  }

  // Your own rating never counts toward your own bet, so nobody can rate a 1 to win an "under".
  function outcome(bet, votes, today) {
    const k = key(bet.voter_id, bet.voter_name);
    const counted = votes.filter((v) => v.day === bet.day && v.voter_id !== bet.voter_id && key(v.voter_id, v.voter_name) !== k);
    const a = counted.length ? avg(counted) : null, line = Number(bet.line);
    if (bet.day >= today) return { status: "pending", avg: a, n: counted.length };
    if (a === null || Math.abs(a - line) < 1e-9) return { status: "push", avg: a, delta: 0, n: counted.length };
    const win = bet.side === "over" ? a > line : a < line;
    return { status: win ? "won" : "lost", avg: a, delta: win ? bet.amount : -bet.amount, n: counted.length };
  }

  // Everyone's balance, played out in order. Hitting zero earns a bailout (and a badge).
  function ledger(bets, votes, today) {
    const people = new Map();
    bets.slice()
      .sort((a, b) => a.day.localeCompare(b.day) || String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach((bet) => {
        const k = key(bet.voter_id, bet.voter_name);
        const p = people.get(k) || { key: k, name: "", ids: new Set(), balance: START, pending: 0, won: 0, lost: 0, pushes: 0, bailouts: 0, history: [] };
        if (bet.voter_name) p.name = bet.voter_name;
        p.ids.add(bet.voter_id);
        const o = outcome(bet, votes, today);
        if (o.status === "pending") p.pending += bet.amount;
        else {
          p.balance += o.delta;
          if (o.status === "won") p.won++; else if (o.status === "lost") p.lost++; else p.pushes++;
          if (p.balance <= 0) { p.balance = BAILOUT; p.bailouts++; }
        }
        p.history.push(Object.assign({ bet }, o));
        people.set(k, p);
      });
    people.forEach((p) => { p.available = Math.max(0, p.balance - p.pending); });
    return people;
  }

  window.LunchBets = { START, BAILOUT, key, lineFor, outcome, ledger };
})();
