// data.jsx — initial seed data + pure utility functions.
// All data-bound helpers (exById, clientById, addLog…) live in store.jsx.

const initials = (name) => name.split(/\s+/).map(w => w[0]).join("").slice(0,2).toUpperCase();

// ============== EXERCISES ==============
const SEED_EXERCISES = [
  { id:"ex_mu",  name:"Muscle-up",          unit:"REPS", duration:"0:42", desc:"Pełen muscle-up na drążku z pełnym wyciągiem. Praca explosywna na ciągu, miękkie przejście, kontrolowany dip.", tags:["pull","push","explosive"] },
  { id:"ex_pl",  name:"Pull-up",            unit:"REPS", duration:"0:36", desc:"Klasyczny pull-up nachwytem, łopatki schowane, broda nad drążkiem.", tags:["pull"] },
  { id:"ex_ch",  name:"Chin-up",            unit:"REPS", duration:"0:31", desc:"Podchwytem, ramiona przy ciele.", tags:["pull"] },
  { id:"ex_ar",  name:"Archer Pull-up",     unit:"REPS", duration:"0:55", desc:"Asymetryczny pull-up — jedno ramię prowadzi, drugie wspomaga.", tags:["pull","unilateral"] },
  { id:"ex_dip", name:"Dips na poręczach",  unit:"REPS", duration:"0:28", desc:"Dipy z kontrolowanym schodzeniem do równoległości.", tags:["push"] },
  { id:"ex_pp",  name:"Pike Push-up",       unit:"REPS", duration:"0:33", desc:"Pompka pike — krok w stronę handstand push-up.", tags:["push","shoulder"] },
  { id:"ex_hps", name:"Handstand Push-up",  unit:"REPS", duration:"0:48", desc:"Pompka w staniu na rękach przy ścianie. Skup się na wertykalnej ścieżce ciała.", tags:["push","shoulder","balance"] },
  { id:"ex_ps",  name:"Pistol Squat",       unit:"REPS", duration:"0:39", desc:"Przysiad na jednej nodze, druga wyprostowana z przodu.", tags:["legs","unilateral"] },
  { id:"ex_sq",  name:"Bulgarian Split Squat", unit:"REPS", duration:"0:35", desc:"Tylna noga oparta na ławce, klasyczny split squat.", tags:["legs"] },
  { id:"ex_ls",  name:"L-sit Hold",         unit:"SEC",  duration:"0:18", desc:"Hold w pozycji L na poręczach lub na podłodze.", tags:["core","static"] },
  { id:"ex_hh",  name:"Handstand Hold",     unit:"SEC",  duration:"0:22", desc:"Stanie na rękach przy ścianie lub wolne.", tags:["balance","shoulder","static"] },
  { id:"ex_df",  name:"Dragon Flag",        unit:"REPS", duration:"0:44", desc:"Negatywne lub pełne dragon flagi.", tags:["core","explosive"] },
  { id:"ex_fl",  name:"Front Lever (tuck)", unit:"SEC",  duration:"0:26", desc:"Tucked front lever — kolana zwinięte do klatki.", tags:["pull","static"] },
  { id:"ex_bl",  name:"Back Lever (tuck)",  unit:"SEC",  duration:"0:24", desc:"Tucked back lever na drążku lub kółkach.", tags:["pull","static"] },
  { id:"ex_hr",  name:"Hanging Leg Raise",  unit:"REPS", duration:"0:29", desc:"Podciąganie nóg do drążka, pełen zakres.", tags:["core"] },
];

// ============== TRAINER ==============
const TRAINER = { id:"t01", name:"Adam Niedźwiedź", role:"trainer" };

// ============== CLIENTS (4 to spread variety) ==============
const SEED_CLIENTS = [
  { id:"c01", name:"Kamil Brzeziński", joined:"2025-09-12", planId:"p_kamil_2", lastSession:"2026-05-20", sessionsLast7:3, totalSessions:42 },
  { id:"c02", name:"Michał Kowalczyk", joined:"2025-11-03", planId:"p_michal_1", lastSession:"2026-05-21", sessionsLast7:4, totalSessions:58 },
  { id:"c03", name:"Anna Wójcik",      joined:"2026-01-22", planId:"p_anna_1",  lastSession:"2026-05-19", sessionsLast7:2, totalSessions:18 },
  { id:"c04", name:"Karolina Mazur",   joined:"2025-12-15", planId:"p_karol_1", lastSession:"2026-05-22", sessionsLast7:4, totalSessions:25 },
];

