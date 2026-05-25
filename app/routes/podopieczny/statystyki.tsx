import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import {
  getHeroStats,
  getPersonalRecords,
  getThisWeekStats,
} from "~/lib/stats";

const SESJA: PlForms = { one: "sesja", few: "sesje", many: "sesji" };
const TYDZIEN: PlForms = { one: "tydzień", few: "tygodnie", many: "tygodni" };
const POWT: PlForms = { one: "powtórzenie", few: "powtórzenia", many: "powtórzeń" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const [hero, thisWeek, prs] = await Promise.all([
    getHeroStats(db, user.id),
    getThisWeekStats(db, user.id),
    getPersonalRecords(db, user.id, { limit: 50 }),
  ]);
  return { hero, thisWeek, prs };
}

export default function TraineeStatystyki() {
  const { hero, thisWeek, prs } = useLoaderData<typeof loader>();
  const isQuiet = hero.totalSessions === 0;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Statystyki</h1>
          <div className="sub">
            {isQuiet
              ? "Zarejestruj pierwszą sesję, by zobaczyć swoje liczby."
              : "Twój postęp w jednym miejscu."}
          </div>
        </div>
      </div>

      {isQuiet ? (
        <div className="empty">
          <h3>Brak danych</h3>
          <div>Statystyki pojawią się po pierwszej zarejestrowanej sesji.</div>
        </div>
      ) : (
        <>
          <HeroCard hero={hero} />
          <ThisWeekCard thisWeek={thisWeek} />
          <PRSection prs={prs} />
        </>
      )}
    </div>
  );
}

function HeroCard({ hero }: { hero: ReturnType<typeof useLoaderData<typeof loader>>["hero"] }) {
  return (
    <div
      className="card"
      style={{
        marginBottom: 20,
        padding: 24,
        background: "var(--ink)",
        color: "var(--bg)",
        border: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "var(--accent)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 24,
          position: "relative",
        }}
      >
        <HeroStat
          label="Sesji łącznie"
          value={hero.totalSessions.toLocaleString("pl-PL")}
          suffix={pluralizePl(hero.totalSessions, SESJA)}
        />
        <HeroStat
          label="Streak"
          value={hero.streakWeeks.toString()}
          suffix={pluralizePl(hero.streakWeeks, TYDZIEN)}
          accent={hero.streakWeeks > 0}
        />
        <HeroStat
          label="Łączne powtórzenia"
          value={hero.totalReps.toLocaleString("pl-PL")}
          suffix={pluralizePl(hero.totalReps, POWT)}
        />
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          opacity: 0.6,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 36,
          lineHeight: 1,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: accent ? "var(--accent)" : "var(--bg)",
        }}
      >
        {value}
      </div>
      <div className="mono" style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
        {suffix}
      </div>
    </div>
  );
}

function ThisWeekCard({
  thisWeek,
}: {
  thisWeek: ReturnType<typeof useLoaderData<typeof loader>>["thisWeek"];
}) {
  const aboveAvg = thisWeek.thisWeek >= thisWeek.avgPerWeek;
  const message =
    thisWeek.avgPerWeek === 0
      ? `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — dobry początek!`
      : aboveAvg
        ? `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — twoja średnia to ${thisWeek.avgPerWeek}. ✓`
        : `${thisWeek.thisWeek} ${pluralizePl(thisWeek.thisWeek, SESJA)} w tym tygodniu — średnio robisz ${thisWeek.avgPerWeek}. Dasz radę nadrobić?`;

  return (
    <div
      className="card"
      style={{
        marginBottom: 22,
        padding: "16px 20px",
        borderLeft: `3px solid ${aboveAvg ? "var(--ok)" : "var(--accent)"}`,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        Ten tydzień
      </div>
      <div style={{ fontSize: 14, color: "var(--ink)" }}>{message}</div>
    </div>
  );
}

function PRSection({
  prs,
}: {
  prs: ReturnType<typeof useLoaderData<typeof loader>>["prs"];
}) {
  return (
    <section>
      <div
        className="row between"
        style={{ alignItems: "baseline", marginBottom: 12 }}
      >
        <h2 style={{ fontSize: 17 }}>Rekordy osobiste</h2>
        <Icons.Trophy style={{ color: "var(--muted)" }} />
      </div>

      {prs.length === 0 ? (
        <div className="empty">
          <h3>Brak rekordów</h3>
          <div>Po pierwszej serii każde wykonanie ćwiczenia tworzy rekord.</div>
        </div>
      ) : (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "1fr 80px 100px 90px", gap: 14 }}
          >
            <div>Ćwiczenie</div>
            <div>Rekord</div>
            <div>Data</div>
            <div />
          </div>
          {prs.map((pr) => (
            <div
              key={pr.exerciseId}
              className="list-row"
              style={{ gridTemplateColumns: "1fr 80px 100px 90px", gap: 14 }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{pr.exerciseName}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {pr.unit === "SEC" ? "wytrzymałość" : "powtórzenia"}
                </div>
              </div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {pr.pr}
                <span
                  className="muted"
                  style={{ fontSize: 11, fontWeight: 400, marginLeft: 3 }}
                >
                  {pr.unit === "SEC" ? "s" : "rep"}
                </span>
              </div>
              <div className="mono text-xs muted">{fmtDate(pr.prAchievedOn)}</div>
              <div style={{ textAlign: "right" }}>
                {pr.isFresh && (
                  <span
                    className="badge"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                      borderColor: "transparent",
                    }}
                    title="Świeży rekord (ostatnie 7 dni)"
                  >
                    świeży
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
