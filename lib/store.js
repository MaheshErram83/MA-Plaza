// ============================================================
//  STORAGE MODULE  —  the ONLY file that touches the database.
//  Now with automation: recurring bills, confirm-received
//  handshake, and settle-up reminders.
// ============================================================

import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
import path from "path";

const dbPath = path.join(process.cwd(), "roommate.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS houses (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, name TEXT NOT NULL,
    vpa TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, description TEXT NOT NULL,
    amount REAL NOT NULL, paid_by TEXT NOT NULL, split_among TEXT NOT NULL,
    settled TEXT NOT NULL DEFAULT '{}', category TEXT DEFAULT 'Other',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS feed (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, icon TEXT, text TEXT NOT NULL,
    tone TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, description TEXT NOT NULL,
    amount REAL NOT NULL, paid_by TEXT NOT NULL, split_among TEXT NOT NULL,
    category TEXT DEFAULT 'Other', day_of_month INTEGER NOT NULL,
    last_run TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, from_id TEXT NOT NULL,
    to_id TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'claimed',
    claimed_at INTEGER, confirmed_at INTEGER
  );
`);

// migrate: add category column to existing expenses if missing
try { db.exec("ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'Other'"); } catch (e) {}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const monthTag = (ts) => { const d = new Date(ts); return d.getFullYear() + "-" + (d.getMonth() + 1); };

export function createHouse(name, members) {
  const houseId = uid();
  const now = Date.now();
  db.run("INSERT INTO houses (id, name, created_at) VALUES (?, ?, ?)", [houseId, name, now]);
  for (const m of members) {
    db.run(
      "INSERT INTO members (id, house_id, name, vpa, created_at) VALUES (?, ?, ?, ?, ?)",
      [uid(), houseId, m.name, m.vpa || m.name.toLowerCase().replace(/\s/g, "") + "@upi", now]
    );
  }
  addFeed(houseId, "home", name + " created with " + members.length + " roommates", "accent");
  return houseId;
}

export function getFirstHouse() { return db.get("SELECT * FROM houses ORDER BY created_at LIMIT 1") || null; }
export function getHouse(houseId) { return db.get("SELECT * FROM houses WHERE id = ?", [houseId]) || null; }
export function getMembers(houseId) { return db.all("SELECT * FROM members WHERE house_id = ? ORDER BY created_at", [houseId]); }

// Add a new roommate to an existing house.
export function addMember(houseId, name, vpa) {
  const id = uid();
  db.run("INSERT INTO members (id, house_id, name, vpa, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, houseId, name, vpa || name.toLowerCase().replace(/\s/g, "") + "@upi", Date.now()]);
  addFeed(houseId, "member", name + " joined the house", "accent");
  return id;
}

// Update a member's name or UPI ID (so QR codes point to the right account).
export function updateMember(houseId, id, { name, vpa }) {
  const m = db.get("SELECT * FROM members WHERE id = ? AND house_id = ?", [id, houseId]);
  if (!m) return;
  db.run("UPDATE members SET name = ?, vpa = ? WHERE id = ?",
    [name || m.name, vpa || m.vpa, id]);
}

// Remove a member. Safe: only allowed if they have NO unsettled balance.
// Their past (settled) history stays intact for the record.
export function removeMember(houseId, id) {
  const members = getMembers(houseId);
  if (members.length <= 2) return { ok: false, reason: "A house needs at least 2 members." };
  // check they're square — appear in no unsettled split, and owe/are owed nothing
  const balances = netBalances(houseId);
  const involved = balances.some((p) => p.from === id || p.to === id);
  if (involved) return { ok: false, reason: "Settle their balance before removing them." };
  const m = db.get("SELECT name FROM members WHERE id = ?", [id]);
  db.run("DELETE FROM members WHERE id = ? AND house_id = ?", [id, houseId]);
  addFeed(houseId, "member", (m ? m.name : "A member") + " left the house", "warning");
  return { ok: true };
}

export function addExpense(houseId, { description, amount, paidBy, splitAmong, category }) {
  const settled = {};
  splitAmong.forEach((mid) => { if (mid === paidBy) settled[mid] = true; });
  db.run(
    "INSERT INTO expenses (id, house_id, description, amount, paid_by, split_among, settled, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [uid(), houseId, description, amount, paidBy, JSON.stringify(splitAmong), JSON.stringify(settled), category || "Other", Date.now()]
  );
}

export function getExpenses(houseId) {
  return db.all("SELECT * FROM expenses WHERE house_id = ? ORDER BY created_at DESC", [houseId]).map((e) => ({
    ...e,
    splitAmong: JSON.parse(e.split_among),
    settled: JSON.parse(e.settled),
    category: e.category || "Other",
  }));
}

export function addFeed(houseId, icon, text, tone) {
  db.run("INSERT INTO feed (id, house_id, icon, text, tone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [uid(), houseId, icon, text, tone, Date.now()]);
}
export function getFeed(houseId, limit = 100) {
  return db.all("SELECT * FROM feed WHERE house_id = ? ORDER BY created_at DESC LIMIT ?", [houseId, limit]);
}

// ============================================================
//  RECURRING BILLS
// ============================================================
export function addRecurring(houseId, { description, amount, paidBy, splitAmong, category, dayOfMonth }) {
  db.run(
    "INSERT INTO recurring (id, house_id, description, amount, paid_by, split_among, category, day_of_month, last_run, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [uid(), houseId, description, amount, paidBy, JSON.stringify(splitAmong), category || "Other", dayOfMonth, null, Date.now()]
  );
  addFeed(houseId, "recurring", description + " set as recurring (day " + dayOfMonth + " each month)", "accent");
}

export function getRecurring(houseId) {
  return db.all("SELECT * FROM recurring WHERE house_id = ? ORDER BY created_at", [houseId]).map((r) => ({
    ...r, splitAmong: JSON.parse(r.split_among),
  }));
}

export function deleteRecurring(houseId, id) {
  db.run("DELETE FROM recurring WHERE id = ? AND house_id = ?", [id, houseId]);
}

// Materialize any recurring bills that are due this month and haven't run yet.
// Called on every data load — cheap, idempotent.
export function runDueRecurring(houseId) {
  const now = new Date();
  const thisMonth = monthTag(now.getTime());
  const today = now.getDate();
  const rows = getRecurring(houseId);
  let created = 0;
  for (const r of rows) {
    if (today >= r.day_of_month && r.last_run !== thisMonth) {
      addExpense(houseId, {
        description: r.description, amount: r.amount, paidBy: r.paid_by,
        splitAmong: r.splitAmong, category: r.category,
      });
      db.run("UPDATE recurring SET last_run = ? WHERE id = ?", [thisMonth, r.id]);
      addFeed(houseId, "recurring", r.description + " auto-added — this month's recurring bill", "accent");
      created++;
    }
  }
  return created;
}

// ============================================================
//  CONFIRM-RECEIVED HANDSHAKE
//  claimPayment: payer says "I paid" -> status 'claimed'
//  confirmPayment: payee says "received" -> clears the debt
// ============================================================
export function claimPayment(houseId, fromId, toId, amount) {
  db.run(
    "INSERT INTO settlements (id, house_id, from_id, to_id, amount, status, claimed_at) VALUES (?, ?, ?, ?, ?, 'claimed', ?)",
    [uid(), houseId, fromId, toId, amount, Date.now()]
  );
  addFeed(houseId, "claim", nameOf(houseId, fromId) + " marked ₹" + Math.round(amount) + " paid to " + nameOf(houseId, toId) + " — awaiting confirmation", "warning");
}

export function confirmPayment(houseId, settlementId) {
  const s = db.get("SELECT * FROM settlements WHERE id = ? AND house_id = ?", [settlementId, houseId]);
  if (!s) return;
  // Clear ALL unsettled shares between these two people, in both directions.
  // The claimed amount was the NET, so confirming settles the pair entirely.
  const rows = getExpenses(houseId);
  for (const e of rows) {
    // debtor's share of what creditor paid
    if (e.paid_by === s.to_id && e.splitAmong.includes(s.from_id) && !e.settled[s.from_id]) {
      e.settled[s.from_id] = true;
      db.run("UPDATE expenses SET settled = ? WHERE id = ?", [JSON.stringify(e.settled), e.id]);
    }
    // creditor's share of what debtor paid (the reverse direction, folded into the net)
    if (e.paid_by === s.from_id && e.splitAmong.includes(s.to_id) && !e.settled[s.to_id]) {
      e.settled[s.to_id] = true;
      db.run("UPDATE expenses SET settled = ? WHERE id = ?", [JSON.stringify(e.settled), e.id]);
    }
  }
  db.run("UPDATE settlements SET status = 'confirmed', confirmed_at = ? WHERE id = ?", [Date.now(), settlementId]);
  addFeed(houseId, "settle", nameOf(houseId, s.to_id) + " confirmed receiving ₹" + Math.round(s.amount) + " from " + nameOf(houseId, s.from_id), "success");
}

export function getPendingConfirmations(houseId) {
  return db.all("SELECT * FROM settlements WHERE house_id = ? AND status = 'claimed' ORDER BY claimed_at DESC", [houseId]);
}

function nameOf(houseId, id) {
  const m = db.get("SELECT name FROM members WHERE id = ?", [id]);
  return m ? m.name : "?";
}

// ============================================================
//  BALANCE ENGINE
// ============================================================
export function netBalances(houseId) {
  const members = getMembers(houseId);
  const expenses = getExpenses(houseId);
  const owe = {};
  members.forEach((a) => { owe[a.id] = {}; members.forEach((b) => { if (a.id !== b.id) owe[a.id][b.id] = 0; }); });
  expenses.forEach((e) => {
    const share = e.amount / e.splitAmong.length;
    e.splitAmong.forEach((mid) => { if (mid !== e.paid_by && !e.settled[mid]) owe[mid][e.paid_by] += share; });
  });
  const pairs = [];
  members.forEach((a) => members.forEach((b) => {
    if (a.id < b.id) {
      const net = owe[a.id][b.id] - owe[b.id][a.id];
      if (Math.abs(net) >= 1) net > 0 ? pairs.push({ from: a.id, to: b.id, amt: net }) : pairs.push({ from: b.id, to: a.id, amt: -net });
    }
  }));
  return pairs;
}

export function simplifiedBalances(houseId) {
  const members = getMembers(houseId);
  const expenses = getExpenses(houseId);
  const net = {};
  members.forEach((m) => (net[m.id] = 0));
  expenses.forEach((e) => {
    const share = e.amount / e.splitAmong.length;
    e.splitAmong.forEach((mid) => {
      if (mid !== e.paid_by && !e.settled[mid]) { net[mid] -= share; net[e.paid_by] += share; }
    });
  });
  const debtors = [], creditors = [];
  for (const id in net) {
    const v = Math.round(net[id]);
    if (v < 0) debtors.push({ id, amt: -v });
    else if (v > 0) creditors.push({ id, amt: v });
  }
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);
  const payments = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay >= 1) payments.push({ from: debtors[i].id, to: creditors[j].id, amt: pay });
    debtors[i].amt -= pay; creditors[j].amt -= pay;
    if (debtors[i].amt < 1) i++;
    if (creditors[j].amt < 1) j++;
  }
  return payments;
}

// ============================================================
//  REMINDERS — oldest unsettled debt per pair, with age in days
// ============================================================
export function reminders(houseId) {
  const expenses = getExpenses(houseId);
  const oldestOwe = {}; // key from->to : earliest created_at
  expenses.forEach((e) => {
    const share = e.amount / e.splitAmong.length;
    e.splitAmong.forEach((mid) => {
      if (mid !== e.paid_by && !e.settled[mid]) {
        const key = mid + ">" + e.paid_by;
        if (!oldestOwe[key] || e.created_at < oldestOwe[key]) oldestOwe[key] = e.created_at;
      }
    });
  });
  const now = Date.now();
  const out = [];
  const simple = simplifiedBalances(houseId);
  simple.forEach((p) => {
    // find oldest debt involving this debtor
    let oldest = now;
    Object.keys(oldestOwe).forEach((k) => {
      if (k.startsWith(p.from + ">")) oldest = Math.min(oldest, oldestOwe[k]);
    });
    const days = Math.floor((now - oldest) / 86400000);
    out.push({ from: p.from, to: p.to, amt: p.amt, days });
  });
  return out.filter((r) => r.days >= 3).sort((a, b) => b.days - a.days);
}

export function stats(houseId) {
  const expenses = getExpenses(houseId);
  let total = 0, pending = 0;
  expenses.forEach((e) => {
    total += e.amount;
    const share = e.amount / e.splitAmong.length;
    e.splitAmong.forEach((mid) => { if (mid !== e.paid_by && !e.settled[mid]) pending += share; });
  });
  return { total, pending, settled: total - pending };
}

// ============================================================
//  AI CFO  —  rule-based house intelligence.
//  Generates a morning brief and answers plain-English
//  questions by computing over the house's own data.
//  No external AI, no API key, works offline — and for money
//  questions, exact math beats a language model's guess.
// ============================================================

function monthName(ts) {
  return new Date(ts).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// The morning brief: a CFO-style summary of the house's finances.
export function cfoBrief(houseId) {
  const expenses = getExpenses(houseId);
  const members = getMembers(houseId);
  const s = stats(houseId);
  const simple = simplifiedBalances(houseId);
  const rem = reminders(houseId);

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // this month's spend
  let monthTotal = 0;
  const byCat = {};
  expenses.forEach((e) => {
    const d = new Date(e.created_at);
    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
      monthTotal += e.amount;
      byCat[e.category] = (byCat[e.category] || 0) + e.amount;
    }
  });

  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  // category trend: this month vs average of prior months
  const priorByCatMonth = {};
  expenses.forEach((e) => {
    const d = new Date(e.created_at);
    const isThisMonth = d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    if (!isThisMonth) {
      const key = e.category;
      priorByCatMonth[key] = priorByCatMonth[key] || {};
      const mk = d.getFullYear() + "-" + d.getMonth();
      priorByCatMonth[key][mk] = (priorByCatMonth[key][mk] || 0) + e.amount;
    }
  });

  const insights = [];
  Object.keys(byCat).forEach((cat) => {
    const prior = priorByCatMonth[cat];
    if (prior) {
      const months = Object.values(prior);
      const avg = months.reduce((a, b) => a + b, 0) / months.length;
      if (avg > 0) {
        const change = Math.round(((byCat[cat] - avg) / avg) * 100);
        if (change >= 20) insights.push({ text: cat + " is " + change + "% higher than your usual ₹" + Math.round(avg).toLocaleString("en-IN"), tone: "warning" });
      }
    }
  });

  // upcoming recurring bills
  const recurring = getRecurring(houseId);
  const today = now.getDate();
  const upcoming = recurring
    .filter((r) => r.day_of_month >= today)
    .sort((a, b) => a.day_of_month - b.day_of_month)
    .slice(0, 2)
    .map((r) => ({ text: r.description + " (₹" + Math.round(r.amount).toLocaleString("en-IN") + ") due on day " + r.day_of_month, tone: "accent" }));

  return {
    monthName: monthName(now.getTime()),
    monthTotal,
    topCategory: topCat ? { name: topCat[0], amount: topCat[1] } : null,
    pendingCount: simple.length,
    pendingTotal: s.pending,
    overdueCount: rem.length,
    insights,
    upcoming,
  };
}

// Answer a plain-English question over the house's data.
// Matches keywords and computes the exact answer.
export function cfoAsk(houseId, question) {
  const q = (question || "").toLowerCase();
  const expenses = getExpenses(houseId);
  const members = getMembers(houseId);
  const nameById = {};
  members.forEach((m) => (nameById[m.id] = m.name));
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");

  if (!expenses.length) return "No expenses recorded yet — add a few and ask me again.";

  // "who paid the least" / "who hasn't contributed" / "lowest" — check FIRST
  if (/(who).*(least|hasn.?t|haven.?t|lowest|minimum)/.test(q)) {
    const spent = {};
    members.forEach((m) => (spent[m.id] = 0));
    expenses.forEach((e) => (spent[e.paid_by] = (spent[e.paid_by] || 0) + e.amount));
    const sorted = Object.entries(spent).sort((a, b) => a[1] - b[1]);
    const [lowId, lowAmt] = sorted[0];
    return nameById[lowId] + " has contributed the least — " + inr(lowAmt) + " so far.";
  }

  // "who paid the most" / "who spends the most" / "top contributor"
  if (/(who).*(paid|spent|spend|contribut|most|highest)/.test(q) || /top contributor/.test(q)) {
    const spent = {};
    expenses.forEach((e) => (spent[e.paid_by] = (spent[e.paid_by] || 0) + e.amount));
    const sorted = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    const [topId, topAmt] = sorted[0];
    return nameById[topId] + " has paid the most — " + inr(topAmt) + " in total.";
  }

  // "how much on <category>" — check each known category
  const cats = ["rent", "utilities", "groceries", "grocery", "internet", "wifi", "subscriptions", "subscription", "food", "other"];
  for (const c of cats) {
    if (q.includes(c)) {
      const target = c === "grocery" ? "groceries" : c === "wifi" ? "internet" : c === "subscription" ? "subscriptions" : c;
      let total = 0, count = 0;
      expenses.forEach((e) => {
        if (e.category.toLowerCase() === target || e.description.toLowerCase().includes(c)) { total += e.amount; count++; }
      });
      if (count === 0) return "No " + target + " expenses found yet.";
      return "You've spent " + inr(total) + " on " + target + " across " + count + " expense" + (count > 1 ? "s" : "") + ".";
    }
  }

  // "biggest category" / "where does money go" / "most spent on"
  if (/(biggest|largest|most).*(categ|spend|spent|expense)/.test(q) || /where.*(money|spend)/.test(q)) {
    const byCat = {};
    expenses.forEach((e) => (byCat[e.category] = (byCat[e.category] || 0) + e.amount));
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    const [cat, amt] = sorted[0];
    return "Your biggest category is " + cat + " — " + inr(amt) + " (" + Math.round((amt / total) * 100) + "% of all spending).";
  }

  // "total" / "how much total" / "how much spent"
  if (/(total|how much).*(spent|spend)/.test(q) || /^total/.test(q) || /overall/.test(q)) {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    return "The house has spent " + inr(total) + " in total across " + expenses.length + " expenses.";
  }

  // "how much does <name> owe" / balances
  if (/(owe|owes|owed|balance|settle)/.test(q)) {
    const simple = simplifiedBalances(houseId);
    if (!simple.length) return "Everyone is settled up — no outstanding balances.";
    const lines = simple.map((p) => nameById[p.from] + " should pay " + nameById[p.to] + " " + inr(p.amt));
    return "Current balances:\n" + lines.join("\n");
  }

  // "average" spend
  if (/average|avg/.test(q)) {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    return "Average expense is " + inr(total / expenses.length) + " across " + expenses.length + " expenses.";
  }

  // fallback: show what it CAN answer
  return "I can answer things like: \"who paid the most?\", \"how much on groceries?\", \"what's our biggest category?\", \"total spent?\", or \"who owes whom?\". Try one of those.";
}

// ============================================================
//  GOALS  —  shared savings goals with contributions.
//  Tracks progress toward a target. This is a LEDGER, not a
//  held balance — money isn't pooled, contributions are logged.
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, title TEXT NOT NULL,
    target REAL NOT NULL, saved REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS goal_contributions (
    id TEXT PRIMARY KEY, goal_id TEXT NOT NULL, member_id TEXT NOT NULL,
    amount REAL NOT NULL, created_at INTEGER NOT NULL
  );
`);