// ============== PLANS ==============
const KAMIL_PLAN_V2 = {
  id:"p_kamil_2",
  clientId:"c01",
  name:"Push / Pull / Legs — Q2 2026",
  version: 2,
  basesOn: 1,
  status: "active",
  created: "2026-04-01",
  published: "2026-04-03",
  sessions: [
    { id:"s_k1", name:"Sesja 1 · Pull A", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_pl", sets:5, reps:8, unit:"REPS", rest:"120s", note:"Pełny zakres, łopatki schowane." }] },
      { id:"b2", kind:"superset", exercises:[
        { exId:"ex_ch", sets:3, reps:8, unit:"REPS", rest:"60s" },
        { exId:"ex_hr", sets:3, reps:10, unit:"REPS", rest:"60s" },
      ] },
      { id:"b3", kind:"single", exercises:[{ exId:"ex_fl", sets:4, reps:20, unit:"SEC", rest:"90s", note:"Hold w czystej tuck pozycji." }] },
    ]},
    { id:"s_k2", name:"Sesja 2 · Push A", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_hps", sets:5, reps:6, unit:"REPS", rest:"120s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_dip", sets:4, reps:10, unit:"REPS", rest:"90s" }] },
      { id:"b3", kind:"superset", exercises:[
        { exId:"ex_pp", sets:3, reps:8, unit:"REPS", rest:"60s" },
        { exId:"ex_ls", sets:3, reps:15, unit:"SEC", rest:"60s" },
      ] },
    ]},
    { id:"s_k3", name:"Sesja 3 · Legs", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_ps", sets:4, reps:6, unit:"REPS", rest:"120s", note:"Pełen zakres na każdej nodze." }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_sq", sets:4, reps:10, unit:"REPS", rest:"90s" }] },
      { id:"b3", kind:"single", exercises:[{ exId:"ex_df", sets:3, reps:6, unit:"REPS", rest:"90s" }] },
    ]},
    { id:"s_k4", name:"Sesja 4 · Pull B (skill)", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_mu", sets:5, reps:3, unit:"REPS", rest:"150s", note:"Praca explosywna. Jeśli brak, zostań przy negatywach." }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_ar", sets:4, reps:5, unit:"REPS", rest:"90s" }] },
      { id:"b3", kind:"superset", exercises:[
        { exId:"ex_bl", sets:3, reps:20, unit:"SEC", rest:"60s" },
        { exId:"ex_ls", sets:3, reps:20, unit:"SEC", rest:"60s" },
      ] },
    ]},
    { id:"s_k5", name:"Sesja 5 · Push B (skill)", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_hh", sets:5, reps:25, unit:"SEC", rest:"90s", note:"Wolna ściana, ostre linie." }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_hps", sets:4, reps:4, unit:"REPS", rest:"120s" }] },
      { id:"b3", kind:"single", exercises:[{ exId:"ex_dip", sets:3, reps:12, unit:"REPS", rest:"60s" }] },
    ]},
    { id:"s_k6", name:"Sesja 6 · Core & Conditioning", blocks:[
      { id:"b1", kind:"superset", exercises:[
        { exId:"ex_df", sets:4, reps:5, unit:"REPS", rest:"75s" },
        { exId:"ex_ls", sets:4, reps:20, unit:"SEC", rest:"75s" },
      ] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_hr", sets:4, reps:12, unit:"REPS", rest:"60s" }] },
    ]},
  ],
};

const KAMIL_PLAN_V1_ARCHIVED = {
  id:"p_kamil_1", clientId:"c01", name:"Push / Pull / Legs — Q2 2026",
  version: 1, status: "archived",
  created: "2026-01-08", published: "2026-01-10",
  sessions: KAMIL_PLAN_V2.sessions.slice(0,5),
};

