import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { getConsultationDetail } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    traineeId: user.id,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  return { detail };
}

const OTWARTY: PlForms = { one: "otwarty", few: "otwarte", many: "otwartych" };
const POPRAWIONY: PlForms = { one: "poprawiony", few: "poprawione", many: "poprawionych" };

export default function TraineeKonsultacjaDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const { consultation: c, items } = detail;

  const periodLabel =
    c.periodFrom && c.periodTo
      ? ` · okres ${fmtDate(c.periodFrom)} — ${fmtDate(c.periodTo)}`
      : "";

  const openCount = items.filter((it) => it.status === "open").length;
  const resolvedCount = items.length - openCount;

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/konsultacje">Konsultacje</Link>
        <span className="sep">›</span>
        <span className="current">{c.title}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {fmtDate(c.heldOn)}
            {periodLabel}
          </div>
          <h1>{c.title}</h1>
          <div className="sub">
            {items.length === 0
              ? "Brak punktów."
              : `${openCount} ${pluralizePl(openCount, OTWARTY)} · ${resolvedCount} ${pluralizePl(resolvedCount, POPRAWIONY)}`}
          </div>
        </div>
      </div>

      {c.summary && c.summary.length > 0 && (
        <div
          className="card"
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 20,
            borderLeft: "3px solid var(--line-2)",
          }}
        >
          {c.summary}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <h2
          className="eyebrow"
          style={{ marginBottom: 14, fontSize: 11, letterSpacing: "0.08em" }}
        >
          Do poprawy
        </h2>

        {items.length === 0 ? (
          <div className="empty" style={{ padding: "32px 24px" }}>
            <div className="muted" style={{ fontSize: 13 }}>
              Brak punktów do poprawy z tej konsultacji.
            </div>
          </div>
        ) : (
          <div className="list">
            {items.map((item) => {
              const isResolved = item.status === "resolved";
              return (
                <div
                  key={item.id}
                  className="list-row"
                  style={{
                    gridTemplateColumns: "20px 1fr auto",
                    gap: 12,
                    cursor: "default",
                  }}
                >
                  {isResolved ? (
                    <Icons.Check
                      style={{
                        color: "var(--ok)",
                        flexShrink: 0,
                        width: 16,
                        height: 16,
                      }}
                    />
                  ) : (
                    <Icons.Dot
                      style={{
                        color: "var(--muted-2)",
                        flexShrink: 0,
                        width: 16,
                        height: 16,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      opacity: isResolved ? 0.45 : 1,
                      textDecoration: isResolved ? "line-through" : "none",
                      color: "var(--ink)",
                    }}
                  >
                    {item.body}
                  </span>
                  <span
                    className="mono text-xs"
                    style={{
                      color: isResolved ? "var(--ok)" : "var(--muted)",
                      flexShrink: 0,
                    }}
                  >
                    {isResolved ? "poprawione" : "otwarte"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
