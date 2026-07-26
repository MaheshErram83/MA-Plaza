"use client";
import { useState, useEffect } from "react";
import QRCode from "qrcode";

const inr = (n) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
const initials = (n) => (n || "?").trim().slice(0, 2).toUpperCase();
const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const CATEGORIES = ["Rent", "Utilities", "Groceries", "Internet", "Repairs", "Food", "Other"];

const STATUS_META = {
  submitted: { label: "Submitted", color: "var(--blue)", bg: "var(--blue-bg)" },
  under_review: { label: "Under review", color: "var(--amber)", bg: "var(--amber-bg)" },
  approved: { label: "Approved", color: "var(--green)", bg: "var(--green-bg)" },
  paid: { label: "Paid", color: "var(--green)", bg: "var(--green-bg)" },
  completed: { label: "Completed", color: "var(--muted)", bg: "var(--card-2)" },
  rejected: { label: "Rejected", color: "var(--red)", bg: "var(--red-bg)" },
};

async function api(action, payload = {}) {
  const res = await fetch("/api/house", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

function buildUpiUri(vpa, name, amount, note) {
  return `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${Math.round(amount)}&cu=INR&tn=${encodeURIComponent(note || "")}`;
}

async function makeQR(vpa, name, amount, note) {
  const uri = buildUpiUri(vpa, name, amount, note);
  return QRCode.toDataURL(uri, { width: 200, margin: 1 });
}

// UPI apps register their own URL schemes. These open a specific app
// with the payment pre-filled; the generic upi:// link lets the phone
// show an app chooser.
function appLinks(vpa, name, amount, note) {
  const params = `pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${Math.round(amount)}&cu=INR&tn=${encodeURIComponent(note || "")}`;
  // Android Intent URLs — Chrome's official method to launch apps.
  // Falls back to Play Store if app not installed.
  return {
    any: `intent://pay?${params}#Intent;scheme=upi;end`,
    gpay: `intent://pay?${params}#Intent;scheme=upi;package=com.google.android.apps.navi;end`,
    phonepe: `intent://pay?${params}#Intent;scheme=upi;package=com.phonepe.app;end`,
    paytm: `intent://pay?${params}#Intent;scheme=upi;package=net.one97.paytm;end`,
  };
}

function UpiPayButtons({ vpa, name, amount, note }) {
  const links = appLinks(vpa, name, amount, note);
  const apps = [
    ["any", "Any UPI app", "#8b7cf6"],
    ["gpay", "Google Pay", "#2DA94F"],
    ["phonepe", "PhonePe", "#5F259F"],
    ["paytm", "Paytm", "#00BAF2"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
      {apps.map(([key, label, color]) => (
        <a key={key} href={links[key]} className="upi-app-btn" style={{ borderColor: color, color }}>
          {label}
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const res = await fetch("/api/house");
    const d = await res.json();
    setData(d);
    setLoading(false);
    return d;
  }
  useEffect(() => { refresh(); }, []);

  if (loading) return <div className="wrap"><p style={{ padding: 40, color: "var(--muted)" }}>Loading…</p></div>;
  if (!data.house) return <Setup onDone={refresh} />;

  const name = (id) => data.members.find((m) => m.id === id)?.name || "?";
  const vpa = (id) => data.members.find((m) => m.id === id)?.vpa || "";
  const treasurerId = data.config?.treasurer_id;

  return (
    <div className="wrap">
      {tab === "dashboard" && <Dashboard data={data} name={name} setTab={setTab} />}
      {tab === "contribute" && <Contribute data={data} name={name} vpa={vpa} treasurerId={treasurerId} onDone={refresh} />}
      {tab === "request" && <RequestReimb data={data} onDone={() => { refresh(); setTab("dashboard"); }} />}
      {tab === "review" && <Review data={data} name={name} vpa={vpa} onDone={refresh} />}
      {tab === "members" && <Members data={data} onDone={refresh} />}
      <TreasBar tab={tab} setTab={setTab} pending={pendingCount(data)} />
    </div>
  );
}

function pendingCount(data) {
  return (data.reimbursements || []).filter((r) => r.status === "submitted" || r.status === "under_review").length;
}

function Header({ icon, title, sub }) {
  return (
    <header>
      <div className="logo">{icon}</div>
      <div><h1>{title}</h1><div className="sub">{sub}</div></div>
    </header>
  );
}
function Avatar({ name }) { return <div className="avatar">{initials(name)}</div>; }

function Setup({ onDone }) {
  const [house, setHouse] = useState("Our House");
  const [input, setInput] = useState("");
  const [vpaInput, setVpaInput] = useState("");
  const [members, setMembers] = useState([]);
  const [amount, setAmount] = useState("3000");

  function add() {
    const n = input.trim();
    if (!n) return;
    setMembers([...members, { name: n, vpa: vpaInput.trim() || n.toLowerCase().replace(/\s/g, "") + "@upi" }]);
    setInput(""); setVpaInput("");
  }
  async function create() {
    if (members.length < 2) return alert("Add at least 2 members");
    const res = await fetch("/api/house", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createHouse", name: house.trim() || "Our House", members }),
    });
    await res.json();
    const snap = await (await fetch("/api/house")).json();
    const maharshi = snap.members.find((m) => m.name.toLowerCase() === "maharshi") || snap.members[0];
    await api("setConfig", { treasurerId: maharshi.id, monthlyAmount: Number(amount) || 0 });
    onDone();
  }

  return (
    <div className="wrap">
      <div className="setup">
        <div className="big">🏦</div>
        <h1 style={{ fontSize: 22 }}>House Treasurer</h1>
        <p style={{ color: "var(--muted)", marginBottom: 20 }}>One fund, one treasurer, clear books.</p>
        <div className="card" style={{ textAlign: "left", maxWidth: 400, margin: "0 auto" }}>
          <label>House name</label>
          <input value={house} onChange={(e) => setHouse(e.target.value)} style={{ marginBottom: 14 }} />
          <label>Add members (with their UPI ID)</label>
          <input value={input} placeholder="Name (e.g. Maharshi)" onChange={(e) => setInput(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="row">
            <input value={vpaInput} placeholder="their-upi@bank" onChange={(e) => setVpaInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ flex: 2 }} />
            <button className="small" onClick={add} style={{ flex: "0 0 auto" }}>Add</button>
          </div>
          <div style={{ margin: "10px 0 14px" }}>
            {members.length ? members.map((m, i) => (
              <span key={i} className="chip">{m.name}{m.name.toLowerCase() === "maharshi" ? " 👑" : ""}<span className="rm" onClick={() => setMembers(members.filter((_, x) => x !== i))}>×</span></span>
            )) : <span style={{ fontSize: 13, color: "var(--muted)" }}>No members yet. Maharshi will be the treasurer.</span>}
          </div>
          <label>Monthly contribution per person (₹)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 14 }} />
          <button className="primary wide" onClick={create}>Create house fund</button>
          <p className="hint">Tip: include a member named "Maharshi" — he's set as the treasurer automatically.</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ data, name, setTab }) {
  const fund = data.fund || {};
  const config = data.config || {};
  const insights = data.fundInsights?.insights || [];
  const reimb = data.reimbursements || [];
  const activeReimb = reimb.filter((r) => !["completed", "rejected"].includes(r.status));

  return (
    <>
      <Header icon="🏦" title={data.house.name} sub={"Treasurer: " + (config.treasurer_id ? name(config.treasurer_id) : "—")} />

      <div className="hero">
        <div className="label">House fund available</div>
        <div className="big">{inr(fund.available)}</div>
        <div className="meta">
          <div className="m"><div className="v" style={{ color: "var(--green)" }}>{inr(fund.monthIn)}</div><div className="k">in this month</div></div>
          <div className="m"><div className="v" style={{ color: "var(--amber)" }}>{inr(fund.pendingReimb)}</div><div className="k">pending out</div></div>
          <div className="m"><div className="v">{inr(fund.monthSpend)}</div><div className="k">spent</div></div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="card">
          <div className="card-head"><h2>🤖 AI insights</h2><span className="tag">treasurer</span></div>
          {insights.map((ins, i) => (
            <div className="bal-row" key={i}>
              <div className="bal-left">
                <span style={{ fontSize: 18 }}>{ins.tone === "warning" ? "⚠️" : ins.tone === "success" ? "✅" : "💡"}</span>
                <div className="bal-text">{ins.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat" onClick={() => setTab("contribute")} style={{ cursor: "pointer" }}><div className="label">Money in</div><div className="value" style={{ fontSize: 15 }}>💰 Add</div></div>
        <div className="stat" onClick={() => setTab("request")} style={{ cursor: "pointer" }}><div className="label">Claim back</div><div className="value" style={{ fontSize: 15 }}>🧾 Request</div></div>
        <div className="stat" onClick={() => setTab("review")} style={{ cursor: "pointer" }}><div className="label">Treasurer</div><div className="value" style={{ fontSize: 15 }}>✓ Review</div></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Active reimbursements</h2>
          <button className="small" onClick={() => setTab("review")}>See all</button>
        </div>
        {activeReimb.length ? activeReimb.slice(0, 4).map((r) => {
          const meta = STATUS_META[r.status];
          return (
            <div className="bal-row" key={r.id}>
              <div className="bal-left"><Avatar name={name(r.member_id)} />
                <div className="bal-text"><b>{name(r.member_id)}</b><div className="sub">{r.description || r.category}</div></div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="bal-amt">{inr(r.amount)}</span>
                <span className="pill" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
              </div>
            </div>
          );
        }) : <div className="empty">No active requests.</div>}
      </div>

      <div className="card"><h2>Recent activity</h2><Feed feed={data.feed} limit={6} /></div>
    </>
  );
}

function Contribute({ data, name, vpa, treasurerId, onDone }) {
  const [member, setMember] = useState(data.members[0].id);
  const [amount, setAmount] = useState(data.config?.monthly_amount || "");
  const [qr, setQr] = useState(null);
  const contribs = data.contributions || [];

  const thisMonth = {};
  contribs.forEach((c) => { thisMonth[c.member_id] = (thisMonth[c.member_id] || 0) + c.amount; });

  async function showPay() {
    if (!Number(amount)) return alert("Enter an amount");
    const img = await makeQR(vpa(treasurerId), name(treasurerId), Number(amount), data.house.name + " fund");
    setQr(img);
  }
  async function confirmPaid() {
    await api("addContribution", { memberId: member, amount: Number(amount) });
    setQr(null);
    onDone();
  }

  return (
    <>
      <Header icon="💰" title="Contribute" sub={"Pay " + name(treasurerId) + " (treasurer)"} />
      <div className="card">
        <h2>Add to the fund</h2>
        <label>Who's contributing?</label>
        <select value={member} onChange={(e) => setMember(e.target.value)} style={{ marginBottom: 12 }}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label>Amount (₹)</label>
        <input type="number" value={amount} placeholder="3000" onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 14 }} />
        {!qr ? (
          <button className="primary wide" onClick={showPay}>Pay {name(treasurerId)} by UPI</button>
        ) : (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 14, marginBottom: 4 }}>Pay <b>{name(treasurerId)}</b> {inr(amount)}</p>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>UPI: {vpa(treasurerId)}</p>

            {(() => {
              const links = appLinks(vpa(treasurerId), name(treasurerId), Number(amount), data.house.name + " fund");
              const apps = [
                ["any", "🔗 Any UPI", "#8b7cf6"],
                ["gpay", "💚 GPay", "#2DA94F"],
                ["phonepe", "💜 PhonePe", "#5F259F"],
                ["paytm", "💙 Paytm", "#00BAF2"],
              ];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {apps.map(([key, label, color]) => (
                    <a key={key} href={links[key]} className="upi-app-btn" style={{ borderColor: color, color, fontSize: 13, textDecoration: "none" }}>
                      {label}
                    </a>
                  ))}
                </div>
              );
            })()}

            <button className="wide small" onClick={() => { navigator.clipboard.writeText(vpa(treasurerId)); alert("Copied: " + vpa(treasurerId)); }} style={{ marginBottom: 12 }}>
              📋 Copy UPI ID & pay manually
            </button>

            <details style={{ textAlign: "center", marginBottom: 14 }}>
              <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>Or scan QR code</summary>
              <div style={{ marginTop: 10 }}>
                <img src={qr} alt="UPI QR" style={{ borderRadius: 12, background: "#fff", padding: 8 }} />
              </div>
            </details>

            <button className="primary wide" onClick={confirmPaid} style={{ fontSize: 16, height: 48 }}>✅ Payment done — add to fund</button>
          </div>
        )}
        <p className="hint">You pay the treasurer directly by UPI. Confirming records it in the fund.</p>
      </div>

      <div className="card">
        <h2>This month's contributions</h2>
        {data.members.map((m) => (
          <div className="bal-row" key={m.id}>
            <div className="bal-left"><Avatar name={m.name} /><div className="bal-text">{m.name}{m.id === treasurerId ? " 👑" : ""}</div></div>
            <span className="bal-amt" style={{ color: thisMonth[m.id] ? "var(--green)" : "var(--muted)" }}>{inr(thisMonth[m.id] || 0)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RequestReimb({ data, onDone }) {
  const [member, setMember] = useState(data.members[0].id);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState("");

  function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setReceipt(reader.result);
    reader.readAsDataURL(f);
  }
  async function submit() {
    if (!Number(amount)) return alert("Enter an amount");
    const memberVpa = data.members.find((m) => m.id === member)?.vpa || "";
    if (!memberVpa || memberVpa.endsWith("@upi")) {
      return alert("Set your real UPI ID first in the Members tab — Maharshi needs it to pay you back.");
    }
    await api("createReimbursement", { reimbursement: { memberId: member, amount: Number(amount), category, description: description.trim(), notes: notes.trim(), receipt } });
    onDone();
  }

  return (
    <>
      <Header icon="🧾" title="Request reimbursement" sub="You paid — claim it back from the fund" />
      <div className="card">
        <label>Who paid?</label>
        <select value={member} onChange={(e) => setMember(e.target.value)} style={{ marginBottom: 4 }}>
          {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {(() => {
          const mv = data.members.find((m) => m.id === member)?.vpa || "";
          const isReal = mv && !mv.endsWith("@upi");
          return <p style={{ fontSize: 12, color: isReal ? "var(--green)" : "var(--red)", marginBottom: 12 }}>
            {isReal ? "UPI: " + mv + " ✓" : "⚠ No real UPI ID set — go to Members tab first"}
          </p>;
        })()}
        <div className="row">
          <div style={{ flex: 1 }}><label>Amount (₹)</label><input type="number" value={amount} placeholder="800" onChange={(e) => setAmount(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label>Category</label><select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <label>Description</label>
        <input value={description} placeholder="Bought groceries at DMart" onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 12 }} />
        <label>Notes (optional)</label>
        <input value={notes} placeholder="Split with flatmates" onChange={(e) => setNotes(e.target.value)} style={{ marginBottom: 12 }} />
        <label>Receipt photo</label>
        <input type="file" accept="image/*" onChange={onFile} style={{ marginBottom: 12, padding: "10px 12px", height: "auto" }} />
        {receipt && <img src={receipt} alt="receipt" style={{ width: "100%", borderRadius: 10, marginBottom: 12, maxHeight: 200, objectFit: "cover" }} />}
        <button className="primary wide" onClick={submit}>Submit request</button>
        <p className="hint">The treasurer reviews, then pays you back by UPI once approved.</p>
      </div>
    </>
  );
}

function Review({ data, name, vpa, onDone }) {
  const reimb = data.reimbursements || [];
  const [note, setNote] = useState({});
  const [payQr, setPayQr] = useState(null);
  const [paySuccess, setPaySuccess] = useState(null);
  const [waitingReturn, setWaitingReturn] = useState(false);

  async function advance(r, toStatus) {
    const res = await api("advanceReimbursement", { reimbId: r.id, toStatus, note: note[r.id] || "" });
    if (!res.ok) return alert(res.reason || "Could not update.");
    onDone();
  }
  async function payNow(r) {
    const memberVpa = vpa(r.member_id);
    if (!memberVpa || memberVpa.endsWith("@upi")) {
      return alert(name(r.member_id) + " hasn't set a real UPI ID yet. Ask them to update it in Members.");
    }
    const img = await makeQR(memberVpa, name(r.member_id), r.amount, "Reimbursement");
    setPayQr({ id: r.id, img, name: name(r.member_id), amount: r.amount, vpa: memberVpa });
  }

  // When Maharshi taps a UPI app link, we set waitingReturn=true.
  // When he comes back (visibilitychange → visible), auto-mark as paid.
  useEffect(() => {
    if (!waitingReturn) return;
    function onReturn() {
      if (document.visibilityState === "visible" && waitingReturn && payQr) {
        // small delay so the app feels like it's "confirming"
        setTimeout(async () => {
          const res = await api("advanceReimbursement", { reimbId: payQr.id, toStatus: "paid", note: "" });
          if (res.ok) {
            setPaySuccess({ name: payQr.name, amount: payQr.amount });
            setPayQr(null);
            setWaitingReturn(false);
            // auto-dismiss success after 3s and refresh
            setTimeout(() => { setPaySuccess(null); onDone(); }, 3000);
          } else {
            alert(res.reason || "Could not mark as paid.");
            setWaitingReturn(false);
          }
        }, 800);
      }
    }
    document.addEventListener("visibilitychange", onReturn);
    return () => document.removeEventListener("visibilitychange", onReturn);
  }, [waitingReturn, payQr]);

  function openUpiApp(link) {
    setWaitingReturn(true);
    window.location.href = link;
  }

  async function manualConfirm() {
    const res = await api("advanceReimbursement", { reimbId: payQr.id, toStatus: "paid", note: "" });
    if (!res.ok) { alert(res.reason || "Could not update."); return; }
    setPaySuccess({ name: payQr.name, amount: payQr.amount });
    setPayQr(null);
    setTimeout(() => { setPaySuccess(null); onDone(); }, 3000);
  }

  const active = reimb.filter((r) => !["completed", "rejected"].includes(r.status));
  const done = reimb.filter((r) => ["completed", "rejected"].includes(r.status));

  // ---- SUCCESS SCREEN ----
  if (paySuccess) {
    return (
      <div className="wrap" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="card" style={{ textAlign: "center", padding: 32 }}>
          <div className="pay-success-icon" style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Payment Successful</div>
          <div style={{ fontSize: 16, color: "var(--muted)", marginBottom: 8 }}>
            {inr(paySuccess.amount)} paid to <b>{paySuccess.name}</b>
          </div>
          <div style={{ fontSize: 13, color: "var(--green)" }}>Deducted from house fund</div>
        </div>
      </div>
    );
  }

  // ---- PAY SCREEN (QR + app tabs + copy fallback) ----
  if (payQr) {
    const links = appLinks(payQr.vpa, payQr.name, payQr.amount, "Reimbursement");
    const apps = [
      ["any", "🔗 Any UPI", "#8b7cf6"],
      ["gpay", "💚 GPay", "#2DA94F"],
      ["phonepe", "💜 PhonePe", "#5F259F"],
      ["paytm", "💙 Paytm", "#00BAF2"],
    ];

    async function confirmPaid() {
      const res = await api("advanceReimbursement", { reimbId: payQr.id, toStatus: "paid", note: "" });
      if (res.ok) {
        setPaySuccess({ name: payQr.name, amount: payQr.amount });
        setPayQr(null);
        setWaitingReturn(false);
        setTimeout(() => { setPaySuccess(null); onDone(); }, 3000);
      } else {
        alert(res.reason || "Could not mark as paid.");
      }
    }

    function copyUPI() {
      navigator.clipboard.writeText(payQr.vpa).then(() => alert("UPI ID copied: " + payQr.vpa)).catch(() => {
        // fallback for older browsers
        const t = document.createElement("textarea");
        t.value = payQr.vpa;
        document.body.appendChild(t);
        t.select();
        document.execCommand("copy");
        document.body.removeChild(t);
        alert("UPI ID copied: " + payQr.vpa);
      });
    }

    return (
      <>
        <Header icon="💸" title="Pay reimbursement" sub={"Pay " + payQr.name} />
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Pay <b>{payQr.name}</b></p>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 4 }}>{inr(payQr.amount)}</div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>UPI: {payQr.vpa}</p>

          <h2 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Step 1: Pay using any method</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            {apps.map(([key, label, color]) => (
              <a key={key} href={links[key]} className="upi-app-btn" style={{ borderColor: color, color, fontSize: 13, textDecoration: "none" }}>
                {label}
              </a>
            ))}
          </div>

          <button className="wide small" onClick={copyUPI} style={{ marginBottom: 12 }}>
            📋 Copy UPI ID & pay manually
          </button>

          <details style={{ textAlign: "center", marginBottom: 14 }}>
            <summary style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>Or scan QR code</summary>
            <div style={{ marginTop: 10 }}>
              <img src={payQr.img} alt="UPI QR" style={{ borderRadius: 12, background: "#fff", padding: 8 }} />
            </div>
          </details>

          <h2 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Step 2: After paying, confirm here</h2>

          <button className="primary wide" onClick={confirmPaid} style={{ fontSize: 16, height: 48 }}>
            ✅ Payment done — deduct from fund
          </button>
          <button className="wide small" onClick={() => { setPayQr(null); setWaitingReturn(false); }} style={{ marginTop: 8, color: "var(--muted)" }}>Cancel</button>
        </div>
      </>
    );
  }

  // ---- REVIEW QUEUE ----
  function renderActions(r) {
    if (r.status === "submitted") return <><button className="small primary" onClick={() => advance(r, "under_review")}>Start review</button><button className="small" onClick={() => advance(r, "rejected")}>Reject</button></>;
    if (r.status === "under_review") return <><button className="small primary" onClick={() => advance(r, "approved")}>Approve</button><button className="small" onClick={() => advance(r, "submitted")}>Ask for info</button><button className="small" onClick={() => advance(r, "rejected")}>Reject</button></>;
    if (r.status === "approved") return <button className="small primary" onClick={() => payNow(r)}>Pay by UPI</button>;
    if (r.status === "paid") return <button className="small primary" onClick={() => advance(r, "completed")}>Mark complete</button>;
    return null;
  }

  return (
    <>
      <Header icon="✓" title="Review queue" sub="Approve, reject, and pay" />
      {active.length ? active.map((r) => {
        const meta = STATUS_META[r.status];
        return (
          <div className="card" key={r.id}>
            <div className="card-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={name(r.member_id)} />
                <div><b>{name(r.member_id)}</b><div className="sub">{fmtDate(r.created_at)} · {r.category}</div></div>
              </div>
              <span className="pill" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
            </div>
            <div className="mrow bold"><span>Amount</span><span>{inr(r.amount)}</span></div>
            {r.description && <div style={{ fontSize: 14, margin: "8px 0" }}>{r.description}</div>}
            {r.notes && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>Note: {r.notes}</div>}
            {r.receipt && <img src={r.receipt} alt="receipt" style={{ width: "100%", borderRadius: 10, margin: "8px 0", maxHeight: 220, objectFit: "cover" }} />}
            {(r.status === "under_review" || r.status === "submitted") && (
              <input value={note[r.id] || ""} placeholder="Note to requester (optional)" onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} style={{ marginBottom: 10 }} />
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{renderActions(r)}</div>
          </div>
        );
      }) : <div className="card"><div className="empty">No requests to review. All caught up.</div></div>}

      {done.length > 0 && (
        <div className="card">
          <h2>History</h2>
          {done.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <div className="bal-row" key={r.id}>
                <div className="bal-left"><Avatar name={name(r.member_id)} /><div className="bal-text"><b>{name(r.member_id)}</b><div className="sub">{r.description || r.category}</div></div></div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="bal-amt">{inr(r.amount)}</span>
                  <span className="pill" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function Members({ data, onDone }) {
  const config = data.config || {};
  const [newName, setNewName] = useState("");
  const [newVpa, setNewVpa] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editVpa, setEditVpa] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expAmt, setExpAmt] = useState("");
  const [expCat, setExpCat] = useState("Utilities");

  async function add() {
    if (!newName.trim()) return alert("Enter a name");
    await api("addMember", { name: newName.trim(), vpa: newVpa.trim() });
    setNewName(""); setNewVpa("");
    onDone();
  }
  function startEdit(m) { setEditing(m.id); setEditName(m.name); setEditVpa(m.vpa || ""); }
  async function saveEdit() {
    await api("updateMember", { memberId: editing, name: editName.trim(), vpa: editVpa.trim() });
    setEditing(null);
    onDone();
  }
  async function remove(m) {
    if (m.id === config.treasurer_id) return alert("Can't remove the treasurer.");
    if (!confirm("Remove " + m.name + "?")) return;
    const res = await api("removeMember", { memberId: m.id });
    if (!res.ok) alert(res.reason || "Could not remove.");
    onDone();
  }
  async function addFundExpense() {
    if (!Number(expAmt)) return alert("Enter an amount");
    await api("addFundExpense", { expense: { description: expDesc.trim() || "Expense", amount: Number(expAmt), category: expCat, paidBy: config.treasurer_id } });
    setExpDesc(""); setExpAmt("");
    onDone();
  }

  return (
    <>
      <Header icon="👥" title="Members" sub={`${data.members.length} in the house`} />

      <div className="card">
        <h2>Add a member</h2>
        <label>Name</label>
        <input value={newName} placeholder="New member" onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 12 }} />
        <label>UPI ID (to receive reimbursements)</label>
        <input value={newVpa} placeholder="name@upi" onChange={(e) => setNewVpa(e.target.value)} style={{ marginBottom: 14 }} />
        <button className="primary wide" onClick={add}>Add member</button>
      </div>

      <div className="card">
        <h2>Current members</h2>
        {data.members.map((m) => (
          <div key={m.id}>
            {editing === m.id ? (
              <div style={{ padding: "12px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <label>Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ marginBottom: 8 }} />
                <label>UPI ID</label>
                <input value={editVpa} placeholder="name@upi" onChange={(e) => setEditVpa(e.target.value)} style={{ marginBottom: 10 }} />
                <div className="row" style={{ marginBottom: 0 }}>
                  <button className="primary small" onClick={saveEdit}>Save</button>
                  <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="bal-row">
                <div className="bal-left">
                  <Avatar name={m.name} />
                  <div className="bal-text"><b>{m.name}{m.id === config.treasurer_id ? " 👑 treasurer" : ""}</b><div className="sub">{m.vpa}</div></div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="small" onClick={() => startEdit(m)}>Edit</button>
                  {m.id !== config.treasurer_id && <button className="small" onClick={() => remove(m)} style={{ color: "var(--red)" }}>Remove</button>}
                </div>
              </div>
            )}
          </div>
        ))}
        <p className="hint">The treasurer 👑 receives all contributions and pays reimbursements. Set each member's real UPI ID so QR codes work.</p>
      </div>

      <div className="card">
        <h2>Record a fund expense</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Money the treasurer spent directly from the fund (electricity, water). Deducts from the total.</p>
        <label>Description</label>
        <input value={expDesc} placeholder="Electricity bill" onChange={(e) => setExpDesc(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="row">
          <div style={{ flex: 1 }}><label>Amount (₹)</label><input type="number" value={expAmt} placeholder="2400" onChange={(e) => setExpAmt(e.target.value)} /></div>
          <div style={{ flex: 1 }}><label>Category</label><select value={expCat} onChange={(e) => setExpCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
        </div>
        <button className="primary wide" onClick={addFundExpense} style={{ marginTop: 4 }}>Record expense</button>
      </div>
    </>
  );
}

function Feed({ feed, limit }) {
  const items = limit ? (feed || []).slice(0, limit) : (feed || []);
  const icon = (t) => t === "contribution" ? "💰" : t === "reimbursement" ? "🧾" : t === "expense" ? "💸" : t === "config" ? "⚙️" : "🏦";
  const bg = (tone) => tone === "success" ? "var(--green-bg)" : tone === "warning" ? "var(--amber-bg)" : "var(--accent-bg)";
  if (!items.length) return <div className="empty">Nothing yet.</div>;
  return items.map((f) => (
    <div className="feed-row" key={f.id}>
      <div className="feed-icon" style={{ background: bg(f.tone) }}>{icon(f.icon)}</div>
      <div className="feed-body"><div className="t">{f.text}</div><div className="d">{fmtDate(f.created_at)}</div></div>
    </div>
  ));
}

function TreasBar({ tab, setTab, pending }) {
  const tabs = [
    ["dashboard", "🏦", "Fund"],
    ["contribute", "💰", "Add"],
    ["request", "🧾", "Claim"],
    ["review", "✓", "Review"],
    ["members", "👥", "Members"],
  ];
  return (
    <div className="tabbar">
      {tabs.map(([id, ic, label]) => (
        <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)} style={{ position: "relative" }}>
          <span className="ic">{ic}</span>{label}
          {id === "review" && pending > 0 && <span style={{ position: "absolute", top: 2, right: 8, background: "var(--amber)", color: "#fff", fontSize: 9, borderRadius: 8, padding: "0 5px", lineHeight: "14px" }}>{pending}</span>}
        </button>
      ))}
    </div>
  );
}
