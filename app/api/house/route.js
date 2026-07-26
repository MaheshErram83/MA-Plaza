import { NextResponse } from "next/server";
import * as store from "../../../lib/store";

export async function GET() {
  const house = store.getFirstHouse();
  if (!house) return NextResponse.json({ house: null });
  const id = house.id;
  // automation: materialize any recurring bills due this month
  store.runDueRecurring(id);
  return NextResponse.json({
    house,
    members: store.getMembers(id),
    expenses: store.getExpenses(id),
    feed: store.getFeed(id),
    stats: store.stats(id),
    balances: store.netBalances(id),
    simplified: store.simplifiedBalances(id),
    recurring: store.getRecurring(id),
    pending: store.getPendingConfirmations(id),
    reminders: store.reminders(id),
    brief: store.cfoBrief(id),
    treasury: store.treasury(id),
    goals: store.getGoals(id),
    config: store.getConfig(id),
    fund: store.fundState(id),
    contributions: store.getContributions(id),
    fundExpenses: store.getFundExpenses(id),
    reimbursements: store.getReimbursements(id),
    fundInsights: store.fundInsights(id),
  });
}

export async function POST(req) {
  const body = await req.json();
  const { action } = body;

  if (action === "createHouse") {
    store.createHouse(body.name, body.members);
    return NextResponse.json({ ok: true });
  }

  const house = store.getFirstHouse();
  if (!house) return NextResponse.json({ error: "no house" }, { status: 400 });
  const id = house.id;

  if (action === "addExpense") {
    store.addExpense(id, body.expense);
    store.addFeed(id, "expense",
      body.expense.description + " added — ₹" + Math.round(body.expense.amount).toLocaleString("en-IN") + " (" + body.payerName + " paid)",
      "accent");
    return NextResponse.json({ ok: true });
  }

  if (action === "addRecurring") {
    store.addRecurring(id, body.recurring);
    store.runDueRecurring(id);
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteRecurring") {
    store.deleteRecurring(id, body.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "claim") {
    store.claimPayment(id, body.fromId, body.toId, body.amt);
    return NextResponse.json({ ok: true });
  }

  if (action === "confirm") {
    store.confirmPayment(id, body.settlementId);
    return NextResponse.json({ ok: true });
  }

  if (action === "ask") {
    const answer = store.cfoAsk(id, body.question);
    return NextResponse.json({ answer });
  }

  if (action === "addMember") {
    store.addMember(id, body.name, body.vpa);
    return NextResponse.json({ ok: true });
  }

  if (action === "updateMember") {
    store.updateMember(id, body.memberId, { name: body.name, vpa: body.vpa });
    return NextResponse.json({ ok: true });
  }

  if (action === "removeMember") {
    const result = store.removeMember(id, body.memberId);
    return NextResponse.json(result);
  }

  if (action === "addGoal") {
    store.addGoal(id, body.title, body.target);
    return NextResponse.json({ ok: true });
  }

  if (action === "contributeGoal") {
    store.contributeGoal(id, body.goalId, body.memberId, body.amount);
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteGoal") {
    store.deleteGoal(id, body.goalId);
    return NextResponse.json({ ok: true });
  }

  if (action === "profile") {
    const profile = store.memberProfile(id, body.memberId);
    return NextResponse.json({ profile });
  }

  if (action === "setConfig") {
    store.setConfig(id, body.treasurerId, body.monthlyAmount);
    return NextResponse.json({ ok: true });
  }

  if (action === "addContribution") {
    store.addContribution(id, body.memberId, body.amount);
    return NextResponse.json({ ok: true });
  }

  if (action === "addFundExpense") {
    store.addFundExpense(id, body.expense);
    return NextResponse.json({ ok: true });
  }

  if (action === "createReimbursement") {
    store.createReimbursement(id, body.reimbursement);
    return NextResponse.json({ ok: true });
  }

  if (action === "advanceReimbursement") {
    const result = store.advanceReimbursement(id, body.reimbId, body.toStatus, body.note);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
