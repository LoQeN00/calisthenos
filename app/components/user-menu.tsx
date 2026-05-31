import { useEffect, useRef, useState } from "react";
import { Form } from "react-router";
import { Icons } from "./icons";

interface UserMenuProps {
  displayName: string;
}

export function UserMenu({ displayName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const initials = initialsOf(displayName);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu użytkownika"
        className="userchip"
        style={{
          border: 0,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span className="avatar">{initials}</span>
        <span>{displayName}</span>
        <Icons.ChevDown
          style={{
            color: "var(--muted)",
            transition: "transform .12s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            padding: 6,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <ThemeToggle onPick={() => setOpen(false)} />
          <div
            style={{
              height: 1,
              background: "var(--line)",
              margin: "4px 0",
            }}
          />
          <Form method="post" action="/wyloguj">
            <button type="submit" role="menuitem" className="menu-item" style={menuItemStyle}>
              <Icons.LogOut />
              <span>Wyloguj</span>
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({ onPick }: { onPick: () => void }) {
  // Read initial theme from <html class>; server can't easily pass it down
  // to Layout. The inline no-FOUC script in `root.tsx` sets the class before
  // hydration, so this is in sync.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("theme-dark") ? "dark" : "light";
  });

  const apply = (next: "light" | "dark") => {
    setTheme(next);
    document.documentElement.classList.toggle("theme-dark", next === "dark");
    // 1-year cookie so the choice survives across visits.
    document.cookie = `theme=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    onPick();
  };

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      style={menuItemStyle}
    >
      {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
      <span>{theme === "dark" ? "Tryb jasny" : "Tryb ciemny"}</span>
    </button>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 6,
  border: 0,
  background: "transparent",
  width: "100%",
  textAlign: "left",
  fontSize: 13.5,
  color: "var(--ink)",
  fontFamily: "inherit",
  cursor: "pointer",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