const MICHAL_PLAN = {
  id:"p_michal_1", clientId:"c02", name:"Pierwszy Muscle-up — Blok 3",
  version: 1, status: "active",
  created: "2026-04-15", published: "2026-04-16",
  sessions: [
    { id:"s_m1", name:"Sesja 1 · Explosywne podciąganie", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_pl", sets:5, reps:5, unit:"REPS", rest:"120s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_mu", sets:6, reps:2, unit:"REPS", rest:"150s", note:"Negatywy jeśli pełny niemożliwy." }] },
    ]},
    { id:"s_m2", name:"Sesja 2 · Dip strength", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_dip", sets:5, reps:8, unit:"REPS", rest:"90s" }] },
      { id:"b2", kind:"superset", exercises:[
        { exId:"ex_pp", sets:3, reps:10, unit:"REPS", rest:"60s" },
        { exId:"ex_ls", sets:3, reps:18, unit:"SEC", rest:"60s" },
      ]},
    ]},
    { id:"s_m3", name:"Sesja 3 · Lever skill", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_fl", sets:5, reps:18, unit:"SEC", rest:"90s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_bl", sets:5, reps:18, unit:"SEC", rest:"90s" }] },
    ]},
    { id:"s_m4", name:"Sesja 4 · Nogi & Core", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_ps", sets:4, reps:6, unit:"REPS", rest:"120s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_df", sets:4, reps:5, unit:"REPS", rest:"90s" }] },
    ]},
  ],
};

const ANNA_PLAN = {
  id:"p_anna_1", clientId:"c03", name:"Foundations — Q2 2026",
  version: 1, status: "active",
  created: "2026-03-01", published: "2026-03-02",
  sessions: [
    { id:"s_a1", name:"Sesja 1 · Push", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_pp", sets:4, reps:8, unit:"REPS", rest:"75s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_dip", sets:4, reps:6, unit:"REPS", rest:"75s" }] },
    ]},
    { id:"s_a2", name:"Sesja 2 · Pull", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_ch", sets:5, reps:5, unit:"REPS", rest:"90s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_hr", sets:3, reps:10, unit:"REPS", rest:"60s" }] },
    ]},
    { id:"s_a3", name:"Sesja 3 · Legs", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_sq", sets:4, reps:10, unit:"REPS", rest:"60s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_ps", sets:3, reps:5, unit:"REPS", rest:"90s" }] },
    ]},
  ],
};

const KAROL_PLAN_V1 = {
  id:"p_karol_1", clientId:"c04", name:"Front Lever Push — Blok 1",
  version: 1, status: "active",
  created: "2026-02-12", published: "2026-02-14",
  sessions: [
    { id:"s_kr1", name:"Sesja 1 · Pull skill", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_fl", sets:5, reps:12, unit:"SEC", rest:"90s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_pl", sets:4, reps:5, unit:"REPS", rest:"120s" }] },
    ]},
    { id:"s_kr2", name:"Sesja 2 · Push", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_hps", sets:4, reps:4, unit:"REPS", rest:"120s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_dip", sets:4, reps:8, unit:"REPS", rest:"75s" }] },
    ]},
    { id:"s_kr3", name:"Sesja 3 · Core", blocks:[
      { id:"b1", kind:"superset", exercises:[
        { exId:"ex_ls", sets:4, reps:20, unit:"SEC", rest:"60s" },
        { exId:"ex_hr", sets:4, reps:10, unit:"REPS", rest:"60s" },
      ]},
    ]},
  ],
};

const KAROL_PLAN_V2_DRAFT = {
  id:"p_karol_2", clientId:"c04", name:"Front Lever Push — Blok 2",
  version: 2, basesOn: 1, status: "draft",
  created: "2026-05-19", published: null,
  sessions: [
    { id:"s_kr1", name:"Sesja 1 · Pull skill", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_fl", sets:5, reps:15, unit:"SEC", rest:"90s" }] },
      { id:"b2", kind:"single", exercises:[{ exId:"ex_pl", sets:4, reps:6, unit:"REPS", rest:"120s" }] },
    ]},
    { id:"s_kr2", name:"Sesja 2 · Push", blocks:[
      { id:"b1", kind:"single", exercises:[{ exId:"ex_hps", sets:4, reps:5, unit:"REPS", rest:"120s" }] },
    ]},
  ],
};