export function addGoal(houseId, title, target) {
  const id = uid();
  db.run("INSERT INTO goals (id, house_id, title, target, saved, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, houseId, title, target, Date.now()]);
  addFeed(houseId, "goal", "New goal: " + title + " (target ₹" + Math.round(target).toLocaleString("en-IN") + ")", "accent");
  return id;
}

export function getGoals(houseId) {
  const goals = db.all("SELECT * FROM goals WHERE house_id = ? ORDER BY created_at DESC", [houseId]);
  return goals.map((g) => ({
    ...g,
    contributions: db.all("SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY created_at DESC", [g.id]),
  }));
}

export function contributeGoal(houseId, goalId, memberId, amount) {
  db.run("INSERT INTO goal_contributions (id, goal_id, member_id, amount, created_at) VALUES (?, ?, ?, ?, ?)",
    [uid(), goalId, memberId, amount, Date.now()]);
  db.run("UPDATE goals SET saved = saved + ? WHERE id = ?", [amount, goalId]);
  const g = db.get("SELECT title FROM goals WHERE id = ?", [goalId]);
  addFeed(houseId, "goal", nameOf(houseId, memberId) + " added ₹" + Math.round(amount).toLocaleString("en-IN") + " to " + (g ? g.title : "a goal"), "success");
}

export function deleteGoal(houseId, goalId) {
  db.run("DELETE FROM goal_contributions WHERE goal_id = ?", [goalId]);
  db.run("DELETE FROM goals WHERE id = ? AND house_id = ?", [goalId, houseId]);
}

// ============================================================
//  MEMBER PROFILE  —  full financial picture for one person.
// ============================================================
export function memberProfile(houseId, memberId) {
  const m = db.get("SELECT * FROM members WHERE id = ? AND house_id = ?", [memberId, houseId]);
  if (!m) return null;
  const expenses = getExpenses(houseId);

  let totalPaid = 0, totalShare = 0, expenseCount = 0;
  expenses.forEach((e) => {
    if (e.paid_by === memberId) { totalPaid += e.amount; }
    if (e.splitAmong.includes(memberId)) {
      totalShare += e.amount / e.splitAmong.length;
      expenseCount++;
    }
  });

  // net balance from simplified view
  const simple = simplifiedBalances(houseId);
  let owes = 0, owed = 0;
  simple.forEach((p) => {
    if (p.from === memberId) owes += p.amt;
    if (p.to === memberId) owed += p.amt;
  });

  // goal contributions
  const goalTotal = db.get("SELECT COALESCE(SUM(amount),0) as t FROM goal_contributions WHERE member_id = ?", [memberId]);

  return {
    id: m.id,
    name: m.name,
    vpa: m.vpa,
    joined: m.created_at,
    totalPaid,
    totalShare,
    expenseCount,
    owes,
    owed,
    netBalance: owed - owes,
    goalContributed: goalTotal ? goalTotal.t : 0,
  };
}

// ============================================================
//  TREASURY  —  house financial position (a display ledger).
//  Shows tracked totals. Does NOT hold or pool money.
// ============================================================
export function treasury(houseId) {
  const s = stats(houseId);
  const goals = getGoals(houseId);
  const goalsSaved = goals.reduce((sum, g) => sum + g.saved, 0);
  const goalsTarget = goals.reduce((sum, g) => sum + g.target, 0);
  const members = getMembers(houseId);
  const expenses = getExpenses(houseId);

  // this month spend
  const now = new Date();
  let monthSpend = 0;
  expenses.forEach((e) => {
    const d = new Date(e.created_at);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) monthSpend += e.amount;
  });

  return {
    totalTracked: s.total,
    pending: s.pending,
    settled: s.settled,
    monthSpend,
    memberCount: members.length,
    goalsSaved,
    goalsTarget,
    goalCount: goals.length,
  };
}

