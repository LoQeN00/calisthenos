import { eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { Link, redirect, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

// ============================================================
// Loader: ekran wstrzymanego konta żyje POZA layoutem podopiecznego (bez sidenav),
// żeby gate w _layout.tsx nie wpadał w pętlę redirectów. Gdy trener jest aktywny
// (lub podopieczny nie ma trenera) — odsyłamy do dashboardu (np. po reaktywacji).
// ============================================================

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
  if (!user.trainerId) throw redirect("/podopieczny");

  const [trainer] = await db
    .select({ archivedAt: schema.users.archivedAt })
    .from(schema.users)
    .where(eq(schema.users.id, user.trainerId))
    .limit(1);

  // Trener aktywny (lub brak) → nie ma po co tu być (np. po reaktywacji).
  if (!trainer?.archivedAt) throw redirect("/podopieczny");

  return {};
}

// ============================================================
// Widok: pełnoekranowa, wyśrodkowana karta brandowa (jak zaproszenie/login).
// ============================================================

export default function WstrzymanePage() {
  const { t } = useTranslation("podopieczny");

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t("wstrzymane.eyebrow")}
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("wstrzymane.title")}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          {t("wstrzymane.body")}
        </p>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/wyloguj" className="muted text-sm">
            {t("wstrzymane.logout")}
          </Link>
        </div>
      </div>
    </main>
  );
}
