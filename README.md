# HomeOS — expense splitter + House Treasurer

Two apps in one:

## 1. Expense splitter (main app, at / )
Split expenses, settle by UPI QR, debt simplification, recurring bills,
confirm-received handshake, AI CFO, members, goals, reports.

## 2. House Treasurer (at /treasurer )  ← NEW
A fund-centric app for houses that pool money with one treasurer:
- House fund dashboard — available balance, money in this month, pending out
- Contributions — record each member's monthly contribution to the fund
- Reimbursement workflow — Submitted → Under review → Approved → Paid →
  Completed (or Rejected). Submit with amount, category, description, notes,
  and a receipt photo. The treasurer reviews, approves/rejects/asks for info,
  then pays.
- Fund expenses — money the treasurer spends directly (electricity, water)
- AI insights — projected fund depletion (runway), pending approvals, who
  hasn't contributed this month
- Overdraw guard — can't pay a reimbursement larger than the fund holds

IMPORTANT: No money is held by the app. The treasurer is a real person with
their own bank account; members pay them by UPI. This app is the ledger and
the approval workflow — which keeps it clear of payment-licensing rules.

## Run it
Node 18+:

    npm install
    npm run dev

Main app: http://localhost:3000
Treasurer: http://localhost:3000/treasurer

Create a house on the main app first, then open /treasurer and set up the
fund (pick a treasurer + monthly amount) in Settings.

## lib/store.js
The only file touching the database. Holds both the splitter engine and the
treasurer engine (contributions, fund state, reimbursement workflow,
insights). To share across phones later, rewrite just this file for Neon.