// ============================================================
//  HOUSE TREASURER MODEL
//  Fund-centric: monthly contributions build a house fund the
//  Treasurer manages. Reimbursement requests flow through a
//  formal approval workflow. All REAL money moves by UPI —
//  this app is the ledger and the workflow, never a wallet.
// ============================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS house_config (
    house_id TEXT PRIMARY KEY, treasurer_id TEXT, monthly_amount REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, member_id TEXT NOT NULL,
    amount REAL NOT NULL, month_tag TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fund_expenses (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, description TEXT NOT NULL,
    amount REAL NOT NULL, category TEXT DEFAULT 'Other', paid_by TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reimbursements (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, member_id TEXT NOT NULL,
    amount REAL NOT NULL, category TEXT DEFAULT 'Other', description TEXT,
    notes TEXT, receipt TEXT, status TEXT NOT NULL DEFAULT 'submitted',
    treasurer_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
`);

// ---- Config: who's treasurer, how much per month ----
export function setConfig(houseId, treasurerId, monthlyAmount) {
  const existing = db.get("SELECT house_id FROM house_config WHERE house_id = ?", [houseId]);
  if (existing) {
    db.run("UPDATE house_config SET treasurer_id = ?, monthly_amount = ? WHERE house_id = ?",
      [treasurerId, monthlyAmount, houseId]);
  } else {
    db.run("INSERT INTO house_config (house_id, treasurer_id, monthly_amount) VALUES (?, ?, ?)",
      [houseId, treasurerId, monthlyAmount]);
  }
  addFeed(houseId, "config", "Treasurer set to " + nameOf(houseId, treasurerId) + ", monthly contribution ₹" + Math.round(monthlyAmount).toLocaleString("en-IN"), "accent");
}
export function getConfig(houseId) {
  return db.get("SELECT * FROM house_config WHERE house_id = ?", [houseId]) || { treasurer_id: null, monthly_amount: 0 };
}

// ---- Contributions ----
export function addContribution(houseId, memberId, amount, monthTag) {
  const mt = monthTag || currentMonthTag();
  db.run("INSERT INTO contributions (id, house_id, member_id, amount, month_tag, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [uid(), houseId, memberId, amount, mt, Date.now()]);
  addFeed(houseId, "contribution", nameOf(houseId, memberId) + " contributed ₹" + Math.round(amount).toLocaleString("en-IN") + " to the fund", "success");
}
export function getContributions(houseId, monthTag) {
  if (monthTag) return db.all("SELECT * FROM contributions WHERE house_id = ? AND month_tag = ? ORDER BY created_at DESC", [houseId, monthTag]);
  return db.all("SELECT * FROM contributions WHERE house_id = ? ORDER BY created_at DESC", [houseId]);
}
function currentMonthTag() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ---- Fund expenses (money spent from the house fund) ----
export function addFundExpense(houseId, { description, amount, category, paidBy }) {
  db.run("INSERT INTO fund_expenses (id, house_id, description, amount, category, paid_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [uid(), houseId, description, amount, category || "Other", paidBy || null, Date.now()]);
  addFeed(houseId, "expense", description + " — ₹" + Math.round(amount).toLocaleString("en-IN") + " from house fund", "accent");
}
export function getFundExpenses(houseId) {
  return db.all("SELECT * FROM fund_expenses WHERE house_id = ? ORDER BY created_at DESC", [houseId]);
}

// ---- The house fund: contributions in, expenses + paid reimbursements out ----
export function fundState(houseId) {
  const contribs = db.all("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE house_id = ?", [houseId]);
  const expenses = db.all("SELECT COALESCE(SUM(amount),0) as t FROM fund_expenses WHERE house_id = ?", [houseId]);
  const paidReimb = db.all("SELECT COALESCE(SUM(amount),0) as t FROM reimbursements WHERE house_id = ? AND status IN ('paid','completed')", [houseId]);
  const totalIn = contribs[0].t;
  const totalOut = expenses[0].t + paidReimb[0].t;
  const available = totalIn - totalOut;

  // this month
  const mt = currentMonthTag();
  const monthIn = db.all("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE house_id = ? AND month_tag = ?", [houseId, mt]);

  // pending reimbursements (awaiting or approved, not yet paid)
  const pending = db.all("SELECT COALESCE(SUM(amount),0) as t FROM reimbursements WHERE house_id = ? AND status IN ('submitted','under_review','approved')", [houseId]);

  // total spent = fund expenses + paid reimbursements (everything that left the fund)
  const totalSpent = expenses[0].t + paidReimb[0].t;

  return {
    available,
    totalIn,
    totalOut,
    monthIn: monthIn[0].t,
    monthSpend: totalSpent,
    pendingReimb: pending[0].t,
  };
}

// ---- Reimbursement workflow ----
const REIMB_FLOW = {
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "rejected", "submitted"],
  approved: ["paid"],
  paid: ["completed"],
};

export function createReimbursement(houseId, { memberId, amount, category, description, notes, receipt }) {
  const id = uid();
  const now = Date.now();
  db.run("INSERT INTO reimbursements (id, house_id, member_id, amount, category, description, notes, receipt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?)",
    [id, houseId, memberId, amount, category || "Other", description || "", notes || "", receipt || "", now, now]);
  addFeed(houseId, "reimbursement", nameOf(houseId, memberId) + " requested ₹" + Math.round(amount).toLocaleString("en-IN") + " reimbursement", "accent");
  return id;
}

export function getReimbursements(houseId, status) {
  let rows;
  if (status) rows = db.all("SELECT * FROM reimbursements WHERE house_id = ? AND status = ? ORDER BY created_at DESC", [houseId, status]);
  else rows = db.all("SELECT * FROM reimbursements WHERE house_id = ? ORDER BY created_at DESC", [houseId]);
  return rows;
}

// Treasurer moves a request through the workflow.
export function advanceReimbursement(houseId, id, toStatus, treasurerNote) {
  const r = db.get("SELECT * FROM reimbursements WHERE id = ? AND house_id = ?", [id, houseId]);
  if (!r) return { ok: false, reason: "Not found." };
  const allowed = REIMB_FLOW[r.status] || [];
  if (!allowed.includes(toStatus)) return { ok: false, reason: "Cannot move from " + r.status + " to " + toStatus + "." };

  // guard: can't pay more than the fund holds
  if (toStatus === "paid") {
    const fund = fundState(houseId);
    if (r.amount > fund.available) return { ok: false, reason: "Not enough in the fund (₹" + Math.round(fund.available).toLocaleString("en-IN") + " available)." };
  }

  db.run("UPDATE reimbursements SET status = ?, treasurer_note = ?, updated_at = ? WHERE id = ?",
    [toStatus, treasurerNote || r.treasurer_note || "", Date.now(), id]);

  const labels = { under_review: "is reviewing", approved: "approved", rejected: "rejected", paid: "paid", completed: "completed", submitted: "sent back for info on" };
  const tone = toStatus === "rejected" ? "warning" : toStatus === "paid" || toStatus === "completed" || toStatus === "approved" ? "success" : "accent";
  addFeed(houseId, "reimbursement", "Treasurer " + (labels[toStatus] || "updated") + " " + nameOf(houseId, r.member_id) + "'s ₹" + Math.round(r.amount).toLocaleString("en-IN") + " request", tone);
  return { ok: true };
}

// ---- Analytics + AI insights for the fund ----
export function fundInsights(houseId) {
  const fund = fundState(houseId);
  const expenses = getFundExpenses(houseId);
  const config = getConfig(houseId);
  const members = getMembers(houseId);
  const insights = [];

  // burn rate: avg monthly spend
  const byMonth = {};
  expenses.forEach((e) => {
    const d = new Date(e.created_at);
    const k = d.getFullYear() + "-" + (d.getMonth() + 1);
    byMonth[k] = (byMonth[k] || 0) + e.amount;
  });
  const months = Object.values(byMonth);
  const avgBurn = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;

  // projected depletion
  if (avgBurn > 0 && fund.available > 0) {
    const monthsLeft = fund.available / avgBurn;
    if (monthsLeft < 1.5) insights.push({ text: "Fund runs low soon — about " + monthsLeft.toFixed(1) + " months left at current spending. Consider collecting contributions.", tone: "warning" });
    else insights.push({ text: "Fund is healthy — roughly " + Math.floor(monthsLeft) + " months of runway at current spending.", tone: "success" });
  }

  // pending approvals
  const pendingCount = db.all("SELECT COUNT(*) as c FROM reimbursements WHERE house_id = ? AND status IN ('submitted','under_review')", [houseId])[0].c;
  if (pendingCount > 0) insights.push({ text: pendingCount + " reimbursement" + (pendingCount > 1 ? "s" : "") + " waiting for treasurer review.", tone: "accent" });

  // who hasn't contributed this month
  if (config.monthly_amount > 0) {
    const mt = currentMonthTag();
    const paid = new Set(getContributions(houseId, mt).map((c) => c.member_id));
    const unpaid = members.filter((m) => !paid.has(m.id));
    if (unpaid.length > 0) insights.push({ text: unpaid.map((m) => m.name).join(", ") + " haven't contributed this month.", tone: "warning" });
  }

  return { avgBurn, insights };
}
