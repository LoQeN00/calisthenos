import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { Icons } from "./icons";

interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  totalPages: number;
  /** Total item count — shown next to the controls (e.g. "243 ćwiczeń"). */
  total?: number;
  /** Plural noun for the total (e.g. "ćwiczeń", "planów"). */
  totalLabel?: string;
  /** Number of pages to show on each side of the current page. */
  siblingRange?: number;
}

export function Pagination({
  page,
  totalPages,
  total,
  totalLabel,
  siblingRange = 1,
}: PaginationProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("common");

  if (totalPages <= 1) {
    if (total != null && totalLabel) {
      return (
        <div className="text-xs muted" style={{ textAlign: "center", marginTop: 18 }}>
          {total} {totalLabel}
        </div>
      );
    }
    return null;
  }

  const buildHref = (p: number) => {
    const params = new URLSearchParams(searchParams);
    if (p > 1) params.set("page", String(p));
    else params.delete("page");
    const qs = params.toString();
    return qs.length > 0 ? `?${qs}` : ".";
  };

  // Page slots: always show first, last, current ± siblingRange. Gaps marked.
  const pageSlots: (number | "gap")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    const isEdge = p === 1 || p === totalPages;
    const inWindow = p >= page - siblingRange && p <= page + siblingRange;
    if (isEdge || inWindow) {
      pageSlots.push(p);
    } else if (pageSlots[pageSlots.length - 1] !== "gap") {
      pageSlots.push("gap");
    }
  }

  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  return (
    <nav
      aria-label={t("pagination.label")}
      className="row wrap"
      style={{
        justifyContent: "center",
        gap: 4,
        alignItems: "center",
        marginTop: 22,
      }}
    >
      {prevPage != null ? (
        <Link to={buildHref(prevPage)} className="btn btn-sm" rel="prev">
          <Icons.ChevLeft /> {t("pagination.previous")}
        </Link>
      ) : (
        <span
          className="btn btn-sm"
          aria-disabled="true"
          style={{ opacity: 0.4, cursor: "not-allowed" }}
        >
          <Icons.ChevLeft /> {t("pagination.previous")}
        </span>
      )}

      {pageSlots.map((slot, i) =>
        slot === "gap" ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: gaps are positional separators, not data.
            key={`gap-${i}`}
            className="muted text-xs"
            aria-hidden="true"
            style={{ padding: "0 4px" }}
          >
            …
          </span>
        ) : (
          <Link
            key={slot}
            to={buildHref(slot)}
            className={slot === page ? "btn btn-sm btn-dark" : "btn btn-sm"}
            aria-current={slot === page ? "page" : undefined}
            aria-label={t("pagination.page", { num: slot })}
          >
            {slot}
          </Link>
        ),
      )}

      {nextPage != null ? (
        <Link to={buildHref(nextPage)} className="btn btn-sm" rel="next">
          {t("pagination.next")} <Icons.Chev />
        </Link>
      ) : (
        <span
          className="btn btn-sm"
          aria-disabled="true"
          style={{ opacity: 0.4, cursor: "not-allowed" }}
        >
          {t("pagination.next")} <Icons.Chev />
        </span>
      )}

      {total != null && totalLabel && (
        <span className="text-xs muted" style={{ marginLeft: 12, fontFamily: "var(--font-mono)" }}>
          {total} {totalLabel}
        </span>
      )}
    </nav>
  );
}

/** Helper: parse `?page=N` from URL search params, clamped to ≥1. */
export function parsePage(searchParams: URLSearchParams): number {
  const raw = Number.parseInt(searchParams.get("page") ?? "1", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}
