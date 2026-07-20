import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Link, useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { assertTrainerActive } from "~/lib/trainee-access";
import {
  getMonthlyWrapped,
  isPastMonth,
  parseYM,
  type Archetype,
  type MonthlyPR,
  type WrappedSummary,
} from "~/lib/wrapped";

// ============================================================
// Loader: validates that the requested month is in the past and has data;
// returns the full wrapped summary used to render the card sequence.
// ============================================================

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  // Wstrzymanie: trasa poza layoutem podopiecznego → gate jawnie (inaczej wstrzymany
  // podopieczny zobaczyłby swoje Wrapped mimo dezaktywacji trenera).
  await assertTrainerActive(db, user);
  const ym = args.params.ym ?? "";
  const parsed = parseYM(ym);
  if (!parsed) throw new Response("invalid month", { status: 404 });
  if (!isPastMonth(parsed.year, parsed.month)) {
    throw new Response("month not yet closed", { status: 404 });
  }
  const summary = await getMonthlyWrapped(db, user.id, parsed.year, parsed.month);
  if (!summary.hasData) {
    throw new Response("no data", { status: 404 });
  }
  return { user, summary };
}

// ============================================================
// Page wrapper: dark full-screen, escapes the sidenav layout entirely.
// ============================================================

export default function WrappedPage() {
  const { user, summary } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const onClose = useCallback(() => navigate("/podopieczny"), [navigate]);

  // Mark this wrapped as viewed in localStorage so the dashboard banner stops
  // nagging. Runs once per ym.
  useEffect(() => {
    try {
      localStorage.setItem(`wrapped-viewed-${summary.ym}`, "1");
    } catch {
      // localStorage can be disabled — harmless.
    }
  }, [summary.ym]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse at top, #1b2030 0%, var(--ink) 60%)",
        color: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        zIndex: 100,
        overflow: "hidden",
      }}
    >
      <CardDeck
        summary={summary}
        firstName={user.displayName.split(" ")[0] ?? user.displayName}
        onClose={onClose}
      />
    </div>
  );
}

// ============================================================
// Card deck — manages current index, transitions, keyboard input.
// ============================================================

/** Localized month name ("Czerwiec" / "juin") and full label ("Czerwiec 2026" / "juin 2026"). */
function localizedMonth(
  locale: string,
  year: number,
  month: number,
): { name: string; label: string } {
  const d = new Date(Date.UTC(year, month - 1, 1));
  const name = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(d);
  // Capitalize first letter (fr renders lowercase month names).
  const cased = name.charAt(0).toUpperCase() + name.slice(1);
  return { name: cased, label: `${cased} ${year}` };
}

