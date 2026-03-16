import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import * as XLSX from "xlsx";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// ─── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Color Palette ─────────────────────────────────────────────────────────────
const COLORS = ["#2563EB","#16A34A","#DC2626","#D97706","#7C3AED","#0891B2","#DB2777","#65A30D","#EA580C","#4F46E5"];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];

const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
  return d.toISOString().split("T")[0];
};

const getMonthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const formatTime = (ts) => {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const filterByRange = (visits, range) => {
  const t = today();
  const ws = getWeekStart();
  const ms = getMonthStart();
  return visits.filter((v) => {
    const d = v.date || "";
    if (range === "weekly") return d >= ws && d <= t;
    if (range === "monthly") return d >= ms && d <= t;
    return true;
  });
};

// ─── Modal Component ───────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Visit Card Form ───────────────────────────────────────────────────────────
function VisitForm({ worker, onSave, onClose, visitTypes, cities, malls, branches, mode, existing }) {
  const [form, setForm] = useState(existing || {
    workerId: worker?.id || "",
    workerName: worker?.name || "",
    date: today(),
    city: "",
    mall: "",
    branch: "",
    visitType: "",
    notes: "",
    isUnplanned: false,
    resolved: false,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const availableMalls = malls.filter((m) => m.city === form.city);
  const availableBranches = branches.filter((b) => b.mall === form.mall);

  const handleSubmit = () => {
    if (!form.date || !form.city || !form.branch || !form.visitType) {
      alert("נא למלא את כל השדות החובה");
      return;
    }
    onSave(form);
  };

  return (
    <div className="form-grid">
      <div className="form-row">
        <label>שם עובד</label>
        <input value={form.workerName} disabled className="input-disabled" />
      </div>
      <div className="form-row">
        <label>תאריך *</label>
        <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="input" />
      </div>
      <div className="form-row">
        <label>עיר *</label>
        <select value={form.city} onChange={(e) => { set("city", e.target.value); set("mall", ""); set("branch", ""); }} className="input">
          <option value="">בחר עיר</option>
          {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>קניון *</label>
        <select value={form.mall} onChange={(e) => { set("mall", e.target.value); set("branch", ""); }} className="input">
          <option value="">בחר קניון</option>
          {availableMalls.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>סניף *</label>
        <select value={form.branch} onChange={(e) => set("branch", e.target.value)} className="input">
          <option value="">בחר סניף</option>
          {availableBranches.map((b) => <option key={b.id} value={b.name}>{b.name}{b.brand ? ` (${b.brand})` : ""}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>מהות ביקור *</label>
        <select value={form.visitType} onChange={(e) => set("visitType", e.target.value)} className="input">
          <option value="">בחר מהות</option>
          {visitTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>
          <input type="checkbox" checked={form.isUnplanned} onChange={(e) => set("isUnplanned", e.target.checked)} />
          &nbsp;ביקור לא מתוכנן
        </label>
      </div>
      {mode === "actual" && (
        <div className="form-row">
          <label>
            <input type="checkbox" checked={form.resolved} onChange={(e) => set("resolved", e.target.checked)} />
            &nbsp;תקלה טופלה
          </label>
        </div>
      )}
      <div className="form-row">
        <label>הערות</label>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="input" rows={3} />
      </div>
      <div className="form-actions">
        <button className="btn-primary" onClick={handleSubmit}>שמור</button>
        <button className="btn-secondary" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ visits, visitTypes, branches }) {
  const [range, setRange] = useState("weekly");
  const filtered = filterByRange(visits, range);

  const byType = visitTypes.map((t) => ({
    name: t.name,
    value: filtered.filter((v) => v.visitType === t.name).length,
  })).filter((x) => x.value > 0);

  // Brand pie – look up branch.brand for each visit
  const brandCount = {};
  filtered.forEach((v) => {
    const b = branches.find((br) => br.name === v.branch);
    const brand = b?.brand || "לא מוגדר";
    brandCount[brand] = (brandCount[brand] || 0) + 1;
  });
  const byBrand = Object.entries(brandCount).map(([name, value]) => ({ name, value })).filter((x) => x.value > 0);

  const branchCount = {};
  filtered.forEach((v) => { branchCount[v.branch] = (branchCount[v.branch] || 0) + 1; });
  const top5 = Object.entries(branchCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));

  const planned = filtered.filter((v) => !v.isUnplanned).length;
  const unplanned = filtered.filter((v) => v.isUnplanned).length;
  const total = filtered.length || 1;
  const planPct = Math.round((planned / total) * 100);
  const unplanPct = 100 - planPct;

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <h2 className="section-title">דאשבורד תפעול</h2>
        <div className="range-toggle">
          <button className={range === "weekly" ? "toggle-btn active" : "toggle-btn"} onClick={() => setRange("weekly")}>מצטבר שבועי</button>
          <button className={range === "monthly" ? "toggle-btn active" : "toggle-btn"} onClick={() => setRange("monthly")}>מצטבר חודשי</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-num">{filtered.length}</div><div className="kpi-label">סה"כ ביקורים</div></div>
        <div className="kpi-card"><div className="kpi-num">{planned}</div><div className="kpi-label">מתוכננים</div></div>
        <div className="kpi-card"><div className="kpi-num">{unplanned}</div><div className="kpi-label">לא מתוכננים</div></div>
        <div className="kpi-card"><div className="kpi-num">{filtered.filter(v => v.resolved).length}</div><div className="kpi-label">תקלות שטופלו</div></div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>מהות ביקורים</h3>
          {byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">אין נתונים</div>}
        </div>

        <div className="chart-card">
          <h3>ביקורים לפי מותג</h3>
          {byBrand.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={byBrand} dataKey="value" nameKey="name" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">אין נתונים (הגדר מותג לסניפים באדמין)</div>}
        </div>

        <div className="chart-card">
          <h3>מתוכנן / לא מתוכנן</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={[{ name: "מתוכנן", value: planPct }, { name: "לא מתוכנן", value: unplanPct }]} dataKey="value" nameKey="name" outerRadius={90} label={({ name, value }) => `${name}: ${value}%`}>
                <Cell fill="#2563EB" /><Cell fill="#DC2626" />
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h3>טופ 5 סניפים לפי תדירות ביקורים</h3>
          {top5.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top5} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">אין נתונים</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Workers Tab ───────────────────────────────────────────────────────────────
function WorkersTab({ workers, setWorkers }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", phone: "" });
  const [editId, setEditId] = useState(null);

  const save = async () => {
    if (!form.name) return;
    if (editId) {
      await updateDoc(doc(db, "workers", editId), form);
    } else {
      await addDoc(collection(db, "workers"), { ...form, createdAt: Date.now() });
    }
    setShowForm(false);
    setForm({ name: "", role: "", phone: "" });
    setEditId(null);
  };

  const remove = async (id) => {
    if (!confirm("למחוק עובד זה?")) return;
    await deleteDoc(doc(db, "workers", id));
  };

  const startEdit = (w) => { setForm({ name: w.name, role: w.role || "", phone: w.phone || "" }); setEditId(w.id); setShowForm(true); };

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2 className="section-title">אנשי שטח</h2>
        <button className="btn-primary" onClick={() => { setShowForm(true); setEditId(null); setForm({ name: "", role: "", phone: "" }); }}>+ הוסף עובד</button>
      </div>
      {showForm && (
        <Modal title={editId ? "עריכת עובד" : "הוספת עובד"} onClose={() => setShowForm(false)}>
          <div className="form-grid">
            <div className="form-row"><label>שם מלא *</label><input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="input" /></div>
            <div className="form-row"><label>תפקיד</label><input value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))} className="input" /></div>
            <div className="form-row"><label>טלפון</label><input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="input" /></div>
            <div className="form-actions"><button className="btn-primary" onClick={save}>שמור</button><button className="btn-secondary" onClick={() => setShowForm(false)}>ביטול</button></div>
          </div>
        </Modal>
      )}
      <table className="data-table">
        <thead><tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>פעולות</th></tr></thead>
        <tbody>
          {workers.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td>
              <td>{w.role || "-"}</td>
              <td>{w.phone || "-"}</td>
              <td>
                <button className="btn-icon" onClick={() => startEdit(w)}>✏️</button>
                <button className="btn-icon" onClick={() => remove(w.id)}>🗑️</button>
              </td>
            </tr>
          ))}
          {workers.length === 0 && <tr><td colSpan={4} className="empty-row">אין עובדים עדיין</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── Planning / Actual Visits Tab ──────────────────────────────────────────────
function VisitsTab({ mode, workers, visits, visitTypes, cities, malls, branches, clockEvents, onAddVisit, onUpdateVisit, onDeleteVisit, onClock }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [editVisit, setEditVisit] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekDays = (offset = 0) => {
    const days = [];
    const now = new Date();
    const day = now.getDay();
    const sun = new Date(now);
    sun.setDate(now.getDate() - day + offset * 7);
    for (let i = 0; i < 7; i++) {
      const d = new Date(sun);
      d.setDate(sun.getDate() + i);
      days.push(d.toISOString().split("T")[0]);
    }
    return days;
  };

  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  const getVisitsForWorkerDay = (workerId, date) =>
    visits.filter((v) => v.workerId === workerId && v.date === date && v.mode === mode);

  const getClockForWorkerDay = (workerId, date) =>
    clockEvents.find((c) => c.workerId === workerId && c.date === date);

  const handleSave = async (form) => {
    await onAddVisit({ ...form, mode });
    setShowForm(false);
  };

  const handleUpdate = async (form) => {
    await onUpdateVisit(editVisit.id, { ...form, mode });
    setEditVisit(null);
  };

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2 className="section-title">{mode === "planned" ? "תכנון שבועי" : "ביקורים בפועל"}</h2>
        <div className="week-nav">
          <button className="btn-secondary" onClick={() => setWeekOffset((p) => p - 1)}>← שבוע קודם</button>
          <span className="week-label">{weekDays[0]} – {weekDays[6]}</span>
          <button className="btn-secondary" onClick={() => setWeekOffset((p) => p + 1)}>שבוע הבא →</button>
        </div>
      </div>

      <div className="planning-grid">
        {/* Header row */}
        <div className="planning-col header-col">
          <div className="worker-header-cell">עובד</div>
          {weekDays.map((d, i) => (
            <div key={d} className={`day-header-cell ${d === today() ? "today" : ""}`}>
              <div>{dayNames[i]}</div>
              <div className="day-date">{d.slice(5)}</div>
            </div>
          ))}
        </div>

        {workers.map((worker) => (
          <div key={worker.id} className="planning-col">
            <div className="worker-name-cell">{worker.name}</div>
            {weekDays.map((date) => {
              const dayVisits = getVisitsForWorkerDay(worker.id, date);
              const clock = getClockForWorkerDay(worker.id, date);
              return (
                <div key={date} className={`day-cell ${date === today() ? "today-cell" : ""}`}>
                  {dayVisits.map((v) => (
                    <div key={v.id} className={`visit-chip ${v.isUnplanned ? "unplanned" : "planned"} ${v.resolved ? "resolved" : ""}`}
                      onClick={() => setEditVisit(v)}>
                      {v.branch} – {v.visitType}
                      {mode === "actual" && v.resolved && <span className="resolved-badge">✓</span>}
                    </div>
                  ))}
                  {mode === "actual" && (
                    <div className="clock-row">
                      {clock?.checkIn ? (
                        <span className="clock-badge in">כניסה: {formatTime(clock.checkIn)}</span>
                      ) : (
                        <button className="btn-clock in" onClick={() => onClock(worker.id, date, "in")}>כניסה</button>
                      )}
                      {clock?.checkOut ? (
                        <span className="clock-badge out">יציאה: {formatTime(clock.checkOut)}</span>
                      ) : (
                        clock?.checkIn && <button className="btn-clock out" onClick={() => onClock(worker.id, date, "out")}>יציאה</button>
                      )}
                    </div>
                  )}
                  <button className="btn-add-visit" onClick={() => { setSelectedWorker(worker); setShowForm(true); }}>+</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {showForm && selectedWorker && (
        <Modal title="הוספת ביקור" onClose={() => setShowForm(false)}>
          <VisitForm worker={selectedWorker} onSave={handleSave} onClose={() => setShowForm(false)}
            visitTypes={visitTypes} cities={cities} malls={malls} branches={branches} mode={mode} />
        </Modal>
      )}

      {editVisit && (
        <Modal title="עריכת ביקור" onClose={() => setEditVisit(null)}>
          <VisitForm worker={{ id: editVisit.workerId, name: editVisit.workerName }}
            onSave={handleUpdate} onClose={() => setEditVisit(null)}
            visitTypes={visitTypes} cities={cities} malls={malls} branches={branches}
            mode={mode} existing={editVisit} />
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button className="btn-danger" onClick={async () => { await onDeleteVisit(editVisit.id); setEditVisit(null); }}>מחק ביקור</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Heat Map Tab ──────────────────────────────────────────────────────────────
function HeatMapTab({ workers, visits }) {
  const planned = visits.filter((v) => v.mode === "planned");
  const actual = visits.filter((v) => v.mode === "actual");

  const getBranchesForWorker = (workerId, mode) =>
    [...new Set(visits.filter((v) => v.workerId === workerId && v.mode === mode).map((v) => `${v.date}|${v.branch}`))].length;

  return (
    <div className="tab-content">
      <h2 className="section-title">מפת חום – תכנון מול ביצוע</h2>
      <table className="data-table heatmap-table">
        <thead>
          <tr><th>עובד</th><th>ביקורים מתוכננים</th><th>ביקורים בפועל</th><th>אחוז ביצוע</th><th>חיווי</th></tr>
        </thead>
        <tbody>
          {workers.map((w) => {
            const p = getBranchesForWorker(w.id, "planned");
            const a = getBranchesForWorker(w.id, "actual");
            const pct = p === 0 ? 0 : Math.round((a / p) * 100);
            const color = pct >= 90 ? "#16A34A" : pct >= 60 ? "#D97706" : "#DC2626";
            return (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td>{p}</td>
                <td>{a}</td>
                <td>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                    <span>{pct}%</span>
                  </div>
                </td>
                <td><span className="status-dot" style={{ background: color }} /> {pct >= 90 ? "תקין" : pct >= 60 ? "חלקי" : "נמוך"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Admin Tab ─────────────────────────────────────────────────────────────────
function AdminTab({ visitTypes, cities, malls, branches }) {
  const [activeSection, setActiveSection] = useState("visitTypes");

  // Visit Types
  const [vtForm, setVtForm] = useState("");
  const addVT = async () => { if (!vtForm.trim()) return; await addDoc(collection(db, "visitTypes"), { name: vtForm.trim() }); setVtForm(""); };
  const removeVT = async (id) => { if (confirm("למחוק?")) await deleteDoc(doc(db, "visitTypes", id)); };

  // Cities
  const [cityForm, setCityForm] = useState("");
  const addCity = async () => { if (!cityForm.trim()) return; await addDoc(collection(db, "cities"), { name: cityForm.trim() }); setCityForm(""); };
  const removeCity = async (id) => { if (confirm("למחוק?")) await deleteDoc(doc(db, "cities", id)); };

  // Malls
  const [mallForm, setMallForm] = useState({ name: "", city: "" });
  const addMall = async () => { if (!mallForm.name || !mallForm.city) return; await addDoc(collection(db, "malls"), mallForm); setMallForm({ name: "", city: "" }); };
  const removeMall = async (id) => { if (confirm("למחוק?")) await deleteDoc(doc(db, "malls", id)); };

  // Branches
  const [branchForm, setBranchForm] = useState({ name: "", mall: "", city: "", brand: "" });
  const addBranch = async () => { if (!branchForm.name || !branchForm.mall) return; await addDoc(collection(db, "branches"), branchForm); setBranchForm({ name: "", mall: "", city: "", brand: "" }); };
  const removeBranch = async (id) => { if (confirm("למחוק?")) await deleteDoc(doc(db, "branches", id)); };

  const sections = [
    { key: "visitTypes", label: "מהות ביקור" },
    { key: "cities", label: "ערים" },
    { key: "malls", label: "קניונים" },
    { key: "branches", label: "סניפים" },
  ];

  return (
    <div className="tab-content">
      <h2 className="section-title">ניהול רשימות – אדמין</h2>
      <div className="admin-tabs">
        {sections.map((s) => <button key={s.key} className={activeSection === s.key ? "admin-tab active" : "admin-tab"} onClick={() => setActiveSection(s.key)}>{s.label}</button>)}
      </div>

      {activeSection === "visitTypes" && (
        <div className="admin-section">
          <h3>מהות ביקור</h3>
          <div className="add-row">
            <input value={vtForm} onChange={(e) => setVtForm(e.target.value)} className="input" placeholder="שם מהות ביקור" />
            <button className="btn-primary" onClick={addVT}>הוסף</button>
          </div>
          <ul className="admin-list">
            {visitTypes.map((t) => <li key={t.id}>{t.name} <button className="btn-icon" onClick={() => removeVT(t.id)}>🗑️</button></li>)}
          </ul>
        </div>
      )}

      {activeSection === "cities" && (
        <div className="admin-section">
          <h3>ערים</h3>
          <div className="add-row">
            <input value={cityForm} onChange={(e) => setCityForm(e.target.value)} className="input" placeholder="שם עיר" />
            <button className="btn-primary" onClick={addCity}>הוסף</button>
          </div>
          <ul className="admin-list">
            {cities.map((c) => <li key={c.id}>{c.name} <button className="btn-icon" onClick={() => removeCity(c.id)}>🗑️</button></li>)}
          </ul>
        </div>
      )}

      {activeSection === "malls" && (
        <div className="admin-section">
          <h3>קניונים</h3>
          <div className="add-row">
            <input value={mallForm.name} onChange={(e) => setMallForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="שם קניון" />
            <select value={mallForm.city} onChange={(e) => setMallForm((p) => ({ ...p, city: e.target.value }))} className="input">
              <option value="">בחר עיר</option>
              {cities.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button className="btn-primary" onClick={addMall}>הוסף</button>
          </div>
          <table className="data-table">
            <thead><tr><th>קניון</th><th>עיר</th><th></th></tr></thead>
            <tbody>
              {malls.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.city}</td><td><button className="btn-icon" onClick={() => removeMall(m.id)}>🗑️</button></td></tr>)}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === "branches" && (
        <div className="admin-section">
          <h3>סניפים</h3>
          <div className="add-row">
            <input value={branchForm.name} onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))} className="input" placeholder="שם סניף" />
            <input value={branchForm.brand} onChange={(e) => setBranchForm((p) => ({ ...p, brand: e.target.value }))} className="input" placeholder="מותג" />
            <select value={branchForm.mall} onChange={(e) => {
              const m = malls.find(x => x.name === e.target.value);
              setBranchForm((p) => ({ ...p, mall: e.target.value, city: m?.city || "" }));
            }} className="input">
              <option value="">בחר קניון</option>
              {malls.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <button className="btn-primary" onClick={addBranch}>הוסף</button>
          </div>
          <table className="data-table">
            <thead><tr><th>סניף</th><th>מותג</th><th>קניון</th><th>עיר</th><th></th></tr></thead>
            <tbody>
              {branches.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.brand || "-"}</td><td>{b.mall}</td><td>{b.city}</td><td><button className="btn-icon" onClick={() => removeBranch(b.id)}>🗑️</button></td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Reports Tab ───────────────────────────────────────────────────────────────
function ReportsTab({ visits, workers, visitTypes, malls, branches, clockEvents }) {
  const [from, setFrom] = useState(getMonthStart());
  const [to, setTo] = useState(today());
  const [activeReport, setActiveReport] = useState("summary");

  const filtered = visits.filter((v) => v.date >= from && v.date <= to);

  const exportToExcel = (data, fileName) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "דוח");
    XLSX.utils.writeFile(wb, `${fileName}.xlsx`);
  };

  // Summary report
  const summaryData = filtered.map((v) => {
    const br = branches.find((b) => b.name === v.branch);
    return {
      עובד: v.workerName,
      תאריך: v.date,
      עיר: v.city,
      קניון: v.mall,
      סניף: v.branch,
      מותג: br?.brand || "",
      "מהות ביקור": v.visitType,
      "מתוכנן/לא מתוכנן": v.isUnplanned ? "לא מתוכנן" : "מתוכנן",
      "תקלה טופלה": v.resolved ? "כן" : "לא",
      הערות: v.notes || "",
      סוג: v.mode === "planned" ? "תכנון" : "בפועל",
    };
  });

  // Indicator report – did worker visit all branches (and brands) in mall?
  const indicatorData = [];
  const actualVisits = filtered.filter((v) => v.mode === "actual");
  workers.forEach((w) => {
    const workerVisits = actualVisits.filter((v) => v.workerId === w.id);
    const mallsVisited = [...new Set(workerVisits.map((v) => v.mall))];
    mallsVisited.forEach((mall) => {
      const expectedBranches = branches.filter((b) => b.mall === mall);
      const visitedBranchNames = [...new Set(workerVisits.filter((v) => v.mall === mall).map((v) => v.branch))];
      const missingBranches = expectedBranches.filter((b) => !visitedBranchNames.includes(b.name));
      const expectedBrands = [...new Set(expectedBranches.map((b) => b.brand).filter(Boolean))];
      const visitedBrands = [...new Set(expectedBranches.filter((b) => visitedBranchNames.includes(b.name)).map((b) => b.brand).filter(Boolean))];
      const missingBrands = expectedBrands.filter((br) => !visitedBrands.includes(br));
      indicatorData.push({
        עובד: w.name,
        קניון: mall,
        "סניפים צפויים": expectedBranches.length,
        "סניפים שבוקרו": visitedBranchNames.length,
        "סניפים חסרים": missingBranches.map((b) => b.name).join(", ") || "אין",
        "מותגים חסרים": missingBrands.join(", ") || "אין",
        סטטוס: missingBranches.length === 0 ? "✅ מלא" : "⚠️ חלקי",
      });
    });
  });

  // Clock report
  const clockData = clockEvents.filter((c) => c.date >= from && c.date <= to).map((c) => ({
    עובד: workers.find((w) => w.id === c.workerId)?.name || c.workerId,
    תאריך: c.date,
    כניסה: formatTime(c.checkIn),
    יציאה: formatTime(c.checkOut),
    "שעות עבודה": c.checkIn && c.checkOut ? `${((c.checkOut - c.checkIn) / 3600000).toFixed(1)}ש'` : "-",
  }));

  const byType = visitTypes.map((t) => ({ name: t.name, value: filtered.filter((v) => v.visitType === t.name).length })).filter((x) => x.value > 0);
  const planned = filtered.filter((v) => !v.isUnplanned).length;
  const unplanned = filtered.filter((v) => v.isUnplanned).length;
  const total = filtered.length || 1;

  const branchCount = {};
  filtered.forEach((v) => { branchCount[v.branch] = (branchCount[v.branch] || 0) + 1; });
  const top5 = Object.entries(branchCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }));

  const reportTabs = [
    { key: "summary", label: "סיכום ביקורים" },
    { key: "charts", label: "גרפים" },
    { key: "indicator", label: "דוח חיווי" },
    { key: "clock", label: "שעות נוכחות" },
  ];

  return (
    <div className="tab-content">
      <h2 className="section-title">דוחות</h2>
      <div className="report-filters">
        <label>מתאריך <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input small" /></label>
        <label>עד תאריך <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input small" /></label>
      </div>

      <div className="admin-tabs">
        {reportTabs.map((r) => <button key={r.key} className={activeReport === r.key ? "admin-tab active" : "admin-tab"} onClick={() => setActiveReport(r.key)}>{r.label}</button>)}
      </div>

      {activeReport === "summary" && (
        <div>
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <button className="btn-secondary" onClick={() => exportToExcel(summaryData, "דוח_ביקורים")}>📥 ייצוא לאקסל</button>
          </div>
          <table className="data-table">
            <thead><tr><th>עובד</th><th>תאריך</th><th>קניון</th><th>סניף</th><th>מותג</th><th>מהות</th><th>תכנון/פועל</th><th>טופלה</th><th>הערות</th></tr></thead>
            <tbody>
              {summaryData.map((r, i) => (
                <tr key={i}><td>{r["עובד"]}</td><td>{r["תאריך"]}</td><td>{r["קניון"]}</td><td>{r["סניף"]}</td><td>{r["מותג"] || "-"}</td><td>{r["מהות ביקור"]}</td><td>{r["מתוכנן/לא מתוכנן"]}</td><td>{r["תקלה טופלה"]}</td><td>{r["הערות"]}</td></tr>
              ))}
              {summaryData.length === 0 && <tr><td colSpan={9} className="empty-row">אין נתונים בטווח זה</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {activeReport === "charts" && (
        <div className="charts-grid">
          <div className="chart-card">
            <h3>מהות ביקורים</h3>
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={byType} dataKey="value" nameKey="name" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
                  <Tooltip /><Legend /></PieChart>
              </ResponsiveContainer>
            ) : <div className="empty-chart">אין נתונים</div>}
          </div>
          <div className="chart-card">
            <h3>מתוכנן / לא מתוכנן</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart><Pie data={[{ name: "מתוכנן", value: planned }, { name: "לא מתוכנן", value: unplanned }]} dataKey="value" nameKey="name" outerRadius={90} label>
                <Cell fill="#2563EB" /><Cell fill="#DC2626" /></Pie><Tooltip /><Legend /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card full-width">
            <h3>טופ 5 סניפים</h3>
            {top5.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top5} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={120} /><Tooltip /><Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} /></BarChart>
              </ResponsiveContainer>
            ) : <div className="empty-chart">אין נתונים</div>}
          </div>
        </div>
      )}

      {activeReport === "indicator" && (
        <div>
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <button className="btn-secondary" onClick={() => exportToExcel(indicatorData, "דוח_חיווי")}>📥 ייצוא לאקסל</button>
          </div>
          <table className="data-table">
              <thead><tr><th>עובד</th><th>קניון</th><th>סניפים צפויים</th><th>בוקרו</th><th>סניפים חסרים</th><th>מותגים חסרים</th><th>סטטוס</th></tr></thead>
              <tbody>
                {indicatorData.map((r, i) => (
                  <tr key={i}><td>{r["עובד"]}</td><td>{r["קניון"]}</td><td>{r["סניפים צפויים"]}</td><td>{r["סניפים שבוקרו"]}</td><td>{r["סניפים חסרים"]}</td><td>{r["מותגים חסרים"]}</td><td>{r["סטטוס"]}</td></tr>
                ))}
                {indicatorData.length === 0 && <tr><td colSpan={7} className="empty-row">אין נתונים בטווח זה</td></tr>}
              </tbody>
            </table>
        </div>
      )}

      {activeReport === "clock" && (
        <div>
          <div style={{ textAlign: "left", marginBottom: 8 }}>
            <button className="btn-secondary" onClick={() => exportToExcel(clockData, "דוח_נוכחות")}>📥 ייצוא לאקסל</button>
          </div>
          <table className="data-table">
            <thead><tr><th>עובד</th><th>תאריך</th><th>כניסה</th><th>יציאה</th><th>שעות</th></tr></thead>
            <tbody>
              {clockData.map((r, i) => <tr key={i}><td>{r["עובד"]}</td><td>{r["תאריך"]}</td><td>{r["כניסה"]}</td><td>{r["יציאה"]}</td><td>{r["שעות עבודה"]}</td></tr>)}
              {clockData.length === 0 && <tr><td colSpan={5} className="empty-row">אין נתונים בטווח זה</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");

  const [workers, setWorkers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [visitTypes, setVisitTypes] = useState([]);
  const [cities, setCities] = useState([]);
  const [malls, setMalls] = useState([]);
  const [branches, setBranches] = useState([]);
  const [clockEvents, setClockEvents] = useState([]);

  // Real-time listeners
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "workers"), (s) => setWorkers(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "visits"), (s) => setVisits(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "visitTypes"), (s) => setVisitTypes(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "cities"), (s) => setCities(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "malls"), (s) => setMalls(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "branches"), (s) => setBranches(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, "clockEvents"), (s) => setClockEvents(s.docs.map((d) => ({ id: d.id, ...d.data() })))),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const addVisit = async (form) => {
    await addDoc(collection(db, "visits"), { ...form, createdAt: Date.now() });
  };

  const updateVisit = async (id, form) => {
    await updateDoc(doc(db, "visits", id), form);
  };

  const deleteVisit = async (id) => {
    await deleteDoc(doc(db, "visits", id));
  };

  const handleClock = async (workerId, date, direction) => {
    const existing = clockEvents.find((c) => c.workerId === workerId && c.date === date);
    const ts = Date.now();
    if (!existing) {
      await addDoc(collection(db, "clockEvents"), { workerId, date, checkIn: ts, checkOut: null });
    } else if (direction === "out") {
      await updateDoc(doc(db, "clockEvents", existing.id), { checkOut: ts });
    }
  };

  const tabs = [
    { key: "dashboard", label: "דאשבורד" },
    { key: "workers", label: "אנשי שטח" },
    { key: "planned", label: "תכנון שבועי" },
    { key: "actual", label: "ביקורים בפועל" },
    { key: "heatmap", label: "מפת חום" },
    { key: "reports", label: "דוחות" },
    { key: "admin", label: "אדמין" },
  ];

  return (
    <div className="app" dir="rtl">
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🏢</span>
          <span className="logo-text">ניהול תפעול שטח</span>
        </div>
        <nav className="app-nav">
          {tabs.map((t) => (
            <button key={t.key} className={tab === t.key ? "nav-tab active" : "nav-tab"} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === "dashboard" && <DashboardTab visits={visits} visitTypes={visitTypes} branches={branches} />}
        {tab === "workers" && <WorkersTab workers={workers} setWorkers={setWorkers} />}
        {tab === "planned" && <VisitsTab mode="planned" workers={workers} visits={visits} visitTypes={visitTypes} cities={cities} malls={malls} branches={branches} clockEvents={clockEvents} onAddVisit={addVisit} onUpdateVisit={updateVisit} onDeleteVisit={deleteVisit} onClock={handleClock} />}
        {tab === "actual" && <VisitsTab mode="actual" workers={workers} visits={visits} visitTypes={visitTypes} cities={cities} malls={malls} branches={branches} clockEvents={clockEvents} onAddVisit={addVisit} onUpdateVisit={updateVisit} onDeleteVisit={deleteVisit} onClock={handleClock} />}
        {tab === "heatmap" && <HeatMapTab workers={workers} visits={visits} />}
        {tab === "reports" && <ReportsTab visits={visits} workers={workers} visitTypes={visitTypes} malls={malls} branches={branches} clockEvents={clockEvents} />}
        {tab === "admin" && <AdminTab visitTypes={visitTypes} cities={cities} malls={malls} branches={branches} />}
      </main>
    </div>
  );
}
