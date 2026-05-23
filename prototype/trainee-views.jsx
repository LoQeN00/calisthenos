/* global React, Icons, UI, DATA, useStore */
// trainee-views.jsx — all trainee-facing views

const { Avatar, Badge, UnitTag, VideoTile, Modal, Pagehead, Crumbs, EmptyState, DifficultyPicker, Toast, Ring } = UI;
const { useState, useEffect, useMemo } = React;

// ============================================================
// TRAINEE DASHBOARD
// ============================================================
function TraineeDashboard({ go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const client = DATA.clientById(TRAINEE_ID);
  const progress = DATA.sessionProgress(TRAINEE_ID);
  const plan = progress.plan;
  const logs = DATA.logsForClient(TRAINEE_ID).sort((a,b) => b.date.localeCompare(a.date));
  const lastLog = logs[0];

  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="view-fade">
      <div className="row between" style={{paddingBottom:22, marginBottom:26, borderBottom:"1px solid var(--line)", alignItems:"flex-end"}}>
        <div>
          <div className="eyebrow">Cześć, {client.name.split(" ")[0]} 👋</div>
          <h1 style={{fontSize:30}}>Twój trening</h1>
          <div className="muted" style={{fontSize:13.5, marginTop:4}}>
            Trener: <span style={{color:"var(--ink)", fontWeight:500}}>{DATA.trainer.name}</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg"
          disabled={!plan}
          onClick={() => setPickerOpen(true)}>
          <Icons.Plus/> Zarejestruj sesję
        </button>
      </div>

      {/* Active plan card */}
      {plan && (
        <div className="card" style={{padding:24, marginBottom:20, background: "var(--ink)", color:"var(--bg)", borderColor:"transparent", position:"relative", overflow:"hidden"}}>
          <div style={{position:"absolute", top:-40, right:-40, width:200, height:200, borderRadius:"50%", background:"var(--accent)", opacity:.15}}/>
          <div className="row between" style={{alignItems:"flex-start"}}>
            <div>
              <div className="row" style={{gap:8, marginBottom:8, color:"var(--accent)"}}>
                <span className="badge" style={{background:"transparent", border:"1px solid var(--accent)", color:"var(--accent)"}}>
                  <span className="badge-dot" style={{background:"var(--accent)"}}/>aktywny plan
                </span>
                <span className="mono" style={{fontSize:11, opacity:.7}}>v{plan.version} · od {DATA.fmtDate(plan.published)}</span>
              </div>
              <h2 style={{fontSize:24, marginBottom:0, color:"var(--bg)"}}>{plan.name}</h2>
            </div>
            <button className="btn"
              style={{background:"transparent", color:"var(--bg)", borderColor:"rgba(255,255,255,.15)"}}
              onClick={() => go({ view:"trainee-sessions"})}>
              Lista sesji <Icons.Chev/>
            </button>
          </div>
        </div>
      )}

      <div className="grid" style={{gridTemplateColumns: "1fr 1fr", gap:20}}>
        {/* All sessions — pick whichever you want, multiple times if you want */}
        {plan && (
          <div>
            <div className="row between" style={{marginBottom:12}}>
              <h2 style={{fontSize:16}}>Sesje w planie</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => go({ view:"trainee-sessions" })}>
                Szczegóły <Icons.Chev/>
              </button>
            </div>
            <div className="list">
              {plan.sessions.map((s, idx) => {
                const sessLogs = logs.filter(l => l.sessionId === s.id && l.planId === plan.id);
                const count = sessLogs.length;
                const lastDone = sessLogs[0]?.date;
                return (
                  <div key={s.id} className="list-row"
                    style={{gridTemplateColumns:"auto 1fr auto auto", gap:12, padding:"12px 16px"}}
                    onClick={() => go({ view:"trainee-session-detail", sessionId: s.id })}>
                    <div className="mono" style={{width:24, textAlign:"center", color:"var(--muted)", fontSize:12}}>
                      {String(idx+1).padStart(2,"0")}
                    </div>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:500}}>{s.name}</div>
                      <div className="muted" style={{fontSize:11.5, marginTop:2}}>
                        {count === 0
                          ? "jeszcze nie wykonana"
                          : <>wykonana <span className="mono">×{count}</span> · ostatnio <span className="mono">{DATA.daysAgo(lastDone)}</span></>}
                      </div>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={(e) => { e.stopPropagation(); go({ view:"trainee-log-form", sessionId: s.id }); }}>
                      <Icons.Plus/> Zarejestruj
                    </button>
                    <Icons.Chev style={{color:"var(--muted-2)"}}/>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent history */}
        <div>
          <div className="row between" style={{marginBottom:12}}>
            <h2 style={{fontSize:16}}>Twoja historia</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => go({ view:"trainee-history" })}>
              Wszystkie <Icons.Chev/>
            </button>
          </div>
          <div className="list">
            {logs.length === 0 && (
              <div style={{padding:24, textAlign:"center", color:"var(--muted)", fontSize:13}}>
                Jeszcze nic nie zarejestrowano.
              </div>
            )}
            {logs.slice(0,5).map(log => (
              <div key={log.id} className="list-row"
                style={{gridTemplateColumns:"auto 1fr auto", gap:12, padding:"12px 16px"}}
                onClick={() => go({ view:"trainee-log-detail", logId: log.id })}>
                <div className="mono" style={{width:36, textAlign:"center", color:"var(--muted)", fontSize:11}}>
                  {DATA.fmtDateShort(log.date)}
                </div>
                <div>
                  <div style={{fontSize:13.5, fontWeight:500}}>{log.sessionName}</div>
                  <div className="muted" style={{fontSize:12}}>
                    <span className="mono">{log.exercises.length}</span> ćwiczeń · trudność <span className="mono">{DATA.avgDiff(log)}/10</span>
                  </div>
                </div>
                <Icons.Chev style={{color:"var(--muted-2)"}}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SessionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        plan={plan}
        logs={logs}
        onPick={(sid) => { setPickerOpen(false); go({ view:"trainee-log-form", sessionId: sid }); }}
      />
    </div>
  );
}

// ============================================================
// SESSION PICKER MODAL
// ============================================================
function SessionPicker({ open, onClose, plan, logs, onPick }) {
  const DATA = useStore();
  if (!plan) return null;
  return (
    <Modal open={open} onClose={onClose} title="Wybierz sesję do zarejestrowania" wide>
      <div className="muted" style={{fontSize:12.5, marginTop:-4, marginBottom:6}}>
        Możesz zarejestrować dowolną sesję — także taką, którą robisz drugi czy trzeci raz pod rząd.
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:8}}>
        {plan.sessions.map((s, idx) => {
          const sessLogs = logs.filter(l => l.sessionId === s.id && l.planId === plan.id);
          const count = sessLogs.length;
          const lastDone = sessLogs[0]?.date;
          const exercises = s.blocks.flatMap(b => DATA.blockExerciseRefs(b));
          return (
            <button key={s.id}
              onClick={() => onPick(s.id)}
              className="card card-hover"
              style={{
                textAlign:"left",
                border:"1px solid var(--line)",
                cursor:"pointer",
                padding:14,
                display:"grid",
                gridTemplateColumns:"auto 1fr auto",
                gap:14,
                alignItems:"center",
                background:"var(--surface)",
              }}>
              <div className="mono" style={{width:36, textAlign:"center", color:"var(--muted)", fontSize:13}}>
                {String(idx+1).padStart(2,"0")}
              </div>
              <div>
                <div style={{fontSize:14.5, fontWeight:500, marginBottom:4}}>{s.name}</div>
                <div className="muted" style={{fontSize:12, lineHeight:1.4}}>
                  <span className="mono">{exercises.length}</span> ćwiczeń ·{" "}
                  <span className="mono">{s.blocks.reduce((a,b)=>a+DATA.blockSetCount(b), 0)}</span> serii ·{" "}
                  {count === 0
                    ? "jeszcze nie wykonana"
                    : <>wykonana <span className="mono">×{count}</span>, ostatnio <span className="mono">{DATA.daysAgo(lastDone)}</span></>}
                </div>
              </div>
              <div className="row" style={{gap:6, color:"var(--accent-ink)"}}>
                {count > 0 && <span className="badge active"><span className="mono">×{count}</span></span>}
                <span className="btn btn-primary btn-sm" style={{pointerEvents:"none"}}>
                  <Icons.Plus/> Wybierz
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ============================================================
// SESSION CARD (reusable)
// ============================================================
function SessionCard({ session, completionCount, lastDone, onClick, onRegister }) {
  const DATA = useStore();
  const blocks = session.blocks;
  const exercises = blocks.flatMap(b => DATA.blockExerciseRefs(b));
  return (
    <div className="card card-hover" onClick={onClick}>
      <div className="row between" style={{marginBottom:12, alignItems:"flex-start"}}>
        <div>
          <h3 style={{fontSize:16, marginBottom:4}}>{session.name}</h3>
          <div className="muted" style={{fontSize:12.5}}>
            <span className="mono">{exercises.length}</span> ćwiczeń ·{" "}
            <span className="mono">{blocks.filter(b => b.kind === "superset").length}</span> supersetów{" "}
            {blocks.filter(b => b.kind === "dropset").length > 0 && <>· <span className="mono">{blocks.filter(b => b.kind === "dropset").length}</span> dropsetów</>}
          </div>
        </div>
        {completionCount > 0 ? (
          <span className="badge active"><span className="badge-dot"/><span className="mono">×{completionCount}</span></span>
        ) : (
          <span className="badge"><span className="badge-dot"/>nowa</span>
        )}
      </div>
      <div className="col" style={{gap:6}}>
        {blocks.slice(0,4).map((b, bi) => {
          const refs = DATA.blockExerciseRefs(b);
          const first = refs[0];
          const firstEx = first ? DATA.exById(first.exId) : null;
          return (
            <div key={bi} className="row" style={{gap:8, fontSize:13}}>
              <span className="mono muted" style={{fontSize:11, width:22}}>{String.fromCharCode(65 + bi)}</span>
              {b.kind === "superset" && <Icons.Link style={{color:"var(--muted)", fontSize:13}}/>}
              {b.kind === "dropset" && <Icons.Drop style={{color:"var(--accent-ink)", background:"var(--accent)", padding:2, borderRadius:3, fontSize:11}}/>}
              <span style={{flex:1, color:"var(--ink-2)"}}>
                {refs.map(r => DATA.exById(r.exId)?.name || "?").join(b.kind === "dropset" ? " → " : " + ")}
              </span>
              <span className="mono muted" style={{fontSize:11}}>
                {b.kind === "dropset"
                  ? `${b.sets}×${b.drops.length}drop`
                  : `${first.sets}×${first.reps}${firstEx?.unit === "SEC" ? "s" : ""}`}
              </span>
            </div>
          );
        })}
        {blocks.length > 4 && (
          <div className="muted" style={{fontSize:11.5, marginTop:4}}>+ {blocks.length - 4} kolejnych bloków…</div>
        )}
      </div>
      <div className="row between" style={{marginTop:12, paddingTop:12, borderTop:"1px dashed var(--line)", alignItems:"center"}}>
        <div className="muted" style={{fontSize:11.5}}>
          {lastDone
            ? <>Ostatnio <span className="mono">{DATA.daysAgo(lastDone)}</span></>
            : <>Jeszcze nie wykonana</>}
        </div>
        {onRegister && (
          <button className="btn btn-primary btn-sm"
            onClick={(e) => { e.stopPropagation(); onRegister(); }}>
            <Icons.Plus/> Zarejestruj
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SESSIONS LIST (full list)
// ============================================================
function TraineeSessions({ go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const progress = DATA.sessionProgress(TRAINEE_ID);
  const plan = progress.plan;
  const logs = DATA.logsForClient(TRAINEE_ID);

  return (
    <div className="view-fade">
      <Pagehead
        eyebrow={`Aktywny plan · v${plan.version}`}
        title={plan.name}
        sub={`${plan.sessions.length} sesji do wyboru`}
      />
      <div className="grid grid-2">
        {plan.sessions.map(session => {
          const sessLogs = logs.filter(l => l.sessionId === session.id && l.planId === plan.id);
          const lastDone = sessLogs.length ? sessLogs.sort((a,b)=>b.date.localeCompare(a.date))[0].date : null;
          return (
            <SessionCard key={session.id}
              session={session}
              completionCount={sessLogs.length}
              lastDone={lastDone}
              onClick={() => go({ view: "trainee-session-detail", sessionId: session.id })}
              onRegister={() => go({ view: "trainee-log-form", sessionId: session.id })}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// SESSION DETAIL (single session before doing it)
// ============================================================
function TraineeSessionDetail({ sessionId, go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const progress = DATA.sessionProgress(TRAINEE_ID);
  const plan = progress.plan;
  const session = plan.sessions.find(s => s.id === sessionId);
  if (!session) return null;
  const logs = DATA.logsForClient(TRAINEE_ID).filter(l => l.sessionId === sessionId && l.planId === plan.id);
  const totalSets = session.blocks.reduce((a,b) => a + DATA.blockSetCount(b), 0);

  return (
    <div className="view-fade">
      <Crumbs items={[{label: plan.name, onClick: () => go({ view:"trainee-sessions"})}]} current={session.name}/>

      <div className="row between" style={{paddingBottom:22, marginBottom:26, borderBottom:"1px solid var(--line)", alignItems:"flex-end"}}>
        <div>
          <div className="eyebrow">Sesja {plan.sessions.findIndex(s=>s.id===sessionId)+1}</div>
          <h1 style={{fontSize:26}}>{session.name}</h1>
          <div className="row" style={{gap:14, marginTop:6, color:"var(--muted)", fontSize:13.5}}>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{session.blocks.length}</span> bloków</span>
            <span>·</span>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{session.blocks.flatMap(b=>DATA.blockExerciseRefs(b)).length}</span> ćwiczeń</span>
            <span>·</span>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{totalSets}</span> serii zaplanowanych</span>
          </div>
        </div>
        <button className="btn btn-primary btn-lg"
          onClick={() => go({ view:"trainee-log-form", sessionId })}>
          <Icons.Plus/> Zarejestruj wykonanie
        </button>
      </div>

      <div className="col" style={{gap:14}}>
        {session.blocks.map((block, bi) => (
          <SessionBlockView key={block.id} block={block} bi={bi}/>
        ))}
      </div>

      <div style={{marginTop:32, paddingTop:24, borderTop:"1px solid var(--line)"}}>
        <button className="btn btn-primary btn-lg" style={{width:"100%"}}
          onClick={() => go({ view:"trainee-log-form", sessionId })}>
          <Icons.Plus/> Zarejestruj wykonanie tej sesji
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SESSION BLOCK VIEW (per block in session detail)
// ============================================================
function SessionBlockView({ block, bi }) {
  const DATA = useStore();

  return (
    <div className="card" style={{padding:0, overflow:"hidden"}}>
      <div className="row" style={{padding:"12px 18px", gap:14, background:"var(--surface-2)", borderBottom:"1px solid var(--line)"}}>
        <div className="mono" style={{fontSize:11, color:"var(--muted)", textTransform:"uppercase", letterSpacing:".06em"}}>
          Blok {String.fromCharCode(65 + bi)}
        </div>
        {block.kind === "superset" && (
          <span className="badge"><Icons.Link/> Superset · naprzemiennie</span>
        )}
        {block.kind === "dropset" && (
          <span className="badge" style={{background:"var(--accent-soft)", color:"var(--accent-ink)", borderColor:"transparent"}}>
            <Icons.Drop/> Drop set · {block.drops.length} dropy bez przerwy
          </span>
        )}
      </div>

      {block.kind === "dropset" ? (
        <div style={{padding:18}}>
          <div className="row" style={{gap:18, marginBottom:14, paddingBottom:12, borderBottom:"1px dashed var(--line)"}}>
            <div>
              <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>Serie</div>
              <div className="mono bold" style={{fontSize:18}}>{block.sets}</div>
            </div>
            <div>
              <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>Przerwa po serii</div>
              <div className="mono bold" style={{fontSize:18}}>{block.rest}</div>
            </div>
            <div style={{flex:1}}/>
          </div>
          <div style={{display:"flex", flexDirection:"column"}}>
            {block.drops.map((drop, di) => {
              const ex = DATA.exById(drop.exId);
              if (!ex) return null;
              return (
                <React.Fragment key={di}>
                  <div className="row" style={{gap:14, alignItems:"flex-start", padding:"10px 0"}}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 6,
                      background: di === 0 ? "var(--ink)" : "var(--surface-2)",
                      color: di === 0 ? "var(--bg)" : "var(--ink)",
                      display:"grid", placeItems:"center",
                      fontFamily:"var(--font-mono)", fontSize:12, fontWeight:600, flexShrink:0,
                    }}>{di+1}</div>
                    <div style={{width:100, flexShrink:0}}>
                      <VideoTile size="16:9" duration={ex.duration}/>
                    </div>
                    <div style={{flex:1}}>
                      <div className="row" style={{gap:10, marginBottom:4}}>
                        <h3 style={{fontSize:14.5}}>{ex.name}</h3>
                        <UnitTag unit={ex.unit}/>
                      </div>
                      <div className="row" style={{gap:14}}>
                        <div className="mono" style={{fontSize:13, fontWeight:600}}>
                          {drop.reps} {ex.unit === "SEC" ? "sek" : "powt."}
                        </div>
                        <div className="muted" style={{fontSize:12}}>{ex.desc.split(".")[0]}.</div>
                      </div>
                    </div>
                  </div>
                  {di < block.drops.length - 1 && (
                    <div style={{
                      display:"flex", alignItems:"center", gap:8,
                      paddingLeft: 14, color:"var(--accent-ink)",
                      fontFamily:"var(--font-mono)", fontSize:10,
                      textTransform:"uppercase", letterSpacing:".08em",
                      background:"var(--accent-soft)",
                      padding:"4px 10px",
                      borderRadius: 4,
                      alignSelf:"flex-start",
                      marginLeft: 0,
                    }}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12l7 7 7-7"/>
                      </svg>
                      bez przerwy
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="col" style={{padding:18, gap:14}}>
          {block.exercises.map((exercise, ei) => {
            const ex = DATA.exById(exercise.exId);
            if (!ex) return null;
            return (
              <div key={ei} className="row" style={{gap:16, alignItems:"flex-start"}}>
                <div style={{width:120, flexShrink:0}}>
                  <VideoTile size="16:9" duration={ex.duration} />
                </div>
                <div style={{flex:1}}>
                  <div className="row" style={{gap:10, marginBottom:6}}>
                    <h3 style={{fontSize:16}}>{ex.name}</h3>
                    <UnitTag unit={ex.unit}/>
                    {block.kind === "superset" && (
                      <span className="mono muted" style={{fontSize:11, textTransform:"uppercase", letterSpacing:".06em"}}>
                        część {ei === 0 ? "A" : "B"}
                      </span>
                    )}
                  </div>
                  <div className="row" style={{gap:18, marginBottom:8}}>
                    <div>
                      <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>Serie</div>
                      <div className="mono bold" style={{fontSize:18}}>{exercise.sets}</div>
                    </div>
                    <div>
                      <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>{ex.unit === "REPS" ? "Powtórzenia" : "Sekundy"}</div>
                      <div className="mono bold" style={{fontSize:18}}>{exercise.reps}</div>
                    </div>
                    <div>
                      <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>Przerwa</div>
                      <div className="mono bold" style={{fontSize:18}}>{exercise.rest}</div>
                    </div>
                  </div>
                  {exercise.note && (
                    <div className="muted" style={{fontSize:12.5, fontStyle:"italic", marginTop:6, paddingLeft:10, borderLeft:"2px solid var(--accent)"}}>
                      „{exercise.note}"
                    </div>
                  )}
                  <div className="muted" style={{fontSize:12.5, lineHeight:1.5, marginTop:8}}>
                    {ex.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// LOG FORM — kluczowy widok
// ============================================================
function TraineeLogForm({ sessionId, go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const progress = DATA.sessionProgress(TRAINEE_ID);
  const plan = progress.plan;
  const session = plan.sessions.find(s => s.id === sessionId);

  // Build initial form state from session blocks.
  // For dropsets, each "drop" becomes its own exercise entry with `dropGroup` metadata,
  // so adjacent rows are visually grouped with "→ bez przerwy" connectors.
  const [form, setForm] = useState(() => {
    const exercises = [];
    session.blocks.forEach(b => {
      if (b.kind === "dropset") {
        const groupId = b.id;
        b.drops.forEach((drop, di) => {
          const ex = DATA.exById(drop.exId);
          exercises.push({
            exId: drop.exId,
            target: { reps: drop.reps, unit: ex?.unit || "REPS", sets: b.sets },
            sets: Array.from({length: b.sets}, () => ({ reps: drop.reps, diff: 6, video: false })),
            blockKind: "dropset",
            dropGroup: groupId,
            dropIndex: di,
            dropTotal: b.drops.length,
          });
        });
      } else {
        b.exercises.forEach(e => {
          const ex = DATA.exById(e.exId);
          exercises.push({
            exId: e.exId,
            target: { reps: e.reps, unit: ex?.unit || "REPS", sets: e.sets },
            sets: Array.from({length: e.sets}, () => ({ reps: e.reps, diff: 6, video: false })),
            blockKind: b.kind,
          });
        });
      }
    });
    return { exercises, note: "" };
  });
  const [saved, setSaved] = useState(false);

  function updateSet(exIdx, setIdx, patch) {
    setForm(f => {
      const c = JSON.parse(JSON.stringify(f));
      c.exercises[exIdx].sets[setIdx] = { ...c.exercises[exIdx].sets[setIdx], ...patch };
      return c;
    });
  }
  function copyDown(exIdx, setIdx) {
    setForm(f => {
      const c = JSON.parse(JSON.stringify(f));
      const src = c.exercises[exIdx].sets[setIdx];
      for (let i = setIdx + 1; i < c.exercises[exIdx].sets.length; i++) {
        c.exercises[exIdx].sets[i] = { ...c.exercises[exIdx].sets[i], reps: src.reps, diff: src.diff };
      }
      return c;
    });
  }

  function save() {
    // Build log object
    const log = {
      clientId: TRAINEE_ID,
      planId: plan.id,
      sessionId: session.id,
      sessionName: session.name,
      date: DATA.todayISO(),
      exercises: form.exercises.map(e => ({
        exId: e.exId,
        sets: e.sets.map(s => ({ reps: s.reps, diff: s.diff, video: s.video })),
      })),
      note: form.note,
      hasVideo: form.exercises.some(e => e.sets.some(s => s.video)),
      allDone: form.exercises.every(e => e.sets.every(s => s.reps > 0)),
    };
    DATA.addLog(log);
    setSaved(true);
    setTimeout(() => {
      go({ view:"trainee-dashboard" });
    }, 1500);
  }

  const totalSets = form.exercises.reduce((a,e) => a + e.sets.length, 0);
  const completedSets = form.exercises.reduce((a,e) => a + e.sets.filter(s => s.reps > 0).length, 0);

  return (
    <div className="view-fade">
      <Crumbs items={[
        {label: plan.name, onClick: () => go({ view:"trainee-sessions"})},
        {label: session.name, onClick: () => go({ view:"trainee-session-detail", sessionId})},
      ]} current="Rejestracja"/>

      <div className="row between" style={{paddingBottom:22, marginBottom:26, borderBottom:"1px solid var(--line)", alignItems:"flex-end"}}>
        <div>
          <div className="eyebrow">Rejestracja wykonania · {DATA.fmtDate(DATA.todayISO())}</div>
          <h1 style={{fontSize:26}}>{session.name}</h1>
          <div className="muted" style={{fontSize:13.5, marginTop:6}}>
            <span className="mono bold" style={{color:"var(--ink)"}}>{completedSets}</span> z <span className="mono">{totalSets}</span> serii wypełnionych
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button className="btn btn-ghost" onClick={() => go({ view:"trainee-session-detail", sessionId})}>Anuluj</button>
          <button className="btn btn-primary btn-lg" onClick={save}>
            <Icons.Check/> Zapisz trening
          </button>
        </div>
      </div>

      <div className="col" style={{gap:16}}>
        {form.exercises.map((exrec, ei) => {
          const ex = DATA.exById(exrec.exId);
          const isDropFirst = exrec.blockKind === "dropset" && exrec.dropIndex === 0;
          const isDropLast  = exrec.blockKind === "dropset" && exrec.dropIndex === exrec.dropTotal - 1;
          const isMidDrop   = exrec.blockKind === "dropset" && !isDropFirst;
          return (
            <React.Fragment key={ei}>
              {isDropFirst && (
                <div className="row" style={{gap:10, padding:"8px 14px", background:"var(--accent-soft)", borderRadius:8, color:"var(--accent-ink)", fontSize:12.5}}>
                  <Icons.Drop/>
                  <strong>Drop set</strong> — wypełnij każdy drop osobno; pamiętaj, że dropy były robione bez przerwy.
                </div>
              )}
              <div className="card" style={{padding:0, overflow:"hidden", ...(exrec.blockKind === "dropset" ? { borderColor:"var(--accent)", borderLeftWidth:3 } : {})}}>
                <div className="row" style={{padding:"14px 18px", gap:14, borderBottom:"1px solid var(--line)"}}>
                  <div className="mono" style={{fontSize:12, color:"var(--muted)", width:24}}>{String(ei+1).padStart(2,"0")}</div>
                  <div style={{flex:1}}>
                    <div className="row" style={{gap:10}}>
                      <h3 style={{fontSize:16}}>{ex.name}</h3>
                      <UnitTag unit={ex.unit}/>
                      {exrec.blockKind === "superset" && (
                        <span className="badge"><Icons.Link/> Superset</span>
                      )}
                      {exrec.blockKind === "dropset" && (
                        <span className="badge" style={{background:"var(--accent-soft)", color:"var(--accent-ink)", borderColor:"transparent"}}>
                          <Icons.Drop/> Drop {exrec.dropIndex+1} / {exrec.dropTotal}
                        </span>
                      )}
                    </div>
                    <div className="muted mono" style={{fontSize:11, marginTop:3, textTransform:"uppercase", letterSpacing:".06em"}}>
                      Plan: {exrec.target.sets} × {exrec.target.reps} {ex.unit === "SEC" ? "sek" : "powt."}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-ghost"><Icons.Play/> Zobacz technikę</button>
                </div>

                <div style={{padding:"14px 18px"}}>
                {exrec.sets.map((s, si) => (
                  <div key={si} style={{
                    display:"grid",
                    gridTemplateColumns: "60px 130px 1fr auto auto",
                    gap:14,
                    alignItems:"center",
                    padding:"12px 0",
                    borderTop: si > 0 ? "1px dashed var(--line)" : "none",
                  }}>
                    <div>
                      <div className="mono muted" style={{fontSize:10, textTransform:"uppercase"}}>Seria</div>
                      <div className="mono" style={{fontSize:18, fontWeight:600}}>#{si+1}</div>
                    </div>
                    <div>
                      <div className="mono muted" style={{fontSize:10, textTransform:"uppercase"}}>{ex.unit === "REPS" ? "Powtórzenia" : "Sekundy"}</div>
                      <div className="row" style={{gap:6, marginTop:4}}>
                        <button className="btn btn-icon btn-sm" onClick={() => updateSet(ei, si, { reps: Math.max(0, s.reps - 1) })}>
                          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
                        </button>
                        <input className="input input-num" style={{width:60}}
                          type="number" min="0"
                          value={s.reps}
                          onChange={e => updateSet(ei, si, { reps: parseInt(e.target.value) || 0 })}/>
                        <button className="btn btn-icon btn-sm" onClick={() => updateSet(ei, si, { reps: s.reps + 1 })}>
                          <Icons.Plus/>
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="mono muted" style={{fontSize:10, textTransform:"uppercase"}}>Trudność (RPE)</div>
                      <div style={{marginTop:4}}>
                        <DifficultyPicker value={s.diff} onChange={v => updateSet(ei, si, { diff: v })}/>
                      </div>
                    </div>
                    <div>
                      <button className={"btn btn-sm " + (s.video ? "btn-dark" : "")}
                        onClick={() => updateSet(ei, si, { video: !s.video })}>
                        {s.video ? <><Icons.Check/> Video</> : <><Icons.Upload/> Video</>}
                      </button>
                    </div>
                    <div>
                      {si < exrec.sets.length - 1 && (
                        <button className="btn btn-ghost btn-sm" title="Skopiuj wartości do kolejnych serii"
                          onClick={() => copyDown(ei, si)}>
                          <Icons.ChevDown/> ditto
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* "bez przerwy" connector between adjacent drops */}
            {exrec.blockKind === "dropset" && !isDropLast && (
              <div style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"6px 14px",
                color:"var(--accent-ink)",
                background:"var(--accent-soft)",
                borderRadius: 4,
                alignSelf:"flex-start",
                marginLeft: 22,
                fontFamily:"var(--font-mono)", fontSize:10,
                textTransform:"uppercase", letterSpacing:".08em",
              }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
                bez przerwy do kolejnego dropa
              </div>
            )}
          </React.Fragment>
          );
        })}

        <div className="card">
          <div className="field">
            <label>Notatka do sesji (opcjonalna)</label>
            <textarea className="textarea" placeholder="Jak Ci poszło? Co czułeś? Co warto zapamiętać przed kolejną sesją…"
              value={form.note}
              onChange={e => setForm({...form, note: e.target.value})}/>
          </div>
        </div>

        <div className="row between" style={{paddingTop:8}}>
          <div className="muted" style={{fontSize:13}}>
            <span className="mono bold" style={{color:"var(--ink)"}}>{completedSets}/{totalSets}</span> serii zarejestrowanych
          </div>
          <div className="row" style={{gap:8}}>
            <button className="btn btn-ghost" onClick={() => go({ view:"trainee-session-detail", sessionId})}>Anuluj</button>
            <button className="btn btn-primary btn-lg" onClick={save}>
              <Icons.Check/> Zapisz trening
            </button>
          </div>
        </div>
      </div>

      {saved && <Toast>Trening zapisany — świetna robota!</Toast>}
    </div>
  );
}

// ============================================================
// TRAINEE HISTORY
// ============================================================
function TraineeHistory({ go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const logs = DATA.logsForClient(TRAINEE_ID).sort((a,b) => b.date.localeCompare(a.date));
  // group by month
  const byMonth = {};
  logs.forEach(l => {
    const d = new Date(l.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(l);
  });

  return (
    <div className="view-fade">
      <Pagehead title="Twoja historia" sub={`${logs.length} zarejestrowanych treningów`}/>
      {Object.entries(byMonth).map(([month, items]) => {
        const d = new Date(month + "-01");
        const monthName = d.toLocaleDateString("pl-PL", { month:"long", year:"numeric"});
        return (
          <div key={month} style={{marginBottom:20}}>
            <div className="row between" style={{marginBottom:10}}>
              <h3 style={{fontSize:14, textTransform:"capitalize"}}>{monthName}</h3>
              <span className="mono muted" style={{fontSize:11}}>{items.length} sesji</span>
            </div>
            <div className="list">
              {items.map(log => (
                <div key={log.id} className="list-row"
                  style={{gridTemplateColumns:"auto 1fr auto auto", gap:14}}
                  onClick={() => go({ view:"trainee-log-detail", logId: log.id })}>
                  <div style={{textAlign:"center", width:42}}>
                    <div className="mono" style={{fontSize:18, fontWeight:600}}>{new Date(log.date).getDate()}</div>
                    <div className="muted mono" style={{fontSize:10, textTransform:"uppercase"}}>{["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"][new Date(log.date).getMonth()]}</div>
                  </div>
                  <div>
                    <div style={{fontSize:14, fontWeight:500}}>{log.sessionName}</div>
                    <div className="muted" style={{fontSize:12, marginTop:2}}>
                      <span className="mono">{log.exercises.length}</span> ćwiczeń · trudność <span className="mono">{DATA.avgDiff(log)}/10</span>
                      {log.hasVideo && <> · <span className="mono">video</span></>}
                    </div>
                  </div>
                  <div>
                    <span className="badge">
                      <span className="badge-dot" style={{background: DATA.avgDiff(log)<=5 ? "var(--ok)" : DATA.avgDiff(log)<=7 ? "var(--warn)" : "var(--danger)"}}/>
                      <span className="mono">{DATA.avgDiff(log)}</span>
                    </span>
                  </div>
                  <Icons.Chev style={{color:"var(--muted-2)"}}/>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Reuse trainer's workout detail view for trainee (read-only)
function TraineeLogDetail({ logId, go }) {
  const DATA = useStore();
  const log = DATA.LOGS.find(l => l.id === logId);
  if (!log) return null;
  const totalSets = DATA.totalSets(log);
  const avg = DATA.avgDiff(log);

  return (
    <div className="view-fade">
      <Crumbs items={[{label:"Historia", onClick: () => go({ view:"trainee-history"})}]} current={log.sessionName}/>

      <div className="row between" style={{paddingBottom:22, marginBottom:26, borderBottom:"1px solid var(--line)", alignItems:"flex-end"}}>
        <div>
          <div className="eyebrow">{DATA.fmtDate(log.date)} · {DATA.daysAgo(log.date)}</div>
          <h1 style={{fontSize:26}}>{log.sessionName}</h1>
          <div className="row" style={{gap:14, marginTop:6, color:"var(--muted)", fontSize:13.5}}>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{log.exercises.length}</span> ćwiczeń</span>
            <span>·</span>
            <span><span className="mono bold" style={{color:"var(--ink)"}}>{totalSets}</span> serii</span>
            <span>·</span>
            <span>śr. trudność <span className="mono bold" style={{color:"var(--ink)"}}>{avg}/10</span></span>
          </div>
        </div>
      </div>

      {log.note && (
        <div className="card" style={{padding:16, marginBottom:20, borderLeft:"3px solid var(--accent)", borderRadius:"4px 12px 12px 4px"}}>
          <div className="row" style={{gap:10, alignItems:"flex-start"}}>
            <Icons.Note style={{color:"var(--muted)", fontSize:18, marginTop:2}}/>
            <div style={{fontSize:14, lineHeight:1.5}}>{log.note}</div>
          </div>
        </div>
      )}

      <div className="col" style={{gap:16}}>
        {log.exercises.map((rec, i) => {
          const ex = DATA.exById(rec.exId);
          const exAvg = rec.sets.reduce((a,s) => a+s.diff, 0) / rec.sets.length;
          return (
            <div key={i} className="card" style={{padding:18}}>
              <div className="row between" style={{marginBottom:12}}>
                <div className="row" style={{gap:10}}>
                  <h3 style={{fontSize:15.5}}>{ex.name}</h3>
                  <UnitTag unit={ex.unit}/>
                </div>
                <span className="badge"><span className="badge-dot" style={{background: exAvg<=5?"var(--ok)":exAvg<=7?"var(--warn)":"var(--danger)"}}/><span className="mono">{exAvg.toFixed(1)}/10</span></span>
              </div>
              <div className="col" style={{gap:6}}>
                {rec.sets.map((s, si) => (
                  <div key={si} className="row" style={{gap:14, padding:"6px 0", borderTop: si > 0 ? "1px dashed var(--line)" : "none"}}>
                    <span className="mono muted" style={{fontSize:12, width:30}}>#{si+1}</span>
                    <span className="mono" style={{fontSize:14, fontWeight:600, width:80}}>{s.reps} {ex.unit.toLowerCase()}</span>
                    <div style={{flex:1, display:"flex", gap:2}}>
                      {Array.from({length:10}, (_,n) => (
                        <div key={n} style={{flex:1, height:6, borderRadius:2, background: n < s.diff ? (s.diff<=5?"var(--ok)":s.diff<=7?"var(--warn)":"var(--danger)") : "var(--surface-2)"}}/>
                      ))}
                    </div>
                    <span className="mono" style={{fontSize:12, width:40, textAlign:"right"}}>{s.diff}/10</span>
                    {s.video && <span className="tag"><Icons.Play/></span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.TraineeViews = { TraineeDashboard, TraineeSessions, TraineeSessionDetail, TraineeLogForm, TraineeHistory, TraineeLogDetail };
