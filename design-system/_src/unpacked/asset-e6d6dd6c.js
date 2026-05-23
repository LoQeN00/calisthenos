/* global React, ReactDOM, Icons, UI, DATA, TrainerViews, TraineeViews, PlanEditor, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle, useTweaks, StoreProvider, useStore, TweakButton */

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "#C7F23C"
}/*EDITMODE-END*/;

// ============================================================
// USER PICKER (replaces role switch)
// ============================================================
function UserPicker() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = store.currentUser;
  const isTrainer = store.isTrainer;

  return (
    <div ref={ref} style={{position:"relative"}}>
      <button className="userchip" style={{border:0, cursor:"pointer"}} onClick={() => setOpen(o => !o)}>
        <UI.Avatar name={current.name}/>
        <div style={{lineHeight:1.15, textAlign:"left"}}>
          <div style={{fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:6}}>
            {current.name}
            <Icons.ChevDown style={{fontSize:12, color:"var(--muted)"}}/>
          </div>
          <div className="muted mono" style={{fontSize:10, textTransform:"uppercase", letterSpacing:".06em"}}>
            {isTrainer ? "Trener" : "Podopieczny"}
          </div>
        </div>
      </button>

      {open && (
        <div style={{
          position:"absolute", right:0, top:"calc(100% + 6px)",
          background:"var(--surface)",
          border:"1px solid var(--line)",
          borderRadius:12, boxShadow:"var(--shadow-lg)",
          minWidth: 280, padding: 6, zIndex: 200,
          animation:"rise .14s ease",
        }}>
          <div className="mono muted" style={{fontSize:10, padding:"8px 10px 4px", textTransform:"uppercase", letterSpacing:".08em"}}>
            Demo · zaloguj jako
          </div>
          <UserPickerRow
            user={store.trainer}
            subtitle={`Trener · ${store.clients.length} podopiecznych`}
            isActive={current.id === store.trainer.id}
            isTrainer
            onClick={() => { store.setCurrentUser(store.trainer.id); setOpen(false); }}
          />
          <div className="mono muted" style={{fontSize:10, padding:"8px 10px 4px", textTransform:"uppercase", letterSpacing:".08em", marginTop:4}}>
            Podopieczni
          </div>
          {store.clients.map(c => {
            const plan = store.activePlanForClient(c.id);
            return (
              <UserPickerRow key={c.id}
                user={c}
                subtitle={plan ? plan.name : "brak aktywnego planu"}
                isActive={current.id === c.id}
                onClick={() => { store.setCurrentUser(c.id); setOpen(false); }}
              />
            );
          })}
          <div style={{height:1, background:"var(--line)", margin:"6px 4px"}}/>
          <button className="btn btn-ghost btn-sm" style={{width:"100%", justifyContent:"flex-start", padding:"8px 10px"}}
            onClick={() => {
              if (confirm("Zresetować wszystkie dane demo do stanu wyjściowego?")) {
                store.reset();
                setOpen(false);
              }
            }}>
            <Icons.History style={{fontSize:14}}/> Zresetuj dane demo
          </button>
        </div>
      )}
    </div>
  );
}

function UserPickerRow({ user, subtitle, isActive, isTrainer, onClick }) {
  return (
    <button onClick={onClick}
      className="row"
      style={{
        width:"100%", padding:"8px 10px",
        background: isActive ? "var(--surface-2)" : "transparent",
        border:0, borderRadius:8, cursor:"pointer",
        gap: 10, textAlign:"left",
      }}>
      <UI.Avatar name={user.name} size="sm"/>
      <div style={{flex:1}}>
        <div style={{fontSize:13, fontWeight: isActive ? 600 : 500}}>{user.name}</div>
        <div className="muted" style={{fontSize:11, marginTop:1}}>{subtitle}</div>
      </div>
      {isActive && <span className="mono" style={{fontSize:10, color:"var(--accent-ink)", background:"var(--accent)", padding:"2px 6px", borderRadius:4, textTransform:"uppercase", letterSpacing:".06em"}}>aktywny</span>}
      {isTrainer && !isActive && <Icons.Trainer style={{color:"var(--muted)"}}/>}
    </button>
  );
}

