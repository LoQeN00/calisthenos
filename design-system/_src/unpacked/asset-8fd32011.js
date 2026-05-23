/* global React, Icons */
// ui.jsx — shared UI components

function Avatar({ name, size }) {
  const initials = window.DATA.initials(name);
  const cls = "avatar" + (size === "lg" ? " lg" : size === "sm" ? " sm" : size === "xl" ? " xl" : "");
  return <div className={cls}>{initials}</div>;
}

function Badge({ children, variant = "default" }) {
  const cls = "badge " + variant;
  return <span className={cls}><span className="badge-dot"/>{children}</span>;
}

function StatusBadge({ status }) {
  if (status === "active")   return <Badge variant="active">aktywny</Badge>;
  if (status === "draft")    return <Badge variant="draft">draft</Badge>;
  if (status === "archived") return <Badge variant="archived">archiwum</Badge>;
  return <Badge>{status}</Badge>;
}

function UnitTag({ unit }) {
  return <span className={"badge " + (unit === "REPS" ? "reps" : "sec")}>
    <span className="badge-dot" style={{background: unit === "REPS" ? "var(--accent)" : "var(--ink-2)"}}/>{unit}
  </span>;
}

function VideoTile({ duration, label, size = "16:9", className = "" }) {
  return (
    <div className={"video-tile " + (size === "1:1" ? "square " : "") + className}>
      <div className="scanlines"/>
      {label && <div className="label">{label}</div>}
      <div className="play"><Icons.Play /></div>
      {duration && <div className="duration">{duration}</div>}
    </div>
  );
}

function Modal({ open, onClose, title, children, footer, wide }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={(e) => { if (e.target.classList.contains("modal-back")) onClose?.(); }}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><Icons.X/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

function DifficultyPicker({ value, onChange }) {
  const tone = value <= 4 ? "is-easy" : value <= 7 ? "is-mid" : "is-hard";
  return (
    <div className={"diff " + tone}>
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button key={n} className={n <= value ? "on" : ""} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  );
}

function Toast({ children }) {
  return <div className="toast"><span className="dot"/>{children}</div>;
}

function Crumbs({ items, current }) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {it.onClick ? <button onClick={it.onClick}>{it.label}</button> : <span>{it.label}</span>}
          <span className="sep">/</span>
        </React.Fragment>
      ))}
      <span className="current">{current}</span>
    </div>
  );
}

function Pagehead({ eyebrow, title, sub, actions }) {
  return (
    <div className="pagehead">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon = Icons.Sparkle, title, sub, action }) {
  return (
    <div className="empty">
      <div style={{fontSize:24, marginBottom:8, color:"var(--muted-2)"}}><Icon/></div>
      <h3>{title}</h3>
      <div style={{marginBottom: action ? 14 : 0}}>{sub}</div>
      {action}
    </div>
  );
}

function Ring({ done, total }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className="ring" style={{"--p": pct}}>
      <span>{done}/{total}</span>
    </div>
  );
}

window.UI = { Avatar, Badge, StatusBadge, UnitTag, VideoTile, Modal, DifficultyPicker, Toast, Crumbs, Pagehead, EmptyState, Ring };