function CardDeck({
  summary,
  firstName,
  onClose,
}: {
  summary: WrappedSummary;
  firstName: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const month = localizedMonth(locale, summary.year, summary.month);
  const cards = buildCards(summary, firstName, month.name);
  const [index, setIndex] = useState(0);
  const current = cards[index]!;
  const isLast = index === cards.length - 1;
  const cardCount = cards.length;

  // Functional updates so the callbacks don't need to capture `index` — keeps
  // the keydown listener stable across re-renders.
  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= cardCount - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [cardCount, onClose]);
  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Keyboard nav (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onClose]);

  // Touch zones: left third → previous, right two-thirds → next.
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width / 3) goPrev();
    else goNext();
  };

  return (
    <>
      {/* Progress bar at top — one segment per card */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "14px 16px 0",
          flexShrink: 0,
        }}
      >
        {cards.map((c, i) => (
          <div
            key={c.key}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background:
                i < index
                  ? "var(--accent)"
                  : i === index
                    ? "rgba(199, 242, 60, 0.55)"
                    : "rgba(255, 255, 255, 0.15)",
              transition: "background .2s ease",
            }}
          />
        ))}
      </div>

      {/* Top chrome: month label + close */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px 0",
          flexShrink: 0,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".12em",
            color: "rgba(255,255,255,.6)",
          }}
        >
          {t("wrapped.deck.chrome", { label: month.label })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("wrapped.deck.close")}
          style={{
            background: "rgba(255,255,255,.08)",
            color: "var(--bg)",
            border: 0,
            width: 32,
            height: 32,
            borderRadius: "50%",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icons.X />
        </button>
      </div>

      {/* Card content area — clickable for advance */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={t("wrapped.deck.nextCard")}
        style={{
          flex: 1,
          background: "transparent",
          border: 0,
          color: "inherit",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          cursor: "pointer",
          minHeight: 0,
          font: "inherit",
        }}
      >
        <CardView card={current} keyForAnim={current.key} />
      </button>

      {/* Bottom CTA on last card: share */}
      {isLast && <ShareBar summary={summary} firstName={firstName} />}
    </>
  );
}

// ============================================================
// Card definitions
// ============================================================

type Card =
  | { key: "intro"; kind: "intro"; firstName: string; monthName: string; sessions: number }
  | {
      key: "volume";
      kind: "volume";
      totalReps: number;
      totalSeconds: number;
      totalSets: number;
    }
  | {
      key: "top";
      kind: "top";
      top: NonNullable<WrappedSummary["topExercise"]>;
    }
  | { key: "top-empty"; kind: "top-empty" }
  | { key: "prs"; kind: "prs"; prs: MonthlyPR[] }
  | {
      key: "heaviest";
      kind: "heaviest";
      day: NonNullable<WrappedSummary["heaviestDay"]>;
    }
  | {
      key: "archetype";
      kind: "archetype";
      archetype: WrappedSummary["archetype"];
      prCount: number;
      topPct: number;
    }
  | {
      key: "vs-prev";
      kind: "vs-prev";
      vs: WrappedSummary["vsPrevious"];
    }
  | { key: "closing"; kind: "closing"; monthName: string };

function buildCards(s: WrappedSummary, firstName: string, monthName: string): Card[] {
  const cards: Card[] = [];
  cards.push({ key: "intro", kind: "intro", firstName, monthName, sessions: s.sessions });
  cards.push({
    key: "volume",
    kind: "volume",
    totalReps: s.totalReps,
    totalSeconds: s.totalSeconds,
    totalSets: s.totalSets,
  });
  if (s.topExercise) {
    cards.push({ key: "top", kind: "top", top: s.topExercise });
  } else {
    cards.push({ key: "top-empty", kind: "top-empty" });
  }
  cards.push({ key: "prs", kind: "prs", prs: s.prs });
  if (s.heaviestDay) {
    cards.push({ key: "heaviest", kind: "heaviest", day: s.heaviestDay });
  }
  cards.push({
    key: "archetype",
    kind: "archetype",
    archetype: s.archetype,
    prCount: s.prs.length,
    topPct: s.topExercise?.pctOfSessions ?? 0,
  });
  cards.push({ key: "vs-prev", kind: "vs-prev", vs: s.vsPrevious });
  cards.push({ key: "closing", kind: "closing", monthName });
  return cards;
}

// ============================================================
// CardView — animation wrapper + per-kind renderer.
// ============================================================

function CardView({ card, keyForAnim }: { card: Card; keyForAnim: string }) {
  // Re-key forces remount, which retriggers the fade-in animation.
  return (
    <div
      key={keyForAnim}
      style={{
        width: "100%",
        maxWidth: 520,
        animation: "wrappedFadeIn 350ms ease forwards",
      }}
    >
      <style>{KEYFRAMES_CSS}</style>
      <RenderCard card={card} />
    </div>
  );
}

const KEYFRAMES_CSS = `
@keyframes wrappedFadeIn {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes wrappedPop {
  0% { opacity: 0; transform: scale(0.85); }
  60% { opacity: 1; transform: scale(1.06); }
  100% { transform: scale(1); }
}
`;

function RenderCard({ card }: { card: Card }) {
  switch (card.kind) {
    case "intro":
      return (
        <IntroCard firstName={card.firstName} monthName={card.monthName} sessions={card.sessions} />
      );
    case "volume":
      return (
        <VolumeCard
          totalReps={card.totalReps}
          totalSeconds={card.totalSeconds}
          totalSets={card.totalSets}
        />
      );
    case "top":
      return <TopExerciseCard top={card.top} />;
    case "top-empty":
      return <TopEmptyCard />;
    case "prs":
      return <PRsCard prs={card.prs} />;
    case "heaviest":
      return <HeaviestCard day={card.day} />;
    case "archetype":
      return (
        <ArchetypeCard archetype={card.archetype} prCount={card.prCount} topPct={card.topPct} />
      );
    case "vs-prev":
      return <VsPrevCard vs={card.vs} />;
    case "closing":
      return <ClosingCard monthName={card.monthName} />;
  }
}

// ============================================================
// Individual cards
// ============================================================

const EYEBROW: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  opacity: 0.6,
  marginBottom: 18,
};

