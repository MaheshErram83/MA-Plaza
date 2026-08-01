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
function upiPayLink(vpa, name, amount, note) {
  const params = `pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${Math.round(amount)}&cu=INR&tn=${encodeURIComponent(note || "")}`;
  return `upi://pay?${params}`;
}

export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Splash screen max 2 seconds
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Capture the install prompt
  useEffect(() => {
    function onPrompt(e) {
      e.preventDefault();
      setInstallPrompt(e);
      setShowInstall(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setShowInstall(false);
    setInstallPrompt(null);
  }

  async function refresh() {
    const res = await fetch("/api/house");
    const d = await res.json();
    setData(d);
    setLoading(false);
    return d;
  }
  useEffect(() => { refresh(); }, []);
  // Auto-refresh every 10 seconds for real-time updates
  useEffect(() => {
    const interval = setInterval(() => { refresh(); }, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !splashDone) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0d0d12" }}>
      <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg,#8b7cf6,#6d5ef0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, boxShadow: "0 8px 40px rgba(139,124,246,0.4)", marginBottom: 20, animation: "pulse 1.5s infinite" }}>🏦</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#f2f2f7", marginBottom: 6 }}>MA Plaza</div>
      <div style={{ fontSize: 13, color: "#8b8b98", marginBottom: 24 }}>One app for all things home</div>
      <div style={{ width: 40, height: 40, border: "3px solid rgba(139,124,246,0.2)", borderTopColor: "#8b7cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
  if (loading && splashDone) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0d0d12" }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#8b7cf6,#6d5ef0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: "0 6px 30px rgba(139,124,246,0.3)", marginBottom: 16 }}>🏦</div>
      <div style={{ fontSize: 14, color: "#8b8b98", marginBottom: 16 }}>Waking up the database...</div>
      <div style={{ width: 36, height: 36, border: "3px solid rgba(139,124,246,0.2)", borderTopColor: "#8b7cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 11, color: "#5a5a68", marginTop: 16 }}>Free tier database sleeps after inactivity</div>
    </div>
  );
  if (!data.house) return <Setup onDone={refresh} />;

  const name = (id) => data.members.find((m) => m.id === id)?.name || "?";
  const vpa = (id) => data.members.find((m) => m.id === id)?.vpa || "";
  const treasurerId = data.config?.treasurer_id;

  return (
    <div className="wrap">
      {tab === "dashboard" && <Dashboard data={data} name={name} setTab={setTab} />}
      {tab === "contribute" && <Contribute data={data} name={name} vpa={vpa} treasurerId={treasurerId} onDone={refresh} />}
      {tab === "requests" && <Requests data={data} name={name} vpa={vpa} onDone={refresh} />}
      {tab === "settings" && <Settings data={data} name={name} setTab={setTab} />}
      {tab === "chat" && <Chat data={data} name={name} onDone={refresh} />}
      {showInstall && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 999, padding: "12px 16px", background: "linear-gradient(135deg, var(--accent), var(--accent-2))", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/icon-192.png" alt="MA Plaza" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <div><div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Install MA Plaza</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Add to home screen</div></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={installApp} style={{ height: 34, padding: "0 16px", background: "#fff", color: "var(--accent-2)", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Install</button>
            <button onClick={() => setShowInstall(false)} style={{ height: 34, padding: "0 10px", background: "transparent", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>✕</button>
          </div>
        </div>
      )}
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: -8, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--green)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }} />
          Live
        </span>
      </div>

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

      <div className="card">
        <div className="card-head"><h2>Active reimbursements</h2>
          <button className="small" onClick={() => setTab("requests")}>See all</button>
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
  const [proof, setProof] = useState("");
  const contribs = data.contributions || [];

  const thisMonth = {};
  contribs.forEach((c) => { thisMonth[c.member_id] = (thisMonth[c.member_id] || 0) + c.amount; });

  function onProof(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setProof(reader.result);
    reader.readAsDataURL(f);
  }
  async function showPay() {
    if (!Number(amount)) return alert("Enter an amount");
    const img = await makeQR(vpa(treasurerId), name(treasurerId), Number(amount), data.house.name + " fund");
    setQr(img);
  }
  async function confirmPaid() {
    if (!proof) return alert("Upload a screenshot of your payment as proof");
    await api("addContribution", { memberId: member, amount: Number(amount), proof });
    setQr(null); setProof("");
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
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Pay <b>{name(treasurerId)}</b></p>
            <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{inr(amount)}</div>

            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Option 1: Scan QR code</p>
              <img src={qr} alt="QR code" style={{ borderRadius: 16, background: "#fff", padding: 12, boxShadow: "0 4px 24px rgba(139,124,246,0.3)", maxWidth: 200 }} />
            </div>

            <div style={{ background: "var(--card-2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Option 2: Pay using UPI ID</p>
              <div style={{ fontSize: 18, fontWeight: 600, color: "var(--accent)", marginBottom: 4, wordBreak: "break-all" }}>{vpa(treasurerId)}</div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Amount: {inr(amount)}</p>
              <button className="wide small" onClick={() => { navigator.clipboard.writeText(vpa(treasurerId)); alert("Copied: " + vpa(treasurerId) + "\n\nNow open PhonePe → Send money → Paste UPI ID → Enter " + inr(amount)); }} style={{ background: "var(--accent-bg)", color: "var(--accent)", borderColor: "rgba(139,124,246,0.3)" }}>
                📋 Copy UPI ID
              </button>
            </div>

            <div style={{ background: "var(--card-2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>📸 Upload payment screenshot</p>
              <input type="file" accept="image/*" onChange={onProof} style={{ marginBottom: 8, padding: "10px 12px", height: "auto", width: "100%" }} />
              {proof && <img src={proof} alt="proof" style={{ width: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />}
              {!proof && <p style={{ fontSize: 12, color: "var(--muted)" }}>Take a screenshot of PhonePe success screen and upload it</p>}
            </div>

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

function Requests({ data, name, vpa, onDone }) {
  const [subTab, setSubTab] = useState("review");
  const pendingCount = (data.reimbursements || []).filter(r => r.status === "submitted" || r.status === "under_review" || r.status === "approved").length;

  return (
    <>
      <Header icon="🧾" title="Requests" sub="Claim & review reimbursements" />
      <div className="card" style={{ padding: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
          <button onClick={() => setSubTab("claim")} style={{ height: 44, border: "none", borderRadius: 10, background: subTab === "claim" ? "var(--accent)" : "transparent", color: subTab === "claim" ? "#fff" : "var(--muted)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            🧾 New claim
          </button>
          <button onClick={() => setSubTab("review")} style={{ height: 44, border: "none", borderRadius: 10, background: subTab === "review" ? "var(--accent)" : "transparent", color: subTab === "review" ? "#fff" : "var(--muted)", fontWeight: 600, fontSize: 14, cursor: "pointer", position: "relative" }}>
            ✓ Review {pendingCount > 0 && <span style={{ background: "var(--amber)", color: "#fff", fontSize: 10, borderRadius: 8, padding: "1px 6px", marginLeft: 4 }}>{pendingCount}</span>}
          </button>
        </div>
      </div>
      {subTab === "claim" && <RequestReimbInner data={data} onDone={onDone} />}
      {subTab === "review" && <ReviewInner data={data} name={name} vpa={vpa} onDone={onDone} />}
    </>
  );
}

function RequestReimbInner({ data, onDone }) {
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

function ReviewInner({ data, name, vpa, onDone }) {
  const reimb = data.reimbursements || [];
  const [note, setNote] = useState({});
  const [payQr, setPayQr] = useState(null);
  const [paySuccess, setPaySuccess] = useState(null);
  const [waitingReturn, setWaitingReturn] = useState(false);
  const [payProof, setPayProof] = useState("");

  function onPayProof(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPayProof(reader.result);
    reader.readAsDataURL(f);
  }

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

  // ---- PAY SCREEN ----
  if (payQr) {
    async function confirmPaid() {
      if (!payProof) return alert("Upload a screenshot of your payment as proof");
      const res = await api("advanceReimbursement", { reimbId: payQr.id, toStatus: "paid", note: "", proof: payProof });
      if (res.ok) {
        setPaySuccess({ name: payQr.name, amount: payQr.amount });
        setPayQr(null); setPayProof("");
        setWaitingReturn(false);
        setTimeout(() => { setPaySuccess(null); onDone(); }, 3000);
      } else {
        alert(res.reason || "Could not mark as paid.");
      }
    }

    return (
      <>
        <Header icon="💸" title="Pay reimbursement" sub={"Pay " + payQr.name} />
        <div className="card" style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Pay <b>{payQr.name}</b></p>
          <div style={{ fontSize: 32, fontWeight: 700, marginBottom: 16 }}>{inr(payQr.amount)}</div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Option 1: Scan QR code</p>
            <img src={payQr.img} alt="QR code" style={{ borderRadius: 16, background: "#fff", padding: 12, boxShadow: "0 4px 24px rgba(139,124,246,0.3)", maxWidth: 200 }} />
          </div>

          <div style={{ background: "var(--card-2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Option 2: Pay using UPI ID</p>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--accent)", marginBottom: 4, wordBreak: "break-all" }}>{payQr.vpa}</div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Amount: {inr(payQr.amount)}</p>
            <button className="wide small" onClick={() => { navigator.clipboard.writeText(payQr.vpa); alert("Copied: " + payQr.vpa + "\n\nNow open PhonePe → Send money → Paste UPI ID → Enter " + inr(payQr.amount)); }} style={{ background: "var(--accent-bg)", color: "var(--accent)", borderColor: "rgba(139,124,246,0.3)" }}>
              📋 Copy UPI ID
            </button>
          </div>

          <div style={{ background: "var(--card-2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>📸 Upload payment screenshot</p>
            <input type="file" accept="image/*" onChange={onPayProof} style={{ marginBottom: 8, padding: "10px 12px", height: "auto", width: "100%" }} />
            {payProof && <img src={payProof} alt="proof" style={{ width: "100%", borderRadius: 10, maxHeight: 200, objectFit: "cover" }} />}
            {!payProof && <p style={{ fontSize: 12, color: "var(--muted)" }}>Take a screenshot of PhonePe success screen and upload it</p>}
          </div>

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

function Settings({ data, name, setTab }) {
  const config = data.config || {};
  const fund = data.fund || {};
  const [subTab, setSubTab] = useState("members");

  return (
    <>
      <Header icon="⚙️" title="Settings" sub={data.house.name} />

      <div className="card" style={{ padding: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          <button onClick={() => setSubTab("members")} style={{ height: 44, border: "none", borderRadius: 10, background: subTab === "members" ? "var(--accent)" : "transparent", color: subTab === "members" ? "#fff" : "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            👥 Members
          </button>
          <button onClick={() => setSubTab("history")} style={{ height: 44, border: "none", borderRadius: 10, background: subTab === "history" ? "var(--accent)" : "transparent", color: subTab === "history" ? "#fff" : "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            📜 History
          </button>
          <button onClick={() => setSubTab("reports")} style={{ height: 44, border: "none", borderRadius: 10, background: subTab === "reports" ? "var(--accent)" : "transparent", color: subTab === "reports" ? "#fff" : "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            📊 Reports
          </button>
        </div>
      </div>

      {subTab === "members" && <SettingsMembers data={data} name={name} config={config} fund={fund} />}
      {subTab === "history" && <SettingsHistory data={data} name={name} />}
      {subTab === "reports" && <SettingsReports data={data} name={name} />}
    </>
  );
}

function SettingsMembers({ data, name, config, fund }) {
  const [newName, setNewName] = useState("");
  const [newVpa, setNewVpa] = useState("");
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState("");
  const [editVpa, setEditVpa] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expAmt, setExpAmt] = useState("");
  const [expCat, setExpCat] = useState("Utilities");

  async function onDone() { window.location.reload(); }

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
      <div className="card">
        <h2>Fund configuration</h2>
        <div className="mrow"><span>Treasurer</span><span style={{ fontWeight: 600 }}>{config.treasurer_id ? name(config.treasurer_id) + " 👑" : "Not set"}</span></div>
        <div className="mrow"><span>Monthly per person</span><span style={{ fontWeight: 600 }}>{inr(config.monthly_amount)}</span></div>
        <div className="mrow"><span>Available fund</span><span style={{ fontWeight: 600, color: "var(--green)" }}>{inr(fund.available)}</span></div>
        <div className="mrow"><span>Total in</span><span>{inr(fund.totalIn)}</span></div>
        <div className="mrow"><span>Total out</span><span>{inr(fund.totalOut)}</span></div>
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
                  <div className="bal-text"><b>{m.name}{m.id === config.treasurer_id ? " 👑" : ""}</b><div className="sub">{m.vpa}</div></div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="small" onClick={() => startEdit(m)}>Edit</button>
                  {m.id !== config.treasurer_id && <button className="small" onClick={() => remove(m)} style={{ color: "var(--red)" }}>Remove</button>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Add a member</h2>
        <label>Name</label>
        <input value={newName} placeholder="New member" onChange={(e) => setNewName(e.target.value)} style={{ marginBottom: 12 }} />
        <label>UPI ID</label>
        <input value={newVpa} placeholder="name@upi" onChange={(e) => setNewVpa(e.target.value)} style={{ marginBottom: 14 }} />
        <button className="primary wide" onClick={add}>Add member</button>
      </div>

      <div className="card">
        <h2>Record fund expense</h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Money the treasurer spent directly (electricity, water).</p>
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

function SettingsHistory({ data, name }) {
  const contribs = (data.contributions || []).map(c => ({ ...c, type: "contribution", ts: Number(c.created_at) }));
  const reimbs = (data.reimbursements || []).map(r => ({ ...r, type: "reimbursement", ts: Number(r.created_at) }));
  const expenses = (data.fundExpenses || []).map(e => ({ ...e, type: "expense", ts: Number(e.created_at) }));
  const all = [...contribs, ...reimbs, ...expenses].sort((a, b) => b.ts - a.ts);
  const totalProofs = contribs.filter(c => c.proof).length + reimbs.filter(r => r.payment_proof || r.receipt).length;

  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);

  const filtered = filter === "all" ? all : all.filter(r => r.type === filter);
  const statusColor = (s) => STATUS_META[s]?.color || "var(--muted)";
  const statusLabel = (s) => STATUS_META[s]?.label || s;

  return (
    <>
      <div className="card">
        <h2>📊 Storage</h2>
        <div className="mrow"><span>Contributions</span><span>{contribs.length}</span></div>
        <div className="mrow"><span>Reimbursements</span><span>{reimbs.length}</span></div>
        <div className="mrow"><span>Fund expenses</span><span>{expenses.length}</span></div>
        <div className="mrow"><span>Payment proofs</span><span style={{ color: "var(--green)" }}>{totalProofs}</span></div>
        <div className="mrow bold"><span>Total records</span><span>{all.length}</span></div>
      </div>

      <div className="card">
        <div className="card-head"><h2>📜 All transactions</h2><span className="tag">{all.length} records</span></div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
          {[["all", "All"], ["contribution", "💰 In"], ["reimbursement", "🧾 Claims"], ["expense", "💸 Out"]].map(([key, label]) => (
            <button key={key} className={"small" + (filter === key ? " primary" : "")} onClick={() => setFilter(key)} style={{ whiteSpace: "nowrap", fontSize: 12 }}>{label}</button>
          ))}
        </div>

        {filtered.length === 0 && <div className="empty">No records yet.</div>}

        {filtered.map((r, i) => (
          <div key={r.id || i} style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="bal-row" onClick={() => setExpanded(expanded === i ? null : i)} style={{ cursor: "pointer" }}>
              <div className="bal-left">
                <span style={{ fontSize: 18 }}>{r.type === "contribution" ? "💰" : r.type === "reimbursement" ? "🧾" : "💸"}</span>
                <div className="bal-text">
                  <b>{r.type === "contribution" ? name(r.member_id) : r.type === "reimbursement" ? name(r.member_id) : (r.description || "Expense")}</b>
                  <div className="sub">{fmtDate(r.ts)} · {r.type === "contribution" ? "Contribution" : r.type === "reimbursement" ? (r.description || r.category) : r.category}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="bal-amt">{inr(r.amount)}</div>
                <div style={{ fontSize: 11, color: r.type === "contribution" ? "var(--green)" : r.type === "expense" ? "var(--amber)" : statusColor(r.status) }}>
                  {r.type === "contribution" ? "Fund +" : r.type === "expense" ? "Fund −" : statusLabel(r.status)}
                </div>
              </div>
            </div>

            {expanded === i && (
              <div style={{ padding: "0 12px 14px", background: "var(--card-2)", borderRadius: "0 0 10px 10px", margin: "0 -2px" }}>
                {r.type === "contribution" && (
                  <>
                    <div className="mrow"><span>Member</span><span>{name(r.member_id)}</span></div>
                    <div className="mrow"><span>Month</span><span>{r.month_tag}</span></div>
                    {r.proof ? (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 12, color: "var(--green)", marginBottom: 6 }}>📸 Payment proof ✓</p>
                        <img src={r.proof} alt="proof" style={{ width: "100%", borderRadius: 10, maxHeight: 300, objectFit: "contain" }} />
                      </div>
                    ) : <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>No proof attached</p>}
                  </>
                )}
                {r.type === "reimbursement" && (
                  <>
                    <div className="mrow"><span>Requested by</span><span>{name(r.member_id)}</span></div>
                    <div className="mrow"><span>Category</span><span>{r.category}</span></div>
                    <div className="mrow"><span>Status</span><span style={{ color: statusColor(r.status) }}>{statusLabel(r.status)}</span></div>
                    {r.notes && <div className="mrow"><span>Notes</span><span>{r.notes}</span></div>}
                    {r.treasurer_note && <div className="mrow"><span>Treasurer note</span><span>{r.treasurer_note}</span></div>}
                    {r.receipt && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>🧾 Receipt:</p>
                        <img src={r.receipt} alt="receipt" style={{ width: "100%", borderRadius: 10, maxHeight: 300, objectFit: "contain" }} />
                      </div>
                    )}
                    {r.payment_proof && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 12, color: "var(--green)", marginBottom: 6 }}>📸 Payment proof ✓</p>
                        <img src={r.payment_proof} alt="payment proof" style={{ width: "100%", borderRadius: 10, maxHeight: 300, objectFit: "contain" }} />
                      </div>
                    )}
                  </>
                )}
                {r.type === "expense" && (
                  <>
                    <div className="mrow"><span>Category</span><span>{r.category}</span></div>
                    {r.paid_by && <div className="mrow"><span>Paid by</span><span>{name(r.paid_by)}</span></div>}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsReports({ data, name }) {
  const [period, setPeriod] = useState("monthly");
  const contribs = data.contributions || [];
  const reimbs = data.reimbursements || [];
  const expenses = data.fundExpenses || [];
  const all = [
    ...contribs.map(c => ({ ...c, type: "in", ts: Number(c.created_at) })),
    ...reimbs.filter(r => ["paid","completed"].includes(r.status)).map(r => ({ ...r, type: "reimb_out", ts: Number(r.updated_at || r.created_at) })),
    ...expenses.map(e => ({ ...e, type: "exp_out", ts: Number(e.created_at) })),
  ];

  const now = new Date();
  const dayMs = 86400000;
  const filterStart = period === "daily" ? now.getTime() - dayMs
    : period === "weekly" ? now.getTime() - 7 * dayMs
    : new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const filtered = all.filter(r => r.ts >= filterStart);

  // totals
  const totalIn = filtered.filter(r => r.type === "in").reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = filtered.filter(r => r.type !== "in").reduce((s, r) => s + Number(r.amount), 0);
  const net = totalIn - totalOut;

  // category breakdown (expenses + reimbursements)
  const byCat = {};
  filtered.filter(r => r.type !== "in").forEach(r => {
    const cat = r.category || "Other";
    byCat[cat] = (byCat[cat] || 0) + Number(r.amount);
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catTotal = catEntries.reduce((s, [, v]) => s + v, 0);
  const catColors = { Rent: "#7F77DD", Utilities: "#EF9F27", Groceries: "#1D9E75", Internet: "#378ADD", Repairs: "#D4537E", Food: "#D85A30", Other: "#888780" };

  // member contributions
  const byMember = {};
  data.members.forEach(m => { byMember[m.id] = 0; });
  filtered.filter(r => r.type === "in").forEach(r => { byMember[r.member_id] = (byMember[r.member_id] || 0) + Number(r.amount); });
  const memberEntries = Object.entries(byMember).sort((a, b) => b[1] - a[1]);
  const maxMemberAmt = Math.max(...memberEntries.map(([,v]) => v), 1);

  // daily spending trend (last 7 days)
  const dailySpend = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMs);
    const key = d.getDate() + "/" + (d.getMonth() + 1);
    dailySpend[key] = 0;
  }
  all.filter(r => r.type !== "in" && r.ts >= now.getTime() - 7 * dayMs).forEach(r => {
    const d = new Date(r.ts);
    const key = d.getDate() + "/" + (d.getMonth() + 1);
    if (dailySpend[key] !== undefined) dailySpend[key] += Number(r.amount);
  });
  const dailyEntries = Object.entries(dailySpend);
  const maxDaily = Math.max(...dailyEntries.map(([,v]) => v), 1);

  // reimbursement status breakdown
  const statusCounts = {};
  reimbs.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
  const statusEntries = Object.entries(statusCounts);

  const periodLabel = period === "daily" ? "Today" : period === "weekly" ? "This week" : "This month";

  return (
    <>
      <div className="card" style={{ padding: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {[["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)} style={{ height: 38, border: "none", borderRadius: 8, background: period === key ? "var(--accent-bg)" : "transparent", color: period === key ? "var(--accent)" : "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="hero" style={{ marginBottom: 14 }}>
        <div className="label">{periodLabel}</div>
        <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: "var(--green)" }}>{inr(totalIn)}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Money in</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: "var(--amber)" }}>{inr(totalOut)}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Money out</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700, color: net >= 0 ? "var(--green)" : "var(--red)" }}>{net >= 0 ? "+" : ""}{inr(net)}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Net</div></div>
        </div>
      </div>

      <div className="card">
        <h2>📊 Spending by category</h2>
        {catEntries.length > 0 ? (
          <>
            <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
              {catEntries.map(([c, v]) => <div key={c} style={{ width: (v / catTotal * 100) + "%", background: catColors[c] || "#888" }} title={c} />)}
            </div>
            {catEntries.map(([c, v]) => (
              <div key={c} style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: catColors[c] || "#888", marginRight: 10, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14 }}>{c}</span>
                <span style={{ fontSize: 14, fontWeight: 600, marginRight: 8 }}>{inr(v)}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", width: 36, textAlign: "right" }}>{Math.round(v / catTotal * 100)}%</span>
              </div>
            ))}
          </>
        ) : <div className="empty">No spending in this period.</div>}
      </div>

      <div className="card">
        <h2>📈 Daily spending (last 7 days)</h2>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginBottom: 8 }}>
          {dailyEntries.map(([day, amt]) => (
            <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>{amt > 0 ? inr(amt) : ""}</div>
              <div style={{ width: "100%", background: amt > 0 ? "linear-gradient(180deg, var(--accent), var(--accent-2))" : "var(--card-2)", borderRadius: 4, height: Math.max(4, (amt / maxDaily) * 80), transition: "height .3s" }} />
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{day}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>👥 Member contributions</h2>
        {memberEntries.map(([id, amt]) => (
          <div key={id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ fontWeight: 500 }}>{name(id)}</span>
              <span style={{ fontWeight: 600 }}>{inr(amt)}</span>
            </div>
            <div style={{ height: 8, background: "var(--card-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: (amt / maxMemberAmt * 100) + "%", height: "100%", background: "linear-gradient(90deg, var(--green), #34d399)", borderRadius: 4, transition: "width .4s" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>🧾 Reimbursement status</h2>
        {statusEntries.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {statusEntries.map(([status, count]) => {
              const meta = STATUS_META[status] || { label: status, color: "var(--muted)", bg: "var(--card-2)" };
              return (
                <div key={status} style={{ background: meta.bg, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: meta.color }}>{count}</div>
                  <div style={{ fontSize: 12, color: meta.color }}>{meta.label}</div>
                </div>
              );
            })}
          </div>
        ) : <div className="empty">No reimbursements yet.</div>}
      </div>

      <div className="card">
        <h2>💡 Summary</h2>
        <div className="mrow"><span>Total transactions</span><span style={{ fontWeight: 600 }}>{filtered.length}</span></div>
        <div className="mrow"><span>Avg spend per day</span><span style={{ fontWeight: 600 }}>{inr(totalOut / (period === "daily" ? 1 : period === "weekly" ? 7 : new Date().getDate()))}</span></div>
        <div className="mrow"><span>Largest expense</span><span style={{ fontWeight: 600 }}>{inr(Math.max(...filtered.filter(r => r.type !== "in").map(r => Number(r.amount)), 0))}</span></div>
        <div className="mrow"><span>Members who contributed</span><span style={{ fontWeight: 600 }}>{memberEntries.filter(([,v]) => v > 0).length} / {data.members.length}</span></div>
      </div>
    </>
  );
}

function Chat({ data, name, onDone }) {
  const [text, setText] = useState("");
  const [sender, setSender] = useState(data.members[0]?.id || "");
  const [refreshing, setRefreshing] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const messages = [...(data.messages || [])].reverse();
  const fileRef = { current: null };

  const houseSlug = (data.house.name || "maplaza").toLowerCase().replace(/[^a-z0-9]/g, "");
  const jitsiRoom = "maplaza-" + houseSlug;

  async function send() {
    if (!text.trim() && !imagePreview) return;
    const msgType = imagePreview ? "image" : "text";
    const msgText = text.trim() || (imagePreview ? "📸 Photo" : "");
    await api("sendMessage", { memberId: sender, text: msgText, image: imagePreview || null, msgType });
    setText(""); setImagePreview(null);
    onDone();
  }

  function onImagePick(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return alert("File too large. Max 5MB.");
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(f);
  }

  async function refreshChat() { setRefreshing(true); await onDone(); setRefreshing(false); }

  useEffect(() => {
    const interval = setInterval(() => { onDone(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  function dateLabel(ts) {
    const d = new Date(Number(ts));
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Today";
    const yesterday = new Date(today - 86400000);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }
  function timeLabel(ts) { return new Date(Number(ts)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }

  let lastDate = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)" }}>
      {/* Header with call buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg,#8b7cf6,#6d5ef0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, boxShadow: "0 4px 16px rgba(139,124,246,0.3)" }}>💬</div>
          <div><h1 style={{ fontSize: 18, margin: 0 }}>House chat</h1><div style={{ fontSize: 11, color: "var(--muted)" }}>{data.members.length} members</div></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <a href={"https://meet.jit.si/" + jitsiRoom + "#config.startWithAudioMuted=true"} target="_blank" rel="noopener" style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(52,211,153,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, textDecoration: "none", cursor: "pointer" }} title="Voice call">📞</a>
          <a href={"https://meet.jit.si/" + jitsiRoom} target="_blank" rel="noopener" style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(96,165,250,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, textDecoration: "none", cursor: "pointer" }} title="Video call">📹</a>
          <button onClick={refreshChat} style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, border: "none", cursor: "pointer", color: "var(--muted)" }}>{refreshing ? "⏳" : "🔄"}</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 4px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", marginTop: 60, fontSize: 14 }}>No messages yet. Say hello! 👋</div>}
        {messages.map((m, i) => {
          const isMe = m.member_id === sender;
          const showDate = dateLabel(m.created_at) !== lastDate;
          lastDate = dateLabel(m.created_at);
          return (
            <div key={m.id || i}>
              {showDate && (
                <div style={{ textAlign: "center", margin: "12px 0 8px" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--card-2)", padding: "4px 14px", borderRadius: 12 }}>{dateLabel(m.created_at)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 2 }}>
                <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                  {!isMe && <span style={{ fontSize: 11, color: "var(--accent)", marginBottom: 2, marginLeft: 10 }}>{name(m.member_id)}</span>}
                  <div style={{
                    background: isMe ? "linear-gradient(135deg,#8b7cf6,#6d5ef0)" : "rgba(23,23,31,0.8)",
                    border: isMe ? "none" : "1px solid rgba(255,255,255,0.06)",
                    color: isMe ? "#fff" : "var(--ink)",
                    padding: m.image ? "6px" : "10px 14px",
                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: 14, lineHeight: 1.5, wordBreak: "break-word",
                  }}>
                    {m.image && <img src={m.image} alt="photo" style={{ width: "100%", maxWidth: 240, borderRadius: 12, marginBottom: m.text && m.text !== "📸 Photo" ? 6 : 0 }} />}
                    {m.text && m.text !== "📸 Photo" && <div>{m.text}</div>}
                    {m.text === "📸 Photo" && !m.image && <div>📸 Photo</div>}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, marginRight: isMe ? 4 : 0, marginLeft: isMe ? 0 : 4 }}>{timeLabel(m.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div style={{ padding: "8px 4px", borderTop: "1px solid var(--line)" }}>
          <div style={{ position: "relative", display: "inline-block" }}>
            <img src={imagePreview} alt="preview" style={{ height: 80, borderRadius: 10, objectFit: "cover" }} />
            <div onClick={() => setImagePreview(null)} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", background: "var(--red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>✕</div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: "8px 0 4px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <select value={sender} onChange={(e) => setSender(e.target.value)} style={{ flex: "0 0 auto", width: 90, fontSize: 11, height: 42, borderRadius: 12 }}>
            {data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input type="file" accept="image/*" style={{ display: "none" }} id="chatImgInput" onChange={onImagePick} />
          <button onClick={() => document.getElementById("chatImgInput").click()} style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", padding: 0 }}>📷</button>
          <input value={text} placeholder="Message..." onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} style={{ flex: 1, height: 42, borderRadius: 12 }} />
          <button onClick={send} style={{ flex: "0 0 auto", width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#8b7cf6,#6d5ef0)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", color: "#fff", boxShadow: "0 4px 12px rgba(139,124,246,0.3)" }}>➤</button>
        </div>
      </div>
    </div>
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
    ["requests", "🧾", "Requests"],
    ["chat", "💬", "Chat"],
    ["settings", "⚙️", "More"],
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
