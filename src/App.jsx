import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

// ─── Firebase ──────────────────────────────────────────────────────────────────
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

// ─── Constants ─────────────────────────────────────────────────────────────────
const COLORS = ["#2563EB","#16A34A","#DC2626","#D97706","#7C3AED","#0891B2","#DB2777","#65A30D","#EA580C","#4F46E5"];
const ABSENCE_TYPES = ["חופשה", "מחלה"];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0];
const getWeekStart = () => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().split("T")[0]; };
const getMonthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; };
const formatTime = (ts) => { if (!ts) return "-"; const d = new Date(ts); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const filterByRange = (items, range) => {
  const t = today(), ws = getWeekStart(), ms = getMonthStart();
  return items.filter((v) => { const d = v.date||""; if (range==="weekly") return d>=ws&&d<=t; if (range==="monthly") return d>=ms&&d<=t; return true; });
};

// ─── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Multi-select chips ────────────────────────────────────────────────────────
function MultiChips({ options, selected, onChange }) {
  const arr = Array.isArray(selected) ? selected : (selected ? [selected] : []);
  const toggle = (name) => onChange(arr.includes(name) ? arr.filter((x) => x !== name) : [...arr, name]);
  return (
    <div className="multi-select-box">
      {options.map((o) => (
        <label key={o} className={`multi-chip${arr.includes(o) ? " selected" : ""}`}>
          <input type="checkbox" checked={arr.includes(o)} onChange={() => toggle(o)} style={{display:"none"}} />
          {o}
        </label>
      ))}
      {options.length === 0 && <span className="empty-hint">אין פריטים ברשימה</span>}
    </div>
  );
}

// ─── Absence Form ──────────────────────────────────────────────────────────────
function AbsenceForm({ worker, onSave, onClose }) {
  const [form, setForm] = useState({ workerId:worker?.id||"", workerName:worker?.name||"", date:today(), absenceType:"חופשה", notes:"", recordType:"absence" });
  const set = (k,v) => setForm((p) => ({...p,[k]:v}));
  return (
    <div className="form-grid">
      <div className="form-row"><label>שם עובד</label><input value={form.workerName} disabled className="input-disabled" /></div>
      <div className="form-row"><label>תאריך *</label><input type="date" value={form.date} onChange={(e)=>set("date",e.target.value)} className="input" /></div>
      <div className="form-row">
        <label>סוג היעדרות *</label>
        <select value={form.absenceType} onChange={(e)=>set("absenceType",e.target.value)} className="input">
          {ABSENCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="form-row"><label>הערות</label><textarea value={form.notes} onChange={(e)=>set("notes",e.target.value)} className="input" rows={2}/></div>
      <div className="form-actions">
        <button className="btn-primary" onClick={()=>{ if(!form.date)return; onSave(form); }}>שמור</button>
        <button className="btn-secondary" onClick={onClose}>ביטול</button>
      </div>
    </div>
  );
}

// ─── Visit Form ────────────────────────────────────────────────────────────────
// Structure: worker → city → mall → brand (= the "branch")
// visitTypes = multi-select
function VisitForm({ worker, onSave, onClose, visitTypes, cities, malls, mode, existing }) {
  const [form, setForm] = useState(existing || {
    workerId:worker?.id||"", workerName:worker?.name||"",
    date:today(), city:"", mall:"", brand:"",
    visitTypes:[], notes:"", isUnplanned:false, resolved:false, recordType:"visit",
  });
  const set = (k,v) => setForm((p) => ({...p,[k]:v}));

  const availableMalls = malls.filter((m) => m.city === form.city);
  const selectedMall = malls.find((m) => m.name === form.mall);
  const availableBrands = selectedMall?.brands || [];

  const handleSubmit = () => {
    const types = Array.isArray(form.visitTypes) ? form.visitTypes : [];
    if (!form.date || !form.city || !form.mall || !form.brand || types.length === 0) {
      alert("נא למלא את כל השדות החובה (כולל לפחות מהות ביקור אחת)");
      return;
    }
    onSave(form);
  };

  return (
    <div className="form-grid">
      <div className="form-row"><label>שם עובד</label><input value={form.workerName} disabled className="input-disabled"/></div>
      <div className="form-row"><label>תאריך *</label><input type="date" value={form.date} onChange={(e)=>set("date",e.target.value)} className="input"/></div>
      <div className="form-row">
        <label>עיר *</label>
        <select value={form.city} onChange={(e)=>{set("city",e.target.value);set("mall","");set("brand","");}} className="input">
          <option value="">בחר עיר</option>
          {cities.map((c)=><option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>קניון *</label>
        <select value={form.mall} onChange={(e)=>{set("mall",e.target.value);set("brand","");}} className="input">
          <option value="">בחר קניון</option>
          {availableMalls.map((m)=><option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>מותג *</label>
        <select value={form.brand} onChange={(e)=>set("brand",e.target.value)} className="input" disabled={!form.mall}>
          <option value="">{form.mall ? "בחר מותג" : "בחר קניון תחילה"}</option>
          {availableBrands.map((b)=><option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div className="form-row">
        <label>מהות ביקור * (בחירה מרובה)</label>
        <MultiChips options={visitTypes.map((t)=>t.name)} selected={form.visitTypes} onChange={(v)=>set("visitTypes",v)} />
      </div>
      <div className="form-row"><label className="checkbox-label"><input type="checkbox" checked={form.isUnplanned} onChange={(e)=>set("isUnplanned",e.target.checked)}/>&nbsp;ביקור לא מתוכנן</label></div>
      {mode==="actual" && <div className="form-row"><label className="checkbox-label"><input type="checkbox" checked={form.resolved} onChange={(e)=>set("resolved",e.target.checked)}/>&nbsp;תקלה טופלה</label></div>}
      <div className="form-row"><label>הערות</label><textarea value={form.notes} onChange={(e)=>set("notes",e.target.value)} className="input" rows={3}/></div>
      <div className="form-actions"><button className="btn-primary" onClick={handleSubmit}>שמור</button><button className="btn-secondary" onClick={onClose}>ביטול</button></div>
    </div>
  );
}

// ─── Pie Chart Card ────────────────────────────────────────────────────────────
function PieChartCard({ title, data }) {
  if (!data || data.length === 0) return <div className="chart-card"><h3>{title}</h3><div className="empty-chart">אין נתונים</div></div>;
  return (
    <div className="chart-card">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart margin={{top:5,right:10,bottom:60,left:10}}>
          <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label={({percent})=>`${(percent*100).toFixed(0)}%`} labelLine>
            {data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
          </Pie>
          <Tooltip/>
          <Legend wrapperStyle={{fontSize:12,paddingTop:8}}/>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
function DashboardTab({ visits, absences, visitTypes }) {
  const [range, setRange] = useState("weekly");
  const actual = visits.filter((v)=>v.mode==="actual");
  const filtered = filterByRange(actual, range);
  const filtAbs = filterByRange(absences, range);

  // Visit types count (multi)
  const typeCount = {};
  filtered.forEach((v)=>{ const ts=Array.isArray(v.visitTypes)?v.visitTypes:(v.visitType?[v.visitType]:[]); ts.forEach((t)=>{typeCount[t]=(typeCount[t]||0)+1;}); });
  const byType = Object.entries(typeCount).map(([name,value])=>({name,value})).filter(x=>x.value>0);

  // Brand count
  const brandCount = {};
  filtered.forEach((v)=>{ if(v.brand) brandCount[v.brand]=(brandCount[v.brand]||0)+1; });
  const byBrand = Object.entries(brandCount).map(([name,value])=>({name,value})).filter(x=>x.value>0);

  // Top 5 – by brand+mall combo
  const top5 = Object.entries(brandCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value}));

  const planned = filtered.filter(v=>!v.isUnplanned).length;
  const unplanned = filtered.filter(v=>v.isUnplanned).length;
  const planData = [{name:"מתוכנן",value:planned},{name:"לא מתוכנן",value:unplanned}].filter(x=>x.value>0);
  const absByType = ABSENCE_TYPES.map((t)=>({name:t,value:filtAbs.filter(a=>a.absenceType===t).length})).filter(x=>x.value>0);

  return (
    <div className="tab-content">
      <div className="dashboard-header">
        <h2 className="section-title">דאשבורד תפעול</h2>
        <div className="range-toggle">
          <button className={range==="weekly"?"toggle-btn active":"toggle-btn"} onClick={()=>setRange("weekly")}>מצטבר שבועי</button>
          <button className={range==="monthly"?"toggle-btn active":"toggle-btn"} onClick={()=>setRange("monthly")}>מצטבר חודשי</button>
        </div>
      </div>
      <div className="kpi-row">
        <div className="kpi-card"><div className="kpi-num">{filtered.length}</div><div className="kpi-label">ביקורים בפועל</div></div>
        <div className="kpi-card"><div className="kpi-num">{planned}</div><div className="kpi-label">מתוכננים</div></div>
        <div className="kpi-card"><div className="kpi-num">{unplanned}</div><div className="kpi-label">לא מתוכננים</div></div>
        <div className="kpi-card"><div className="kpi-num">{filtered.filter(v=>v.resolved).length}</div><div className="kpi-label">תקלות שטופלו</div></div>
        <div className="kpi-card"><div className="kpi-num">{filtAbs.length}</div><div className="kpi-label">היעדרויות</div></div>
      </div>
      <div className="charts-grid">
        <PieChartCard title="מהות ביקורים" data={byType}/>
        <PieChartCard title="ביקורים לפי מותג" data={byBrand}/>
        <PieChartCard title="מתוכנן / לא מתוכנן" data={planData}/>
        {absByType.length>0 && <PieChartCard title="היעדרויות" data={absByType}/>}
        <div className="chart-card full-width">
          <h3>טופ 5 מותגים לפי תדירות ביקורים</h3>
          {top5.length>0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={top5} layout="vertical" margin={{top:5,right:30,bottom:5,left:10}}>
                <CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/>
                <YAxis type="category" dataKey="name" width={150} tick={{fontSize:12}}/>
                <Tooltip/><Bar dataKey="value" fill="#2563EB" radius={[0,4,4,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="empty-chart">אין נתונים</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Workers Tab ───────────────────────────────────────────────────────────────
function WorkersTab({ workers }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({name:"",role:"",phone:""});
  const [editId, setEditId] = useState(null);
  const save = async () => {
    if (!form.name) return;
    if (editId) await updateDoc(doc(db,"workers",editId),form);
    else await addDoc(collection(db,"workers"),{...form,createdAt:Date.now()});
    setShowForm(false); setForm({name:"",role:"",phone:""}); setEditId(null);
  };
  const remove = async (id) => { if(!confirm("למחוק?"))return; await deleteDoc(doc(db,"workers",id)); };
  const startEdit = (w) => { setForm({name:w.name,role:w.role||"",phone:w.phone||""}); setEditId(w.id); setShowForm(true); };
  return (
    <div className="tab-content">
      <div className="section-header">
        <h2 className="section-title">אנשי שטח</h2>
        <button className="btn-primary" onClick={()=>{setShowForm(true);setEditId(null);setForm({name:"",role:"",phone:""});}}>+ הוסף עובד</button>
      </div>
      {showForm && (
        <Modal title={editId?"עריכת עובד":"הוספת עובד"} onClose={()=>setShowForm(false)}>
          <div className="form-grid">
            <div className="form-row"><label>שם מלא *</label><input value={form.name} onChange={(e)=>setForm(p=>({...p,name:e.target.value}))} className="input"/></div>
            <div className="form-row"><label>תפקיד</label><input value={form.role} onChange={(e)=>setForm(p=>({...p,role:e.target.value}))} className="input"/></div>
            <div className="form-row"><label>טלפון</label><input value={form.phone} onChange={(e)=>setForm(p=>({...p,phone:e.target.value}))} className="input"/></div>
            <div className="form-actions"><button className="btn-primary" onClick={save}>שמור</button><button className="btn-secondary" onClick={()=>setShowForm(false)}>ביטול</button></div>
          </div>
        </Modal>
      )}
      <table className="data-table">
        <thead><tr><th>שם</th><th>תפקיד</th><th>טלפון</th><th>פעולות</th></tr></thead>
        <tbody>
          {workers.map(w=><tr key={w.id}><td>{w.name}</td><td>{w.role||"-"}</td><td>{w.phone||"-"}</td><td><button className="btn-icon" onClick={()=>startEdit(w)}>✏️</button><button className="btn-icon" onClick={()=>remove(w.id)}>🗑️</button></td></tr>)}
          {workers.length===0&&<tr><td colSpan={4} className="empty-row">אין עובדים עדיין</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── Visits Tab ────────────────────────────────────────────────────────────────
function VisitsTab({ mode, workers, visits, absences, visitTypes, cities, malls, clockEvents, onAddVisit, onUpdateVisit, onDeleteVisit, onAddAbsence, onDeleteAbsence, onClock }) {
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [editVisit, setEditVisit] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekDays = (offset=0) => {
    const days=[]; const now=new Date(); const sun=new Date(now);
    sun.setDate(now.getDate()-now.getDay()+offset*7);
    for(let i=0;i<7;i++){const d=new Date(sun);d.setDate(sun.getDate()+i);days.push(d.toISOString().split("T")[0]);}
    return days;
  };
  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"];
  const getVisits = (wid,date) => visits.filter(v=>v.workerId===wid&&v.date===date&&v.mode===mode);
  const getAbsence = (wid,date) => absences.find(a=>a.workerId===wid&&a.date===date);
  const getClock = (wid,date) => clockEvents.find(c=>c.workerId===wid&&c.date===date);

  return (
    <div className="tab-content">
      <div className="section-header">
        <h2 className="section-title">{mode==="planned"?"תכנון שבועי":"ביקורים בפועל"}</h2>
        <div className="week-nav">
          <button className="btn-secondary" onClick={()=>setWeekOffset(p=>p-1)}>← שבוע קודם</button>
          <span className="week-label">{weekDays[0]} – {weekDays[6]}</span>
          <button className="btn-secondary" onClick={()=>setWeekOffset(p=>p+1)}>שבוע הבא →</button>
        </div>
      </div>
      <div className="planning-scroll">
        <div className="planning-grid" style={{gridTemplateColumns:`160px repeat(7,minmax(140px,1fr))`}}>
          <div className="worker-header-cell">עובד</div>
          {weekDays.map((d,i)=><div key={d} className={`day-header-cell${d===today()?" today":""}`}><div>{dayNames[i]}</div><div className="day-date">{d.slice(5)}</div></div>)}
          {workers.map(worker=>(
            <>
              <div key={`n-${worker.id}`} className="worker-name-cell">{worker.name}</div>
              {weekDays.map(date=>{
                const dayVisits=getVisits(worker.id,date);
                const absence=getAbsence(worker.id,date);
                const clock=getClock(worker.id,date);
                return (
                  <div key={`${worker.id}-${date}`} className={`day-cell${date===today()?" today-cell":""}`}>
                    {absence&&<div className="absence-chip" onClick={()=>{if(confirm("למחוק היעדרות?"))onDeleteAbsence(absence.id);}}>{absence.absenceType} ✕</div>}
                    {dayVisits.map(v=>(
                      <div key={v.id} className={`visit-chip${v.isUnplanned?" unplanned":" planned"}${v.resolved?" resolved":""}`} onClick={()=>setEditVisit(v)}>
                        <div className="chip-branch">{v.mall} – {v.brand}</div>
                        {Array.isArray(v.visitTypes)&&v.visitTypes.length>0&&<div className="chip-types">{v.visitTypes.join(", ")}</div>}
                        {mode==="actual"&&v.resolved&&<span className="resolved-badge"> ✓</span>}
                      </div>
                    ))}
                    {mode==="actual"&&(
                      <div className="clock-row">
                        {clock?.checkIn?<span className="clock-badge in">כניסה: {formatTime(clock.checkIn)}</span>:<button className="btn-clock in" onClick={()=>onClock(worker.id,date,"in")}>כניסה</button>}
                        {clock?.checkOut?<span className="clock-badge out">יציאה: {formatTime(clock.checkOut)}</span>:clock?.checkIn&&<button className="btn-clock out" onClick={()=>onClock(worker.id,date,"out")}>יציאה</button>}
                      </div>
                    )}
                    <div className="cell-actions">
                      <button className="btn-add-visit" title="הוסף ביקור" onClick={()=>{setSelectedWorker(worker);setShowVisitForm(true);}}>+</button>
                      <button className="btn-absence" title="סמן היעדרות" onClick={()=>{setSelectedWorker(worker);setShowAbsenceForm(true);}}>−</button>
                    </div>
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {showVisitForm&&selectedWorker&&(
        <Modal title="הוספת ביקור" onClose={()=>setShowVisitForm(false)}>
          <VisitForm worker={selectedWorker} onSave={async f=>{await onAddVisit({...f,mode});setShowVisitForm(false);}} onClose={()=>setShowVisitForm(false)} visitTypes={visitTypes} cities={cities} malls={malls} mode={mode}/>
        </Modal>
      )}
      {showAbsenceForm&&selectedWorker&&(
        <Modal title="הוספת היעדרות" onClose={()=>setShowAbsenceForm(false)}>
          <AbsenceForm worker={selectedWorker} onSave={async f=>{await onAddAbsence(f);setShowAbsenceForm(false);}} onClose={()=>setShowAbsenceForm(false)}/>
        </Modal>
      )}
      {editVisit&&(
        <Modal title="עריכת ביקור" onClose={()=>setEditVisit(null)}>
          <VisitForm worker={{id:editVisit.workerId,name:editVisit.workerName}} onSave={async f=>{await onUpdateVisit(editVisit.id,{...f,mode});setEditVisit(null);}} onClose={()=>setEditVisit(null)} visitTypes={visitTypes} cities={cities} malls={malls} mode={mode} existing={editVisit}/>
          <div style={{textAlign:"center",marginTop:8}}><button className="btn-danger" onClick={async()=>{await onDeleteVisit(editVisit.id);setEditVisit(null);}}>מחק ביקור</button></div>
        </Modal>
      )}
    </div>
  );
}

// ─── Heat Map ──────────────────────────────────────────────────────────────────
function HeatMapTab({ workers, visits }) {
  const getCount = (wid,mode) => [...new Set(visits.filter(v=>v.workerId===wid&&v.mode===mode).map(v=>`${v.date}|${v.mall}|${v.brand}`))].length;
  return (
    <div className="tab-content">
      <h2 className="section-title">מפת חום – תכנון מול ביצוע</h2>
      <table className="data-table">
        <thead><tr><th>עובד</th><th>מתוכנן</th><th>בפועל</th><th>אחוז ביצוע</th><th>חיווי</th></tr></thead>
        <tbody>
          {workers.map(w=>{
            const p=getCount(w.id,"planned"),a=getCount(w.id,"actual");
            const pct=p===0?0:Math.round((a/p)*100);
            const color=pct>=90?"#16A34A":pct>=60?"#D97706":"#DC2626";
            return <tr key={w.id}><td>{w.name}</td><td>{p}</td><td>{a}</td><td><div className="progress-bar-wrap"><div className="progress-bar" style={{width:`${Math.min(pct,100)}%`,background:color}}/><span>{pct}%</span></div></td><td><span className="status-dot" style={{background:color}}/> {pct>=90?"תקין":pct>=60?"חלקי":"נמוך"}</td></tr>;
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Admin Tab ─────────────────────────────────────────────────────────────────
// Malls store their brands list directly → brand = the "branch"
function AdminTab({ visitTypes, cities, malls, brands }) {
  const [activeSection, setActiveSection] = useState("visitTypes");

  // Visit Types
  const [vtForm, setVtForm] = useState("");
  const addVT = async () => { if(!vtForm.trim())return; await addDoc(collection(db,"visitTypes"),{name:vtForm.trim()}); setVtForm(""); };
  const removeVT = async (id) => { if(confirm("למחוק?")) await deleteDoc(doc(db,"visitTypes",id)); };

  // Brands (global list)
  const [brandForm, setBrandForm] = useState("");
  const addBrand = async () => { if(!brandForm.trim())return; await addDoc(collection(db,"brands"),{name:brandForm.trim()}); setBrandForm(""); };
  const removeBrand = async (id) => { if(confirm("למחוק?")) await deleteDoc(doc(db,"brands",id)); };

  // Cities
  const [cityForm, setCityForm] = useState("");
  const addCity = async () => { if(!cityForm.trim())return; await addDoc(collection(db,"cities"),{name:cityForm.trim()}); setCityForm(""); };
  const removeCity = async (id) => { if(confirm("למחוק?")) await deleteDoc(doc(db,"cities",id)); };

  // Malls with brand checkboxes
  const [mallForm, setMallForm] = useState({name:"",city:"",brands:[]});
  const [editMall, setEditMall] = useState(null); // for editing brands in existing mall
  const [editMallBrands, setEditMallBrands] = useState([]);

  const toggleFormBrand = (name) => setMallForm(p=>({...p,brands:p.brands.includes(name)?p.brands.filter(b=>b!==name):[...p.brands,name]}));
  const addMall = async () => { if(!mallForm.name||!mallForm.city)return; await addDoc(collection(db,"malls"),mallForm); setMallForm({name:"",city:"",brands:[]}); };
  const removeMall = async (id) => { if(confirm("למחוק?")) await deleteDoc(doc(db,"malls",id)); };
  const startEditMall = (m) => { setEditMall(m); setEditMallBrands(m.brands||[]); };
  const saveEditMall = async () => { await updateDoc(doc(db,"malls",editMall.id),{brands:editMallBrands}); setEditMall(null); };
  const toggleEditBrand = (name) => setEditMallBrands(p=>p.includes(name)?p.filter(b=>b!==name):[...p,name]);

  const sections = [{key:"visitTypes",label:"מהות ביקור"},{key:"brands",label:"מותגים"},{key:"cities",label:"ערים"},{key:"malls",label:"קניונים"}];

  return (
    <div className="tab-content">
      <h2 className="section-title">ניהול רשימות – אדמין</h2>
      <div className="admin-tabs">{sections.map(s=><button key={s.key} className={activeSection===s.key?"admin-tab active":"admin-tab"} onClick={()=>setActiveSection(s.key)}>{s.label}</button>)}</div>

      {activeSection==="visitTypes"&&(
        <div className="admin-section"><h3>מהות ביקור</h3>
          <div className="add-row"><input value={vtForm} onChange={e=>setVtForm(e.target.value)} className="input" placeholder="שם מהות ביקור" onKeyDown={e=>e.key==="Enter"&&addVT()}/><button className="btn-primary" onClick={addVT}>הוסף</button></div>
          <ul className="admin-list">{visitTypes.map(t=><li key={t.id}>{t.name}<button className="btn-icon" onClick={()=>removeVT(t.id)}>🗑️</button></li>)}</ul>
        </div>
      )}

      {activeSection==="brands"&&(
        <div className="admin-section"><h3>מותגים</h3>
          <div className="add-row"><input value={brandForm} onChange={e=>setBrandForm(e.target.value)} className="input" placeholder="שם מותג" onKeyDown={e=>e.key==="Enter"&&addBrand()}/><button className="btn-primary" onClick={addBrand}>הוסף</button></div>
          <ul className="admin-list">{brands.map(b=><li key={b.id}>{b.name}<button className="btn-icon" onClick={()=>removeBrand(b.id)}>🗑️</button></li>)}</ul>
        </div>
      )}

      {activeSection==="cities"&&(
        <div className="admin-section"><h3>ערים</h3>
          <div className="add-row"><input value={cityForm} onChange={e=>setCityForm(e.target.value)} className="input" placeholder="שם עיר" onKeyDown={e=>e.key==="Enter"&&addCity()}/><button className="btn-primary" onClick={addCity}>הוסף</button></div>
          <ul className="admin-list">{cities.map(c=><li key={c.id}>{c.name}<button className="btn-icon" onClick={()=>removeCity(c.id)}>🗑️</button></li>)}</ul>
        </div>
      )}

      {activeSection==="malls"&&(
        <div className="admin-section">
          <h3>קניונים</h3>
          <div className="mall-form-box">
            <div className="add-row">
              <input value={mallForm.name} onChange={e=>setMallForm(p=>({...p,name:e.target.value}))} className="input" placeholder="שם קניון"/>
              <select value={mallForm.city} onChange={e=>setMallForm(p=>({...p,city:e.target.value}))} className="input">
                <option value="">בחר עיר</option>
                {cities.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {brands.length>0&&(
              <div className="brands-in-mall">
                <label className="brands-label">מותגים בקניון זה:</label>
                <MultiChips options={brands.map(b=>b.name)} selected={mallForm.brands} onChange={v=>setMallForm(p=>({...p,brands:v}))}/>
              </div>
            )}
            <button className="btn-primary" onClick={addMall}>הוסף קניון</button>
          </div>

          {/* Edit modal for mall brands */}
          {editMall&&(
            <Modal title={`עריכת מותגים – ${editMall.name}`} onClose={()=>setEditMall(null)}>
              <div className="form-grid">
                <div className="form-row">
                  <label className="brands-label">מותגים בקניון:</label>
                  <MultiChips options={brands.map(b=>b.name)} selected={editMallBrands} onChange={setEditMallBrands}/>
                </div>
                <div className="form-actions"><button className="btn-primary" onClick={saveEditMall}>שמור</button><button className="btn-secondary" onClick={()=>setEditMall(null)}>ביטול</button></div>
              </div>
            </Modal>
          )}

          <table className="data-table" style={{marginTop:16}}>
            <thead><tr><th>קניון</th><th>עיר</th><th>מותגים</th><th>פעולות</th></tr></thead>
            <tbody>
              {malls.map(m=>(
                <tr key={m.id}>
                  <td>{m.name}</td><td>{m.city}</td>
                  <td>{Array.isArray(m.brands)&&m.brands.length>0?m.brands.join(", "):"-"}</td>
                  <td>
                    <button className="btn-icon" title="עריכת מותגים" onClick={()=>startEditMall(m)}>✏️</button>
                    <button className="btn-icon" onClick={()=>removeMall(m.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Reports Tab ───────────────────────────────────────────────────────────────
function ReportsTab({ visits, absences, workers, visitTypes, malls, clockEvents }) {
  const [from, setFrom] = useState(getMonthStart());
  const [to, setTo] = useState(today());
  const [activeReport, setActiveReport] = useState("summary");

  const filtered = visits.filter(v=>v.date>=from&&v.date<=to);
  const filtAbs = absences.filter(a=>a.date>=from&&a.date<=to);

  const exportToExcel = (data,fileName) => { const ws=XLSX.utils.json_to_sheet(data); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"דוח"); XLSX.utils.writeFile(wb,`${fileName}.xlsx`); };

  const summaryData = filtered.map(v=>({ עובד:v.workerName, תאריך:v.date, עיר:v.city, קניון:v.mall, מותג:v.brand||"", "מהות ביקור":(Array.isArray(v.visitTypes)?v.visitTypes:(v.visitType?[v.visitType]:[])).join(", "), "מתוכנן/לא מתוכנן":v.isUnplanned?"לא מתוכנן":"מתוכנן", "תקלה טופלה":v.resolved?"כן":"לא", הערות:v.notes||"", סוג:v.mode==="planned"?"תכנון":"בפועל" }));
  const absenceData = filtAbs.map(a=>({ עובד:a.workerName, תאריך:a.date, "סוג היעדרות":a.absenceType, הערות:a.notes||"" }));

  // Indicator – did worker visit all brands in each mall they visited?
  const indicatorData = [];
  const actualVisits = filtered.filter(v=>v.mode==="actual");
  workers.forEach(w=>{
    const wv=actualVisits.filter(v=>v.workerId===w.id);
    const mallsVisited=[...new Set(wv.map(v=>v.mall))];
    mallsVisited.forEach(mallName=>{
      const mallDef=malls.find(m=>m.name===mallName);
      const expectedBrands=mallDef?.brands||[];
      const visitedBrands=[...new Set(wv.filter(v=>v.mall===mallName).map(v=>v.brand))];
      const missingBrands=expectedBrands.filter(b=>!visitedBrands.includes(b));
      indicatorData.push({ עובד:w.name, קניון:mallName, "מותגים צפויים":expectedBrands.length, "מותגים שבוקרו":visitedBrands.length, "מותגים חסרים":missingBrands.join(", ")||"אין", סטטוס:missingBrands.length===0?"✅ מלא":"⚠️ חלקי" });
    });
  });

  const clockData = clockEvents.filter(c=>c.date>=from&&c.date<=to).map(c=>({ עובד:workers.find(w=>w.id===c.workerId)?.name||c.workerId, תאריך:c.date, כניסה:formatTime(c.checkIn), יציאה:formatTime(c.checkOut), "שעות עבודה":c.checkIn&&c.checkOut?`${((c.checkOut-c.checkIn)/3600000).toFixed(1)}ש'`:"-" }));

  // Charts
  const typeCount={};
  filtered.forEach(v=>{const ts=Array.isArray(v.visitTypes)?v.visitTypes:(v.visitType?[v.visitType]:[]);ts.forEach(t=>{typeCount[t]=(typeCount[t]||0)+1;});});
  const byType=Object.entries(typeCount).map(([name,value])=>({name,value})).filter(x=>x.value>0);
  const brandCount={};
  filtered.forEach(v=>{if(v.brand)brandCount[v.brand]=(brandCount[v.brand]||0)+1;});
  const byBrand=Object.entries(brandCount).map(([name,value])=>({name,value})).filter(x=>x.value>0);
  const planned=filtered.filter(v=>!v.isUnplanned).length, unplanned=filtered.filter(v=>v.isUnplanned).length;
  const top5=Object.entries(brandCount).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,value])=>({name,value}));

  const reportTabs=[{key:"summary",label:"סיכום ביקורים"},{key:"absences",label:"היעדרויות"},{key:"charts",label:"גרפים"},{key:"indicator",label:"דוח חיווי"},{key:"clock",label:"שעות נוכחות"}];

  return (
    <div className="tab-content">
      <h2 className="section-title">דוחות</h2>
      <div className="report-filters">
        <label>מתאריך <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="input small"/></label>
        <label>עד תאריך <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="input small"/></label>
      </div>
      <div className="admin-tabs">{reportTabs.map(r=><button key={r.key} className={activeReport===r.key?"admin-tab active":"admin-tab"} onClick={()=>setActiveReport(r.key)}>{r.label}</button>)}</div>

      {activeReport==="summary"&&<div><div className="export-row"><button className="btn-secondary" onClick={()=>exportToExcel(summaryData,"דוח_ביקורים")}>📥 ייצוא לאקסל</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>עובד</th><th>תאריך</th><th>קניון</th><th>מותג</th><th>מהות ביקור</th><th>תכנון/פועל</th><th>טופלה</th><th>הערות</th></tr></thead><tbody>{summaryData.map((r,i)=><tr key={i}><td>{r["עובד"]}</td><td>{r["תאריך"]}</td><td>{r["קניון"]}</td><td>{r["מותג"]||"-"}</td><td>{r["מהות ביקור"]}</td><td>{r["מתוכנן/לא מתוכנן"]}</td><td>{r["תקלה טופלה"]}</td><td>{r["הערות"]}</td></tr>)}{summaryData.length===0&&<tr><td colSpan={8} className="empty-row">אין נתונים בטווח זה</td></tr>}</tbody></table></div></div>}

      {activeReport==="absences"&&<div><div className="export-row"><button className="btn-secondary" onClick={()=>exportToExcel(absenceData,"דוח_היעדרויות")}>📥 ייצוא לאקסל</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>עובד</th><th>תאריך</th><th>סוג היעדרות</th><th>הערות</th></tr></thead><tbody>{absenceData.map((r,i)=><tr key={i}><td>{r["עובד"]}</td><td>{r["תאריך"]}</td><td>{r["סוג היעדרות"]}</td><td>{r["הערות"]}</td></tr>)}{absenceData.length===0&&<tr><td colSpan={4} className="empty-row">אין נתונים בטווח זה</td></tr>}</tbody></table></div></div>}

      {activeReport==="charts"&&(
        <div className="charts-grid">
          <PieChartCard title="מהות ביקורים" data={byType}/>
          <PieChartCard title="ביקורים לפי מותג" data={byBrand}/>
          <PieChartCard title="מתוכנן / לא מתוכנן" data={[{name:"מתוכנן",value:planned},{name:"לא מתוכנן",value:unplanned}].filter(x=>x.value>0)}/>
          <div className="chart-card full-width"><h3>טופ 5 מותגים</h3>{top5.length>0?<ResponsiveContainer width="100%" height={240}><BarChart data={top5} layout="vertical" margin={{top:5,right:30,bottom:5,left:10}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis type="category" dataKey="name" width={150} tick={{fontSize:12}}/><Tooltip/><Bar dataKey="value" fill="#2563EB" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>:<div className="empty-chart">אין נתונים</div>}</div>
        </div>
      )}

      {activeReport==="indicator"&&<div><div className="export-row"><button className="btn-secondary" onClick={()=>exportToExcel(indicatorData,"דוח_חיווי")}>📥 ייצוא לאקסל</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>עובד</th><th>קניון</th><th>מותגים צפויים</th><th>בוקרו</th><th>מותגים חסרים</th><th>סטטוס</th></tr></thead><tbody>{indicatorData.map((r,i)=><tr key={i}><td>{r["עובד"]}</td><td>{r["קניון"]}</td><td>{r["מותגים צפויים"]}</td><td>{r["מותגים שבוקרו"]}</td><td>{r["מותגים חסרים"]}</td><td>{r["סטטוס"]}</td></tr>)}{indicatorData.length===0&&<tr><td colSpan={6} className="empty-row">אין נתונים בטווח זה</td></tr>}</tbody></table></div></div>}

      {activeReport==="clock"&&<div><div className="export-row"><button className="btn-secondary" onClick={()=>exportToExcel(clockData,"דוח_נוכחות")}>📥 ייצוא לאקסל</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>עובד</th><th>תאריך</th><th>כניסה</th><th>יציאה</th><th>שעות</th></tr></thead><tbody>{clockData.map((r,i)=><tr key={i}><td>{r["עובד"]}</td><td>{r["תאריך"]}</td><td>{r["כניסה"]}</td><td>{r["יציאה"]}</td><td>{r["שעות עבודה"]}</td></tr>)}{clockData.length===0&&<tr><td colSpan={5} className="empty-row">אין נתונים בטווח זה</td></tr>}</tbody></table></div></div>}
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [workers, setWorkers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [visitTypes, setVisitTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [cities, setCities] = useState([]);
  const [malls, setMalls] = useState([]);
  const [clockEvents, setClockEvents] = useState([]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db,"workers"),s=>setWorkers(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"visits"),s=>setVisits(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"absences"),s=>setAbsences(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"visitTypes"),s=>setVisitTypes(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"brands"),s=>setBrands(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"cities"),s=>setCities(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"malls"),s=>setMalls(s.docs.map(d=>({id:d.id,...d.data()})))),
      onSnapshot(collection(db,"clockEvents"),s=>setClockEvents(s.docs.map(d=>({id:d.id,...d.data()})))),
    ];
    return ()=>unsubs.forEach(u=>u());
  }, []);

  const addVisit = async f => await addDoc(collection(db,"visits"),{...f,createdAt:Date.now()});
  const updateVisit = async (id,f) => await updateDoc(doc(db,"visits",id),f);
  const deleteVisit = async id => await deleteDoc(doc(db,"visits",id));
  const addAbsence = async f => await addDoc(collection(db,"absences"),{...f,createdAt:Date.now()});
  const deleteAbsence = async id => await deleteDoc(doc(db,"absences",id));
  const handleClock = async (wid,date,dir) => {
    const ex=clockEvents.find(c=>c.workerId===wid&&c.date===date);
    if(!ex) await addDoc(collection(db,"clockEvents"),{workerId:wid,date,checkIn:Date.now(),checkOut:null});
    else if(dir==="out") await updateDoc(doc(db,"clockEvents",ex.id),{checkOut:Date.now()});
  };

  const tabs=[{key:"dashboard",label:"דאשבורד"},{key:"workers",label:"אנשי שטח"},{key:"planned",label:"תכנון שבועי"},{key:"actual",label:"ביקורים בפועל"},{key:"heatmap",label:"מפת חום"},{key:"reports",label:"דוחות"},{key:"admin",label:"אדמין"}];
  const sp={workers,visits,absences,visitTypes,cities,malls,clockEvents,brands,onAddVisit:addVisit,onUpdateVisit:updateVisit,onDeleteVisit:deleteVisit,onAddAbsence:addAbsence,onDeleteAbsence:deleteAbsence,onClock:handleClock};

  return (
    <div className="app" dir="rtl">
      <header className="app-header">
        <div className="header-logo"><span className="logo-icon">🏢</span><span className="logo-text">ניהול תפעול שטח</span></div>
        <nav className="app-nav">{tabs.map(t=><button key={t.key} className={tab===t.key?"nav-tab active":"nav-tab"} onClick={()=>setTab(t.key)}>{t.label}</button>)}</nav>
      </header>
      <main className="app-main">
        {tab==="dashboard"&&<DashboardTab visits={visits} absences={absences} visitTypes={visitTypes}/>}
        {tab==="workers"&&<WorkersTab workers={workers}/>}
        {tab==="planned"&&<VisitsTab mode="planned" {...sp}/>}
        {tab==="actual"&&<VisitsTab mode="actual" {...sp}/>}
        {tab==="heatmap"&&<HeatMapTab workers={workers} visits={visits}/>}
        {tab==="reports"&&<ReportsTab visits={visits} absences={absences} workers={workers} visitTypes={visitTypes} malls={malls} clockEvents={clockEvents}/>}
        {tab==="admin"&&<AdminTab visitTypes={visitTypes} cities={cities} malls={malls} brands={brands}/>}
      </main>
    </div>
  );
}