// ============================================================
// MAIN APP
// ============================================================
function AppInner() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const store = useStore();
  const isTrainer = store.isTrainer;

  // Default route per role; reset when user changes (different role)
  const [route, setRoute] = useState({ view: isTrainer ? "dashboard" : "trainee-dashboard" });

  // When the user changes between trainer/trainee roles, reset the route
  useEffect(() => {
    setRoute({ view: isTrainer ? "dashboard" : "trainee-dashboard" });
  }, [isTrainer, store.currentUserId]);

  // Theme + accent classes
  useEffect(() => {
    document.body.className = "";
    if (t.theme === "dark") document.body.classList.add("theme-dark");
    if (t.accent === "#FF7A3D") document.body.classList.add("accent-orange");
  }, [t.theme, t.accent]);

  const go = (next) => setRoute(next);

  const trainerNav = [
    { key:"dashboard", label:"Pulpit", icon: Icons.Dashboard },
    { key:"clients", label:"Podopieczni", icon: Icons.Users, tail: store.clients.length },
    { key:"library", label:"Biblioteka ćwiczeń", icon: Icons.Library, tail: store.exercises.length },
    { key:"plans", label:"Plany", icon: Icons.Plans, tail: store.plans.length },
  ];
  const traineeNav = [
    { key:"trainee-dashboard", label:"Mój plan", icon: Icons.Plans },
    { key:"trainee-sessions", label:"Sesje", icon: Icons.Library },
    { key:"trainee-history", label:"Historia", icon: Icons.History },
    { key:"trainee-body", label:"Sylwetka", icon: Icons.Body },
  ];

  const sideActive = (k) => {
    if (k === "clients") return ["clients","client-detail","workout-history","workout-detail","plan-editor","client-body"].includes(route.view);
    if (k === "dashboard") return route.view === "dashboard";
    if (k === "library") return route.view === "library";
    if (k === "plans") return route.view === "plans";
    if (k === "trainee-dashboard") return route.view === "trainee-dashboard";
    if (k === "trainee-sessions") return ["trainee-sessions","trainee-session-detail","trainee-log-form"].includes(route.view);
    if (k === "trainee-history") return ["trainee-history","trainee-log-detail"].includes(route.view);
    if (k === "trainee-body") return route.view === "trainee-body";
    return false;
  };

  const navItems = isTrainer ? trainerNav : traineeNav;

  // Render the active view
  let content = null;
  if (isTrainer) {
    const V = TrainerViews;
    switch(route.view) {
      case "dashboard":        content = <V.TrainerDashboard go={go}/>; break;
      case "clients":          content = <V.TrainerClients go={go}/>; break;
      case "library":          content = <V.ExerciseLibrary go={go}/>; break;
      case "plans":            content = <PlansListView go={go}/>; break;
      case "client-detail":    content = <V.TrainerClientDetail clientId={route.clientId} go={go}/>; break;
      case "workout-history":  content = <V.TrainerWorkoutHistory clientId={route.clientId} go={go}/>; break;
      case "workout-detail":   content = <V.TrainerWorkoutDetail clientId={route.clientId} logId={route.logId} go={go}/>; break;
      case "plan-editor":      content = <PlanEditor planId={route.planId} clientId={route.clientId} go={go}/>; break;
      case "client-body":      content = <BodyViews.TrainerClientBody clientId={route.clientId} go={go}/>; break;
      default: content = <V.TrainerDashboard go={go}/>;
    }
  } else {
    const V = TraineeViews;
    switch(route.view) {
      case "trainee-dashboard":      content = <V.TraineeDashboard go={go}/>; break;
      case "trainee-sessions":       content = <V.TraineeSessions go={go}/>; break;
      case "trainee-session-detail": content = <V.TraineeSessionDetail sessionId={route.sessionId} go={go}/>; break;
      case "trainee-log-form":       content = <V.TraineeLogForm sessionId={route.sessionId} go={go}/>; break;
      case "trainee-history":        content = <V.TraineeHistory go={go}/>; break;
      case "trainee-log-detail":     content = <V.TraineeLogDetail logId={route.logId} go={go}/>; break;
      case "trainee-body":           content = <BodyViews.TraineeBody go={go}/>; break;
      default: content = <V.TraineeDashboard go={go}/>;
    }
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"/>
          <span>kalisthenos</span>
          <span className="brand-dot"/>
        </div>
        <div className="topbar-spacer"/>
        <button className="btn btn-icon btn-ghost" title={t.theme === "dark" ? "Tryb jasny" : "Tryb ciemny"}
          onClick={() => setTweak("theme", t.theme === "dark" ? "light" : "dark")}>
          {t.theme === "dark" ? <Icons.Sun/> : <Icons.Moon/>}
        </button>
        <UserPicker/>
      </div>

      <div className="layout">
        <aside className="sidenav">
          <div className="sidenav-section">{isTrainer ? "Workspace" : "Twoja przestrzeń"}</div>
          {navItems.map(item => (
            <button key={item.key} className={"nav-item" + (sideActive(item.key) ? " active" : "")}
              onClick={() => go({ view: item.key })}>
              <item.icon/>
              <span>{item.label}</span>
              {item.tail != null && <span className="nav-tail">{item.tail}</span>}
            </button>
          ))}

          {isTrainer && store.clients.length > 0 && (
            <>
              <div className="sidenav-section" style={{marginTop:12}}>Skróty</div>
              {store.clients.slice(0,3).map(c => {
                const draftPlan = store.plans.find(p => p.clientId === c.id && p.status === "draft");
                return (
                  <button key={c.id} className="nav-item"
                    onClick={() => go({ view:"client-detail", clientId: c.id })}>
                    <UI.Avatar name={c.name} size="sm"/>
                    <span style={{
                      whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                    }}>{c.name.split(" ")[0]} {c.name.split(" ")[1]?.[0]}.</span>
                    {draftPlan && <span className="nav-tail" style={{color:"var(--warn)"}} title="ma draft">•</span>}
                  </button>
                );
              })}
            </>
          )}
        </aside>

        <main className="main">
          {content}
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Motyw">
          <TweakRadio
            label="Tryb"
            value={t.theme}
            options={[
              { value:"light", label:"Jasny" },
              { value:"dark",  label:"Ciemny" },
            ]}
            onChange={v => setTweak("theme", v)}
          />
        </TweakSection>
        <TweakSection label="Akcent">
          <TweakColor
            label="Kolor CTA"
            value={t.accent}
            options={["#C7F23C", "#FF7A3D"]}
            onChange={v => setTweak("accent", v)}
          />
        </TweakSection>
        <TweakSection label="Dane">
          <TweakButton label="Zresetuj demo do stanu wyjściowego" onClick={() => {
            if (confirm("Zresetować wszystkie dane demo? (cofnie wszystkie dodane plany, ćwiczenia, treningi)")) {
              store.reset();
            }
          }}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ============================================================
// PLANS LIST VIEW (trainer)
// ============================================================
function PlansListView({ go }) {
  const DATA = useStore();
  const [filter, setFilter] = useState("all");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const filtered = DATA.PLANS.filter(p => filter === "all" || p.status === filter);

  return (
    <div className="view-fade">
      <UI.Pagehead
        title="Plany"
        sub={`${DATA.PLANS.length} planów łącznie · ${DATA.PLANS.filter(p=>p.status==="active").length} aktywnych`}
        actions={
          <button className="btn btn-primary" onClick={() => setClientPickerOpen(true)}>
            <Icons.Plus/> Nowy plan
          </button>
        }
      />
      <div className="row" style={{gap:6, marginBottom:18}}>
        {[
          { k:"all", label:"Wszystkie" },
          { k:"active", label:"Aktywne" },
          { k:"draft", label:"Draft" },
          { k:"archived", label:"Archiwum" },
        ].map(o => (
          <button key={o.k}
            className={"btn btn-sm " + (filter === o.k ? "btn-dark" : "btn-ghost")}
            onClick={() => setFilter(o.k)}>
            {o.label} <span className="mono muted" style={{marginLeft:6, fontSize:11}}>
              {o.k === "all" ? DATA.PLANS.length : DATA.PLANS.filter(p => p.status === o.k).length}
            </span>
          </button>
        ))}
      </div>

      <div className="list">
        <div className="list-row list-head"
          style={{gridTemplateColumns:"2fr 1.5fr 0.8fr 0.8fr 0.5fr", gap:14}}>
          <div>Plan</div>
          <div>Podopieczny</div>
          <div>Sesji</div>
          <div>Status</div>
          <div></div>
        </div>
        {filtered.map(p => {
          const client = DATA.clientById(p.clientId);
          return (
            <div key={p.id} className="list-row"
              style={{gridTemplateColumns:"2fr 1.5fr 0.8fr 0.8fr 0.5fr", gap:14}}
              onClick={() => go({ view:"plan-editor", planId: p.id, clientId: p.clientId })}>
              <div>
                <div style={{fontSize:14, fontWeight:500}}>{p.name}</div>
                <div className="muted mono" style={{fontSize:11}}>v{p.version} · {DATA.fmtDate(p.created)}</div>
              </div>
              <div className="row" style={{gap:8}}>
                <UI.Avatar name={client?.name || "?"} size="sm"/>
                <span style={{fontSize:13}}>{client?.name || "Usunięty"}</span>
              </div>
              <div className="mono" style={{fontSize:14}}>{p.sessions.length}</div>
              <div><UI.StatusBadge status={p.status}/></div>
              <Icons.Chev style={{color:"var(--muted-2)"}}/>
            </div>
          );
        })}
      </div>

      <UI.Modal
        open={clientPickerOpen}
        onClose={() => setClientPickerOpen(false)}
        title="Dla kogo nowy plan?">
        <div className="muted" style={{fontSize:12.5, marginTop:-4, marginBottom:6}}>
          Każdy plan jest indywidualny — wybierz podopiecznego.
        </div>
        <div style={{display:"flex", flexDirection:"column", gap:6}}>
          {DATA.clients.map(c => {
            const activePlan = DATA.activePlanForClient(c.id);
            return (
              <button key={c.id}
                onClick={() => { setClientPickerOpen(false); go({ view:"plan-editor", planId:"new", clientId: c.id }); }}
                className="row"
                style={{
                  width:"100%", padding:"12px 14px",
                  background:"var(--surface)",
                  border:"1px solid var(--line)",
                  borderRadius:10, cursor:"pointer",
                  gap:12, textAlign:"left",
                }}>
                <UI.Avatar name={c.name}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14, fontWeight:500}}>{c.name}</div>
                  <div className="muted" style={{fontSize:12}}>
                    {activePlan
                      ? <>Aktywny plan: {activePlan.name} · v{activePlan.version}</>
                      : <>Brak aktywnego planu</>}
                  </div>
                </div>
                <Icons.Chev style={{color:"var(--muted-2)"}}/>
              </button>
            );
          })}
        </div>
      </UI.Modal>
    </div>
  );
}

function App() {
  return (
    <StoreProvider>
      <AppInner/>
    </StoreProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
