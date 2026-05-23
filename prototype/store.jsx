/* global React, DATA */
// store.jsx — central state with React Context, localStorage persistence,
// and data-bound helpers (exById, clientById, addLog…).

const { createContext, useContext, useState, useEffect, useMemo, useCallback } = React;

const STORAGE_KEY = "kalisthenos.state.v2";

const StoreContext = createContext(null);

// Load from localStorage or seed; defensive against parse errors.
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // sanity-check minimum shape
      if (parsed && parsed.exercises && parsed.clients && parsed.plans && parsed.logs) {
        return parsed;
      }
    }
  } catch (e) { /* fall through to seed */ }
  return JSON.parse(JSON.stringify(DATA.INITIAL_STATE));
}

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 8);
}

function StoreProvider({ children }) {
  const [state, setState] = useState(loadState);

  // persist on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }, [state]);

  // -------- ACTIONS --------
  const actions = useMemo(() => ({
    setCurrentUser: (id) => setState(s => ({ ...s, currentUserId: id })),

    addExercise: (input) => {
      const ex = {
        id: uid("ex"),
        name: input.name || "Nowe ćwiczenie",
        unit: input.unit || "REPS",
        desc: input.desc || "",
        duration: "0:30",
        tags: input.tags || [],
      };
      setState(s => ({ ...s, exercises: [...s.exercises, ex] }));
      return ex.id;
    },

    deleteExercise: (id) => setState(s => ({ ...s, exercises: s.exercises.filter(e => e.id !== id) })),

    // Save plan as draft. If a draft with this id already exists, update it.
    // If id is "new", create a new draft.
    savePlan: (plan) => {
      const id = plan.id && plan.id !== "new" ? plan.id : uid("p");
      const next = { ...plan, id, status: plan.status || "draft" };
      setState(s => {
        const exists = s.plans.find(p => p.id === id);
        return {
          ...s,
          plans: exists
            ? s.plans.map(p => p.id === id ? next : p)
            : [...s.plans, next],
        };
      });
      return id;
    },

    // Publish a plan:
    // - if no active plan for that client → just flip status to active.
    // - if there's an active plan AND this is a different draft → archive the old active.
    // - assign published date = today.
    publishPlan: (planId) => {
      setState(s => {
        const target = s.plans.find(p => p.id === planId);
        if (!target) return s;
        const today = DATA.todayISO();
        return {
          ...s,
          plans: s.plans.map(p => {
            // archive existing active plan for same client (if different plan)
            if (p.clientId === target.clientId && p.status === "active" && p.id !== planId) {
              return { ...p, status: "archived" };
            }
            if (p.id === planId) {
              return { ...p, status: "active", published: today };
            }
            return p;
          }),
          // point the client at the newly-active plan
          clients: s.clients.map(c =>
            c.id === target.clientId ? { ...c, planId } : c
          ),
        };
      });
    },

    deletePlan: (planId) => setState(s => ({ ...s, plans: s.plans.filter(p => p.id !== planId) })),

    addLog: (log) => {
      const id = uid("l");
      const finalLog = { ...log, id, date: log.date || DATA.todayISO() };
      setState(s => {
        // Update client stats — recount in next tick via derived; here we just bump quick counters
        const clients = s.clients.map(c => {
          if (c.id !== finalLog.clientId) return c;
          return {
            ...c,
            lastSession: finalLog.date,
            totalSessions: (c.totalSessions || 0) + 1,
            sessionsLast7: (c.sessionsLast7 || 0) + 1,
          };
        });
        return { ...s, logs: [...s.logs, finalLog], clients };
      });
      return id;
    },

    addPhoto: (input) => {
      const id = uid("ph");
      const photo = {
        id,
        clientId: input.clientId,
        date: input.date || DATA.todayISO(),
        dataUrl: input.dataUrl,
        note: input.note || "",
        view: input.view || "front", // front/side/back
      };
      setState(s => ({ ...s, photos: [...(s.photos || []), photo] }));
      return id;
    },

    deletePhoto: (id) => setState(s => ({ ...s, photos: (s.photos || []).filter(p => p.id !== id) })),

    setTheme: (theme) => setState(s => ({ ...s, theme })),

    // reset to seed
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      setState(JSON.parse(JSON.stringify(DATA.INITIAL_STATE)));
    },
  }), []);

  // -------- DERIVED HELPERS --------
  const helpers = useMemo(() => {
    const exById = (id) => state.exercises.find(e => e.id === id);
    const clientById = (id) => state.clients.find(c => c.id === id);
    const planById = (id) => state.plans.find(p => p.id === id);
    const logsForClient = (id) => state.logs.filter(l => l.clientId === id);
    const logsForSession = (clientId, sessionId) =>
      state.logs.filter(l => l.clientId === clientId && l.sessionId === sessionId);
    const plansForClient = (id) => state.plans.filter(p => p.clientId === id);
    const photosForClient = (id) => (state.photos || []).filter(p => p.clientId === id);

    // sessionProgress: distinct sessions of the active plan that have at least one log
    const sessionProgress = (clientId) => {
      const c = clientById(clientId);
      if (!c?.planId) return { done:0, total:0, plan:null };
      const plan = planById(c.planId);
      if (!plan) {
        // Fall back to any active plan for this client
        const fallback = state.plans.find(p => p.clientId === clientId && p.status === "active");
        if (!fallback) return { done:0, total:0, plan:null };
        const planLogs = state.logs.filter(l => l.clientId === clientId && l.planId === fallback.id);
        const doneIds = new Set(planLogs.map(l => l.sessionId));
        return { done: doneIds.size, total: fallback.sessions.length, plan: fallback, planLogs };
      }
      const planLogs = state.logs.filter(l => l.clientId === clientId && l.planId === plan.id);
      const doneIds = new Set(planLogs.map(l => l.sessionId));
      return { done: doneIds.size, total: plan.sessions.length, plan, planLogs };
    };

    // active plan for client (fallback if planId mismatch)
    const activePlanForClient = (clientId) => {
      const c = clientById(clientId);
      if (c?.planId) {
        const p = planById(c.planId);
        if (p && p.status === "active") return p;
      }
      return state.plans.find(p => p.clientId === clientId && p.status === "active") || null;
    };

    return { exById, clientById, planById, logsForClient, logsForSession, plansForClient, photosForClient, sessionProgress, activePlanForClient };
  }, [state]);

  // Stable block helpers (don't depend on state — pure shape functions)
  // For "single" / "superset": iterate block.exercises
  // For "dropset": treat each drop as an exercise-equivalent (sets/reps derived from block)
  function blockExerciseRefs(block) {
    if (block.kind === "dropset") {
      return block.drops.map(d => ({
        exId: d.exId, sets: block.sets, reps: d.reps,
        rest: block.rest, note: d.note,
        isDrop: true, dropCount: block.drops.length,
      }));
    }
    return block.exercises.map(e => ({ ...e, isDrop: false }));
  }
  function blockSetCount(block) {
    if (block.kind === "dropset") return block.sets * block.drops.length;
    return block.exercises.reduce((acc, e) => acc + e.sets, 0);
  }
  function blockExerciseCount(block) {
    if (block.kind === "dropset") return block.drops.length;
    return block.exercises.length;
  }

  // Build context value — combines state arrays, helpers, and actions
  // Preserve UPPERCASE alias for state arrays so legacy `DATA.CLIENTS` style references can be migrated minimally.
  const ctx = useMemo(() => ({
    // raw state slices
    exercises: state.exercises,
    clients: state.clients,
    plans: state.plans,
    logs: state.logs,
    photos: state.photos || [],
    theme: state.theme || "light",
    trainer: state.trainer,
    currentUserId: state.currentUserId,
    // legacy aliases
    EXERCISES: state.exercises,
    CLIENTS: state.clients,
    PLANS: state.plans,
    LOGS: state.logs,
    // helpers (data-bound)
    ...helpers,
    // shape helpers
    blockExerciseRefs, blockSetCount, blockExerciseCount,
    // utilities (no data dependency)
    initials: DATA.initials,
    fmtDate: DATA.fmtDate,
    fmtDateShort: DATA.fmtDateShort,
    daysAgo: DATA.daysAgo,
    avgDiff: DATA.avgDiff,
    totalSets: DATA.totalSets,
    todayISO: DATA.todayISO,
    // actions
    ...actions,
    // computed
    currentUser: state.currentUserId === state.trainer.id
      ? state.trainer
      : state.clients.find(c => c.id === state.currentUserId) || state.trainer,
    isTrainer: state.currentUserId === state.trainer.id,
  }), [state, helpers, actions]);

  return <StoreContext.Provider value={ctx}>{children}</StoreContext.Provider>;
}

function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

Object.assign(window, { StoreProvider, useStore });
