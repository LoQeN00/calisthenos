import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";
import { VideoButton } from "~/components/video-modal";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { signFileUrl } from "~/lib/files";
import { loadActivePlanFullForTrainee } from "~/lib/workouts";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const sessionId = args.params.sessionId ?? "";
  const planFull = await loadActivePlanFullForTrainee(db, user.id);
  if (!planFull) throw new Response("not found", { status: 404 });

  const sessionIdx = planFull.sessions.findIndex((s) => s.session.id === sessionId);
  if (sessionIdx === -1) throw new Response("not found", { status: 404 });
  const sessionView = planFull.sessions[sessionIdx]!;

  // Sign demo URLs for items that have a demo file.
  const blocks = sessionView.blocks.map((b) => ({
    ...b,
    items: b.items.map((it) => ({
      ...it,
      demoUrl: it.exercise.demoFileId != null ? signFileUrl(it.exercise.demoFileId, user.id) : null,
    })),
  }));

  return {
    plan: planFull.plan,
    sessionView,
    sessionIdx,
    blocks,
  };
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function TraineeSessionDetail() {
  const { plan, sessionView, sessionIdx, blocks } = useLoaderData<typeof loader>();
  const { t } = useTranslation("podopieczny");
  const totalSets = blocks.reduce((a, b) => {
    if (b.block.kind === "dropset") return a + (b.block.sets ?? 0);
    return a + b.items.reduce((aa, it) => aa + (it.item.sets ?? 0), 0);
  }, 0);

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/sesje">{plan.name}</Link>
        <span className="sep">›</span>
        <span className="current">{sessionView.session.name}</span>
      </div>

      <div
        className="row between"
        style={{
          paddingBottom: 22,
          marginBottom: 24,
          borderBottom: "1px solid var(--line)",
          alignItems: "flex-end",
          gap: 16,
        }}
      >
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("sesje.detail.eyebrow", { number: sessionIdx + 1 })}
          </div>
          <h1 style={{ fontSize: 26 }}>{sessionView.session.name}</h1>
          <div
            className="row"
            style={{ gap: 14, marginTop: 6, color: "var(--muted)", fontSize: 13.5 }}
          >
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {blocks.length}
              </span>{" "}
              {t("sesje.detail.blocks", { count: blocks.length })}
            </span>
            <span>·</span>
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {blocks.reduce((a, b) => a + b.items.length, 0)}
              </span>{" "}
              {t("sesje.detail.exercises", {
                count: blocks.reduce((a, b) => a + b.items.length, 0),
              })}
            </span>
            <span>·</span>
            <span>
              <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>
                {totalSets}
              </span>{" "}
              {t("sesje.detail.plannedSets", { count: totalSets })}
            </span>
          </div>
        </div>
        <Link
          to={`/podopieczny/loguj/${sessionView.session.id}`}
          className="btn btn-primary btn-lg"
        >
          <Icons.Plus /> {t("sesje.detail.registerBtn")}
        </Link>
      </div>

      <div className="col" style={{ gap: 14 }}>
        {blocks.map((b, bi) => (
          <BlockView key={b.block.id} bi={bi} block={b} />
        ))}
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
        <Link
          to={`/podopieczny/loguj/${sessionView.session.id}`}
          className="btn btn-primary btn-lg"
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Icons.Plus /> {t("sesje.detail.registerBtnFull")}
        </Link>
      </div>
    </div>
  );
}

function BlockView({
  bi,
  block: b,
}: {
  bi: number;
  block: LoaderData["blocks"][number];
}) {
  const { t } = useTranslation("podopieczny");
  return (
    <div className="card card-padless">
      <div
        className="row"
        style={{
          padding: "12px 18px",
          gap: 14,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--line)",
          alignItems: "center",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
        >
          {t("sesje.detail.blockLabel", { letter: String.fromCharCode(65 + bi) })}
        </div>
        {b.block.kind === "superset" && (
          <span className="badge">
            <Icons.Link /> {t("sesje.detail.supersetBadge")}
          </span>
        )}
        {b.block.kind === "dropset" && (
          <span
            className="badge"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent-ink)",
              borderColor: "transparent",
            }}
          >
            <Icons.Drop /> {t("sesje.detail.dropsetBadge", { count: b.items.length })}
          </span>
        )}
      </div>

      {b.block.kind === "dropset" ? (
        <div style={{ padding: 18 }}>
          <div
            className="row"
            style={{
              gap: 18,
              marginBottom: 14,
              paddingBottom: 12,
              borderBottom: "1px dashed var(--line)",
            }}
          >
            <div>
              <div
                className="mono muted"
                style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}
              >
                {t("sesje.detail.sets")}
              </div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                {b.block.sets ?? 0}
              </div>
            </div>
            <div>
              <div
                className="mono muted"
                style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}
              >
                {t("sesje.detail.restAfterSet")}
              </div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
                {b.block.restSeconds != null ? `${b.block.restSeconds}s` : "—"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {b.items.map((it, di) => (
              <DropRow key={it.item.id} it={it} di={di} total={b.items.length} />
            ))}
          </div>
        </div>
      ) : (
        <div className="col" style={{ padding: 18, gap: 14 }}>
          {b.items.map((it, ei) => (
            <ExerciseRow key={it.item.id} it={it} ei={ei} kind={b.block.kind} />
          ))}
        </div>
      )}
    </div>
  );
}

