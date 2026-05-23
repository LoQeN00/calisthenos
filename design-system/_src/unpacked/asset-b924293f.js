/* global React, Icons, UI, DATA, useStore */
// trainer-plan-editor.jsx — the key trainer view for building plans

const { Avatar, Badge, StatusBadge, UnitTag, VideoTile, Modal, Pagehead, Crumbs, EmptyState } = UI;
const { useState, useEffect, useMemo, useRef } = React;

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

function newBlock(kind = "single", exId = "ex_pl") {
  const base = (id) => ({ exId: id, sets: 3, reps: 8, rest: "60s", note: "" });
  if (kind === "superset") return { id: "b" + Math.random().toString(36).slice(2,6), kind:"superset", exercises: [base("ex_pl"), base("ex_hr")] };
  if (kind === "dropset")  return {
    id: "b" + Math.random().toString(36).slice(2,6),
    kind: "dropset",
    // For dropset, sets/rest apply to the whole sequence; each "drop" has its own target reps
    sets: 3,
    rest: "120s",
    drops: [
      { exId: "ex_ar",  reps: 5,  note: "" },
      { exId: "ex_pl",  reps: 8,  note: "" },
      { exId: "ex_ch",  reps: 10, note: "" },
    ],
  };
  return { id: "b" + Math.random().toString(36).slice(2,6), kind:"single", exercises: [base(exId)] };
}
function newSession(idx) {
  return { id: "s" + Math.random().toString(36).slice(2,6), name: `Sesja ${idx}`, blocks: [] };
}

