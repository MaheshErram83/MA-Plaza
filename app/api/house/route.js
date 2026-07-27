import { NextResponse } from "next/server";
import * as store from "../../../lib/store";

let dbReady = false;
async function ensureDB() {
  if (!dbReady) { await store.initDB(); dbReady = true; }
}

export async function GET() {
  await ensureDB();
  const house = await store.getFirstHouse();
  if (!house) return NextResponse.json({ house: null });
  const id = house.id;
  const [members, feed, config, fund, contributions, fundExpenses, reimbursements, fundInsights] = await Promise.all([
    store.getMembers(id),
    store.getFeed(id),
    store.getConfig(id),
    store.fundState(id),
    store.getContributions(id),
    store.getFundExpenses(id),
    store.getReimbursements(id),
    store.fundInsights(id),
  ]);
  return NextResponse.json({ house, members, feed, config, fund, contributions, fundExpenses, reimbursements, fundInsights });
}

export async function POST(req) {
  await ensureDB();
  const body = await req.json();
  const { action } = body;

  if (action === "createHouse") {
    await store.createHouse(body.name, body.members);
    return NextResponse.json({ ok: true });
  }

  const house = await store.getFirstHouse();
  if (!house) return NextResponse.json({ error: "no house" }, { status: 400 });
  const id = house.id;

  if (action === "setConfig") { await store.setConfig(id, body.treasurerId, body.monthlyAmount); return NextResponse.json({ ok: true }); }
  if (action === "addMember") { await store.addMember(id, body.name, body.vpa); return NextResponse.json({ ok: true }); }
  if (action === "updateMember") { await store.updateMember(id, body.memberId, { name: body.name, vpa: body.vpa }); return NextResponse.json({ ok: true }); }
  if (action === "removeMember") { return NextResponse.json(await store.removeMember(id, body.memberId)); }
  if (action === "addContribution") { await store.addContribution(id, body.memberId, body.amount, body.proof); return NextResponse.json({ ok: true }); }
  if (action === "addFundExpense") { await store.addFundExpense(id, body.expense); return NextResponse.json({ ok: true }); }
  if (action === "createReimbursement") { await store.createReimbursement(id, body.reimbursement); return NextResponse.json({ ok: true }); }
  if (action === "advanceReimbursement") { return NextResponse.json(await store.advanceReimbursement(id, body.reimbId, body.toStatus, body.note, body.proof)); }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
