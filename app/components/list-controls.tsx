import { useEffect, useRef } from "react";
import { Form, Link, useSearchParams, useSubmit } from "react-router";
import { type ListControlsSpec, type ListControlsState, buildControlHref } from "~/lib/list-params";
import { Icons } from "./icons";

interface ListControlsProps {
  spec: ListControlsSpec;
  state: ListControlsState;
  /** Placeholder szukajki (gdy spec.searchable). */
  searchPlaceholder?: string;
}

/**
 * Współdzielony pasek kontrolek listy: szukajka (opcjonalnie) + dropdown sortu
 * + chipy filtrów. Sterowany URL search params (server-side). Każda zmiana
 * resetuje `page` (formularz GET nie zawiera page; chipy budują href przez
 * buildControlHref). Działa bez JS (natywny submit + <noscript>).
 */
export function ListControls({ spec, state, searchPlaceholder }: ListControlsProps) {
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSubmit = (form: HTMLFormElement) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      submit(form, { method: "get", replace: true });
    }, 300);
  };

  const submitNow = (form: HTMLFormElement | null) => {
    if (!form) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    submit(form, { method: "get", replace: true });
  };
  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    },
    [],
  );

  // Aktywne (nie-domyślne) filtry niesiemy jako ukryte pola, by przetrwały
  // submit szukajki/sortu. `page` celowo pomijamy => reset do strony 1.
  const hiddenFilters = spec.filterGroups
    .filter((g) => state.filters[g.param] !== g.defaultValue)
    .map((g) => (
      <input key={g.param} type="hidden" name={g.param} value={state.filters[g.param]} />
    ));

  return (
    <div className="col" style={{ gap: 10, marginBottom: 16 }}>
      <Form
        method="get"
        className="row wrap"
        style={{ gap: 8, alignItems: "center" }}
        onChange={(e) => {
          const t = e.target as HTMLElement;
          if (t instanceof HTMLInputElement && t.name === "q") scheduleAutoSubmit(e.currentTarget);
        }}
      >
        {spec.searchable && (
          <div className="input-search" style={{ flex: 1, minWidth: 220 }}>
            <Icons.Search />
            <input
              name="q"
              defaultValue={state.q}
              placeholder={searchPlaceholder ?? "Szukaj…"}
              className="input"
              type="search"
              autoComplete="off"
            />
          </div>
        )}

        {hiddenFilters}

        <label className="row" style={{ gap: 6, alignItems: "center" }}>
          <span className="text-xs muted">Sortuj</span>
          <select
            name="sort"
            defaultValue={state.sort}
            className="input"
            style={{ width: "auto" }}
            onChange={(e) => submitNow(e.currentTarget.form)}
          >
            {spec.sortOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <noscript>
          <button type="submit" className="btn btn-sm">
            Zastosuj
          </button>
        </noscript>
      </Form>

      {spec.filterGroups.map((g) => (
        <div
          key={g.param}
          className="row wrap"
          style={{ gap: 6, alignItems: "center" }}
          aria-label={g.label}
        >
          <span className="text-xs muted" style={{ marginRight: 2 }}>
            {g.label}
          </span>
          {g.options.map((opt) => {
            const isActive = state.filters[g.param] === opt.value;
            const href = buildControlHref(searchParams, {
              [g.param]: opt.value === g.defaultValue ? null : opt.value,
            });
            return (
              <Link
                key={opt.value}
                to={href}
                className={isActive ? "btn btn-sm btn-dark" : "btn btn-sm"}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}
