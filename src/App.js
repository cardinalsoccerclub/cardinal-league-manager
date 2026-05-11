import React, { useState, useEffect } from "react";

/* ─── STORAGE ─────────────────────────────────────────────── */
const load = async (k) => {
  try { return JSON.parse((await window.storage.get(k)).value); }
  catch { return null; }
};
const save = async (k, v) => {
  try { await window.storage.set(k, JSON.stringify(v)); }
  catch (e) { console.error("Storage error:", e); }
};
const uid = () => Math.random().toString(36).slice(2, 9);

/* ─── CONSTANTS ───────────────────────────────────────────── */
const AGE_GROUPS = ["U6", "U8", "U10"];
const FORMAT_MAP  = { U6: "4v4", U8: "4v4", U10: "7v7" };
const DAY_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const C = {
  red:"#C8102E", redHover:"#A80D24", navy:"#0D1B2A",
  gold:"#E8B400", bg:"#F2F4F7", white:"#fff",
  border:"#DDE2EC", muted:"#8492A6", text:"#1B2533",
  sub:"#4A5568", success:"#10B981", warn:"#F59E0B", danger:"#EF4444",
};

/* ─── TIME HELPERS ────────────────────────────────────────── */
function timeToMin(t) {
  if (!t) return -1;
  const m = t.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!m) return -1;
  let [, h, min, p] = m; h = parseInt(h); min = parseInt(min);
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}
// Returns true if a 60-min practice starting at `practiceTime` overlaps a blocked window
function practiceOverlapsBlock(practiceTime, block) {
  if (block.type === "full" || !block.startTime) return true; // full-day block
  const ps = timeToMin(practiceTime), pe = ps + 60;
  const bs = timeToMin(block.startTime), be = timeToMin(block.endTime);
  return ps < be && pe > bs;
}

/* ─── ROUND-ROBIN ALGORITHM ───────────────────────────────── */
function roundRobin(teams) {
  const arr = [...teams];
  if (arr.length % 2) arr.push(null);
  const n = arr.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++)
      if (arr[i] && arr[n - 1 - i]) pairs.push([arr[i], arr[n - 1 - i]]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  return rounds;
}

function gameDates(start, end, dayNums) {
  const dates = [], cur = new Date(start + "T12:00:00"), fin = new Date(end + "T12:00:00");
  while (cur <= fin) {
    if (dayNums.includes(cur.getDay()))
      dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/* ─── SEED DATA ───────────────────────────────────────────── */
function buildSeed() {
  return {
    users:  [{ id:"admin", name:"League Admin", role:"admin", pin:"0000" }],
    teams:  [
      { id:uid(), name:"Red Cardinals",   ageGroup:"U6",  coachName:"Coach Smith",    pin:"1111" },
      { id:uid(), name:"Blue Jays",        ageGroup:"U6",  coachName:"Coach Jones",    pin:"2222" },
      { id:uid(), name:"Green Hawks",      ageGroup:"U6",  coachName:"Coach Davis",    pin:"3333" },
      { id:uid(), name:"Yellow Finches",   ageGroup:"U8",  coachName:"Coach Wilson",   pin:"4444" },
      { id:uid(), name:"Purple Martins",   ageGroup:"U8",  coachName:"Coach Brown",    pin:"5555" },
      { id:uid(), name:"Silver Eagles",    ageGroup:"U10", coachName:"Coach Moore",    pin:"7777" },
      { id:uid(), name:"Gold Falcons",     ageGroup:"U10", coachName:"Coach Anderson", pin:"8888" },
    ],
    fields: [
      { id:uid(), name:"Cardinal Field A",   location:"Mentor Sports Park",  types:["4v4","7v7"] },
      { id:uid(), name:"Cardinal Field B",   location:"Mentor Sports Park",  types:["4v4","7v7"] },
      { id:uid(), name:"Cardinal Field C",   location:"Mentor Sports Park",  types:["4v4","7v7","9v9"] },
      { id:uid(), name:"Wildwood Field 1",   location:"Wildwood Park",       types:["4v4","7v7"] },
      { id:uid(), name:"Wildwood Field 2",   location:"Wildwood Park",       types:["4v4","7v7"] },
      { id:uid(), name:"Mentor HS Field",    location:"Mentor High School",  types:["9v9","11v11"] },
      { id:uid(), name:"Lake Shore Field",   location:"Lake Shore Park",     types:["4v4","7v7"] },
      { id:uid(), name:"Civic Center A",     location:"Civic Center",        types:["4v4"] },
      { id:uid(), name:"Civic Center B",     location:"Civic Center",        types:["4v4"] },
      { id:uid(), name:"Community Park",     location:"Community Park",      types:["4v4","7v7"] },
    ],
    games:     [],
    blocked:   [],
    practices: [],
  };
}

/* ═══════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════ */
export default function App() {
  const [ready,     setReady]     = useState(false);
  const [user,      setUser]      = useState(null);
  const [teams,     setTeams]     = useState([]);
  const [fields,    setFields]    = useState([]);
  const [games,     setGames]     = useState([]);
  const [blocked,   setBlocked]   = useState([]);
  const [users,     setUsers]     = useState([]);
  const [practices, setPractices] = useState([]);

  /* Initial load */
  useEffect(() => {
    (async () => {
      let u = await load("csc:users"),  t = await load("csc:teams"),
          f = await load("csc:fields"), g = await load("csc:games"),
          b = await load("csc:blocked"), p = await load("csc:practices");
      if (!u) {
        const s = buildSeed();
        await save("csc:users",     s.users);     await save("csc:teams",     s.teams);
        await save("csc:fields",    s.fields);    await save("csc:games",     s.games);
        await save("csc:blocked",   s.blocked);   await save("csc:practices", s.practices);
        [u, t, f, g, b, p] = [s.users, s.teams, s.fields, s.games, s.blocked, s.practices];
      }
      setUsers(u||[]); setTeams(t||[]); setFields(f||[]); setGames(g||[]);
      setBlocked(b||[]); setPractices(p||[]);
      setReady(true);
    })();
  }, []);

  const upTeams     = async v => { setTeams(v);     await save("csc:teams",     v); };
  const upFields    = async v => { setFields(v);    await save("csc:fields",    v); };
  const upGames     = async v => { setGames(v);     await save("csc:games",     v); };
  const upBlocked   = async v => { setBlocked(v);   await save("csc:blocked",   v); };
  const upUsers     = async v => { setUsers(v);     await save("csc:users",     v); };
  const upPractices = async v => { setPractices(v); await save("csc:practices", v); };

  if (!ready) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:C.navy, flexDirection:"column", gap:16 }}>
      <GFont />
      <div style={{ fontSize:48 }}>⚽</div>
      <div style={{ color:C.white, fontFamily:"Oswald,sans-serif", fontSize:18, letterSpacing:2 }}>
        LOADING CARDINAL SC…
      </div>
    </div>
  );

  const common = { teams, fields, games, blocked, users, practices,
                   upTeams, upFields, upGames, upBlocked, upUsers, upPractices };

  if (!user) return <LoginScreen {...common} onLogin={setUser} />;
  if (user.role === "admin") return <AdminDashboard {...common} user={user} onLogout={() => setUser(null)} />;
  return <CoachDashboard {...common} user={user} onLogout={() => setUser(null)} />;
}