const HUGE: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(64px, 18vw, 132px)",
  lineHeight: 0.95,
  letterSpacing: "-0.04em",
  color: "var(--accent)",
};

const BIG: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(40px, 10vw, 72px)",
  lineHeight: 1.05,
  letterSpacing: "-0.02em",
};

const HEAD: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 700,
  fontSize: "clamp(24px, 5vw, 32px)",
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

const SUB: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.5,
  opacity: 0.75,
  marginTop: 18,
};

function IntroCard({
  firstName,
  monthName,
  sessions,
}: {
  firstName: string;
  monthName: string;
  sessions: number;
}) {
  const { t } = useTranslation("podopieczny");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.intro.eyebrow")}</div>
      <div style={HEAD}>{t("wrapped.intro.greeting", { name: firstName })}</div>
      <div style={{ ...HUGE, marginTop: 20 }}>{monthName}</div>
      <div style={{ ...SUB, marginTop: 8 }}>
        <Trans
          t={t}
          i18nKey="wrapped.intro.lead"
          count={sessions}
          values={{ count: sessions }}
          components={[<strong style={{ color: "var(--accent)" }} key="s" />]}
        />
      </div>
    </div>
  );
}

function VolumeCard({
  totalReps,
  totalSeconds,
  totalSets,
}: {
  totalReps: number;
  totalSeconds: number;
  totalSets: number;
}) {
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const hero = totalReps >= totalSeconds ? totalReps : totalSeconds;
  const heroLabel =
    totalReps >= totalSeconds ? t("wrapped.volume.heroReps") : t("wrapped.volume.heroSeconds");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.volume.eyebrow")}</div>
      <CountUp value={hero} style={HUGE} locale={locale} />
      <div style={HEAD}>{heroLabel}</div>
      <div style={SUB}>
        <Trans
          t={t}
          i18nKey="wrapped.volume.lead"
          values={{ sets: totalSets.toLocaleString(locale) }}
          components={[<strong key="s" />]}
        />
        {totalReps > 0 && totalSeconds > 0 && (
          <Trans
            t={t}
            i18nKey={
              hero === totalReps ? "wrapped.volume.balanceSeconds" : "wrapped.volume.balanceReps"
            }
            values={{
              seconds: totalSeconds.toLocaleString(locale),
              reps: totalReps.toLocaleString(locale),
            }}
            components={[<strong key="s" />]}
          />
        )}
      </div>
    </div>
  );
}

function TopExerciseCard({
  top,
}: {
  top: NonNullable<WrappedSummary["topExercise"]>;
}) {
  const { t } = useTranslation("podopieczny");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.top.eyebrow")}</div>
      <div style={HEAD}>{t("wrapped.top.head")}</div>
      <div
        style={{
          ...BIG,
          color: "var(--accent)",
          marginTop: 16,
          marginBottom: 8,
          wordBreak: "break-word",
        }}
      >
        {top.exerciseName}
      </div>
      <div style={SUB}>
        <Trans
          t={t}
          i18nKey="wrapped.top.lead"
          count={top.sessionsInvolved}
          values={{ count: top.sessionsInvolved, pct: top.pctOfSessions, unit: top.unit }}
          components={[<strong key="s" />, <span className="mono" key="u" />]}
        />
      </div>
    </div>
  );
}

function TopEmptyCard() {
  const { t } = useTranslation("podopieczny");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.topEmpty.eyebrow")}</div>
      <div style={HEAD}>{t("wrapped.topEmpty.head")}</div>
      <div style={SUB}>{t("wrapped.topEmpty.lead")}</div>
    </div>
  );
}