// ============================================================
// EXERCISE PICKER
// ============================================================
function ExercisePicker({ open, onClose, onPick }) {
  const DATA = useStore();
  const [q, setQ] = useState("");
  const list = DATA.EXERCISES.filter(e => e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="Wybierz z biblioteki" wide>
      <div className="input-search">
        <Icons.Search/>
        <input autoFocus className="input" placeholder="Szukaj ćwiczenia…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div style={{maxHeight: 380, overflow:"auto", marginTop:10, display:"grid", gap:6}}>
        {list.map(ex => (
          <button key={ex.id} className="btn"
            style={{justifyContent:"flex-start", height:"auto", padding:"10px 12px", gap:12, textAlign:"left"}}
            onClick={() => { onPick(ex.id); onClose(); }}>
            <div style={{width:36, height:36, background:"var(--ink)", color:"var(--bg)", borderRadius:6, display:"grid", placeItems:"center"}}>
              <Icons.Play/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:500, fontSize:14}}>{ex.name}</div>
              <div className="muted" style={{fontSize:12}}>{ex.tags.join(" · ")}</div>
            </div>
            <UnitTag unit={ex.unit}/>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ============================================================
// PLAN EDITOR
// ============================================================
function PlanEditor({ planId, clientId, go }) {
  const DATA = useStore();
  const isNew = planId === "new";
  const client = DATA.clientById(clientId);
  const originalPlan = !isNew ? DATA.planById(planId) : null;

  const [plan, setPlan] = useState(() => {
    if (originalPlan) {
      // If the plan is active, editing creates a new draft with bumped version.
      // If the plan is already a draft, we edit it in place.
      if (originalPlan.status === "active") {
        // look for existing draft based on this plan
        const existingDraft = DATA.plans.find(p =>
          p.clientId === originalPlan.clientId &&
          p.status === "draft" &&
          p.basesOn === originalPlan.version
        );
        if (existingDraft) return deepClone(existingDraft);
        return {
          ...deepClone(originalPlan),
          id: "new",
          version: originalPlan.version + 1,
          basesOn: originalPlan.version,
          status: "draft",
          created: DATA.todayISO(),
          published: null,
        };
      }
      return deepClone(originalPlan);
    }
    return {
      id: "new",
      clientId,
      name: "Nowy plan",
      version: 1,
      status: "draft",
      created: DATA.todayISO(),
      sessions: [],
    };
  });

  const [editingName, setEditingName] = useState(false);
  const [pickerFor, setPickerFor] = useState(null); // { sessionIdx, blockIdx, exerciseIdx } | null
  const [expanded, setExpanded] = useState(() => new Set(plan.sessions.map((_,i) => i)));
  const [toast, setToast] = useState(null);

  // Drag state
  const [drag, setDrag] = useState(null);

  // Show preview-of-changes badge when modifying an active plan (will create new version)
  const willCreateNewVersion = originalPlan && originalPlan.status === "active";

  function updateBlock(si, bi, patch) {
    setPlan(p => {
      const c = deepClone(p);
      c.sessions[si].blocks[bi] = { ...c.sessions[si].blocks[bi], ...patch };
      return c;
    });
  }
  function updateExercise(si, bi, ei, patch) {
    setPlan(p => {
      const c = deepClone(p);
      const ex = c.sessions[si].blocks[bi].exercises[ei];
      c.sessions[si].blocks[bi].exercises[ei] = { ...ex, ...patch };
      return c;
    });
  }
  function addSession() {
    setPlan(p => {
      const c = deepClone(p);
      c.sessions.push(newSession(c.sessions.length + 1));
      setExpanded(prev => new Set([...prev, c.sessions.length - 1]));
      return c;
    });
  }
  function deleteSession(si) {
    setPlan(p => {
      const c = deepClone(p);
      c.sessions.splice(si, 1);
      return c;
    });
  }
  function addBlock(si, kind) {
    setPlan(p => {
      const c = deepClone(p);
      c.sessions[si].blocks.push(newBlock(kind));
      return c;
    });
  }
  function deleteBlock(si, bi) {
    setPlan(p => {
      const c = deepClone(p);
      c.sessions[si].blocks.splice(bi, 1);
      return c;
    });
  }
  function moveSession(from, to) {
    if (from === to) return;
    setPlan(p => {
      const c = deepClone(p);
      const [item] = c.sessions.splice(from, 1);
      c.sessions.splice(to, 0, item);
      return c;
    });
  }
  function moveBlock(si, from, to) {
    if (from === to) return;
    setPlan(p => {
      const c = deepClone(p);
      const [item] = c.sessions[si].blocks.splice(from, 1);
      c.sessions[si].blocks.splice(to, 0, item);
      return c;
    });
  }
  function pickExercise(exId) {
    if (!pickerFor) return;
    const { si, bi, ei } = pickerFor;
    const block = plan.sessions[si].blocks[bi];
    if (ei === "add") {
      // adding a 2nd exercise to make superset
      setPlan(p => {
        const c = deepClone(p);
        c.sessions[si].blocks[bi].exercises.push({
          exId, sets: 3, reps: 8, rest: "60s", note: ""
        });
        c.sessions[si].blocks[bi].kind = "superset";
        return c;
      });
    } else if (block.kind === "dropset") {
      // drops[ei]
      setPlan(p => {
        const c = deepClone(p);
        c.sessions[si].blocks[bi].drops[ei] = { ...c.sessions[si].blocks[bi].drops[ei], exId };
        return c;
      });
    } else {
      updateExercise(si, bi, ei, { exId });
    }
  }
  function saveDraft() {
    const savedId = DATA.savePlan(plan);
    if (plan.id === "new") setPlan(p => ({ ...p, id: savedId }));
    setToast("Draft zapisany");
    setTimeout(() => setToast(null), 1800);
  }
  function publish() {
    const savedId = DATA.savePlan(plan);
    if (plan.id === "new") setPlan(p => ({ ...p, id: savedId }));
    DATA.publishPlan(savedId);
    setToast("Plan opublikowany — wersja " + plan.version);
    setTimeout(() => {
      setToast(null);
      go({ view: "client-detail", clientId });
    }, 1400);
  }

  const totalBlocks = plan.sessions.reduce((a,s) => a + s.blocks.length, 0);
  const totalSets = plan.sessions.reduce((a,s) => a + s.blocks.reduce((b, blk) => b + DATA.blockSetCount(blk), 0), 0);

  return (
    <div className="view-fade">
      <Crumbs items={[
        {label:"Podopieczni", onClick: () => go({ view:"clients"})},
        {label: client?.name || "—", onClick: () => go({ view:"client-detail", clientId})}
      ]} current={isNew ? "Nowy plan" : `Edytor · ${plan.name}`}/>

      {/* Page head */}
      <div style={{paddingBottom:22, marginBottom:24, borderBottom:"1px solid var(--line)"}}>
        <div className="row" style={{gap:10, marginBottom:8}}>
          <StatusBadge status="draft"/>
          {originalPlan && (
            <span className="mono muted" style={{fontSize:12}}>
              {willCreateNewVersion
                ? `Wersja ${(originalPlan.version||1)+1} (Draft) — bazuje na Wersji ${originalPlan.version}`
                : `Wersja ${plan.version} (Draft)`}
            </span>
          )}
          {isNew && <span className="mono muted" style={{fontSize:12}}>Wersja 1 (Draft) — nowy plan dla {client?.name}</span>}
        </div>
        <div className="row between" style={{alignItems:"flex-start"}}>
          <div style={{flex:1, marginRight:24}}>
            {editingName ? (
              <input autoFocus
                value={plan.name}
                onChange={e => setPlan({...plan, name: e.target.value})}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => e.key === "Enter" && setEditingName(false)}
                style={{
                  fontFamily:"var(--font-display)", fontSize:28, fontWeight:600,
                  border:"none", outline:"none", background:"transparent",
                  width:"100%", color:"var(--ink)", padding:0,
                  letterSpacing:"-0.01em", borderBottom: "1px dashed var(--accent)"
                }}/>
            ) : (
              <h1 style={{fontSize:28, lineHeight:1.1, cursor:"text"}} onClick={() => setEditingName(true)}>
                {plan.name} <Icons.Edit style={{fontSize:18, color:"var(--muted-2)", verticalAlign:"baseline"}}/>
              </h1>
            )}
            <div className="muted" style={{fontSize:13.5, marginTop:6}}>
              Dla <span style={{color:"var(--ink)", fontWeight:500}}>{client?.name}</span> ·{" "}
              <span className="mono">{plan.sessions.length}</span> sesji ·{" "}
              <span className="mono">{totalBlocks}</span> bloków ·{" "}
              <span className="mono">{totalSets}</span> serii łącznie
            </div>
          </div>
          <div className="row" style={{gap:8}}>
            <button className="btn btn-ghost" onClick={() => go({ view:"client-detail", clientId })}>Anuluj</button>
            <button className="btn" onClick={saveDraft}>Zapisz draft</button>
            <button className="btn btn-primary" onClick={publish} disabled={plan.sessions.length === 0}>
              <Icons.Check/> Publikuj plan
            </button>
          </div>
        </div>
      </div>

      {/* Sessions */}
      <div className="col" style={{gap:16}}>
        {plan.sessions.length === 0 && (
          <EmptyState
            icon={Icons.Plans}
            title="Plan jeszcze nie zawiera sesji"
            sub="Dodaj pierwszą sesję, żeby zacząć układać bloki ćwiczeń."
            action={<button className="btn btn-primary" onClick={addSession}><Icons.Plus/> Dodaj sesję</button>}
          />
        )}
        {plan.sessions.map((session, si) => (
          <SessionEditor key={session.id}
            session={session}
            si={si}
            expanded={expanded.has(si)}
            onToggle={() => setExpanded(e => {
              const n = new Set(e);
              if (n.has(si)) n.delete(si); else n.add(si);
              return n;
            })}
            onRename={name => setPlan(p => { const c = deepClone(p); c.sessions[si].name = name; return c; })}
            onDelete={() => deleteSession(si)}
            onAddBlock={kind => { addBlock(si, kind); setExpanded(e => new Set([...e, si])); }}
            onUpdateBlock={(bi, patch) => updateBlock(si, bi, patch)}
            onUpdateExercise={(bi, ei, patch) => updateExercise(si, bi, ei, patch)}
            onDeleteBlock={(bi) => deleteBlock(si, bi)}
            onPickExercise={(bi, ei) => setPickerFor({ si, bi, ei })}
            onMoveSession={(to) => moveSession(si, to)}
            sessionCount={plan.sessions.length}
            onMoveBlock={(from, to) => moveBlock(si, from, to)}
          />
        ))}

        {plan.sessions.length > 0 && (
          <button className="btn" style={{alignSelf:"flex-start"}} onClick={addSession}>
            <Icons.Plus/> Dodaj sesję
          </button>
        )}
      </div>

      <ExercisePicker open={!!pickerFor} onClose={() => setPickerFor(null)} onPick={pickExercise}/>

      {toast && <UI.Toast>{toast}</UI.Toast>}
    </div>
  );
}

// ============================================================
// SESSION EDITOR
// ============================================================
function SessionEditor({ session, si, expanded, onToggle, onRename, onDelete, onAddBlock, onUpdateBlock, onUpdateExercise, onDeleteBlock, onPickExercise, onMoveSession, sessionCount, onMoveBlock }) {
  const DATA = useStore();
  const [editingName, setEditingName] = useState(false);
  const [menu, setMenu] = useState(false);

  return (
    <div className="card" style={{padding:0, overflow:"visible"}}>
      <div className="row" style={{padding:"14px 18px", gap:14, borderBottom: expanded ? "1px solid var(--line)" : "none", background: "var(--surface)", borderRadius: expanded ? "14px 14px 0 0" : "14px"}}>
        <button className="btn btn-icon btn-ghost btn-sm" onClick={onToggle} style={{transform: expanded ? "rotate(90deg)" : "none", transition:"transform .15s ease"}}>
          <Icons.Chev/>
        </button>
        <div className="mono" style={{width:30, textAlign:"center", color:"var(--muted)", fontSize:13}}>
          {String(si + 1).padStart(2, "0")}
        </div>
        <div style={{flex:1}}>
          {editingName ? (
            <input autoFocus
              value={session.name}
              onChange={e => onRename(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => e.key === "Enter" && setEditingName(false)}
              style={{
                fontFamily:"var(--font-display)", fontSize:16, fontWeight:600,
                border:"none", outline:"none", background:"transparent",
                width:"100%", color:"var(--ink)", padding:0,
              }}/>
          ) : (
            <h3 style={{fontSize:15.5, cursor:"text"}} onClick={() => setEditingName(true)}>{session.name}</h3>
          )}
          <div className="muted" style={{fontSize:12, marginTop:2}}>
            <span className="mono">{session.blocks.length}</span> bloków ·{" "}
            <span className="mono">{session.blocks.reduce((a,b) => a + DATA.blockExerciseCount(b), 0)}</span> ćwiczeń
          </div>
        </div>
        <div className="row" style={{gap:4}}>
          <button className="btn btn-icon btn-ghost btn-sm" disabled={si===0} onClick={() => onMoveSession(si-1)} title="W górę">
            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button className="btn btn-icon btn-ghost btn-sm" disabled={si===sessionCount-1} onClick={() => onMoveSession(si+1)} title="W dół">
            <Icons.ChevDown/>
          </button>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onDelete} title="Usuń sesję">
            <Icons.Trash/>
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{padding:18, background:"var(--bg)", borderRadius:"0 0 14px 14px"}}>
          {session.blocks.length === 0 && (
            <div className="empty" style={{padding:"28px 16px"}}>
              <div className="muted" style={{fontSize:13, marginBottom:10}}>Sesja jest pusta. Dodaj pierwszy blok.</div>
              <div className="row" style={{gap:8, justifyContent:"center", flexWrap:"wrap"}}>
                <button className="btn btn-sm" onClick={() => onAddBlock("single")}><Icons.Plus/> Pojedyncze ćwiczenie</button>
                <button className="btn btn-sm" onClick={() => onAddBlock("superset")}><Icons.Link/> Superset</button>
                <button className="btn btn-sm" onClick={() => onAddBlock("dropset")}><Icons.Drop/> Drop set</button>
              </div>
            </div>
          )}

          {session.blocks.map((block, bi) => (
            <BlockEditor key={block.id}
              block={block}
              bi={bi}
              blockCount={session.blocks.length}
              onPickExercise={(ei) => onPickExercise(bi, ei)}
              onUpdateBlock={(patch) => onUpdateBlock(bi, patch)}
              onUpdateExercise={(ei, patch) => onUpdateExercise(bi, ei, patch)}
              onDelete={() => onDeleteBlock(bi)}
              onMove={(to) => onMoveBlock(bi, to)}
            />
          ))}

          {session.blocks.length > 0 && (
            <div className="row" style={{gap:8, marginTop:6, flexWrap:"wrap"}}>
              <button className="btn btn-sm" onClick={() => onAddBlock("single")}><Icons.Plus/> Pojedyncze</button>
              <button className="btn btn-sm" onClick={() => onAddBlock("superset")}><Icons.Link/> Superset</button>
              <button className="btn btn-sm" onClick={() => onAddBlock("dropset")}><Icons.Drop/> Drop set</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BLOCK EDITOR
// ============================================================
function BlockEditor({ block, bi, blockCount, onPickExercise, onUpdateBlock, onUpdateExercise, onDelete, onMove }) {
  const DATA = useStore();

  const blockLabel = block.kind === "superset"
    ? "Superset · 2 ćwicz. naprzemiennie"
    : block.kind === "dropset"
      ? `Drop set · ${block.drops?.length || 0} dropy bez przerwy`
      : "Pojedyncze";

  function updateDrop(di, patch) {
    const drops = block.drops.map((d, i) => i === di ? { ...d, ...patch } : d);
    onUpdateBlock({ drops });
  }
  function addDrop() {
    const drops = [...block.drops, { exId: "ex_ch", reps: 10, note: "" }];
    onUpdateBlock({ drops });
  }
  function removeDrop(di) {
    if (block.drops.length <= 2) return; // dropset min 2 drops
    const drops = block.drops.filter((_, i) => i !== di);
    onUpdateBlock({ drops });
  }
  function moveDropDown(di) {
    if (di >= block.drops.length - 1) return;
    const drops = [...block.drops];
    [drops[di], drops[di+1]] = [drops[di+1], drops[di]];
    onUpdateBlock({ drops });
  }
  function moveDropUp(di) {
    if (di <= 0) return;
    const drops = [...block.drops];
    [drops[di], drops[di-1]] = [drops[di-1], drops[di]];
    onUpdateBlock({ drops });
  }

  return (
    <div className="block">
      <div className="block-head">
        <Icons.Drag className="grab"/>
        <div className="mono" style={{fontSize:11, color:"var(--muted)", letterSpacing:".06em", textTransform:"uppercase", marginRight:8, display:"flex", alignItems:"center", gap:6}}>
          {block.kind === "dropset" && <Icons.Drop style={{color:"var(--accent-ink)", background:"var(--accent)", padding:2, borderRadius:3, fontSize:10}}/>}
          Blok {String.fromCharCode(65 + bi)} · {blockLabel}
        </div>
        <div style={{flex:1}}/>
        <div className="row" style={{gap:4}}>
          <button className="btn btn-icon btn-ghost btn-sm" disabled={bi===0} onClick={() => onMove(bi-1)} title="W górę">
            <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
          </button>
          <button className="btn btn-icon btn-ghost btn-sm" disabled={bi===blockCount-1} onClick={() => onMove(bi+1)} title="W dół">
            <Icons.ChevDown/>
          </button>
          <button className="btn btn-icon btn-ghost btn-sm" onClick={onDelete} title="Usuń blok">
            <Icons.Trash/>
          </button>
        </div>
      </div>

      {block.kind === "dropset" ? (
        <DropsetBody
          block={block}
          onPickExercise={onPickExercise}
          updateDrop={updateDrop}
          addDrop={addDrop}
          removeDrop={removeDrop}
          moveDropDown={moveDropDown}
          moveDropUp={moveDropUp}
          onUpdateBlock={onUpdateBlock}
        />
      ) : (
        <div className="block-body">
          {block.exercises.map((exercise, ei) => {
            const ex = DATA.exById(exercise.exId);
            return (
              <div key={ei} style={{
                padding:14,
                background: "var(--bg)",
                border:"1px solid var(--line)",
                borderRadius:10,
                display:"grid",
                gridTemplateColumns: "1.6fr 0.7fr 0.9fr 0.7fr",
                gap:14,
                alignItems: "center",
              }}>
                <div>
                  {block.kind === "superset" && (
                    <div className="mono muted" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4}}>
                      {ei === 0 ? "A · pierwsze" : "B · drugie"}
                    </div>
                  )}
                  <button className="btn"
                    style={{justifyContent:"flex-start", width:"100%", height:42, padding:"0 12px", gap:10}}
                    onClick={() => onPickExercise(ei)}>
                    <div style={{width:28, height:28, background:"var(--ink)", color:"var(--bg)", borderRadius:5, display:"grid", placeItems:"center", flexShrink:0}}>
                      <Icons.Play style={{fontSize:13}}/>
                    </div>
                    <span style={{flex:1, textAlign:"left", fontWeight:500}}>{ex?.name || "?"}</span>
                    {ex && <UnitTag unit={ex.unit}/>}
                    <Icons.ChevDown style={{color:"var(--muted)"}}/>
                  </button>
                  {exercise.note && (
                    <input
                      className="input"
                      style={{marginTop:8, fontSize:12.5, fontStyle:"italic"}}
                      placeholder="Notatka do ćwiczenia…"
                      value={exercise.note}
                      onChange={e => onUpdateExercise(ei, { note: e.target.value })}/>
                  )}
                  {!exercise.note && (
                    <button className="btn btn-ghost btn-sm" style={{padding:"4px 0", marginTop:6}}
                      onClick={() => onUpdateExercise(ei, { note: " " })}>
                      <Icons.Plus style={{fontSize:12}}/> Notatka
                    </button>
                  )}
                </div>
                <div className="field">
                  <label>Serie</label>
                  <input className="input input-num" type="number" min="1"
                    value={exercise.sets}
                    onChange={e => onUpdateExercise(ei, { sets: parseInt(e.target.value)||1 })}/>
                </div>
                <div className="field">
                  <label>{ex?.unit === "REPS" ? "Powtórzeń" : "Sekund"}</label>
                  <input className="input input-num" type="number" min="1"
                    value={exercise.reps}
                    onChange={e => onUpdateExercise(ei, { reps: parseInt(e.target.value)||1 })}/>
                </div>
                <div className="field">
                  <label>Przerwa</label>
                  <input className="input input-num"
                    value={exercise.rest}
                    onChange={e => onUpdateExercise(ei, { rest: e.target.value })}/>
                </div>
              </div>
            );
          })}
          {block.kind === "single" && (
            <button className="btn btn-ghost btn-sm" style={{alignSelf:"flex-start"}}
              onClick={() => onPickExercise("add")}>
              <Icons.Link/> Zamień na superset (dodaj 2. ćwiczenie)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DROPSET BODY
// ============================================================
function DropsetBody({ block, onPickExercise, updateDrop, addDrop, removeDrop, moveDropDown, moveDropUp, onUpdateBlock }) {
  const DATA = useStore();
  return (
    <div className="block-body">
      <div className="card" style={{background:"var(--accent-soft)", borderColor:"transparent", padding:"10px 14px"}}>
        <div className="row" style={{gap:10, fontSize:12.5, color:"var(--accent-ink)"}}>
          <Icons.Drop/>
          <div>
            <strong>Drop set</strong> — wykonaj wszystkie {block.drops.length} dropy <strong>jeden po drugim bez przerwy</strong>. Dopiero potem odpoczynek i kolejna seria. Zaczynamy od najtrudniejszego wariantu, kończymy najłatwiejszym.
          </div>
        </div>

        <div className="row" style={{gap:14, marginTop:12}}>
          <div className="field" style={{maxWidth:120}}>
            <label>Serie</label>
            <input className="input input-num" type="number" min="1"
              value={block.sets}
              onChange={e => onUpdateBlock({ sets: parseInt(e.target.value)||1 })}/>
          </div>
          <div className="field" style={{maxWidth:140}}>
            <label>Przerwa po serii</label>
            <input className="input input-num"
              value={block.rest}
              onChange={e => onUpdateBlock({ rest: e.target.value })}/>
          </div>
        </div>
      </div>

      <div style={{display:"flex", flexDirection:"column", gap:0, marginTop:12}}>
        {block.drops.map((drop, di) => {
          const ex = DATA.exById(drop.exId);
          return (
            <React.Fragment key={di}>
              <div style={{
                padding:12,
                background: "var(--bg)",
                border:"1px solid var(--line)",
                borderRadius:10,
                display:"grid",
                gridTemplateColumns: "auto 1.4fr 0.9fr auto",
                gap:12,
                alignItems: "center",
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: di === 0 ? "var(--ink)" : "var(--surface-2)",
                  color: di === 0 ? "var(--bg)" : "var(--ink)",
                  display:"grid", placeItems:"center",
                  fontFamily:"var(--font-mono)", fontSize:11, fontWeight:600,
                }}>{di+1}</div>
                <button className="btn"
                  style={{justifyContent:"flex-start", width:"100%", height:38, padding:"0 12px", gap:10}}
                  onClick={() => onPickExercise(di)}>
                  <div style={{width:22, height:22, background:"var(--ink)", color:"var(--bg)", borderRadius:4, display:"grid", placeItems:"center", flexShrink:0}}>
                    <Icons.Play style={{fontSize:11}}/>
                  </div>
                  <span style={{flex:1, textAlign:"left", fontWeight:500, fontSize:13.5}}>{ex?.name || "?"}</span>
                  {ex && <UnitTag unit={ex.unit}/>}
                </button>
                <div className="row" style={{gap:6, alignItems:"center"}}>
                  <input className="input input-num" type="number" min="1"
                    value={drop.reps}
                    style={{width:60}}
                    onChange={e => updateDrop(di, { reps: parseInt(e.target.value)||1 })}/>
                  <span className="mono muted" style={{fontSize:11}}>
                    {ex?.unit === "SEC" ? "sek" : "powt."}
                  </span>
                </div>
                <div className="row" style={{gap:2}}>
                  <button className="btn btn-icon btn-ghost btn-sm" disabled={di===0} onClick={() => moveDropUp(di)} title="W górę">
                    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                  </button>
                  <button className="btn btn-icon btn-ghost btn-sm" disabled={di===block.drops.length-1} onClick={() => moveDropDown(di)} title="W dół">
                    <Icons.ChevDown/>
                  </button>
                  <button className="btn btn-icon btn-ghost btn-sm" disabled={block.drops.length <= 2} onClick={() => removeDrop(di)} title="Usuń drop">
                    <Icons.Trash/>
                  </button>
                </div>
              </div>
              {di < block.drops.length - 1 && (
                <div style={{
                  display:"flex", alignItems:"center", gap:8,
                  paddingLeft: 28, color:"var(--muted)",
                  fontFamily:"var(--font-mono)", fontSize:10,
                  textTransform:"uppercase", letterSpacing:".08em",
                  height: 24,
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft:-4}}>
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                  </svg>
                  bez przerwy
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <button className="btn btn-ghost btn-sm" style={{alignSelf:"flex-start", marginTop:6}}
        onClick={addDrop} disabled={block.drops.length >= 5}>
        <Icons.Plus/> Dodaj kolejny drop {block.drops.length >= 5 && "(max 5)"}
      </button>
    </div>
  );
}

window.PlanEditor = PlanEditor;
