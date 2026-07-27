import { useState } from "react";
import { Link } from "react-router";
import { MAX_ONBOARDING_EXERCISES, MAX_ONBOARDING_NOTE } from "~/lib/onboarding-form-types";

export interface PickableExercise {
  id: string;
  name: string;
  unit: "REPS" | "SEC";
}

/**
 * Sekcja modala zaproszenia: opcjonalny formularz startowy. Nie renderuje
 * `<Form>` — owija go trasa-rodzic (wzorem `consultation-form.tsx`).
 */
export function OnboardingPicker({ exercises }: { exercises: PickableExercise[] }) {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const needle = q.trim().toLowerCase();
  const visible =
    needle === "" ? exercises : exercises.filter((e) => e.name.toLowerCase().includes(needle));
  const atLimit = selected.length >= MAX_ONBOARDING_EXERCISES;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (exercises.length === 0) {
    return (
      <div
        className="text-sm muted"
        style={{
          padding: "10px 12px",
          border: "1px dashed var(--line-2)",
          borderRadius: 8,
          background: "var(--surface)",
        }}
      >
        Formularz startowy wymaga ćwiczeń w bibliotece.{" "}
        <Link to="/trener/biblioteka" style={{ color: "var(--ink)" }}>
          Dodaj pierwsze ćwiczenie
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          name="withOnboarding"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          style={{ width: 15, height: 15, margin: 0, accentColor: "var(--accent)" }}
        />
        <span>Dołącz formularz startowy — opcjonalnie</span>
      </label>
      <p className="text-xs muted" style={{ margin: "4px 0 0" }}>
        Podopieczny wypełni go zaraz po założeniu konta, zanim wejdzie do aplikacji.
      </p>

      {on && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj ćwiczenia…"
            className="input"
            aria-label="Szukaj ćwiczenia"
          />
          <div
            className="text-xs muted mono"
            style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
          >
            Wybrano {selected.length}/{MAX_ONBOARDING_EXERCISES}
          </div>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 8,
              display: "grid",
              gap: 4,
            }}
          >
            {visible.length === 0 ? (
              <div className="text-sm muted">Nic nie pasuje do „{q}".</div>
            ) : (
              visible.map((e) => {
                const isOn = selected.includes(e.id);
                return (
                  <label
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      borderRadius: 6,
                      cursor: isOn || !atLimit ? "pointer" : "not-allowed",
                      opacity: isOn || !atLimit ? 1 : 0.45,
                      background: isOn ? "var(--accent-soft)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="onboardingExercise"
                      value={e.id}
                      checked={isOn}
                      disabled={!isOn && atLimit}
                      onChange={() => toggle(e.id)}
                      style={{ width: 14, height: 14, margin: 0, accentColor: "var(--accent)" }}
                    />
                    <span style={{ flex: 1, fontSize: 13 }}>{e.name}</span>
                    <span
                      className="mono text-xs muted"
                      style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
                    >
                      {e.unit === "SEC" ? "sek." : "powt."}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {/* Zaznaczenia odfiltrowane aktualną szukajką nie mają checkboxa w DOM,
              więc przeglądarka by ich nie wysłała — trener widziałby „Wybrano 2/12",
              a zapisałoby się jedno ćwiczenie. Dosyłamy je ukrytymi polami. */}
          {selected
            .filter((id) => !visible.some((e) => e.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="onboardingExercise" value={id} />
            ))}
          <label className="field" style={{ margin: 0 }}>
            <span className="text-sm">Notatka dla podopiecznego — opcjonalnie</span>
            <textarea
              name="onboardingNote"
              className="input"
              rows={2}
              maxLength={MAX_ONBOARDING_NOTE}
              placeholder="np. Wykonaj na świeżo, bez rozgrzewki do upadku."
            />
          </label>
        </div>
      )}
    </div>
  );
}
