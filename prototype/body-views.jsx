/* global React, Icons, UI, useStore */
// body-views.jsx — body photo tracking (trainee upload + trainer review)

const { useState, useEffect, useMemo, useRef } = React;
const { Avatar, Modal, Pagehead, Crumbs, EmptyState, Toast } = UI;

// ============================================================
// Shared: photo card
// ============================================================
function PhotoCard({ photo, onClick, onDelete, size = "md" }) {
  const dims = size === "lg" ? { aspect: "3 / 4", radius: 12 } : { aspect: "3 / 4", radius: 10 };
  return (
    <div className="card-hover"
      style={{
        background: "var(--ink)",
        borderRadius: dims.radius,
        overflow: "hidden",
        position: "relative",
        aspectRatio: dims.aspect,
        cursor: onClick ? "pointer" : "default",
        border: "1px solid var(--line)",
      }}
      onClick={onClick}>
      <img src={photo.dataUrl} alt=""
        style={{width:"100%", height:"100%", objectFit:"cover", display:"block"}}
        onError={(e) => { e.target.style.display = "none"; }}/>
      <div style={{
        position:"absolute", inset:0,
        background:"linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 35%, transparent 65%, rgba(0,0,0,.35) 100%)",
        pointerEvents: "none",
      }}/>
      {photo.view && (
        <div style={{
          position:"absolute", top:8, left:8,
          background:"rgba(0,0,0,.55)", color:"#fff",
          padding:"3px 7px", borderRadius:4,
          fontSize:10, fontFamily:"var(--font-mono)",
          textTransform:"uppercase", letterSpacing:".08em",
        }}>
          {photo.view === "front" ? "Przód" : photo.view === "side" ? "Bok" : photo.view === "back" ? "Tył" : photo.view}
        </div>
      )}
      <div style={{
        position:"absolute", bottom:8, left:8, right:8,
        color:"#fff",
        fontFamily:"var(--font-mono)",
        fontSize:11,
        display:"flex", justifyContent:"space-between", alignItems:"flex-end",
      }}>
        <div>
          <div style={{fontWeight:600}}>{useStore().fmtDate(photo.date)}</div>
          {photo.note && <div style={{fontSize:10, opacity:.7, marginTop:2, fontStyle:"italic", maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>„{photo.note}"</div>}
        </div>
        {onDelete && (
          <button className="btn btn-icon btn-sm"
            style={{background:"rgba(0,0,0,.6)", color:"#fff", border:0, width:24, height:24}}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Usuń">
            <Icons.Trash style={{fontSize:11}}/>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Photo gallery (timeline) — used by both roles
// ============================================================
function PhotoGallery({ photos, onPhotoClick, allowDelete, onDelete, showViewFilter }) {
  const DATA = useStore();
  const [viewFilter, setViewFilter] = useState("all");

  const filtered = viewFilter === "all"
    ? photos
    : photos.filter(p => p.view === viewFilter);

  // Group by month
  const sorted = [...filtered].sort((a,b) => b.date.localeCompare(a.date));
  const groups = useMemo(() => {
    const g = {};
    sorted.forEach(p => {
      const d = new Date(p.date);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (!g[k]) g[k] = [];
      g[k].push(p);
    });
    return g;
  }, [sorted]);

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Icons.Camera}
        title="Brak zdjęć sylwetki"
        sub="Regularne zdjęcia pomagają śledzić postępy lepiej niż waga czy obwody."
      />
    );
  }

  return (
    <div>
      {showViewFilter && (
        <div className="row" style={{gap:6, marginBottom:18, flexWrap:"wrap"}}>
          {[
            { k:"all",   label:"Wszystkie" },
            { k:"front", label:"Przód" },
            { k:"side",  label:"Bok" },
            { k:"back",  label:"Tył" },
          ].map(o => {
            const count = o.k === "all" ? photos.length : photos.filter(p => p.view === o.k).length;
            return (
              <button key={o.k}
                className={"btn btn-sm " + (viewFilter === o.k ? "btn-dark" : "btn-ghost")}
                onClick={() => setViewFilter(o.k)}>
                {o.label} <span className="mono muted" style={{marginLeft:6, fontSize:11}}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {Object.entries(groups).map(([month, items]) => {
        const d = new Date(month + "-01");
        const monthName = d.toLocaleDateString("pl-PL", { month:"long", year:"numeric"});
        return (
          <div key={month} style={{marginBottom: 26}}>
            <div className="row" style={{marginBottom:10, gap:12, alignItems:"center"}}>
              <h3 style={{fontSize:14, textTransform:"capitalize"}}>{monthName}</h3>
              <div style={{flex:1, height:1, background:"var(--line)"}}/>
              <span className="mono muted" style={{fontSize:11}}>{items.length} {items.length === 1 ? "zdjęcie" : "zdjęć"}</span>
            </div>
            <div className="grid"
              style={{gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap:14}}>
              {items.map(p => (
                <PhotoCard key={p.id} photo={p}
                  onClick={() => onPhotoClick(p)}
                  onDelete={allowDelete ? () => onDelete(p.id) : null}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Photo lightbox / detail viewer with comparison
// ============================================================
function PhotoLightbox({ photo, allPhotos, onClose }) {
  const DATA = useStore();
  const [compareWith, setCompareWith] = useState(null);

  if (!photo) return null;

  // Other photos of same view
  const sameView = allPhotos
    .filter(p => p.view === photo.view && p.id !== photo.id)
    .sort((a,b) => a.date.localeCompare(b.date));

  // Auto-suggest oldest photo of same view for comparison
  const suggested = sameView[0];

  return (
    <div className="modal-back" onClick={(e) => { if (e.target.classList.contains("modal-back")) onClose(); }}>
      <div className="modal wide" style={{maxWidth: compareWith ? 900 : 560, padding:0}}>
        <div className="modal-head" style={{padding:"14px 18px"}}>
          <div>
            <div className="row" style={{gap:10}}>
              <h3 style={{fontSize:16}}>{DATA.fmtDate(photo.date)}</h3>
              <span className="badge">
                <span className="badge-dot"/>
                {photo.view === "front" ? "Przód" : photo.view === "side" ? "Bok" : photo.view === "back" ? "Tył" : photo.view}
              </span>
            </div>
            {photo.note && <div className="muted" style={{fontSize:12, marginTop:4, fontStyle:"italic"}}>„{photo.note}"</div>}
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><Icons.X/></button>
        </div>
        <div style={{padding:18}}>
          <div className="grid" style={{gridTemplateColumns: compareWith ? "1fr 1fr" : "1fr", gap: 14}}>
            <div>
              {compareWith && (
                <div className="muted mono" style={{fontSize:11, marginBottom:6, textTransform:"uppercase", letterSpacing:".08em"}}>
                  {DATA.fmtDate(compareWith.date)} · porównanie
                </div>
              )}
              <div style={{borderRadius:10, overflow:"hidden", background:"var(--ink)", aspectRatio:"3 / 4"}}>
                {compareWith && <img src={compareWith.dataUrl} alt=""
                  style={{width:"100%", height:"100%", objectFit:"cover"}}/>}
              </div>
              {compareWith && (
                <div className="muted" style={{fontSize:12, marginTop:8, textAlign:"center"}}>
                  {Math.floor((new Date(photo.date) - new Date(compareWith.date)) / (1000*60*60*24))} dni różnicy
                </div>
              )}
            </div>
            <div>
              {compareWith && (
                <div className="mono" style={{fontSize:11, marginBottom:6, textTransform:"uppercase", letterSpacing:".08em", color: "var(--accent-ink)", fontWeight:600}}>
                  {DATA.fmtDate(photo.date)} · TERAZ
                </div>
              )}
              <div style={{borderRadius:10, overflow:"hidden", background:"var(--ink)", aspectRatio:"3 / 4"}}>
                <img src={photo.dataUrl} alt=""
                  style={{width:"100%", height:"100%", objectFit:"cover"}}/>
              </div>
            </div>
          </div>

          {sameView.length > 0 && (
            <div style={{marginTop:18, paddingTop:18, borderTop:"1px solid var(--line)"}}>
              <div className="row between" style={{marginBottom:10}}>
                <div className="mono muted" style={{fontSize:11, textTransform:"uppercase", letterSpacing:".08em"}}>
                  Porównaj z innym zdjęciem ({photo.view === "front" ? "przód" : photo.view === "side" ? "bok" : "tył"})
                </div>
                {compareWith && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setCompareWith(null)}>
                    <Icons.X/> Wyłącz
                  </button>
                )}
              </div>
              <div className="row" style={{gap:8, overflowX:"auto", paddingBottom:6}}>
                {sameView.map(p => (
                  <button key={p.id}
                    onClick={() => setCompareWith(compareWith?.id === p.id ? null : p)}
                    style={{
                      flexShrink:0,
                      width:60, height:80,
                      background:"var(--ink)",
                      border: compareWith?.id === p.id ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: 6,
                      cursor:"pointer",
                      padding:0,
                      position:"relative",
                      overflow:"hidden",
                    }}
                    title={DATA.fmtDate(p.date)}>
                    <img src={p.dataUrl} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/>
                    <div style={{
                      position:"absolute", bottom:0, left:0, right:0,
                      background:"rgba(0,0,0,.7)", color:"#fff",
                      fontSize:9, padding:"2px 4px", fontFamily:"var(--font-mono)",
                    }}>{DATA.fmtDateShort(p.date)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Upload form
// ============================================================
function PhotoUploadModal({ open, onClose, onUpload }) {
  const DATA = useStore();
  const [dataUrl, setDataUrl] = useState(null);
  const [view, setView] = useState("front");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(DATA.todayISO());
  const fileRef = useRef();

  useEffect(() => {
    if (open) {
      setDataUrl(null);
      setView("front");
      setNote("");
      setDate(DATA.todayISO());
    }
  }, [open]);

  function onFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setDataUrl(e.target.result);
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!dataUrl) return;
    onUpload({ dataUrl, view, note, date });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Dodaj zdjęcie sylwetki" wide
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary" disabled={!dataUrl} onClick={submit}>
          <Icons.Check/> Zapisz zdjęcie
        </button>
      </>}>

      {!dataUrl ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          style={{
            border:"2px dashed var(--line-2)",
            borderRadius:12,
            padding:"40px 24px",
            textAlign:"center",
            cursor:"pointer",
            background:"var(--surface-2)",
            transition:"border-color .12s ease, background .12s ease",
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--accent)"}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--line-2)"}>
          <div style={{fontSize:28, color:"var(--muted-2)", marginBottom:8}}>
            <Icons.Upload/>
          </div>
          <div style={{fontSize:15, fontWeight:500, marginBottom:4}}>Upuść zdjęcie albo kliknij, żeby wybrać</div>
          <div className="muted" style={{fontSize:12.5}}>JPG, PNG · zdjęcie zostanie zapisane lokalnie</div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
            onChange={(e) => onFile(e.target.files?.[0])}/>
        </div>
      ) : (
        <div className="row" style={{gap:18, alignItems:"flex-start"}}>
          <div style={{width:200, flexShrink:0}}>
            <div style={{background:"var(--ink)", borderRadius:10, overflow:"hidden", aspectRatio:"3 / 4"}}>
              <img src={dataUrl} alt="" style={{width:"100%", height:"100%", objectFit:"cover"}}/>
            </div>
            <button className="btn btn-ghost btn-sm" style={{marginTop:8, width:"100%"}}
              onClick={() => setDataUrl(null)}>
              <Icons.X/> Wybierz inne
            </button>
          </div>
          <div style={{flex:1, display:"flex", flexDirection:"column", gap:14}}>
            <div className="field">
              <label>Data wykonania zdjęcia</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)}/>
            </div>
            <div className="field">
              <label>Widok</label>
              <div className="row" style={{gap:6}}>
                {[
                  { k:"front", label:"Przód" },
                  { k:"side",  label:"Bok" },
                  { k:"back",  label:"Tył" },
                ].map(o => (
                  <button key={o.k}
                    className={"btn btn-sm " + (view === o.k ? "btn-dark" : "")}
                    onClick={() => setView(o.k)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Notatka (opcjonalna)</label>
              <textarea className="textarea" placeholder="np. po 8 tygodniach planu, waga 76 kg…"
                value={note} onChange={(e) => setNote(e.target.value)}/>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// TRAINEE: Body view — upload + own gallery
// ============================================================
function TraineeBody({ go }) {
  const DATA = useStore();
  const TRAINEE_ID = DATA.currentUserId;
  const client = DATA.clientById(TRAINEE_ID);
  const photos = DATA.photosForClient(TRAINEE_ID);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [toast, setToast] = useState(null);

  function upload(input) {
    DATA.addPhoto({ ...input, clientId: TRAINEE_ID });
    setToast("Zdjęcie dodane do Twojej galerii");
    setTimeout(() => setToast(null), 2200);
  }

  function del(id) {
    if (!confirm("Usunąć to zdjęcie? Trener też je traci.")) return;
    DATA.deletePhoto(id);
  }

  return (
    <div className="view-fade">
      <Pagehead
        eyebrow="Trackowanie postępów"
        title="Twoja sylwetka"
        sub={photos.length === 0
          ? "Dodaj pierwsze zdjęcie, żeby zacząć budować historię"
          : `${photos.length} ${photos.length === 1 ? "zdjęcie" : "zdjęć"} w galerii`}
        actions={
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            <Icons.Plus/> Dodaj zdjęcie
          </button>
        }
      />

      <div className="card" style={{padding:14, marginBottom:24, background:"var(--surface-2)", borderColor:"var(--line)", borderStyle:"dashed"}}>
        <div className="row" style={{gap:12}}>
          <Icons.Camera style={{fontSize:18, color:"var(--muted)", marginTop:2}}/>
          <div style={{fontSize:13, lineHeight:1.5, color:"var(--ink-2)"}}>
            <strong>Wskazówka:</strong> rób zdjęcia w tych samych warunkach — to samo oświetlenie,
            te same ujęcia (przód / bok / tył), ten sam strój. Trener {DATA.trainer.name} zobaczy te zdjęcia w Twoim profilu.
          </div>
        </div>
      </div>

      <PhotoGallery
        photos={photos}
        onPhotoClick={setLightboxPhoto}
        allowDelete
        onDelete={del}
        showViewFilter
      />

      <PhotoUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={upload}/>
      <PhotoLightbox photo={lightboxPhoto} allPhotos={photos} onClose={() => setLightboxPhoto(null)}/>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}

// ============================================================
// TRAINER: View a client's photo gallery
// ============================================================
function TrainerClientBody({ clientId, go }) {
  const DATA = useStore();
  const client = DATA.clientById(clientId);
  const photos = DATA.photosForClient(clientId);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);

  return (
    <div className="view-fade">
      <Crumbs items={[
        {label:"Podopieczni", onClick: () => go({ view:"clients"})},
        {label: client.name, onClick: () => go({ view:"client-detail", clientId})},
      ]} current="Sylwetka"/>

      <Pagehead
        eyebrow={`${client.name}`}
        title="Galeria sylwetki"
        sub={photos.length === 0
          ? `Podopieczny nie dodał jeszcze żadnych zdjęć.`
          : `${photos.length} zdjęć · pierwsze ${DATA.fmtDate(photos.sort((a,b)=>a.date.localeCompare(b.date))[0].date)}`}
      />

      <PhotoGallery
        photos={photos}
        onPhotoClick={setLightboxPhoto}
        showViewFilter
      />

      <PhotoLightbox photo={lightboxPhoto} allPhotos={photos} onClose={() => setLightboxPhoto(null)}/>
    </div>
  );
}

window.BodyViews = { TraineeBody, TrainerClientBody };