const SEED_PLANS = [
  KAMIL_PLAN_V2, KAMIL_PLAN_V1_ARCHIVED,
  MICHAL_PLAN, ANNA_PLAN,
  KAROL_PLAN_V1, KAROL_PLAN_V2_DRAFT,
];

// ============== LOGS ==============
function mkLog(id, clientId, planId, sessionId, sessionName, date, exerciseRecords, note, hasVideo, allDone) {
  return { id, clientId, planId, sessionId, sessionName, date, exercises: exerciseRecords, note, hasVideo, allDone };
}
function mkRec(exId, sets) { return { exId, sets }; }
function s(reps, diff, withVideo=false) { return { reps, diff, video: withVideo }; }

const SEED_LOGS = [
  mkLog("l01","c01","p_kamil_2","s_k1","Sesja 1 · Pull A","2026-05-20",[
    mkRec("ex_pl",[s(8,5,true),s(8,6),s(7,7),s(6,8),s(6,8)]),
    mkRec("ex_ch",[s(8,5),s(7,6),s(7,7)]),
    mkRec("ex_hr",[s(10,4),s(10,5),s(9,6)]),
    mkRec("ex_fl",[s(20,7,true),s(18,8),s(17,8),s(15,9)]),
  ],"Mocno czuć łapy. Front lever idzie do przodu.", true, true),
  mkLog("l02","c01","p_kamil_2","s_k4","Sesja 4 · Pull B (skill)","2026-05-18",[
    mkRec("ex_mu",[s(2,8,true),s(1,9),s(1,9),s(1,10),s(0,10)]),
    mkRec("ex_ar",[s(5,6),s(4,7),s(4,8),s(3,8)]),
    mkRec("ex_bl",[s(20,5),s(18,6),s(17,7)]),
    mkRec("ex_ls",[s(20,5),s(18,6),s(16,7)]),
  ],"Pierwszy muscle-up w pełnym cisza! Reszta seria mocno spadła ale jest baza.", true, true),
  mkLog("l03","c01","p_kamil_2","s_k2","Sesja 2 · Push A","2026-05-15",[
    mkRec("ex_hps",[s(6,6),s(5,7),s(5,8),s(4,8),s(4,9)]),
    mkRec("ex_dip",[s(10,5),s(10,5),s(9,6),s(9,6)]),
    mkRec("ex_pp",[s(8,4),s(8,5),s(7,5)]),
    mkRec("ex_ls",[s(15,5),s(14,6),s(13,6)]),
  ],"", false, true),
  mkLog("l04","c02","p_michal_1","s_m1","Sesja 1 · Explosywne podciąganie","2026-05-21",[
    mkRec("ex_pl",[s(5,6),s(5,7),s(5,7),s(4,8),s(4,8)]),
    mkRec("ex_mu",[s(2,8),s(1,9),s(1,9),s(1,10),s(0,10),s(0,10)]),
  ],"Bardzo trudna sesja, muscle-up wciąż uciekają.", true, true),
  mkLog("l05","c02","p_michal_1","s_m2","Sesja 2 · Dip strength","2026-05-19",[
    mkRec("ex_dip",[s(8,5),s(8,6),s(7,7),s(7,7),s(6,8)]),
    mkRec("ex_pp",[s(10,5),s(9,6),s(9,7)]),
    mkRec("ex_ls",[s(18,5),s(17,6),s(15,7)]),
  ],"", false, true),
  mkLog("l06","c02","p_michal_1","s_m3","Sesja 3 · Lever skill","2026-05-17",[
    mkRec("ex_fl",[s(18,6),s(17,7),s(15,8),s(13,9),s(12,9)]),
    mkRec("ex_bl",[s(18,5),s(17,6),s(15,7),s(14,8),s(13,8)]),
  ],"Front lever czysty hold 18s, świetna progresja.", true, true),
  mkLog("l07","c02","p_michal_1","s_m4","Sesja 4 · Nogi & Core","2026-05-15",[
    mkRec("ex_ps",[s(6,6,true),s(6,6),s(5,7),s(5,8)]),
    mkRec("ex_df",[s(5,7),s(4,8),s(4,8),s(3,9)]),
  ],"", true, true),
  mkLog("l08","c02","p_michal_1","s_m1","Sesja 1 · Explosywne podciąganie","2026-05-13",[
    mkRec("ex_pl",[s(5,6),s(5,7),s(4,7),s(4,8),s(3,9)]),
    mkRec("ex_mu",[s(1,9),s(1,9),s(1,10),s(0,10),s(0,10),s(0,10)]),
  ],"", false, true),
  mkLog("l09","c03","p_anna_1","s_a1","Sesja 1 · Push","2026-05-19",[
    mkRec("ex_pp",[s(8,5),s(8,6),s(7,7),s(7,7)]),
    mkRec("ex_dip",[s(6,6),s(5,7),s(5,8),s(4,8)]),
  ],"Pierwszy raz 8x pike push-up bez przerw.", true, true),
  mkLog("l10","c03","p_anna_1","s_a2","Sesja 2 · Pull","2026-05-16",[
    mkRec("ex_ch",[s(5,5),s(5,6),s(4,7),s(4,7),s(3,8)]),
    mkRec("ex_hr",[s(10,5),s(9,6),s(8,7)]),
  ],"", false, true),
  mkLog("l11","c04","p_karol_1","s_kr1","Sesja 1 · Pull skill","2026-05-22",[
    mkRec("ex_fl",[s(12,7,true),s(11,7),s(10,8),s(9,9),s(8,9)]),
    mkRec("ex_pl",[s(5,6),s(5,7),s(4,8),s(4,8)]),
  ],"Czas na progres do v2 — front lever blokuje 12s.", true, true),
  mkLog("l12","c04","p_karol_1","s_kr2","Sesja 2 · Push","2026-05-20",[
    mkRec("ex_hps",[s(4,7),s(4,8),s(3,8),s(3,9)]),
    mkRec("ex_dip",[s(8,5),s(7,6),s(7,7),s(6,8)]),
  ],"", false, true),
  mkLog("l13","c04","p_karol_1","s_kr3","Sesja 3 · Core","2026-05-18",[
    mkRec("ex_ls",[s(20,5),s(20,6),s(18,7),s(15,8)]),
    mkRec("ex_hr",[s(10,5),s(9,6),s(8,7),s(7,8)]),
  ],"", true, true),
];