function PRsCard({ prs }: { prs: MonthlyPR[] }) {
  const { t } = useTranslation("podopieczny");
  if (prs.length === 0) {
    return (
      <div>
        <div style={EYEBROW}>{t("wrapped.prs.eyebrow")}</div>
        <div style={HEAD}>{t("wrapped.prs.emptyHead")}</div>
        <div style={SUB}>{t("wrapped.prs.emptyLead")}</div>
      </div>
    );
  }
  const top = prs[0]!;
  const topUnitLabel = top.unit === "SEC" ? t("wrapped.prs.unitSec") : t("wrapped.prs.unitReps");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.prs.eyebrow")}</div>
      <div style={HEAD}>{t("wrapped.prs.head")}</div>
      <div
        style={{
          ...HUGE,
          fontSize: "clamp(72px, 22vw, 156px)",
          marginTop: 10,
          marginBottom: 6,
        }}
      >
        {prs.length}
      </div>
      <div style={HEAD}>{t("wrapped.prs.count", { count: prs.length })}</div>
      <div style={{ ...SUB, marginTop: 20 }}>
        <Trans
          t={t}
          i18nKey="wrapped.prs.strongest"
          values={{ name: top.exerciseName, reps: top.reps, unitLabel: topUnitLabel }}
          components={[
            <strong style={{ color: "var(--accent)" }} key="n" />,
            <span className="mono" key="r" />,
          ]}
        />
        {top.previousBest > 0 && (
          <>
            {" "}
            <span className="mono" style={{ opacity: 0.55 }}>
              {t("wrapped.prs.previousBest", { value: top.previousBest })}
            </span>
          </>
        )}
      </div>
      {prs.length > 1 && (
        <div
          className="text-xs mono"
          style={{
            opacity: 0.55,
            marginTop: 14,
            textAlign: "left",
            maxHeight: 90,
            overflow: "hidden",
          }}
        >
          {prs
            .slice(1, 5)
            .map((p) => `${p.exerciseName} · ${p.reps}${p.unit === "SEC" ? "s" : ""}`)
            .join(" · ")}
          {prs.length > 5 && ` · ${t("wrapped.prs.moreSuffix", { n: prs.length - 5 })}`}
        </div>
      )}
    </div>
  );
}

function HeaviestCard({
  day,
}: {
  day: NonNullable<WrappedSummary["heaviestDay"]>;
}) {
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const setWord = t("wrapped.heaviest.setWord", { count: day.setCount });
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.heaviest.eyebrow")}</div>
      <div style={HEAD}>{fmtDate(day.date, locale)}</div>
      <div
        style={{
          ...BIG,
          color: "var(--accent)",
          marginTop: 16,
          marginBottom: 4,
          wordBreak: "break-word",
        }}
      >
        {day.sessionName}
      </div>
      <div style={SUB}>
        <Trans
          t={t}
          i18nKey="wrapped.heaviest.lead"
          values={{ reps: day.totalReps.toLocaleString(locale), count: day.setCount, setWord }}
          components={[<strong key="r" />, <strong key="c" />]}
        />
        {day.avgRpe != null && (
          <Trans
            t={t}
            i18nKey="wrapped.heaviest.rpe"
            values={{ value: day.avgRpe }}
            components={[<strong key="v" />]}
          />
        )}
      </div>
    </div>
  );
}

function ArchetypeCard({
  archetype,
  prCount,
  topPct,
}: {
  archetype: WrappedSummary["archetype"];
  prCount: number;
  topPct: number;
}) {
  const { t } = useTranslation("podopieczny");
  const { label, description } = localizeArchetype(t, archetype, prCount, topPct);
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.archetype.eyebrow")}</div>
      <div
        style={{
          fontSize: "clamp(72px, 18vw, 120px)",
          lineHeight: 1,
          marginBottom: 14,
          animation: "wrappedPop 600ms ease forwards",
        }}
      >
        {archetype.emoji}
      </div>
      <div style={{ ...HUGE, fontSize: "clamp(40px, 12vw, 84px)", color: "var(--accent)" }}>
        {label}
      </div>
      <div style={SUB}>{description}</div>
    </div>
  );
}