/* ═══════════════════════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════════════════════ */
function LoginScreen({ users, teams, onLogin }) {
  const [pin,   setPin]   = useState("");
  const [error, setError] = useState("");

  const attempt = () => {
    const admin = users.find(u => u.role === "admin" && u.pin === pin);
    if (admin) { onLogin(admin); return; }
    const team = teams.find(t => t.pin === pin);
    if (team) {
      onLogin({ id:"coach-"+team.id, name:team.coachName||"Coach", role:"coach",
                teamId:team.id, teamName:team.name, ageGroup:team.ageGroup });
      return;
    }
    setError("Invalid PIN. Please try again.");
    setPin("");
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:`radial-gradient(ellipse at 60% 40%, #1a2f4a 0%, ${C.navy} 70%)`, fontFamily:"DM Sans,sans-serif" }}>
      <GFont />
      {/* decorative bg circles */}
      <div style={{ position:"fixed", width:600, height:600, borderRadius:"50%",
        background:"rgba(200,16,46,0.06)", top:-200, right:-200, pointerEvents:"none" }} />
      <div style={{ position:"fixed", width:400, height:400, borderRadius:"50%",
        background:"rgba(200,16,46,0.04)", bottom:-100, left:-100, pointerEvents:"none" }} />

      <div style={{ background:C.white, borderRadius:20, padding:"48px 44px", width:400,
        boxShadow:"0 32px 80px rgba(0,0,0,0.45)", position:"relative" }}>
        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:72, height:72, borderRadius:"50%", background:C.red,
            display:"flex", alignItems:"center", justifyContent:"center",
            margin:"0 auto 16px", fontSize:32, boxShadow:`0 8px 24px rgba(200,16,46,0.4)` }}>⚽</div>
          <div style={{ fontFamily:"Oswald,sans-serif", fontSize:11, fontWeight:700,
            letterSpacing:4, color:C.gold, marginBottom:6 }}>MENTOR, OHIO</div>
          <h1 style={{ fontFamily:"Oswald,sans-serif", fontSize:28, fontWeight:700,
            color:C.navy, margin:"0 0 6px", lineHeight:1 }}>CARDINAL SOCCER</h1>
          <p style={{ color:C.muted, fontSize:14, margin:0 }}>League Management System</p>
        </div>

        {/* PIN input */}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.text,
            letterSpacing:1, marginBottom:10 }}>ENTER YOUR PIN</label>
          <input
            type="password" value={pin} autoFocus
            onChange={e => { setPin(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && attempt()}
            placeholder="••••"
            style={{ width:"100%", padding:"16px", fontSize:24, letterSpacing:10,
              border:`2px solid ${error ? C.danger : C.border}`, borderRadius:12,
              outline:"none", textAlign:"center", boxSizing:"border-box",
              transition:"border-color 0.15s", fontFamily:"monospace" }}
          />
          {error && (
            <div style={{ color:C.danger, fontSize:13, marginTop:8, textAlign:"center" }}>{error}</div>
          )}
        </div>

        <button onClick={attempt} style={{ width:"100%", padding:"15px", background:C.red,
          color:C.white, border:"none", borderRadius:12, fontSize:16, fontWeight:700,
          fontFamily:"Oswald,sans-serif", letterSpacing:2, cursor:"pointer",
          boxShadow:`0 4px 16px rgba(200,16,46,0.35)`, transition:"all 0.15s" }}>
          SIGN IN →
        </button>

        <div style={{ marginTop:20, padding:"12px 14px", background:"#F8F9FA",
          border:"1px solid #E8ECF0", borderRadius:10, fontSize:12, color:C.muted, lineHeight:1.8 }}>
          <strong style={{ color:C.text }}>Demo PINs —</strong><br/>
          Admin: <code style={pill}>0000</code>&nbsp;
          U6: <code style={pill}>1111</code> <code style={pill}>2222</code> <code style={pill}>3333</code>&nbsp;
          U8: <code style={pill}>4444</code> <code style={pill}>5555</code>&nbsp;
          U10: <code style={pill}>7777</code> <code style={pill}>8888</code>
        </div>
      </div>
    </div>
  );
}
const pill = { background:"#E8ECF0", padding:"1px 6px", borderRadius:4, fontFamily:"monospace", fontSize:11 };

