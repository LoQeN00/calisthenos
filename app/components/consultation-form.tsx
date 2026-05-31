import { useState } from "react";
import { Icons } from "~/components/icons";

export interface ConsultationFormItem {
  body: string;
  status: "open" | "resolved";
}

export interface ConsultationFormDefaultValue {
  heldOn: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  title: string;
  summary: string;
  items: ConsultationFormItem[];
}

interface ConsultationFormProps {
  defaultValue?: ConsultationFormDefaultValue;
  defaultHeldOn?: string;
}

/**
 * Formularz konsultacji (pola + dynamiczna lista punktów „do poprawy").
 * Nie renderuje własnego <Form> — rodzic owija go w <Form method="post">
 * i dodaje własny przycisk submit + hidden intent.
 */
export function ConsultationForm({ defaultValue, defaultHeldOn }: ConsultationFormProps) {
  const [items, setItems] = useState<ConsultationFormItem[]>(defaultValue?.items ?? []);

  function addItem() {
    setItems((prev) => [...prev, { body: "", status: "open" }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItemBody(idx: number, body: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, body } : it)));
  }

  const heldOnDefault = defaultValue?.heldOn ?? defaultHeldOn ?? "";
  const periodFromDefault = defaultValue?.periodFrom ?? "";
  const periodToDefault = defaultValue?.periodTo ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Data spotkania */}
      <div className="field">
        <label htmlFor="cf-heldOn">Data spotkania</label>
        <input
          id="cf-heldOn"
          className="input"
          type="date"
          name="heldOn"
          required
          defaultValue={heldOnDefault}
          style={{ maxWidth: 220 }}
        />
      </div>

      {/* Okres — od / do */}
      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>
          Okres (opcjonalnie)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            maxWidth: 460,
          }}
        >
          <div className="field">
            <label htmlFor="cf-periodFrom">Okres od</label>
            <input
              id="cf-periodFrom"
              className="input"
              type="date"
              name="periodFrom"
              defaultValue={periodFromDefault}
            />
          </div>
          <div className="field">
            <label htmlFor="cf-periodTo">Okres do</label>
            <input
              id="cf-periodTo"
              className="input"
              type="date"
              name="periodTo"
              defaultValue={periodToDefault}
            />
          </div>
        </div>
      </div>

      {/* Tytuł */}
      <div className="field">
        <label htmlFor="cf-title">Tytuł</label>
        <input
          id="cf-title"
          className="input"
          type="text"
          name="title"
          required
          maxLength={160}
          defaultValue={defaultValue?.title ?? ""}
          placeholder="np. Konsultacja miesięczna — maj 2026"
        />
      </div>

      {/* Podsumowanie */}
      <div className="field">
        <label htmlFor="cf-summary">Podsumowanie</label>
        <textarea
          id="cf-summary"
          className="textarea"
          name="summary"
          maxLength={10000}
          defaultValue={defaultValue?.summary ?? ""}
          placeholder="Notatki z konsultacji, obserwacje, plan na kolejny okres..."
          rows={5}
        />
      </div>

      {/* Punkty do poprawy */}
      <div>
        <div className="field-label" style={{ marginBottom: 10 }}>
          Do poprawy
        </div>

        {items.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 10,
            }}
          >
            {items.map((item, idx) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: controlled list, no stable IDs
                key={idx}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                {/* Hidden status field — carries the item's current status */}
                <input type="hidden" name="itemStatus" value={item.status} />
                <div
                  className="mono text-xs muted"
                  style={{
                    paddingTop: 10,
                    width: 20,
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {idx + 1}.
                </div>
                <input
                  className="input"
                  type="text"
                  name="itemBody"
                  value={item.body}
                  onChange={(e) => updateItemBody(idx, e.target.value)}
                  placeholder="Treść punktu do poprawy..."
                  maxLength={2000}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  style={{ color: "var(--muted)", flexShrink: 0 }}
                  onClick={() => removeItem(idx)}
                  aria-label={`Usuń punkt ${idx + 1}`}
                >
                  <Icons.X />
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn btn-ghost" onClick={addItem} style={{ fontSize: 13 }}>
          <Icons.Plus /> Dodaj punkt
        </button>
      </div>
    </div>
  );
}
