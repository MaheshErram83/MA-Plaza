// ============================================================
//  STORAGE MODULE — Neon Postgres version.
//  The ONLY file that touches the database.
//  Replace DATABASE_URL with your Neon connection string.
// ============================================================

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}
async function run(sql, params = []) {
  await pool.query(sql, params);
}

// ---- INIT TABLES ----
export async function initDB() {
  await run(`
    CREATE TABLE IF NOT EXISTS houses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, name TEXT NOT NULL,
      vpa TEXT, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, description TEXT NOT NULL,
      amount REAL NOT NULL, paid_by TEXT NOT NULL, split_among TEXT NOT NULL,
      settled TEXT NOT NULL DEFAULT '{}', category TEXT DEFAULT 'Other',
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feed (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, icon TEXT, text TEXT NOT NULL,
      tone TEXT, created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS house_config (
      house_id TEXT PRIMARY KEY, treasurer_id TEXT, monthly_amount REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, member_id TEXT NOT NULL,
      amount REAL NOT NULL, month_tag TEXT NOT NULL, proof TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fund_expenses (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, description TEXT NOT NULL,
      amount REAL NOT NULL, category TEXT DEFAULT 'Other', paid_by TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reimbursements (
      id TEXT PRIMARY KEY, house_id TEXT NOT NULL, member_id TEXT NOT NULL,
      amount REAL NOT NULL, category TEXT DEFAULT 'Other', description TEXT,
      notes TEXT, receipt TEXT, status TEXT NOT NULL DEFAULT 'submitted',
      treasurer_note TEXT, payment_proof TEXT,
      created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
    );
  `);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function currentMonthTag() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// ---- House ----
export async function createHouse(name, members) {
  const houseId = uid();
  const now = Date.now();
  await run("INSERT INTO houses (id, name, created_at) VALUES ($1, $2, $3)", [houseId, name, now]);
  for (const m of members) {
    await run("INSERT INTO members (id, house_id, name, vpa, created_at) VALUES ($1, $2, $3, $4, $5)",
      [uid(), houseId, m.name, m.vpa || m.name.toLowerCase().replace(/\s/g, "") + "@upi", now]);
  }
  await addFeed(houseId, "home", name + " created with " + members.length + " members", "accent");
  return houseId;
}
export async function getFirstHouse() { return one("SELECT * FROM houses ORDER BY created_at LIMIT 1"); }
export async function getMembers(houseId) { return q("SELECT * FROM members WHERE house_id = $1 ORDER BY created_at", [houseId]); }

export async function addMember(houseId, name, vpa) {
  const id = uid();
  await run("INSERT INTO members (id, house_id, name, vpa, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, houseId, name, vpa || name.toLowerCase().replace(/\s/g, "") + "@upi", Date.now()]);
  await addFeed(houseId, "member", name + " joined the house", "accent");
  return id;
}
export async function updateMember(houseId, id, { name, vpa }) {
  const m = await one("SELECT * FROM members WHERE id = $1 AND house_id = $2", [id, houseId]);
  if (!m) return;
  await run("UPDATE members SET name = $1, vpa = $2 WHERE id = $3", [name || m.name, vpa || m.vpa, id]);
}
export async function removeMember(houseId, id) {
  const members = await getMembers(houseId);
  if (members.length <= 2) return { ok: false, reason: "A house needs at least 2 members." };
  const m = await one("SELECT name FROM members WHERE id = $1", [id]);
  await run("DELETE FROM members WHERE id = $1 AND house_id = $2", [id, houseId]);
  await addFeed(houseId, "member", (m ? m.name : "A member") + " left the house", "warning");
  return { ok: true };
}

// ---- Feed ----
export async function addFeed(houseId, icon, text, tone) {
  await run("INSERT INTO feed (id, house_id, icon, text, tone, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [uid(), houseId, icon, text, tone, Date.now()]);
}
export async function getFeed(houseId, limit = 100) {
  return q("SELECT * FROM feed WHERE house_id = $1 ORDER BY created_at DESC LIMIT $2", [houseId, limit]);
}

async function nameOf(houseId, id) {
  const m = await one("SELECT name FROM members WHERE id = $1", [id]);
  return m ? m.name : "?";
}

// ---- Config ----
export async function setConfig(houseId, treasurerId, monthlyAmount) {
  const existing = await one("SELECT house_id FROM house_config WHERE house_id = $1", [houseId]);
  if (existing) {
    await run("UPDATE house_config SET treasurer_id = $1, monthly_amount = $2 WHERE house_id = $3",
      [treasurerId, monthlyAmount, houseId]);
  } else {
    await run("INSERT INTO house_config (house_id, treasurer_id, monthly_amount) VALUES ($1, $2, $3)",
      [houseId, treasurerId, monthlyAmount]);
  }
  const tn = await nameOf(houseId, treasurerId);
  await addFeed(houseId, "config", "Treasurer set to " + tn + ", monthly ₹" + Math.round(monthlyAmount).toLocaleString("en-IN"), "accent");
}
export async function getConfig(houseId) {
  return (await one("SELECT * FROM house_config WHERE house_id = $1", [houseId])) || { treasurer_id: null, monthly_amount: 0 };
}

// ---- Contributions ----
export async function addContribution(houseId, memberId, amount, proof) {
  const mt = currentMonthTag();
  await run("INSERT INTO contributions (id, house_id, member_id, amount, month_tag, proof, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [uid(), houseId, memberId, amount, mt, proof || null, Date.now()]);
  const n = await nameOf(houseId, memberId);
  await addFeed(houseId, "contribution", n + " contributed ₹" + Math.round(amount).toLocaleString("en-IN") + " (proof attached)", "success");
}
export async function getContributions(houseId, monthTag) {
  if (monthTag) return q("SELECT * FROM contributions WHERE house_id = $1 AND month_tag = $2 ORDER BY created_at DESC", [houseId, monthTag]);
  return q("SELECT * FROM contributions WHERE house_id = $1 ORDER BY created_at DESC", [houseId]);
}

// ---- Fund expenses ----
export async function addFundExpense(houseId, { description, amount, category, paidBy }) {
  await run("INSERT INTO fund_expenses (id, house_id, description, amount, category, paid_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [uid(), houseId, description, amount, category || "Other", paidBy || null, Date.now()]);
  await addFeed(houseId, "expense", description + " — ₹" + Math.round(amount).toLocaleString("en-IN") + " from fund", "accent");
}
export async function getFundExpenses(houseId) {
  return q("SELECT * FROM fund_expenses WHERE house_id = $1 ORDER BY created_at DESC", [houseId]);
}

// ---- Fund state ----
export async function fundState(houseId) {
  const contribs = await one("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE house_id = $1", [houseId]);
  const expenses = await one("SELECT COALESCE(SUM(amount),0) as t FROM fund_expenses WHERE house_id = $1", [houseId]);
  const paidReimb = await one("SELECT COALESCE(SUM(amount),0) as t FROM reimbursements WHERE house_id = $1 AND status IN ('paid','completed')", [houseId]);
  const totalIn = Number(contribs.t);
  const totalOut = Number(expenses.t) + Number(paidReimb.t);
  const available = totalIn - totalOut;
  const mt = currentMonthTag();
  const monthIn = await one("SELECT COALESCE(SUM(amount),0) as t FROM contributions WHERE house_id = $1 AND month_tag = $2", [houseId, mt]);
  const pending = await one("SELECT COALESCE(SUM(amount),0) as t FROM reimbursements WHERE house_id = $1 AND status IN ('submitted','under_review','approved')", [houseId]);
  const totalSpent = Number(expenses.t) + Number(paidReimb.t);
  return {
    available, totalIn, totalOut,
    monthIn: Number(monthIn.t),
    monthSpend: totalSpent,
    pendingReimb: Number(pending.t),
  };
}

// ---- Reimbursements ----
const REIMB_FLOW = {
  submitted: ["under_review", "rejected"],
  under_review: ["approved", "rejected", "submitted"],
  approved: ["paid"],
  paid: ["completed"],
};

export async function createReimbursement(houseId, { memberId, amount, category, description, notes, receipt }) {
  const id = uid();
  const now = Date.now();
  await run("INSERT INTO reimbursements (id, house_id, member_id, amount, category, description, notes, receipt, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9,$10)",
    [id, houseId, memberId, amount, category || "Other", description || "", notes || "", receipt || "", now, now]);
  const n = await nameOf(houseId, memberId);
  await addFeed(houseId, "reimbursement", n + " requested ₹" + Math.round(amount).toLocaleString("en-IN") + " reimbursement", "accent");
  return id;
}
export async function getReimbursements(houseId, status) {
  if (status) return q("SELECT * FROM reimbursements WHERE house_id = $1 AND status = $2 ORDER BY created_at DESC", [houseId, status]);
  return q("SELECT * FROM reimbursements WHERE house_id = $1 ORDER BY created_at DESC", [houseId]);
}
export async function advanceReimbursement(houseId, id, toStatus, treasurerNote, paymentProof) {
  const r = await one("SELECT * FROM reimbursements WHERE id = $1 AND house_id = $2", [id, houseId]);
  if (!r) return { ok: false, reason: "Not found." };
  const allowed = REIMB_FLOW[r.status] || [];
  if (!allowed.includes(toStatus)) return { ok: false, reason: "Cannot move from " + r.status + " to " + toStatus + "." };
  if (toStatus === "paid") {
    const fund = await fundState(houseId);
    if (r.amount > fund.available) return { ok: false, reason: "Not enough in fund (₹" + Math.round(fund.available).toLocaleString("en-IN") + " available)." };
  }
  if (toStatus === "paid" && paymentProof) {
    await run("UPDATE reimbursements SET status = $1, treasurer_note = $2, payment_proof = $3, updated_at = $4 WHERE id = $5",
      [toStatus, treasurerNote || r.treasurer_note || "", paymentProof, Date.now(), id]);
  } else {
    await run("UPDATE reimbursements SET status = $1, treasurer_note = $2, updated_at = $3 WHERE id = $4",
      [toStatus, treasurerNote || r.treasurer_note || "", Date.now(), id]);
  }
  const n = await nameOf(houseId, r.member_id);
  const labels = { under_review: "is reviewing", approved: "approved", rejected: "rejected", paid: "paid", completed: "completed", submitted: "sent back for info on" };
  const tone = toStatus === "rejected" ? "warning" : ["paid","completed","approved"].includes(toStatus) ? "success" : "accent";
  await addFeed(houseId, "reimbursement", "Treasurer " + (labels[toStatus] || "updated") + " " + n + "'s ₹" + Math.round(r.amount).toLocaleString("en-IN") + " request", tone);
  return { ok: true };
}

// ---- Fund insights ----
export async function fundInsights(houseId) {
  const fund = await fundState(houseId);
  const expenses = await getFundExpenses(houseId);
  const config = await getConfig(houseId);
  const members = await getMembers(houseId);
  const insights = [];
  const byMonth = {};
  expenses.forEach((e) => {
    const d = new Date(Number(e.created_at));
    const k = d.getFullYear() + "-" + (d.getMonth() + 1);
    byMonth[k] = (byMonth[k] || 0) + Number(e.amount);
  });
  const months = Object.values(byMonth);
  const avgBurn = months.length ? months.reduce((a, b) => a + b, 0) / months.length : 0;
  if (avgBurn > 0 && fund.available > 0) {
    const monthsLeft = fund.available / avgBurn;
    if (monthsLeft < 1.5) insights.push({ text: "Fund runs low — about " + monthsLeft.toFixed(1) + " months left. Collect contributions.", tone: "warning" });
    else insights.push({ text: "Fund healthy — roughly " + Math.floor(monthsLeft) + " months of runway.", tone: "success" });
  }
  const pendingCount = await one("SELECT COUNT(*) as c FROM reimbursements WHERE house_id = $1 AND status IN ('submitted','under_review')", [houseId]);
  if (Number(pendingCount.c) > 0) insights.push({ text: pendingCount.c + " reimbursement(s) awaiting review.", tone: "accent" });
  if (config.monthly_amount > 0) {
    const mt = currentMonthTag();
    const paid = new Set((await getContributions(houseId, mt)).map((c) => c.member_id));
    const unpaid = members.filter((m) => !paid.has(m.id));
    if (unpaid.length > 0) insights.push({ text: unpaid.map((m) => m.name).join(", ") + " haven't contributed this month.", tone: "warning" });
  }
  return { avgBurn, insights };
}

// ============================================================
//  HOUSE CHAT — group messaging for all roommates
// ============================================================
export async function initChat() {
  await run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, house_id TEXT NOT NULL, member_id TEXT NOT NULL,
    text TEXT NOT NULL, image TEXT, msg_type TEXT DEFAULT 'text',
    created_at BIGINT NOT NULL
  )`);
}

export async function sendMessage(houseId, memberId, text, image, msgType) {
  const id = uid();
  await run("INSERT INTO messages (id, house_id, member_id, text, image, msg_type, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [id, houseId, memberId, text, image || null, msgType || "text", Date.now()]);
  return id;
}

export async function getMessages(houseId, limit = 50) {
  return q("SELECT * FROM messages WHERE house_id = $1 ORDER BY created_at DESC LIMIT $2", [houseId, limit]);
}