/* ═══════════════════════════════════════════════════════════
   ADMIN DASHBOARD
═══════════════════════════════════════════════════════════ */
function AdminDashboard(props) {
  const { onLogout, teams, fields, games, practices } = props;
  const [tab, setTab] = useState("teams");

  const NAV = [
    { id:"teams",     icon:"👥", label:"Teams" },
    { id:"fields",    icon:"🏟️", label:"Fields" },
    { id:"schedule",  icon:"📅", label:"Schedule" },
    { id:"generator", icon:"⚡", label:"Generator" },
    { id:"practices", icon:"🏃", label:"Practices" },
  ];

  const stats = [
    { label:"Teams",     value:teams.length },
    { label:"Fields",    value:fields.length },
    { label:"Games",     value:games.length },
    { label:"Practices", value:practices.length },
  ];

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"DM Sans,sans-serif", background:C.bg }}>
      <GFont />
      {/* ─ Sidebar ─ */}
      <div style={{ width:220, background:C.navy, display:"flex", flexDirection:"column", flexShrink:0,
        boxShadow:"4px 0 20px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:"50%", background:C.red,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18,
              flexShrink:0 }}>⚽</div>
            <div>
              <div style={{ fontFamily:"Oswald,sans-serif", color:C.white, fontWeight:600, fontSize:14 }}>CARDINAL SC</div>
              <div style={{ color:C.gold, fontSize:11, fontWeight:600, letterSpacing:1 }}>ADMIN PANEL</div>
            </div>
          </div>
        </div>

        <nav style={{ flex:1, padding:"14px 10px" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
              background: tab===n.id ? C.red : "transparent",
              color: tab===n.id ? C.white : "rgba(255,255,255,0.55)",
              border:"none", borderRadius:8, fontSize:14, fontWeight:500,
              cursor:"pointer", marginBottom:3, textAlign:"left",
              boxShadow: tab===n.id ? "0 2px 8px rgba(200,16,46,0.4)" : "none",
              transition:"all 0.15s",
            }}><span style={{ fontSize:16 }}>{n.icon}</span>{n.label}</button>
          ))}
        </nav>

        {/* Stats pills */}
        <div style={{ padding:"14px 14px", borderTop:"1px solid rgba(255,255,255,0.07)", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          {stats.map(s => (
            <div key={s.label} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:12 }}>
              <span style={{ color:"rgba(255,255,255,0.4)" }}>{s.label}</span>
              <span style={{ color:C.white, fontWeight:600 }}>{s.value}</span>
            </div>
          ))}
        </div>

        <div style={{ padding:"12px 10px" }}>
          <button onClick={onLogout} style={{ width:"100%", padding:"9px", background:"rgba(255,255,255,0.06)",
            color:"rgba(255,255,255,0.5)", border:"none", borderRadius:8, fontSize:13, cursor:"pointer" }}>
            ← Sign Out
          </button>
        </div>
      </div>

      {/* ─ Content ─ */}
      <div style={{ flex:1, overflow:"auto", padding:28 }}>
        {tab==="teams"     && <TeamsManager    {...props} />}
        {tab==="fields"    && <FieldsManager   {...props} />}
        {tab==="schedule"  && <ScheduleViewer  {...props} />}
        {tab==="generator" && <ScheduleGenerator {...props} onDone={() => setTab("schedule")} />}
        {tab==="practices" && <PracticesAdmin  {...props} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TEAMS MANAGER
═══════════════════════════════════════════════════════════ */
function TeamsManager({ teams, upTeams }) {
  const [modal,  setModal]  = useState(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = teams
    .filter(t => filter==="All" || t.ageGroup===filter)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
                 t.coachName.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async (team) => {
    await upTeams(team.id
      ? teams.map(t => t.id===team.id ? team : t)
      : [...teams, { ...team, id:uid() }]);
    setModal(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this team? Their scheduled games will remain."))
      await upTeams(teams.filter(t => t.id !== id));
  };

  return (
    <div>
      <PageHeader title="Teams" subtitle={`${teams.length} teams · ${AGE_GROUPS.join(" · ")}`}
        action={<Btn onClick={() => setModal({})}>＋ Add Team</Btn>} />

      {/* Filter bar */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        {["All",...AGE_GROUPS].map(g => (
          <Chip key={g} active={filter===g} onClick={() => setFilter(g)}>{g}</Chip>
        ))}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teams…"
          style={{ marginLeft:"auto", padding:"7px 14px", border:`1px solid ${C.border}`,
            borderRadius:20, fontSize:13, outline:"none", width:180, fontFamily:"DM Sans,sans-serif" }} />
      </div>

      {/* Team cards by age group */}
      {AGE_GROUPS.map(ag => {
        const grp = filtered.filter(t => t.ageGroup===ag);
        if (!grp.length) return null;
        return (
          <div key={ag} style={{ marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <span style={{ background:C.red, color:C.white, fontFamily:"Oswald,sans-serif",
                fontWeight:600, fontSize:12, padding:"3px 10px", borderRadius:4, letterSpacing:1 }}>{ag}</span>
              <span style={{ fontSize:13, color:C.muted }}>
                {grp.length} team{grp.length!==1?"s":""} · {FORMAT_MAP[ag]} format
              </span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
              {grp.map(team => (
                <div key={team.id} style={{ background:C.white, borderRadius:12, padding:"18px",
                  border:`1px solid ${C.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.05)",
                  transition:"box-shadow 0.15s" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:C.text }}>{team.name}</div>
                      <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>
                        🧑‍💼 {team.coachName||"No coach assigned"}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      <IconBtn onClick={() => setModal(team)} title="Edit">✏️</IconBtn>
                      <IconBtn onClick={() => handleDelete(team.id)} title="Delete">🗑️</IconBtn>
                    </div>
                  </div>
                  <div style={{ marginTop:12, paddingTop:12, borderTop:`1px solid ${C.border}`,
                    display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.muted }}>
                      PIN:&nbsp;<code style={{ background:C.bg, padding:"2px 7px", borderRadius:5,
                        fontFamily:"monospace", fontSize:13, color:C.text }}>{team.pin}</code>
                    </span>
                    <span style={{ fontSize:11, background:"#EEF2FF", color:"#4F46E5",
                      padding:"2px 8px", borderRadius:12, fontWeight:600 }}>{FORMAT_MAP[ag]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length===0 && <EmptyState icon="👥" msg="No teams found. Add your first team!" />}

      {modal!==null && (
        <Modal title={modal.id ? "Edit Team" : "Add Team"} onClose={() => setModal(null)}>
          <TeamForm initial={modal} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function TeamForm({ initial, onSave, onClose }) {
  const [v, setV] = useState({ name:"", ageGroup:"U6", coachName:"", pin:"", ...initial });
  const set = k => e => setV(p => ({...p, [k]:e.target.value}));
  const valid = v.name.trim() && v.coachName.trim() && v.pin.trim().length >= 4;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <FInput label="Team Name"   value={v.name}      onChange={set("name")}      placeholder="e.g. Red Cardinals" />
      <div>
        <Label>AGE GROUP</Label>
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          {AGE_GROUPS.map(g => (
            <button key={g} onClick={() => setV(p=>({...p,ageGroup:g}))} style={{
              flex:1, padding:"9px", border:`1px solid ${v.ageGroup===g?C.red:C.border}`,
              background:v.ageGroup===g?C.red:C.white, color:v.ageGroup===g?C.white:C.sub,
              borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer"
            }}>{g}</button>
          ))}
        </div>
      </div>
      <FInput label="Coach Name"  value={v.coachName} onChange={set("coachName")} placeholder="e.g. Coach Smith" />
      <FInput label="Coach PIN (4+ digits)" value={v.pin} onChange={set("pin")} placeholder="e.g. 1234" type="text" maxLength={8} />
      <div style={{ display:"flex", gap:10, marginTop:6 }}>
        <Btn onClick={() => valid && onSave(v)} full disabled={!valid}>Save Team</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
      {!valid && <div style={{ fontSize:12, color:C.muted, textAlign:"center" }}>Fill in all fields and a PIN of at least 4 digits</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FIELDS MANAGER
═══════════════════════════════════════════════════════════ */
function FieldsManager({ fields, blocked, games, upFields, upBlocked }) {
  const [modal,    setModal]    = useState(null);
  const [blockFor, setBlockFor] = useState(null); // field id
  const [blockV,   setBlockV]   = useState({ date:"", type:"full", startTime:"", endTime:"", reason:"" });
  const [viewDate, setViewDate] = useState(new Date().toISOString().split("T")[0]);

  const handleSave = async (f) => {
    await upFields(f.id ? fields.map(x => x.id===f.id ? f : x) : [...fields, {...f, id:uid()}]);
    setModal(null);
  };
  const handleDelete = async (id) => {
    if (window.confirm("Delete this field?")) await upFields(fields.filter(f => f.id!==id));
  };
  const handleBlock = async () => {
    if (!blockV.date) return;
    if (blockV.type==="window" && (!blockV.startTime || !blockV.endTime)) return;
    const entry = { id:uid(), fieldId:blockFor, ...blockV };
    await upBlocked([...blocked, entry]);
    setBlockFor(null);
    setBlockV({ date:"", type:"full", startTime:"", endTime:"", reason:"" });
  };
  const unblock = async (id) => await upBlocked(blocked.filter(b => b.id !== id));

  const setB = k => e => setBlockV(p => ({...p, [k]:e.target.value}));

  const fmtBlock = (b) => {
    const d = new Date(b.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
    if (b.type==="window" && b.startTime && b.endTime) return `${d} · ${b.startTime}–${b.endTime}`;
    return `${d} · All Day`;
  };

  return (
    <div>
      <PageHeader title="Fields" subtitle={`${fields.length} fields configured across all locations`}
        action={<Btn onClick={() => setModal({})}>＋ Add Field</Btn>} />

      {/* Date picker for availability overview */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20,
        background:C.white, padding:"14px 18px", borderRadius:10, border:`1px solid ${C.border}` }}>
        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>📅 Check availability for:</span>
        <input type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)}
          style={{ padding:"6px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13,
            fontFamily:"DM Sans,sans-serif", outline:"none" }} />
        <span style={{ fontSize:13, color:C.muted }}>
          {new Date(viewDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
        </span>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))", gap:14 }}>
        {fields.map(field => {
          const dayBlocks  = blocked.filter(b => b.fieldId===field.id && b.date===viewDate);
          const isBlocked  = dayBlocks.some(b => b.type==="full" || !b.startTime);
          const dayGames   = games.filter(g => g.fieldId===field.id && g.date===viewDate);
          const allBlocks  = blocked.filter(b => b.fieldId===field.id)
            .sort((a,b) => a.date.localeCompare(b.date));
          const statusColor = isBlocked ? C.danger : (dayGames.length||dayBlocks.length) ? C.warn : C.success;
          const statusLabel = isBlocked ? "🚫 Blocked"
            : dayBlocks.length ? `⚠️ ${dayBlocks.length} window${dayBlocks.length>1?"s":""}`
            : dayGames.length ? `⚠️ ${dayGames.length} Game${dayGames.length>1?"s":""}` : "✅ Available";

          return (
            <div key={field.id} style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`,
              overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ padding:"14px 16px", borderBottom:`3px solid ${statusColor}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{field.name}</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>📍 {field.location}</div>
                    {field.address && (
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(field.address)}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize:11, color:"#4F46E5", marginTop:2, display:"block", textDecoration:"none" }}>
                        🗺 {field.address}
                      </a>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:4 }}>
                    <IconBtn onClick={() => setModal(field)} title="Edit">✏️</IconBtn>
                    <IconBtn onClick={() => handleDelete(field.id)} title="Delete">🗑️</IconBtn>
                  </div>
                </div>
                <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                  {field.types.map(t => (
                    <span key={t} style={{ fontSize:11, padding:"2px 7px", borderRadius:10,
                      background:"#EEF2FF", color:"#4F46E5", fontWeight:600 }}>{t}</span>
                  ))}
                  <span style={{ marginLeft:"auto", fontSize:11, padding:"3px 9px", borderRadius:10,
                    background:`${statusColor}18`, color:statusColor, fontWeight:700 }}>{statusLabel}</span>
                </div>
              </div>

              {/* Games on selected date */}
              {dayGames.length > 0 && (
                <div style={{ padding:"10px 16px", background:"#FFFBEB", borderBottom:`1px solid ${C.border}` }}>
                  {dayGames.map(g => (
                    <div key={g.id} style={{ fontSize:12, color:C.sub, padding:"3px 0" }}>
                      {g.time} — <strong>{g.homeTeamName}</strong> vs {g.awayTeamName}
                      <span style={{ marginLeft:6, background:C.red, color:"#fff",
                        fontSize:10, padding:"1px 6px", borderRadius:8 }}>{g.ageGroup}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Blocked windows on selected date */}
              {dayBlocks.length > 0 && !isBlocked && (
                <div style={{ padding:"10px 16px", background:"#FFF1F2", borderBottom:`1px solid ${C.border}` }}>
                  {dayBlocks.map(b => (
                    <div key={b.id} style={{ fontSize:12, color:C.danger, padding:"2px 0" }}>
                      🚫 {b.startTime}–{b.endTime}{b.reason ? ` · ${b.reason}` : ""}
                    </div>
                  ))}
                </div>
              )}

              {/* All blocks for this field */}
              <div style={{ padding:"10px 16px" }}>
                {allBlocks.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:0.5, marginBottom:6 }}>
                      BLOCKED SLOTS
                    </div>
                    {allBlocks.slice(0,4).map(b => (
                      <div key={b.id} style={{ display:"flex", justifyContent:"space-between",
                        alignItems:"flex-start", fontSize:12, color:C.text, padding:"3px 0",
                        borderBottom:`1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontWeight:500 }}>{fmtBlock(b)}</div>
                          {b.reason && <div style={{ fontSize:11, color:C.muted }}>{b.reason}</div>}
                        </div>
                        <button onClick={() => unblock(b.id)} style={{
                          color:C.danger, background:"none", border:"none", cursor:"pointer",
                          fontSize:11, flexShrink:0, marginLeft:8 }}>✕</button>
                      </div>
                    ))}
                    {allBlocks.length > 4 && (
                      <div style={{ fontSize:11, color:C.muted, padding:"3px 0" }}>+{allBlocks.length-4} more…</div>
                    )}
                  </div>
                )}
                <button onClick={() => { setBlockFor(field.id); setBlockV({date:"",type:"full",startTime:"",endTime:"",reason:""}); }} style={{
                  width:"100%", padding:"7px", background:C.bg, border:`1px dashed ${C.border}`,
                  borderRadius:8, fontSize:12, color:C.muted, cursor:"pointer" }}>
                  ＋ Block Time
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {modal!==null && (
        <Modal title={modal.id ? "Edit Field" : "Add Field"} onClose={() => setModal(null)}>
          <FieldForm initial={modal} onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
      {blockFor && (
        <Modal title="Block Field Time" onClose={() => setBlockFor(null)}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:14, color:C.sub }}>
              Field: <strong>{fields.find(f=>f.id===blockFor)?.name}</strong>
            </div>
            <FInput label="Date" type="date" value={blockV.date} onChange={setB("date")} />

            {/* Block type */}
            <div>
              <Label>BLOCK TYPE</Label>
              <div style={{ display:"flex", gap:8, marginTop:8 }}>
                {[["full","🚫 Full Day"],["window","⏱ Time Window"]].map(([val,lbl]) => (
                  <button key={val} onClick={() => setBlockV(p=>({...p,type:val}))} style={{
                    flex:1, padding:"9px", border:`1px solid ${blockV.type===val?C.danger:C.border}`,
                    background:blockV.type===val?C.danger:C.white,
                    color:blockV.type===val?C.white:C.sub,
                    borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer"
                  }}>{lbl}</button>
                ))}
              </div>
            </div>

            {/* Time window inputs */}
            {blockV.type==="window" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <FInput label="Start Time" type="text" value={blockV.startTime}
                  onChange={setB("startTime")} placeholder="e.g. 9:00 AM" />
                <FInput label="End Time" type="text" value={blockV.endTime}
                  onChange={setB("endTime")} placeholder="e.g. 12:00 PM" />
              </div>
            )}

            <FInput label="Reason (optional)" type="text" value={blockV.reason}
              onChange={setB("reason")} placeholder="e.g. Travel team practice, Tournament, Maintenance" />

            <div style={{ padding:"10px 12px", background:"#FFF8F0",
              border:"1px solid #FED7AA", borderRadius:8, fontSize:12, color:"#92400E" }}>
              💡 <strong>Full Day</strong> blocks the entire field for all uses.
              <strong> Time Window</strong> blocks a specific window — coaches will see a warning if their practice overlaps it.
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <Btn onClick={handleBlock} full>Save Block</Btn>
              <Btn onClick={() => setBlockFor(null)} outline>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FieldForm({ initial, onSave, onClose }) {
  const ALL_TYPES = ["4v4","7v7","9v9","11v11"];
  const [v, setV] = useState({ name:"", location:"", address:"", types:["4v4","7v7"], ...initial });
  const set = k => e => setV(p => ({...p, [k]:e.target.value}));
  const toggleType = t => setV(p => ({...p, types:p.types.includes(t) ? p.types.filter(x=>x!==t) : [...p.types,t]}));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <FInput label="Field Name"     value={v.name}     onChange={set("name")}     placeholder="e.g. Cardinal Field A" />
      <FInput label="VENUE / PARK"   value={v.location} onChange={set("location")} placeholder="e.g. Mentor Sports Park" />
      <FInput label="STREET ADDRESS" value={v.address}  onChange={set("address")}  placeholder="e.g. 1234 Mentor Ave, Mentor, OH 44060" />
      <div>
        <Label>SUPPORTED FORMATS</Label>
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          {ALL_TYPES.map(t => (
            <button key={t} onClick={() => toggleType(t)} style={{
              flex:1, padding:"8px", border:`1px solid ${v.types.includes(t)?C.red:C.border}`,
              background:v.types.includes(t)?C.red:C.white,
              color:v.types.includes(t)?C.white:C.sub,
              borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer"
            }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:6 }}>
        <Btn onClick={() => v.name && v.location && onSave(v)} full>Save Field</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCHEDULE VIEWER
═══════════════════════════════════════════════════════════ */
function ScheduleViewer({ games, teams, fields, upGames }) {
  const [filterAG,     setFilterAG]     = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [search,       setSearch]       = useState("");

  const filtered = games
    .filter(g => filterAG==="All" || g.ageGroup===filterAG)
    .filter(g => filterStatus==="All" || g.status===filterStatus)
    .filter(g => !search || g.homeTeamName.toLowerCase().includes(search.toLowerCase()) ||
                            g.awayTeamName.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => a.date!==b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));

  const delGame = async (id) => {
    if (window.confirm("Remove this game from the schedule?"))
      await upGames(games.filter(g => g.id!==id));
  };

  const sColor = s => s==="scheduled"?"#DCFCE7":s==="rescheduled"?"#FEF3C7":s==="cancelled"?"#FEE2E2":"#F3F4F6";
  const sTColor = s => s==="scheduled"?C.success:s==="rescheduled"?C.warn:s==="cancelled"?C.danger:C.muted;

  // Group by date for the table
  const grouped = {};
  filtered.forEach(g => { (grouped[g.date] = grouped[g.date]||[]).push(g); });

  return (
    <div>
      <PageHeader title="Schedule" subtitle={`${games.length} total games · ${filtered.length} shown`} />

      {/* Filters */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ display:"flex", gap:6 }}>
          {["All",...AGE_GROUPS].map(g => <Chip key={g} active={filterAG===g} onClick={() => setFilterAG(g)}>{g}</Chip>)}
        </div>
        <div style={{ width:1, background:C.border, height:24 }} />
        <div style={{ display:"flex", gap:6 }}>
          {["All","scheduled","rescheduled","cancelled"].map(s => (
            <Chip key={s} active={filterStatus===s} color={filterStatus===s?C.navy:null}
              onClick={() => setFilterStatus(s)} style={{ textTransform:"capitalize" }}>{s}</Chip>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teams…"
          style={{ marginLeft:"auto", padding:"7px 14px", border:`1px solid ${C.border}`,
            borderRadius:20, fontSize:13, outline:"none", width:180, fontFamily:"DM Sans,sans-serif" }} />
      </div>

      {filtered.length===0
        ? <EmptyState icon="📅" msg="No games match your filters. Use the Generator tab to build a schedule." />
        : (
          <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {["Date","Time","Age","Home Team","Away Team","Field","Status",""].map(h => (
                    <th key={h} style={{ padding:"11px 14px", textAlign:"left",
                      fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.55)", letterSpacing:0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, i) => (
                  <tr key={g.id} style={{ borderBottom:`1px solid ${C.border}`,
                    background:i%2===0?C.white:"#FAFBFC", transition:"background 0.1s" }}>
                    <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, color:C.text }}>
                      {new Date(g.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:13, color:C.sub }}>{g.time}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:11, padding:"2px 8px", borderRadius:10,
                        background:C.red, color:C.white, fontWeight:700 }}>{g.ageGroup}</span>
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:13, color:C.text, fontWeight:500 }}>🏠 {g.homeTeamName}</td>
                    <td style={{ padding:"10px 14px", fontSize:13, color:C.sub }}>✈️ {g.awayTeamName}</td>
                    <td style={{ padding:"10px 14px", fontSize:13, color:C.muted }}>{g.fieldName}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ fontSize:11, padding:"3px 9px", borderRadius:10,
                        background:sColor(g.status), color:sTColor(g.status),
                        fontWeight:700, textTransform:"capitalize" }}>{g.status}</span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <IconBtn onClick={() => delGame(g.id)} title="Remove game">🗑️</IconBtn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SCHEDULE GENERATOR
═══════════════════════════════════════════════════════════ */
function ScheduleGenerator({ teams, fields, games, upGames, onDone }) {
  const [ageGroup,  setAgeGroup]  = useState("U6");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [days,      setDays]      = useState([6]); // Saturday
  const [slots,     setSlots]     = useState(["9:00 AM","10:30 AM","12:00 PM"]);
  const [newSlot,   setNewSlot]   = useState("");
  const [preview,   setPreview]   = useState(null);
  const [err,       setErr]       = useState("");
  const [saved,     setSaved]     = useState(false);

  const groupTeams = teams.filter(t => t.ageGroup === ageGroup);
  const format     = FORMAT_MAP[ageGroup];

  const generate = () => {
    setErr(""); setSaved(false);
    if (!startDate || !endDate)    { setErr("Select a start and end date."); return; }
    if (new Date(endDate) < new Date(startDate)) { setErr("End date must be after start date."); return; }
    if (groupTeams.length < 2)     { setErr(`Need at least 2 ${ageGroup} teams to generate a schedule.`); return; }
    if (!days.length)              { setErr("Select at least one game day."); return; }
    if (!slots.length)             { setErr("Add at least one time slot."); return; }

    const compatFields = fields.filter(f => f.types.includes(format));
    if (!compatFields.length)     { setErr(`No fields support ${format} for ${ageGroup}. Add compatible fields first.`); return; }

    const rounds  = roundRobin(groupTeams);
    const dates   = gameDates(startDate, endDate, days);

    if (!dates.length)  { setErr("No valid game dates in selected range for chosen day(s)."); return; }
    if (dates.length < rounds.length) {
      setErr(`⚠️ Only ${dates.length} game dates available, but ${rounds.length} rounds needed. Some rounds won't be scheduled.`);
    }

    const newGames = [];
    for (let dIdx = 0; dIdx < Math.min(dates.length, rounds.length); dIdx++) {
      const round = rounds[dIdx];
      round.forEach(([home, away], gi) => {
        newGames.push({
          id:           uid(),
          homeTeamId:   home.id,   homeTeamName: home.name,
          awayTeamId:   away.id,   awayTeamName: away.name,
          fieldId:      compatFields[gi % compatFields.length].id,
          fieldName:    compatFields[gi % compatFields.length].name,
          date:         dates[dIdx],
          time:         slots[gi % slots.length],
          ageGroup,     status:"scheduled",
        });
      });
    }
    setPreview(newGames);
  };

  const confirm = async () => {
    await upGames([...games, ...preview]);
    setSaved(true);
    setTimeout(onDone, 1200);
  };

  const toggleDay = d => setDays(p => p.includes(d) ? p.filter(x=>x!==d) : [...p,d]);

  return (
    <div>
      <PageHeader title="Schedule Generator" subtitle="Auto-build round-robin schedules for any age group" />
      <div style={{ display:"grid", gridTemplateColumns:"340px 1fr", gap:20, alignItems:"start" }}>

        {/* Config panel */}
        <div style={{ background:C.white, borderRadius:12, padding:22, border:`1px solid ${C.border}` }}>
          <SectionLabel>AGE GROUP</SectionLabel>
          <div style={{ display:"flex", gap:8, marginBottom:16 }}>
            {AGE_GROUPS.map(g => (
              <button key={g} onClick={() => { setAgeGroup(g); setPreview(null); setSaved(false); }} style={{
                flex:1, padding:"9px", border:`1px solid ${ageGroup===g?C.red:C.border}`,
                background:ageGroup===g?C.red:C.white, color:ageGroup===g?C.white:C.sub,
                borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer"
              }}>{g}</button>
            ))}
          </div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:18, padding:"8px 10px",
            background:C.bg, borderRadius:8 }}>
            {groupTeams.length} teams · {format} format ·&nbsp;
            {roundRobin(groupTeams).length} rounds needed
          </div>

          <FInput label="Season Start" type="date" value={startDate}
            onChange={e=>{setStartDate(e.target.value);setPreview(null);}} />
          <div style={{ marginTop:12 }}>
            <FInput label="Season End"   type="date" value={endDate}
              onChange={e=>{setEndDate(e.target.value);setPreview(null);}} />
          </div>

          <div style={{ marginTop:16 }}>
            <SectionLabel>GAME DAYS</SectionLabel>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
              {DAY_LABELS.map((d,i) => (
                <button key={d} onClick={() => toggleDay(i)} style={{
                  padding:"6px 10px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                  border:`1px solid ${days.includes(i)?C.red:C.border}`,
                  background:days.includes(i)?C.red:C.white,
                  color:days.includes(i)?C.white:C.sub
                }}>{d}</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop:16 }}>
            <SectionLabel>TIME SLOTS</SectionLabel>
            <div style={{ marginTop:8, marginBottom:8 }}>
              {slots.map((s,i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  fontSize:13, color:C.text, padding:"5px 8px", borderBottom:`1px solid ${C.border}` }}>
                  ⏰ {s}
                  <button onClick={() => setSlots(p => p.filter((_,j)=>j!==i))} style={{
                    color:C.danger, background:"none", border:"none", cursor:"pointer", fontSize:14 }}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={newSlot} onChange={e=>setNewSlot(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&newSlot&&!slots.includes(newSlot)&&(setSlots(p=>[...p,newSlot]),setNewSlot(""))}
                placeholder="e.g. 9:00 AM"
                style={{ flex:1, padding:"7px 10px", border:`1px solid ${C.border}`,
                  borderRadius:8, fontSize:13, outline:"none", fontFamily:"DM Sans,sans-serif" }} />
              <button onClick={() => { if(newSlot&&!slots.includes(newSlot)){setSlots(p=>[...p,newSlot]);setNewSlot(""); }}} style={{
                padding:"7px 14px", background:C.red, color:C.white, border:"none",
                borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>＋</button>
            </div>
          </div>

          {err && (
            <div style={{ marginTop:14, padding:"10px 12px", background:"#FEF2F2",
              border:"1px solid #FCA5A5", borderRadius:8, fontSize:12, color:C.danger }}>{err}</div>
          )}

          <button onClick={generate} style={{ width:"100%", marginTop:16, padding:"12px",
            background:C.navy, color:C.white, border:"none", borderRadius:10,
            fontSize:15, fontWeight:700, fontFamily:"Oswald,sans-serif", letterSpacing:1,
            cursor:"pointer", boxShadow:"0 4px 12px rgba(13,27,42,0.3)" }}>
            ⚡ PREVIEW SCHEDULE
          </button>
        </div>

        {/* Preview panel */}
        <div>
          {saved ? (
            <div style={{ background:"#DCFCE7", border:`1px solid ${C.success}`, borderRadius:12,
              padding:40, textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div style={{ fontFamily:"Oswald,sans-serif", fontSize:22, color:C.success }}>
                SCHEDULE SAVED!
              </div>
              <div style={{ color:C.sub, marginTop:8 }}>Redirecting to Schedule view…</div>
            </div>
          ) : !preview ? (
            <div style={{ background:C.white, borderRadius:12, border:`2px dashed ${C.border}`,
              padding:60, textAlign:"center" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>⚡</div>
              <div style={{ fontFamily:"Oswald,sans-serif", fontSize:22, color:C.navy, marginBottom:8 }}>
                READY TO GENERATE
              </div>
              <div style={{ fontSize:14, color:C.muted }}>
                Configure your season settings on the left, then preview your schedule.
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                <div>
                  <div style={{ fontFamily:"Oswald,sans-serif", fontSize:20, color:C.navy }}>
                    {ageGroup} SCHEDULE PREVIEW — {preview.length} GAMES
                  </div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>
                    {new Set(preview.map(g=>g.date)).size} game days ·&nbsp;
                    {fields.filter(f=>f.types.includes(format)).length} compatible fields
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn onClick={() => setPreview(null)} outline>← Revise</Btn>
                  <Btn onClick={confirm}>✓ Confirm & Save</Btn>
                </div>
              </div>
              <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`,
                overflow:"hidden", maxHeight:520, overflowY:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead style={{ position:"sticky", top:0 }}>
                    <tr style={{ background:C.navy }}>
                      {["#","Date","Time","Home","Away","Field"].map(h => (
                        <th key={h} style={{ padding:"10px 14px", textAlign:"left",
                          fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.55)", letterSpacing:0.8 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((g,i) => (
                      <tr key={g.id} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.white:"#FAFBFC" }}>
                        <td style={{ padding:"9px 14px", fontSize:12, color:C.muted }}>{i+1}</td>
                        <td style={{ padding:"9px 14px", fontSize:13, fontWeight:600, color:C.text }}>
                          {new Date(g.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                        </td>
                        <td style={{ padding:"9px 14px", fontSize:13, color:C.sub }}>{g.time}</td>
                        <td style={{ padding:"9px 14px", fontSize:13, fontWeight:500 }}>{g.homeTeamName}</td>
                        <td style={{ padding:"9px 14px", fontSize:13, color:C.sub }}>vs {g.awayTeamName}</td>
                        <td style={{ padding:"9px 14px", fontSize:13, color:C.muted }}>{g.fieldName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COACH DASHBOARD
═══════════════════════════════════════════════════════════ */
function CoachDashboard({ user, teams, fields, games, blocked, practices, upPractices, onLogout }) {
  const [tab, setTab] = useState("schedule");
  const team       = teams.find(t => t.id === user.teamId);
  const myGames    = games
    .filter(g => g.homeTeamId===user.teamId || g.awayTeamId===user.teamId)
    .sort((a,b) => a.date.localeCompare(b.date));
  const myPractices = practices
    .filter(p => p.teamId === user.teamId)
    .sort((a,b) => a.date.localeCompare(b.date));
  const upcoming  = myGames.filter(g => new Date(g.date+"T23:59:59") >= new Date());
  const past      = myGames.filter(g => new Date(g.date+"T23:59:59") <  new Date());
  const upcomingP = myPractices.filter(p => new Date(p.date+"T23:59:59") >= new Date());

  return (
    <div style={{ display:"flex", height:"100vh", fontFamily:"DM Sans,sans-serif", background:C.bg }}>
      <GFont />
      <div style={{ width:220, background:C.navy, display:"flex", flexDirection:"column",
        flexShrink:0, boxShadow:"4px 0 20px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"22px 18px 18px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:"50%", background:C.red,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>⚽</div>
            <div>
              <div style={{ fontFamily:"Oswald,sans-serif", color:C.white, fontWeight:600, fontSize:13, lineHeight:1.3 }}>
                {team?.name||"My Team"}
              </div>
              <div style={{ color:C.gold, fontSize:11, fontWeight:600, letterSpacing:1 }}>
                {team?.ageGroup} · COACH
              </div>
            </div>
          </div>
        </div>
        <nav style={{ flex:1, padding:"14px 10px" }}>
          {[
            {id:"schedule",  icon:"📅", label:"My Schedule"},
            {id:"practices", icon:"🏃", label:"Practices"},
            {id:"fields",    icon:"🏟️", label:"Field Calendar"},
          ].map(n => (
            <button key={n.id} onClick={() => setTab(n.id)} style={{
              width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
              background:tab===n.id?C.red:"transparent", color:tab===n.id?C.white:"rgba(255,255,255,0.55)",
              border:"none", borderRadius:8, fontSize:14, fontWeight:500, cursor:"pointer",
              marginBottom:3, textAlign:"left", transition:"all 0.15s",
              boxShadow:tab===n.id?"0 2px 8px rgba(200,16,46,0.4)":"none"
            }}><span style={{ fontSize:16 }}>{n.icon}</span>{n.label}</button>
          ))}
        </nav>
        {/* Season summary */}
        <div style={{ padding:"14px", borderTop:"1px solid rgba(255,255,255,0.07)",
          borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          {[
            ["Upcoming games", upcoming.length],
            ["Practices",      upcomingP.length],
            ["Past games",     past.length],
          ].map(([l,v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"3px 0", fontSize:12 }}>
              <span style={{ color:"rgba(255,255,255,0.4)" }}>{l}</span>
              <span style={{ color:C.white, fontWeight:600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:"12px 10px" }}>
          <button onClick={onLogout} style={{ width:"100%", padding:"9px",
            background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.5)",
            border:"none", borderRadius:8, fontSize:13, cursor:"pointer" }}>← Sign Out</button>
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", padding:28 }}>
        {tab==="schedule" && (
          <div>
            <PageHeader title={team?.name||"My Schedule"}
              subtitle={`${upcoming.length} upcoming · ${past.length} completed`} />
            {myGames.length===0
              ? <EmptyState icon="📅" msg="No games scheduled for your team yet. Check back soon!" />
              : (
                <div>
                  {upcoming.length > 0 && (
                    <div style={{ marginBottom:28 }}>
                      <SectionLabel style={{ marginBottom:12 }}>UPCOMING GAMES</SectionLabel>
                      <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10 }}>
                        {upcoming.map(g => <GameCard key={g.id} game={g} teamId={user.teamId} />)}
                      </div>
                    </div>
                  )}
                  {past.length > 0 && (
                    <div>
                      <SectionLabel style={{ marginBottom:12 }}>PAST GAMES</SectionLabel>
                      <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10, opacity:0.6 }}>
                        {past.map(g => <GameCard key={g.id} game={g} teamId={user.teamId} past />)}
                      </div>
                    </div>
                  )}
                </div>
              )
            }
          </div>
        )}
        {tab==="practices" && (
          <PracticesCoach
            user={user} team={team} practices={myPractices} allPractices={practices}
            fields={fields} blocked={blocked} games={games} upPractices={upPractices} />
        )}
        {tab==="fields" && (
          <FieldCalendarView fields={fields} blocked={blocked} games={games} practices={practices} />
        )}
      </div>
    </div>
  );
}

function GameCard({ game, teamId, past }) {
  const isHome = game.homeTeamId === teamId;
  const opp    = isHome ? game.awayTeamName : game.homeTeamName;
  const d      = new Date(game.date+"T12:00:00");
  const sColor = game.status==="scheduled"?C.success:game.status==="rescheduled"?C.warn:C.danger;
  return (
    <div style={{ background:C.white, borderRadius:12, padding:"16px 20px",
      border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:16,
      boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      {/* Date block */}
      <div style={{ textAlign:"center", minWidth:52, flexShrink:0 }}>
        <div style={{ fontFamily:"Oswald,sans-serif", fontSize:26, color:C.navy, lineHeight:1 }}>{d.getDate()}</div>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>
          {d.toLocaleDateString("en-US",{month:"short"})}
        </div>
        <div style={{ fontSize:10, color:C.muted }}>
          {d.toLocaleDateString("en-US",{weekday:"short"})}
        </div>
      </div>
      <div style={{ width:3, height:44, background:C.red, borderRadius:3, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:15, color:C.text }}>
          {isHome ? "🏠 Home" : "✈️ Away"} vs <span style={{ color:C.red }}>{opp}</span>
        </div>
        <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>
          {game.time} &nbsp;·&nbsp; 📍 {game.fieldName}
        </div>
      </div>
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <span style={{ fontSize:11, padding:"4px 10px", borderRadius:12,
          background:`${sColor}18`, color:sColor, fontWeight:700, textTransform:"capitalize",
          display:"block" }}>{game.status}</span>
        <span style={{ fontSize:11, color:C.muted, marginTop:4, display:"block" }}>{game.ageGroup}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   FIELD CALENDAR (shared read-only view)
═══════════════════════════════════════════════════════════ */
function FieldCalendarView({ fields, blocked, games, practices = [] }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const dayGames     = games.filter(g => g.date===date);
  const dayPractices = practices.filter(p => p.date===date);
  const dayBlocked   = blocked.filter(b => b.date===date);

  return (
    <div>
      <PageHeader title="Field Calendar" subtitle="Daily field availability at a glance" />
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24,
        background:C.white, padding:"14px 18px", borderRadius:10, border:`1px solid ${C.border}` }}>
        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>📅 Viewing:</span>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{ padding:"7px 12px", border:`1px solid ${C.border}`, borderRadius:8,
            fontSize:14, fontFamily:"DM Sans,sans-serif", outline:"none" }} />
        <span style={{ fontSize:14, color:C.sub }}>
          {new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:12, fontSize:12 }}>
          {[["✅","Available"],["⚽","Game"],["🏃","Practice"],["🚫","Blocked"]].map(([e,l]) => (
            <span key={l} style={{ color:C.muted }}>{e} {l}</span>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:12 }}>
        {fields.map(field => {
          const fBlocks    = dayBlocked.filter(b => b.fieldId===field.id);
          const isFullDay  = fBlocks.some(b => b.type==="full" || !b.startTime);
          const fWindows   = fBlocks.filter(b => b.type==="window" && b.startTime);
          const fGames     = dayGames.filter(g => g.fieldId===field.id);
          const fPractices = dayPractices.filter(p => p.fieldId===field.id);
          const busy       = fGames.length + fPractices.length;
          const borderCol  = isFullDay ? C.danger : (fWindows.length||busy) ? C.warn : C.success;
          const statusLabel = isFullDay ? "🚫 BLOCKED ALL DAY"
            : fWindows.length ? `⚠️ ${fWindows.length} TIME BLOCK${fWindows.length>1?"S":""}`
            : busy ? `⚠️ ${busy} BOOKING${busy>1?"S":""}` : "✅ OPEN";

          return (
            <div key={field.id} style={{ background:C.white, borderRadius:12, overflow:"hidden",
              border:`1px solid ${C.border}`, borderTop:`4px solid ${borderCol}` }}>
              <div style={{ padding:"12px 14px" }}>
                <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{field.name}</div>
                <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>📍 {field.location}</div>
                {field.address && (
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(field.address)}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize:11, color:"#4F46E5", marginTop:2, display:"block", textDecoration:"none" }}>
                    🗺 {field.address}
                  </a>
                )}
                <div style={{ marginTop:8, display:"flex", gap:4, flexWrap:"wrap" }}>
                  {field.types.map(t => (
                    <span key={t} style={{ fontSize:10, padding:"2px 7px", borderRadius:10,
                      background:"#EEF2FF", color:"#4F46E5", fontWeight:600 }}>{t}</span>
                  ))}
                  <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, color:borderCol }}>{statusLabel}</span>
                </div>
              </div>
              {/* Time window blocks */}
              {fWindows.length > 0 && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 14px", background:"#FFF1F2" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.danger, letterSpacing:0.5, marginBottom:4 }}>🚫 BLOCKED WINDOWS</div>
                  {fWindows.map(b => (
                    <div key={b.id} style={{ fontSize:12, color:C.danger, padding:"2px 0" }}>
                      {b.startTime}–{b.endTime}{b.reason ? ` · ${b.reason}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {fGames.length > 0 && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 14px", background:"#FFFBEB" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.warn, letterSpacing:0.5, marginBottom:4 }}>⚽ GAMES</div>
                  {fGames.map(g => (
                    <div key={g.id} style={{ fontSize:12, color:C.sub, padding:"2px 0" }}>
                      {g.time} — <strong>{g.homeTeamName}</strong> vs {g.awayTeamName}
                      <span style={{ marginLeft:6, background:C.red, color:"#fff",
                        fontSize:10, padding:"1px 5px", borderRadius:8 }}>{g.ageGroup}</span>
                    </div>
                  ))}
                </div>
              )}
              {fPractices.length > 0 && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:"8px 14px", background:"#F0FDF4" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.success, letterSpacing:0.5, marginBottom:4 }}>🏃 PRACTICES</div>
                  {fPractices.map(p => (
                    <div key={p.id} style={{ fontSize:12, color:C.sub, padding:"2px 0" }}>
                      {p.time} · 1 hr — <strong>{p.teamName}</strong>
                      <span style={{ marginLeft:6, background:C.success, color:"#fff",
                        fontSize:10, padding:"1px 5px", borderRadius:8 }}>{p.ageGroup}</span>
                    </div>
                  ))}
                </div>
              )}
              {!isFullDay && !fWindows.length && !busy && (
                <div style={{ borderTop:`1px solid ${C.border}`, padding:"10px 14px" }}>
                  <div style={{ fontSize:12, color:C.muted }}>No bookings scheduled</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRACTICES — ADMIN VIEW (read-only overview of all teams)
═══════════════════════════════════════════════════════════ */
function PracticesAdmin({ practices, teams, fields, upPractices }) {
  const [filterAG, setFilterAG] = useState("All");
  const [search,   setSearch]   = useState("");

  const filtered = practices
    .filter(p => filterAG==="All" || p.ageGroup===filterAG)
    .filter(p => !search || p.teamName.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => a.date!==b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));

  const del = async id => {
    if (window.confirm("Remove this practice?")) await upPractices(practices.filter(p => p.id!==id));
  };

  return (
    <div>
      <PageHeader title="All Practices" subtitle={`${practices.length} practices scheduled across all teams`} />
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        {["All",...AGE_GROUPS].map(g => <Chip key={g} active={filterAG===g} onClick={() => setFilterAG(g)}>{g}</Chip>)}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search teams…"
          style={{ marginLeft:"auto", padding:"7px 14px", border:`1px solid ${C.border}`,
            borderRadius:20, fontSize:13, outline:"none", width:180, fontFamily:"DM Sans,sans-serif" }} />
      </div>
      {filtered.length===0
        ? <EmptyState icon="🏃" msg="No practices scheduled yet. Coaches schedule their own practices from their dashboard." />
        : (
          <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:C.navy }}>
                  {["Date","Time","Team","Coach","Field","Notes",""].map(h => (
                    <th key={h} style={{ padding:"11px 14px", textAlign:"left",
                      fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.55)", letterSpacing:0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p,i) => {
                  const isPast = new Date(p.date+"T23:59:59") < new Date();
                  return (
                    <tr key={p.id} style={{ borderBottom:`1px solid ${C.border}`,
                      background:i%2===0?C.white:"#FAFBFC", opacity:isPast?0.55:1 }}>
                      <td style={{ padding:"10px 14px", fontSize:13, fontWeight:600, color:C.text }}>
                        {new Date(p.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                      </td>
                      <td style={{ padding:"10px 14px", fontSize:13, color:C.sub }}>{p.time}</td>
                      <td style={{ padding:"10px 14px", fontSize:13, color:C.text, fontWeight:500 }}>
                        <span style={{ fontSize:10, background:C.success, color:"#fff",
                          padding:"1px 6px", borderRadius:8, marginRight:6 }}>{p.ageGroup}</span>
                        {p.teamName}
                      </td>
                      <td style={{ padding:"10px 14px", fontSize:13, color:C.muted }}>{p.coachName||"—"}</td>
                      <td style={{ padding:"10px 14px", fontSize:13, color:C.muted }}>{p.fieldName}</td>
                      <td style={{ padding:"10px 14px", fontSize:12, color:C.muted, maxWidth:160,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.notes||"—"}</td>
                      <td style={{ padding:"10px 14px" }}>
                        <IconBtn onClick={() => del(p.id)} title="Remove">🗑️</IconBtn>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRACTICES — COACH VIEW (full CRUD for own team)
═══════════════════════════════════════════════════════════ */
function PracticesCoach({ user, team, practices, allPractices, fields, blocked, games, upPractices }) {
  const [modal, setModal] = useState(null);

  const upcoming = practices.filter(p => new Date(p.date+"T23:59:59") >= new Date());
  const past     = practices.filter(p => new Date(p.date+"T23:59:59") <  new Date());

  const handleSave = async (p) => {
    const full = {
      ...p, id: p.id||uid(),
      teamId:    user.teamId,
      teamName:  team?.name||"My Team",
      ageGroup:  team?.ageGroup||"",
      coachName: team?.coachName||user.name,
    };
    const updated = p.id
      ? allPractices.map(x => x.id===p.id ? full : x)
      : [...allPractices, full];
    await upPractices(updated);
    setModal(null);
  };

  const del = async id => {
    if (window.confirm("Delete this practice?"))
      await upPractices(allPractices.filter(p => p.id!==id));
  };

  return (
    <div>
      <PageHeader title="Practices"
        subtitle={`${upcoming.length} upcoming · ${past.length} past`}
        action={<Btn onClick={() => setModal({})}>＋ Schedule Practice</Btn>} />

      {practices.length===0
        ? (
          <div style={{ textAlign:"center", padding:"60px 20px", background:C.white,
            borderRadius:12, border:`2px dashed ${C.border}` }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🏃</div>
            <div style={{ fontFamily:"Oswald,sans-serif", fontSize:20, color:C.navy, marginBottom:8 }}>
              NO PRACTICES YET
            </div>
            <div style={{ fontSize:14, color:C.muted, marginBottom:20 }}>
              Schedule your first practice — pick a date, time, field, and duration.
            </div>
            <Btn onClick={() => setModal({})}>＋ Schedule First Practice</Btn>
          </div>
        ) : (
          <div>
            {upcoming.length > 0 && (
              <div style={{ marginBottom:28 }}>
                <SectionLabel style={{ marginBottom:12 }}>UPCOMING PRACTICES</SectionLabel>
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10 }}>
                  {upcoming.map(p => (
                    <PracticeCard key={p.id} practice={p}
                      onEdit={() => setModal(p)} onDelete={() => del(p.id)} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div style={{ opacity:0.6 }}>
                <SectionLabel style={{ marginBottom:12 }}>PAST PRACTICES</SectionLabel>
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:10 }}>
                  {past.map(p => (
                    <PracticeCard key={p.id} practice={p}
                      onEdit={() => setModal(p)} onDelete={() => del(p.id)} past />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      }

      {modal!==null && (
        <Modal title={modal.id ? "Edit Practice" : "Schedule Practice"} onClose={() => setModal(null)}>
          <PracticeForm
            initial={modal} fields={fields} blocked={blocked}
            games={games} allPractices={allPractices}
            teamId={user.teamId}
            onSave={handleSave} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}

function PracticeCard({ practice: p, onEdit, onDelete, past }) {
  const d = new Date(p.date+"T12:00:00");
  return (
    <div style={{ background:C.white, borderRadius:12, padding:"16px 20px",
      border:`1px solid ${C.border}`, display:"flex", alignItems:"center", gap:16,
      boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ textAlign:"center", minWidth:52, flexShrink:0 }}>
        <div style={{ fontFamily:"Oswald,sans-serif", fontSize:26, color:C.navy, lineHeight:1 }}>{d.getDate()}</div>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>
          {d.toLocaleDateString("en-US",{month:"short"})}
        </div>
        <div style={{ fontSize:10, color:C.muted }}>{d.toLocaleDateString("en-US",{weekday:"short"})}</div>
      </div>
      <div style={{ width:3, height:44, background:C.success, borderRadius:3, flexShrink:0 }} />
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:15, color:C.text }}>🏃 Practice Session</div>
        <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>
          {p.time} · 1 hr · 📍 {p.fieldName}
        </div>
        {p.notes && (
          <div style={{ fontSize:12, color:C.sub, marginTop:4, fontStyle:"italic" }}>"{p.notes}"</div>
        )}
      </div>
      {!past && (
        <div style={{ display:"flex", gap:6, flexShrink:0 }}>
          <IconBtn onClick={onEdit} title="Edit">✏️</IconBtn>
          <IconBtn onClick={onDelete} title="Delete">🗑️</IconBtn>
        </div>
      )}
    </div>
  );
}

function PracticeForm({ initial, fields, blocked, games, allPractices, teamId, onSave, onClose }) {
  const [v, setV] = useState({
    date:"", time:"5:00 PM", fieldId:"", fieldName:"", duration:60, notes:"", ...initial
  });
  const set = k => e => setV(p => ({...p, [k]:e.target.value}));

  // A field is fully blocked if there's a full-day block OR a time-window block overlapping the 60-min practice
  const getFieldBlockStatus = (fieldId) => {
    if (!v.date) return { blocked:false, windows:[] };
    const dayBlocks = blocked.filter(b => b.fieldId===fieldId && b.date===v.date);
    const fullDay   = dayBlocks.some(b => b.type==="full" || !b.startTime);
    if (fullDay) return { blocked:true, windows:[] };
    const overlapping = v.time
      ? dayBlocks.filter(b => b.type==="window" && practiceOverlapsBlock(v.time, b))
      : [];
    return { blocked:false, windows:overlapping };
  };

  const fieldBusy = (fieldId) => {
    if (!v.date) return [];
    const fGames     = games.filter(g => g.fieldId===fieldId && g.date===v.date);
    const fPractices = allPractices.filter(p => p.fieldId===fieldId && p.date===v.date && p.id!==initial?.id);
    return [...fGames.map(g=>`⚽ ${g.time} Game`), ...fPractices.map(p=>`🏃 ${p.time} ${p.teamName}`)];
  };

  const handleFieldChange = (e) => {
    const f = fields.find(x => x.id===e.target.value);
    setV(p => ({...p, fieldId:e.target.value, fieldName:f?.name||""}));
  };

  const valid = v.date && v.time && v.fieldId;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <FInput label="Date" type="date" value={v.date} onChange={set("date")} />
        <FInput label="Start Time" type="text" value={v.time}
          onChange={set("time")} placeholder="e.g. 5:00 PM" />
      </div>

      {/* Duration fixed at 1 hour */}
      <div style={{ padding:"10px 14px", background:"#F0FDF4", border:"1px solid #86EFAC",
        borderRadius:8, fontSize:13, color:"#166534", display:"flex", alignItems:"center", gap:8 }}>
        ⏱ <strong>Duration: 1 hour</strong> &nbsp;(fixed for all rec practices)
      </div>

      <div>
        <Label>FIELD</Label>
        <select value={v.fieldId} onChange={handleFieldChange} style={{
          width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`,
          borderRadius:8, fontSize:14, marginTop:8, outline:"none",
          fontFamily:"DM Sans,sans-serif", background:C.white }}>
          <option value="">— Select a field —</option>
          {fields.map(f => {
            const { blocked:blk, windows } = getFieldBlockStatus(f.id);
            const busy = fieldBusy(f.id);
            return (
              <option key={f.id} value={f.id}>
                {f.name} · {f.location}{blk?" 🚫 BLOCKED":windows.length?` ⚠️ Overlaps block`:busy.length?` ⚠️ ${busy.length} booking${busy.length>1?"s":""}` : ""}
              </option>
            );
          })}
        </select>

        {/* Conflict feedback */}
        {v.fieldId && v.date && (() => {
          const { blocked:blk, windows } = getFieldBlockStatus(v.fieldId);
          const busy = fieldBusy(v.fieldId);
          if (blk) return (
            <div style={{ marginTop:8, padding:"10px 12px", background:"#FEF2F2",
              border:"1px solid #FCA5A5", borderRadius:8, fontSize:12, color:C.danger }}>
              🚫 This field is blocked all day on {new Date(v.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}.
              Please choose a different field or date.
            </div>
          );
          if (windows.length) return (
            <div style={{ marginTop:8, padding:"10px 12px", background:"#FEF2F2",
              border:"1px solid #FCA5A5", borderRadius:8, fontSize:12, color:C.danger }}>
              🚫 Your practice time overlaps a blocked window:&nbsp;
              {windows.map(w => `${w.startTime}–${w.endTime}${w.reason?` (${w.reason})`:""}`).join(", ")}.
              Adjust your start time or pick a different field.
            </div>
          );
          if (busy.length) return (
            <div style={{ marginTop:8, padding:"10px 12px", background:"#FFFBEB",
              border:"1px solid #FCD34D", borderRadius:8, fontSize:12, color:"#92400E" }}>
              ⚠️ Other bookings this day: {busy.join(", ")}. Confirm there's no time conflict.
            </div>
          );
          return (
            <div style={{ marginTop:8, padding:"8px 12px", background:"#F0FDF4",
              border:"1px solid #86EFAC", borderRadius:8, fontSize:12, color:C.success }}>
              ✅ Field looks open for your practice time.
            </div>
          );
        })()}
      </div>

      <FInput label="Notes (optional)" type="text" value={v.notes}
        onChange={set("notes")} placeholder="e.g. Bring cones, focus on passing drills" />

      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <Btn onClick={() => valid && onSave(v)} full disabled={!valid}>Save Practice</Btn>
        <Btn onClick={onClose} outline>Cancel</Btn>
      </div>
      {!valid && <div style={{ fontSize:12, color:C.muted, textAlign:"center" }}>Select a date, time, and field to continue</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED PRIMITIVES
═══════════════════════════════════════════════════════════ */
function GFont() {
  return <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap'); *{box-sizing:border-box;} button{font-family:'DM Sans',sans-serif;} input,select{font-family:'DM Sans',sans-serif;}`}</style>;
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:24 }}>
      <div>
        <h2 style={{ fontFamily:"Oswald,sans-serif", fontSize:28, fontWeight:700,
          color:C.navy, margin:0, lineHeight:1.1 }}>{title.toUpperCase()}</h2>
        {subtitle && <div style={{ fontSize:13, color:C.muted, marginTop:5 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:1000 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:C.white, borderRadius:16, padding:28, width:460,
        maxWidth:"92vw", maxHeight:"88vh", overflow:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.3)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <h3 style={{ fontFamily:"Oswald,sans-serif", fontSize:20, fontWeight:700, color:C.navy, margin:0 }}>
            {title.toUpperCase()}
          </h3>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:22,
            cursor:"pointer", color:C.muted, lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FInput({ label, ...props }) {
  return (
    <div>
      {label && <Label>{label}</Label>}
      <input {...props} style={{ width:"100%", padding:"10px 12px", border:`1px solid ${C.border}`,
        borderRadius:8, fontSize:14, outline:"none", marginTop:label?8:0,
        transition:"border-color 0.15s", ...props.style }} />
    </div>
  );
}

function Label({ children, style }) {
  return <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:0.8, ...style }}>{children}</div>;
}

function SectionLabel({ children, style }) {
  return <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:0.8, marginBottom:4, ...style }}>{children}</div>;
}

function Btn({ children, onClick, full, outline, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:"10px 22px", borderRadius:9, fontSize:14, fontWeight:700,
      fontFamily:"Oswald,sans-serif", letterSpacing:0.8, cursor:disabled?"not-allowed":"pointer",
      width:full?"100%":"auto",
      background:outline?C.white:disabled?"#ccc":C.red,
      color:outline?C.red:C.white,
      border:`2px solid ${disabled?"#ccc":C.red}`,
      opacity:disabled?0.7:1, transition:"all 0.15s",
    }}>{children}</button>
  );
}

function IconBtn({ onClick, children, title }) {
  return (
    <button onClick={onClick} title={title} style={{ padding:"5px 7px", background:"none",
      border:"none", cursor:"pointer", fontSize:15, borderRadius:6,
      transition:"background 0.1s" }}>{children}</button>
  );
}

function Chip({ children, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{ padding:"6px 14px", borderRadius:20, fontSize:13, fontWeight:600,
      cursor:"pointer", border:`1px solid ${active?(color||C.red):C.border}`,
      background:active?(color||C.red):C.white, color:active?C.white:C.sub,
      transition:"all 0.15s" }}>{children}</button>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign:"center", padding:"64px 20px", background:C.white,
      borderRadius:12, border:`2px dashed ${C.border}` }}>
      <div style={{ fontSize:44, marginBottom:14 }}>{icon}</div>
      <div style={{ fontSize:15, color:C.muted, maxWidth:320, margin:"0 auto" }}>{msg}</div>
    </div>
  );
}
