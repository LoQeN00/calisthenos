import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icons } from "~/components/icons";

export interface ConsultationFormItem {
  body: string;
  status: "open" | "resolved";
}

export interface ConsultationFormDefaultValue {
  scheduledAt: string;
  durationMin?: number;
  meetingUrl?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  title: string;
  summary: string;
  items: ConsultationFormItem[];
}

interface ConsultationFormProps {
  defaultValue?: ConsultationFormDefaultValue;
  /** Domyślny moment spotkania (datetime-local "YYYY-MM-DDTHH:MM"). */
  defaultScheduledAt?: string;
}

/**
 * Formularz konsultacji (pola + dynamiczna lista punktów „do poprawy").
 * Nie renderuje własnego <Form> — rodzic owija go w <Form method="post">
 * i dodaje własny przycisk submit + hidden intent.
 */
export function ConsultationForm({ defaultValue, defaultScheduledAt }: ConsultationFormProps) {
  const { t } = useTranslation("trenerKonsultacje");
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

  const scheduledAtDefault = defaultValue?.scheduledAt ?? defaultScheduledAt ?? "";
  const periodFromDefault = defaultValue?.periodFrom ?? "";
  const periodToDefault = defaultValue?.periodTo ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Termin spotkania + czas trwania */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          maxWidth: 460,
        }}
      >
        <div className="field">
          <label htmlFor="cf-scheduledAt">{t("form.scheduledAt")}</label>
          <input
            id="cf-scheduledAt"
            className="input"
            type="datetime-local"
            name="scheduledAt"
            required
            defaultValue={scheduledAtDefault}
          />
        </div>
        <div className="field">
          <label htmlFor="cf-durationMin">{t("form.durationMin")}</label>
          <input
            id="cf-durationMin"
            className="input"
            type="number"
            name="durationMin"
            min={1}
            max={600}
            defaultValue={defaultValue?.durationMin ?? 45}
          />
        </div>
      </div>

      {/* Link spotkania */}
      <div className="field">
        <label htmlFor="cf-meetingUrl">{t("form.meetingUrl")}</label>
        <input
          id="cf-meetingUrl"
          className="input"
          type="url"
          name="meetingUrl"
          maxLength={500}
          defaultValue={defaultValue?.meetingUrl ?? ""}
          placeholder={t("form.meetingUrlPlaceholder")}
        />
      </div>

      {/* Okres — od / do */}
      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>
          {t("form.periodLabel")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            maxWidth: 460,
          }}
        >
          <div className="field">
            <label htmlFor="cf-periodFrom">{t("form.periodFrom")}</label>
            <input
              id="cf-periodFrom"
              className="input"
              type="date"
              name="periodFrom"
              defaultValue={periodFromDefault}
            />
          </div>
          <div className="field">
            <label htmlFor="cf-periodTo">{t("form.periodTo")}</label>
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
        <label htmlFor="cf-title">{t("form.title")}</label>
        <input
          id="cf-title"
          className="input"
          type="text"
          name="title"
          required
          maxLength={160}
          defaultValue={defaultValue?.title ?? ""}
          placeholder={t("form.titlePlaceholder")}
        />
      </div>

      {/* Podsumowanie */}
      <div className="field">
        <label htmlFor="cf-summary">{t("form.summary")}</label>
        <textarea
          id="cf-summary"
          className="textarea"
          name="summary"
          maxLength={10000}
          defaultValue={defaultValue?.summary ?? ""}
          placeholder={t("form.summaryPlaceholder")}
          rows={5}
        />
      </div>

      {/* Punkty do poprawy */}
      <div>
        <div className="field-label" style={{ marginBottom: 10 }}>
          {t("form.toImprove")}
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
                  placeholder={t("form.itemPlaceholder")}
                  maxLength={2000}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  style={{ color: "var(--muted)", flexShrink: 0 }}
                  onClick={() => removeItem(idx)}
                  aria-label={t("form.removeItem", { n: idx + 1 })}
                >
                  <Icons.X />
                </button>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn btn-ghost" onClick={addItem} style={{ fontSize: 13 }}>
          <Icons.Plus /> {t("form.addItem")}
        </button>
      </div>
    </div>
  );
}