/**
 * Maps the server-computed archetype (PL strings from `app/lib/wrapped.ts`) to a
 * localized label + description via its stable `key`. Counts the summary still
 * exposes (PR count for `power-user`, top-% for `specialist`) are re-interpolated;
 * archetypes whose original copy referenced inputs not present in the summary
 * (`experimenter` newExercises, `all-rounder` distinctExercises) use count-free copy.
 */
function localizeArchetype(
  // biome-ignore lint/suspicious/noExplicitAny: przeciążenia TFunction są złożone; tu wystarczy luźny podpis.
  t: (...args: any[]) => string,
  archetype: Archetype,
  prCount: number,
  topPct: number,
): { label: string; description: string } {
  switch (archetype.key) {
    case "power-user":
      return {
        label: t("wrapped.archetype.powerUser.label"),
        description: t("wrapped.archetype.powerUser.description", { count: prCount }),
      };
    case "specialist":
      return {
        label: t("wrapped.archetype.specialist.label"),
        description: t("wrapped.archetype.specialist.description", { pct: topPct }),
      };
    case "experimenter":
      return {
        label: t("wrapped.archetype.experimenter.label"),
        description: t("wrapped.archetype.experimenter.description"),
      };
    case "consistent":
      return {
        label: t("wrapped.archetype.consistent.label"),
        description: t("wrapped.archetype.consistent.description"),
      };
    case "maximalist":
      return {
        label: t("wrapped.archetype.maximalist.label"),
        description: t("wrapped.archetype.maximalist.description"),
      };
    case "endurance":
      return {
        label: t("wrapped.archetype.endurance.label"),
        description: t("wrapped.archetype.endurance.description"),
      };
    case "all-rounder":
      return {
        label: t("wrapped.archetype.allRounder.label"),
        description: t("wrapped.archetype.allRounder.description"),
      };
    case "patient":
      return {
        label: t("wrapped.archetype.patient.label"),
        description: t("wrapped.archetype.patient.description"),
      };
    default:
      return {
        label: t("wrapped.archetype.explorer.label"),
        description: t("wrapped.archetype.explorer.description"),
      };
  }
}

function VsPrevCard({ vs }: { vs: WrappedSummary["vsPrevious"] }) {
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  if (!vs.hasPrevious) {
    return (
      <div>
        <div style={EYEBROW}>{t("wrapped.vsPrev.eyebrowFirst")}</div>
        <div style={HEAD}>{t("wrapped.vsPrev.firstHead")}</div>
        <div style={SUB}>{t("wrapped.vsPrev.firstLead")}</div>
      </div>
    );
  }
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.vsPrev.eyebrow")}</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          marginTop: 14,
          marginBottom: 12,
        }}
      >
        <DeltaStat
          label={t("wrapped.vsPrev.sessionsLabel")}
          value={`${vs.sessionsThis}`}
          delta={vs.sessionsDelta}
          deltaText={
            vs.sessionsDelta === 0
              ? t("wrapped.vsPrev.same")
              : t("wrapped.vsPrev.sessionsDelta", {
                  delta: `${vs.sessionsDelta > 0 ? "+" : ""}${vs.sessionsDelta}`,
                  prev: vs.sessionsPrev,
                })
          }
        />
        <DeltaStat
          label={t("wrapped.vsPrev.repsLabel")}
          value={vs.repsThis.toLocaleString(locale)}
          delta={vs.repsDeltaPct ?? 0}
          deltaText={
            vs.repsDeltaPct == null
              ? t("wrapped.vsPrev.noData")
              : vs.repsDeltaPct === 0
                ? t("wrapped.vsPrev.same")
                : t("wrapped.vsPrev.repsDelta", {
                    delta: `${vs.repsDeltaPct > 0 ? "+" : ""}${vs.repsDeltaPct}`,
                  })
          }
        />
      </div>
      {vs.avgRpeThis != null && vs.rpeDelta != null && vs.rpeDelta !== 0 && (
        <div style={{ ...SUB, marginTop: 8 }}>
          <Trans
            t={t}
            i18nKey="wrapped.vsPrev.rpeLine"
            values={{
              value: vs.avgRpeThis,
              delta: `${vs.rpeDelta > 0 ? "+" : ""}${vs.rpeDelta}`,
            }}
            components={[
              <strong key="v" />,
              <span style={{ color: vs.rpeDelta > 0 ? "var(--danger)" : "var(--ok)" }} key="d" />,
            ]}
          />
        </div>
      )}
    </div>
  );
}