function DropRow({
  it,
  di,
  total,
}: {
  it: LoaderData["blocks"][number]["items"][number];
  di: number;
  total: number;
}) {
  const { t } = useTranslation("podopieczny");
  const ex = it.exercise;
  return (
    <div>
      <div className="row" style={{ gap: 14, alignItems: "flex-start", padding: "10px 0" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: di === 0 ? "var(--ink)" : "var(--surface-2)",
            color: di === 0 ? "var(--bg)" : "var(--ink)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {di + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div
            className="row"
            style={{ gap: 10, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}
          >
            <h3 style={{ fontSize: 14.5, margin: 0 }}>{ex.name}</h3>
            <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>{ex.unit}</span>
            {it.demoUrl && <VideoButton src={it.demoUrl} title={ex.name} size="sm" />}
          </div>
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
              {it.item.reps}{" "}
              {ex.unit === "SEC" ? t("sesje.detail.secUnit") : t("sesje.detail.repsUnit")}
            </div>
            {ex.description.length > 0 && (
              <div className="text-xs muted" style={{ flex: 1 }}>
                {ex.description.split(".")[0]}.
              </div>
            )}
          </div>
        </div>
      </div>
      {di < total - 1 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px",
            color: "var(--accent-ink)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            background: "var(--accent-soft)",
            borderRadius: 4,
            marginLeft: 44,
            marginBottom: 4,
          }}
        >
          <Icons.ChevDown style={{ fontSize: 12 }} />
          {t("sesje.detail.noBreak")}
        </div>
      )}
    </div>
  );
}

function ExerciseRow({
  it,
  ei,
  kind,
}: {
  it: LoaderData["blocks"][number]["items"][number];
  ei: number;
  kind: "single" | "superset" | "dropset";
}) {
  const { t } = useTranslation("podopieczny");
  const ex = it.exercise;
  return (
    <div style={{ flex: 1 }}>
      <div
        className="row"
        style={{ gap: 10, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}
      >
        <h3 style={{ fontSize: 16, margin: 0 }}>{ex.name}</h3>
        <span className={`badge${ex.unit === "REPS" ? " active" : ""}`}>{ex.unit}</span>
        {kind === "superset" && (
          <span
            className="mono muted"
            style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em" }}
          >
            {t("sesje.detail.supersetPart", { part: ei === 0 ? "A" : "B" })}
          </span>
        )}
        {it.demoUrl && <VideoButton src={it.demoUrl} title={ex.name} />}
      </div>
      <div style={{ flex: 1 }}>
        <div className="row" style={{ gap: 18, marginBottom: 8 }}>
          <Stat label={t("sesje.detail.sets")} value={String(it.item.sets ?? 0)} />
          <Stat
            label={ex.unit === "REPS" ? t("sesje.detail.repetitions") : t("sesje.detail.seconds")}
            value={String(it.item.reps)}
          />
          <Stat
            label={t("sesje.detail.rest")}
            value={it.item.restSeconds != null ? `${it.item.restSeconds}s` : "—"}
          />
        </div>
        {it.item.note && (
          <div
            className="muted"
            style={{
              fontSize: 12.5,
              fontStyle: "italic",
              marginTop: 6,
              paddingLeft: 10,
              borderLeft: "2px solid var(--accent)",
            }}
          >
            „{it.item.note}"
          </div>
        )}
        {ex.description.length > 0 && (
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 8 }}>
            {ex.description}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="mono muted"
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }}
      >
        {label}
      </div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}
