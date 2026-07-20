import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export function CategoryPicker({
  categories,
  selected,
}: {
  categories: { id: string; name: string }[];
  selected: string[];
}) {
  const { t } = useTranslation("trener");
  const selectedSet = new Set(selected);
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend
        style={{
          fontSize: 12,
          color: "var(--muted)",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-mono)",
          padding: 0,
          marginBottom: 8,
        }}
      >
        {t("categoryPicker.legend")}
      </legend>
      {categories.length === 0 ? (
        <div
          className="text-sm muted"
          style={{
            padding: "10px 12px",
            border: "1px dashed var(--line-2)",
            borderRadius: 8,
            background: "var(--surface)",
          }}
        >
          {t("categoryPicker.emptyPrefix")}
          <Link to="/trener/biblioteka" style={{ color: "var(--ink)" }}>
            {t("categoryPicker.emptyLink")}
          </Link>
          {t("categoryPicker.emptySuffix")}
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          {categories.map((c) => {
            const isOn = selectedSet.has(c.name);
            return (
              <label
                key={c.id}
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: isOn ? "var(--ink)" : "var(--surface)",
                  color: isOn ? "var(--bg)" : "var(--ink)",
                  borderColor: isOn ? "var(--ink)" : "var(--line)",
                }}
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={c.name}
                  defaultChecked={isOn}
                  style={{ width: 13, height: 13, margin: 0, accentColor: "var(--accent)" }}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
