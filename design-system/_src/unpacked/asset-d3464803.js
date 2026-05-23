/* global React, Icons, UI, DATA, useStore */
// trainer-views.jsx — all trainer-facing views

const { Avatar, Badge, StatusBadge, UnitTag, VideoTile, Modal, Pagehead, Crumbs, EmptyState, Ring } = UI;
const { useState, useEffect, useMemo, Fragment } = React;

// ============================================================
// TRAINER DASHBOARD
// ============================================================
function TrainerDashboard({ go }) {
  const DATA = useStore();
  const clients = DATA.CLIENTS;

  // Recent activity = last 5 logs sorted by date
  const recent = [...DATA.LOGS].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);

  return (
    <div className="view-fade">
      <Pagehead
        eyebrow={`Trener · ${DATA.trainer.name}`}
        title="Pulpit"
        sub={`${clients.length} aktywnych podopiecznych`}
        actions={<button className="btn btn-primary" onClick={() => go({ view:"library" })}><Icons.Plus/> Nowe ćwiczenie</button>}
      />

      <div className="grid" style={{gridTemplateColumns: "1.5fr 1fr", gap: 20}}>
        <div>
          <div className="row between" style={{marginBottom:12}}>
            <h2 style={{fontSize:17}}>Podopieczni</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go({ view:"clients" })}>
              Wszyscy <Icons.Chev/>
            </button>
          </div>
          <ClientsList clients={clients} go={go} variant="compact" />
        </div>

        <div>
          <div className="row between" style={{marginBottom:12}}>
            <h2 style={{fontSize:17}}>Ostatnie sesje</h2>
            <Icons.History style={{color:"var(--muted)"}}/>
          </div>
          <div className="list">
            {recent.map(log => {
              const client = DATA.clientById(log.clientId);
              return (
                <div key={log.id} className="list-row"
                  style={{gridTemplateColumns: "auto 1fr auto", gap: 12, padding:"12px 16px"}}
                  onClick={() => go({ view:"workout-detail", clientId: client.id, logId: log.id })}>
                  <Avatar name={client.name} size="sm" />
                  <div>
                    <div style={{fontWeight:500, fontSize:13}}>{client.name}</div>
                    <div className="muted" style={{fontSize:12}}>{log.sessionName}</div>
                  </div>
                  <div className="mono" style={{fontSize:11, color:"var(--muted)"}}>{DATA.daysAgo(log.date)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CLIENTS LIST
// ============================================================
function ClientsList({ clients, go, variant }) {
  const DATA = useStore();
  return (
    <div className="list">
      {variant !== "compact" && (
        <div className="list-row list-head"
          style={{gridTemplateColumns:"2fr 1.4fr 1.2fr 0.5fr", gap:12}}>
          <div>Podopieczny</div>
          <div>Plan</div>
          <div>Ostatnia sesja</div>
          <div></div>
        </div>
      )}
      {clients.map(c => {
        const plan = c.planId ? DATA.planById(c.planId) : null;
        return (
          <div key={c.id} className="list-row"
            style={{gridTemplateColumns: variant==="compact" ? "auto 1fr auto" : "2fr 1.4fr 1.2fr 0.5fr", gap:12}}
            onClick={() => go({ view:"client-detail", clientId: c.id })}>
            <div className="row" style={{gap:10}}>
              <Avatar name={c.name} />
              <div>
                <div style={{fontWeight:500, fontSize:14}}>{c.name}</div>
                {variant !== "compact" && plan && <div className="muted" style={{fontSize:12}}>od {DATA.fmtDate(c.joined)}</div>}
              </div>
            </div>
            {variant !== "compact" && <div>
              {plan ? <div>
                <div style={{fontSize:13}}>{plan.name}</div>
                <div className="muted mono" style={{fontSize:11}}>v{plan.version} · {plan.status}</div>
              </div> : <span className="muted">brak planu</span>}
            </div>}
            {variant !== "compact" && <div className="mono" style={{fontSize:12, color: "var(--ink-2)"}}>
              {DATA.daysAgo(c.lastSession)}
            </div>}
            <Icons.Chev style={{color:"var(--muted-2)"}}/>
          </div>
        );
      })}
    </div>
  );
}

function TrainerClients({ go }) {
  const DATA = useStore();
  const [search, setSearch] = useState("");
  const filtered = DATA.CLIENTS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="view-fade">
      <Pagehead
        title="Podopieczni"
        sub={`${DATA.CLIENTS.length} osób · ${DATA.PLANS.filter(p=>p.status==="active").length} aktywnych planów`}
        actions={<>
          <div className="input-search" style={{width: 220}}>
            <Icons.Search/>
            <input className="input" placeholder="Szukaj po imieniu…" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
        </>}
      />
      <ClientsList clients={filtered} go={go} />
    </div>
  );
}

// ============================================================
// EXERCISE LIBRARY
// ============================================================
function ExerciseLibrary({ go }) {
  const DATA = useStore();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [newEx, setNewEx] = useState({ name:"", desc:"", unit:"REPS" });
  const [toast, setToast] = useState(null);

  function saveExercise() {
    if (!newEx.name.trim()) return;
    DATA.addExercise(newEx);
    setNewEx({ name:"", desc:"", unit:"REPS" });
    setModal(false);
    setToast("Dodano ćwiczenie do biblioteki");
    setTimeout(() => setToast(null), 2200);
  }

  const tagOpts = ["all","pull","push","legs","core","static","balance"];
  const filtered = DATA.EXERCISES.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || e.tags.includes(filter);
    return matchSearch && matchFilter;
  });

  return (
    <div className="view-fade">
      <Pagehead
        title="Biblioteka ćwiczeń"
        sub={`${DATA.EXERCISES.length} pozycji · używanych w ${DATA.PLANS.length} planach`}
        actions={<>
          <div className="input-search" style={{width:220}}>
            <Icons.Search/>
            <input className="input" placeholder="Szukaj ćwiczenia…" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={()=>setModal(true)}><Icons.Plus/> Dodaj ćwiczenie</button>
        </>}
      />

      <div className="row" style={{gap:6, marginBottom:18, flexWrap:"wrap"}}>
        {tagOpts.map(t => (
          <button key={t}
            className={"btn btn-sm " + (filter === t ? "btn-dark" : "btn-ghost")}
            onClick={() => setFilter(t)}>
            {t === "all" ? "Wszystkie" : t}
          </button>
        ))}
      </div>

      <div className="grid grid-3" style={{gap:16}}>
        {filtered.map(ex => (
          <div key={ex.id} className="card card-hover" style={{padding:14}}>
            <VideoTile duration={ex.duration} label="DEMO" />
            <div className="row between" style={{marginTop:12, alignItems:"flex-start"}}>
              <div>
                <h3 style={{fontSize:15, marginBottom:4}}>{ex.name}</h3>
                <UnitTag unit={ex.unit} />
              </div>
              <button className="btn btn-icon btn-ghost btn-sm"><Icons.More/></button>
            </div>
            <div className="muted" style={{fontSize:12.5, marginTop:10, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden"}}>
              {ex.desc}
            </div>
            <div className="row" style={{marginTop:12, gap:4, flexWrap:"wrap"}}>
              {ex.tags.slice(0,3).map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={()=>setModal(false)} title="Nowe ćwiczenie"
        footer={<>
          <button className="btn btn-ghost" onClick={()=>setModal(false)}>Anuluj</button>
          <button className="btn btn-primary" onClick={saveExercise} disabled={!newEx.name.trim()}>Zapisz w bibliotece</button>
        </>}>
        <div className="field">
          <label>Nazwa ćwiczenia</label>
          <input className="input" placeholder="np. Pseudo Planche Push-up" value={newEx.name}
            onChange={e=>setNewEx({...newEx, name:e.target.value})} />
        </div>
        <div className="field">
          <label>Opis / wskazówki</label>
          <textarea className="textarea" placeholder="Jak wykonać, na co zwrócić uwagę…" value={newEx.desc}
            onChange={e=>setNewEx({...newEx, desc:e.target.value})}></textarea>
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Jednostka</label>
            <div className="row" style={{gap:6}}>
              {["REPS","SEC"].map(u => (
                <button key={u} className={"btn " + (newEx.unit === u ? "btn-dark":"")} onClick={() => setNewEx({...newEx, unit:u})}>
                  {u === "REPS" ? "Powtórzenia" : "Sekundy"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Filmik instruktażowy</label>
            <button className="btn" style={{height:38, justifyContent:"flex-start"}}><Icons.Upload/> Wybierz plik…</button>
          </div>
        </div>
      </Modal>
      {toast && <UI.Toast>{toast}</UI.Toast>}
    </div>
  );
}

// ============================================================
// CLIENT DETAIL (plans for this client)
// ============================================================
function TrainerClientDetail({ clientId, go }) {
  const DATA = useStore();
  const client = DATA.clientById(clientId);
  const plans = DATA.plansForClient(clientId);
  const active = plans.find(p => p.status === "active");
  const draft = plans.find(p => p.status === "draft");
  const archived = plans.filter(p => p.status === "archived");
  const logs = DATA.logsForClient(clientId);

  return (
    <div className="view-fade">
      <Crumbs items={[{label:"Podopieczni", onClick: () => go({ view:"clients"})}]} current={client.name}/>

      <div className="row between" style={{marginBottom:24, alignItems:"flex-start", paddingBottom:22, borderBottom:"1px solid var(--line)"}}>
        <div className="row" style={{gap:16, alignItems:"center"}}>
          <Avatar name={client.name} size="xl"/>
          <div>
            <div className="eyebrow">Podopieczny · od {DATA.fmtDate(client.joined)}</div>
            <h1 style={{fontSize:26}}>{client.name}</h1>
            <div className="muted" style={{fontSize:13.5, marginTop:6}}>
              Ostatnia sesja · <span className="mono" style={{color:"var(--ink-2)"}}>{DATA.daysAgo(client.lastSession)}</span>
            </div>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn" onClick={() => go({ view:"client-body", clientId })}>
            <Icons.Camera/> Sylwetka <span className="mono muted" style={{marginLeft:6, fontSize:11}}>{DATA.photosForClient(clientId).length}</span>
          </button>
          <button className="btn btn-primary"
            onClick={() => go({ view:"plan-editor", planId: "new", clientId })}>
            <Icons.Plus/> Nowy plan
          </button>
        </div>
      </div>

      {/* Active plan card */}
      {active && (
        <div className="card" style={{marginBottom:20}}>
          <div className="row between" style={{alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div className="row" style={{gap:8, marginBottom:8}}>
                <StatusBadge status="active" />
                <span className="mono muted" style={{fontSize:11}}>v{active.version} · od {DATA.fmtDate(active.published)}</span>
              </div>
              <h2 style={{fontSize:19, marginBottom:6}}>{active.name}</h2>
              <div className="muted" style={{fontSize:13}}>
                <span className="mono">{active.sessions.length}</span> sesji do wyboru przez podopiecznego
              </div>
            </div>
            <div className="row" style={{gap:8}}>
              <button className="btn" onClick={() => go({ view:"plan-editor", planId: active.id, clientId })}><Icons.Edit/> Edytuj plan</button>
              <button className="btn btn-icon btn-ghost"><Icons.More/></button>
            </div>
          </div>
        </div>
      )}

      {/* Draft */}
      {draft && (
        <div className="card" style={{marginBottom:20, borderStyle:"dashed", borderColor:"var(--line-2)", background:"var(--surface)"}}>
          <div className="row between" style={{alignItems:"flex-start"}}>
            <div>
              <div className="row" style={{gap:8, marginBottom:8}}>
                <StatusBadge status="draft"/>
                <span className="mono muted" style={{fontSize:11}}>Wersja {draft.version} (Draft) — bazuje na Wersji {draft.basesOn || draft.version-1}</span>
              </div>
              <h2 style={{fontSize:19, marginBottom:6}}>{draft.name}</h2>
              <div className="muted" style={{fontSize:13}}>{draft.sessions.length} sesji · niedokończony</div>
            </div>
            <button className="btn btn-dark"
              onClick={() => go({ view:"plan-editor", planId: draft.id, clientId })}>
              Wróć do edycji <Icons.Chev/>
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{gridTemplateColumns: "1.4fr 1fr", gap:24, marginTop:12}}>
        <div>
          <div className="row between" style={{marginBottom:12}}>
            <h2 style={{fontSize:16}}>Historia treningów</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go({ view:"workout-history", clientId })}>
              Wszystkie <Icons.Chev/>
            </button>
          </div>
          <WorkoutLogList logs={logs.slice(0,6)} go={go} clientId={clientId} />
        </div>

        <div>
          <h2 style={{fontSize:16, marginBottom:12}}>Archiwum planów</h2>
          {archived.length === 0 && <div className="muted" style={{fontSize:13}}>Brak zarchiwizowanych planów.</div>}
          {archived.map(p => (
            <div key={p.id} className="card" style={{padding:14, marginBottom:10, cursor:"pointer"}}>
              <div className="row" style={{gap:10}}>
                <Icons.Arch style={{color:"var(--muted)", fontSize:18, marginTop:2}}/>
                <div style={{flex:1}}>
                  <div className="row" style={{gap:8}}>
                    <StatusBadge status="archived" />
                    <span className="mono muted" style={{fontSize:11}}>v{p.version}</span>
                  </div>
                  <div style={{fontSize:13.5, fontWeight:500, marginTop:4}}>{p.name}</div>
                  <div className="muted" style={{fontSize:12}}>{p.sessions.length} sesji · {DATA.fmtDate(p.created)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// WORKOUT LOGS LIST + DETAIL
// ============================================================
function WorkoutLogList({ logs, go, clientId }) {
  const DATA = useStore();
  if (logs.length === 0) return <EmptyState title="Brak treningów" sub="Ten podopieczny jeszcze nic nie zarejestrował."/>;
  return (
    <div className="list">
      {logs.map(log => {
        const totalSets = DATA.totalSets(log);
        const avg = DATA.avgDiff(log);
        const exCount = log.exercises.length;
        return (
          <div key={log.id} className="list-row"
            style={{gridTemplateColumns: "auto 1fr auto auto auto", gap:14}}
            onClick={() => go({ view:"workout-detail", clientId, logId: log.id })}>
            <div style={{textAlign:"center", width:44}}>
              <div className="mono" style={{fontSize:18, fontWeight:600, color:"var(--ink)"}}>{new Date(log.date).getDate()}</div>
              <div className="muted mono" style={{fontSize:10, textTransform:"uppercase"}}>{["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"][new Date(log.date).getMonth()]}</div>
            </div>
            <div>
              <div style={{fontSize:14, fontWeight:500}}>{log.sessionName}</div>
              <div className="muted" style={{fontSize:12, marginTop:2}}>
                <span className="mono">{exCount}</span> ćwiczeń · <span className="mono">{totalSets}</span> serii
                {log.note && <> · <span style={{color:"var(--ink-2)", fontStyle:"italic"}}>„{log.note.slice(0,40)}{log.note.length>40?"…":""}"</span></>}
              </div>
            </div>
            <div className="row" style={{gap:6}}>
              <span className="badge" title="średnia trudność">
                <span className="badge-dot" style={{background: avg<=5 ? "var(--ok)" : avg<=7 ? "var(--warn)" : "var(--danger)"}}/>
                <span className="mono">{avg}</span>
              </span>
            </div>
            <div>
              {log.hasVideo ? <span className="tag"><Icons.Play/> video</span> : <span className="tag muted">bez video</span>}
            </div>
            <Icons.Chev style={{color:"var(--muted-2)"}}/>
          </div>
        );
      })}
    </div>
  );
}

function TrainerWorkoutHistory({ clientId, go }) {
  const DATA = useStore();
  const client = DATA.clientById(clientId);
  const logs = DATA.logsForClient(clientId).sort((a,b) => b.date.localeCompare(a.date));
  return (
    <div className="view-fade">
      <Crumbs items={[
        {label:"Podopieczni", onClick: () => go({ view:"clients"})},
        {label: client.name, onClick: () => go({ view:"client-detail", clientId})}
      ]} current="Historia treningów"/>
      <Pagehead title="Historia treningów" sub={`${logs.length} zarejestrowanych sesji · ${client.name}`}/>
      <WorkoutLogList logs={logs} go={go} clientId={clientId}/>
    </div>
  );
}

function TrainerWorkoutDetail({ clientId, logId, go }) {
  const DATA = useStore();
  const client = DATA.clientById(clientId);
  const log = DATA.LOGS.find(l => l.id === logId);
  if (!log) return null;
  const totalSets = DATA.totalSets(log);
  const avg = DATA.avgDiff(log);

  return (
    <div className="view-fade">
      <Crumbs items={[
        {label:"Podopieczni", onClick: () => go({ view:"clients"})},
        {label: client.name, onClick: () => go({ view:"client-detail", clientId})},
        {label:"Historia", onClick: () => go({ view:"workout-history", clientId})},
      ]} current={log.sessionName}/>

      <div className="row between" style={{marginBottom:24, alignItems:"flex-end", paddingBottom:22, borderBottom:"1px solid var(--line)"}}>
        <div>
          <div className="eyebrow">{DATA.fmtDate(log.date)} · {DATA.daysAgo(log.date)}</div>
          <h1 style={{fontSize:24}}>{log.sessionName}</h1>
          <div className="row" style={{gap:14, marginTop:6, color:"var(--muted)", fontSize:13.5}}>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{log.exercises.length}</span> ćwiczeń</span>
            <span>·</span>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{totalSets}</span> serii</span>
            <span>·</span>
            <span>śr. trudność <span className="mono bold" style={{color:"var(--ink)"}}>{avg}/10</span></span>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <Avatar name={client.name}/>
          <div>
            <div style={{fontSize:13, fontWeight:500}}>{client.name}</div>
            <div className="muted mono" style={{fontSize:11}}>{client.id.toUpperCase()}</div>
          </div>
        </div>
      </div>

      {log.note && (
        <div className="card" style={{padding:16, marginBottom:20, borderLeft:"3px solid var(--accent)", borderRadius:"4px 12px 12px 4px"}}>
          <div className="row" style={{gap:10, alignItems:"flex-start"}}>
            <Icons.Note style={{color:"var(--muted)", fontSize:18, marginTop:2}}/>
            <div>
              <div className="muted mono" style={{fontSize:11, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4}}>Notatka podopiecznego</div>
              <div style={{fontSize:14, lineHeight:1.5}}>{log.note}</div>
            </div>
          </div>
        </div>
      )}

      <div className="col" style={{gap:16}}>
        {log.exercises.map((rec, i) => {
          const ex = DATA.exById(rec.exId);
          const exAvg = rec.sets.reduce((a,s) => a+s.diff, 0) / rec.sets.length;
          return (
            <div key={i} className="card" style={{padding:0, overflow:"hidden"}}>
              <div className="row" style={{padding:"14px 18px", gap:14, borderBottom:"1px solid var(--line)"}}>
                <div className="mono" style={{fontSize:11, color:"var(--muted)", width:24}}>{String(i+1).padStart(2,"0")}</div>
                <div style={{flex:1}}>
                  <div className="row" style={{gap:10}}>
                    <h3 style={{fontSize:15.5}}>{ex.name}</h3>
                    <UnitTag unit={ex.unit}/>
                  </div>
                </div>
                <div className="row" style={{gap:14}}>
                  <div style={{textAlign:"right"}}>
                    <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".08em"}}>Średnio</div>
                    <div className="mono bold" style={{fontSize:14}}>{(rec.sets.reduce((a,s)=>a+s.reps,0)/rec.sets.length).toFixed(1)} {ex.unit.toLowerCase()}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".08em"}}>Trudność</div>
                    <div className="mono bold" style={{fontSize:14, color: exAvg<=5?"var(--ok)":exAvg<=7?"var(--warn)":"var(--danger)"}}>{exAvg.toFixed(1)}/10</div>
                  </div>
                </div>
              </div>
              <div className="row" style={{padding:18, gap:18, alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div className="set-grid" style={{marginBottom:6}}>
                    <span className="label-mini">Seria</span>
                    <span className="label-mini">{ex.unit === "REPS" ? "Powtórzenia" : "Sekundy"}</span>
                    <span className="label-mini">Trudność</span>
                    <span className="label-mini" style={{gridColumn:"4 / span 2"}}>Wizualnie</span>
                    <span className="label-mini">Video</span>
                  </div>
                  {rec.sets.map((s, si) => (
                    <div key={si} className="set-grid" style={{padding:"8px 0", borderTop: si>0?"1px dashed var(--line)":"none"}}>
                      <span className="mono bold">#{si+1}</span>
                      <span className="mono"><span style={{fontWeight:600, fontSize:15}}>{s.reps}</span> {ex.unit.toLowerCase()}</span>
                      <span className="mono" style={{color: s.diff<=5?"var(--ok)":s.diff<=7?"var(--warn)":"var(--danger)", fontWeight:600}}>{s.diff}/10</span>
                      <div style={{gridColumn:"4 / span 2", display:"flex", gap:2}}>
                        {Array.from({length:10}, (_,n) => (
                          <div key={n} style={{flex:1, height:6, borderRadius:2, background: n < s.diff ? (s.diff<=5?"var(--ok)":s.diff<=7?"var(--warn)":"var(--danger)") : "var(--surface-2)"}}/>
                        ))}
                      </div>
                      <span>{s.video ? <span className="tag" title="filmik z serii"><Icons.Play/></span> : <span className="muted mono" style={{fontSize:11}}>—</span>}</span>
                    </div>
                  ))}
                </div>
                {rec.sets.some(s => s.video) && (
                  <div style={{width:200, flexShrink:0}}>
                    <VideoTile duration="0:48" label={`Seria ${rec.sets.findIndex(s=>s.video)+1}`}/>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.TrainerViews = { TrainerDashboard, TrainerClients, ExerciseLibrary, TrainerClientDetail, TrainerWorkoutHistory, TrainerWorkoutDetail };