function DeltaStat({
  label,
  value,
  delta,
  deltaText,
}: {
  label: string;
  value: string;
  delta: number;
  deltaText: string;
}) {
  const tone = delta > 0 ? "var(--accent)" : delta < 0 ? "var(--danger)" : "rgba(255,255,255,.6)";
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".1em",
          opacity: 0.55,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 38,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mono" style={{ fontSize: 11, marginTop: 6, color: tone }}>
        {deltaText}
      </div>
    </div>
  );
}

function ClosingCard({ monthName }: { monthName: string }) {
  const { t } = useTranslation("podopieczny");
  return (
    <div>
      <div style={EYEBROW}>{t("wrapped.closing.eyebrow")}</div>
      <div style={{ ...HUGE, color: "var(--accent)" }}>{monthName}</div>
      <div style={HEAD}>{t("wrapped.closing.head")}</div>
      <div style={SUB}>{t("wrapped.closing.lead")}</div>
    </div>
  );
}

// ============================================================
// CountUp — animowany licznik dla dużych liczb
// ============================================================

function CountUp({
  value,
  style,
  locale = "pl-PL",
}: {
  value: number;
  style: React.CSSProperties;
  locale?: string;
}) {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic.
      const eased = 1 - (1 - t) ** 3;
      setCurrent(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <div style={style}>{current.toLocaleString(locale)}</div>;
}

// ============================================================
// ShareBar — last-card CTA
// ============================================================

function ShareBar({
  summary,
  firstName,
}: {
  summary: WrappedSummary;
  firstName: string;
}) {
  const [copied, setCopied] = useState(false);
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const monthLabel = localizedMonth(locale, summary.year, summary.month).label;

  const shareText = buildShareText(t, locale, summary, firstName, monthLabel);

  const onShare = async () => {
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch {
      // user canceled or share failed → fall through to copy
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // last resort: nothing we can do without UI clutter
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "16px 20px 24px",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <button type="button" onClick={onShare} className="btn btn-primary" style={{ minWidth: 160 }}>
        <Icons.Upload /> {copied ? t("wrapped.share.copied") : t("wrapped.share.share")}
      </button>
      <Link
        to="/podopieczny"
        className="btn"
        style={{
          background: "rgba(255,255,255,.08)",
          color: "var(--bg)",
          borderColor: "rgba(255,255,255,.15)",
        }}
      >
        {t("wrapped.share.close")}
      </Link>
    </div>
  );
}

function buildShareText(
  // biome-ignore lint/suspicious/noExplicitAny: przeciążenia TFunction są złożone; tu wystarczy luźny podpis.
  t: (...args: any[]) => string,
  locale: string,
  s: WrappedSummary,
  firstName: string,
  monthLabel: string,
): string {
  const archetypeLabel = localizeArchetype(
    t,
    s.archetype,
    s.prs.length,
    s.topExercise?.pctOfSessions ?? 0,
  ).label;
  const parts = [
    t("wrapped.share.textIntro", { name: firstName, label: monthLabel }),
    t("wrapped.share.textSessions", { n: s.sessions }),
  ];
  if (s.totalReps > 0)
    parts.push(t("wrapped.share.textReps", { reps: s.totalReps.toLocaleString(locale) }));
  if (s.totalSeconds > 0)
    parts.push(t("wrapped.share.textSeconds", { seconds: s.totalSeconds.toLocaleString(locale) }));
  if (s.prs.length > 0) parts.push(t("wrapped.share.textPrs", { n: s.prs.length }));
  parts.push(t("wrapped.share.textArchetype", { label: archetypeLabel, emoji: s.archetype.emoji }));
  return parts.join(" · ");
}