// ============== Pure utility fns (no data dependency) ==============
function fmtDate(iso) {
  const d = new Date(iso);
  const months = ["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pl-PL", { day:"2-digit", month:"short" });
}
function daysAgo(iso) {
  const d = new Date(iso); const now = new Date();
  const diff = Math.floor((now - d) / (24*60*60*1000));
  if (diff < 0) return "dzisiaj";
  if (diff === 0) return "dzisiaj";
  if (diff === 1) return "wczoraj";
  if (diff < 7) return `${diff} dni temu`;
  if (diff < 30) return `${Math.floor(diff/7)} tyg. temu`;
  return `${Math.floor(diff/30)} mies. temu`;
}
function avgDiff(log) {
  let total=0, n=0;
  log.exercises.forEach(e => e.sets.forEach(s => { total += s.diff; n++; }));
  return n ? Math.round(total/n*10)/10 : 0;
}
function totalSets(log) {
  return log.exercises.reduce((acc,e) => acc + e.sets.length, 0);
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}

const INITIAL_STATE = {
  exercises: SEED_EXERCISES,
  clients: SEED_CLIENTS,
  plans: SEED_PLANS,
  logs: SEED_LOGS,
  photos: [],
  theme: "light",
  trainer: TRAINER,
  // 'currentUserId' is the user logged in for demo purposes — defaults to trainer
  currentUserId: "t01",
};

window.DATA = {
  INITIAL_STATE,
  // utility fns (no data dependency)
  initials, fmtDate, fmtDateShort, daysAgo, avgDiff, totalSets, todayISO,
};
