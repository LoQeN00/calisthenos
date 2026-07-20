import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import { ConsultationRow } from "~/components/consultation-row";
import { type DaySummary, MonthCalendar } from "~/components/month-calendar";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { consultationPresentation, mostUrgentTone } from "~/lib/consultation-status";
import { type TrainerCalendarItem, listTrainerOccurrencesInRange } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtTime, monthRangeUTC, shiftMonth, todayISO } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const m = url.searchParams.get("m") ?? todayISO().slice(0, 7);
  const range = monthRangeUTC(m);
  const occurrences = await listTrainerOccurrencesInRange(db, {
    trainerId: user.id,
    fromISO: range.fromISO,
    toISO: range.toISO,
  });
  return { occurrences, m, year: range.year, month0: range.month0, today: todayISO() };
}

export default function TrenerKonsultacjeKalendarz() {
  const { occurrences, m, year, month0, today } = useLoaderData<typeof loader>();
  const { t } = useTranslation("trenerKonsultacje");
  const now = Date.now();

  // Grupuj po dniu miesiąca (UTC).
  const byDay = new Map<number, TrainerCalendarItem[]>();
  for (const o of occurrences) {
    const day = new Date(o.scheduledAt).getUTCDate();
    const arr = byDay.get(day) ?? [];
    arr.push(o);
    byDay.set(day, arr);
  }

  // Podsumowanie per dzień dla kalendarza (kolor = najważniejszy ton).
  const days = new Map<number, DaySummary>();
  for (const [day, occs] of byDay) {
    const tones = occs.map(
      (o) =>
        consultationPresentation({
          status: o.status,
          scheduledAtISO: o.scheduledAt,
          nowMs: now,
          viewer: "trainer",
        }).tone,
    );
    const tone = mostUrgentTone(tones);
    if (tone) days.set(day, { tone, count: occs.length });
  }

  const todayDay = today.slice(0, 7) === m ? new Date(`${today}T00:00:00.000Z`).getUTCDate() : null;
  const firstDayWithOcc = [...byDay.keys()].sort((a, b) => a - b)[0] ?? null;
  const [selected, setSelected] = useState<number | null>(firstDayWithOcc);
  const selectedOccs = selected != null ? (byDay.get(selected) ?? []) : [];

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("kalendarz.eyebrow")}
          </div>
          <h1>{t("kalendarz.title")}</h1>
          <div className="sub">{t("kalendarz.sub")}</div>
        </div>
      </div>

      <div style={{ maxWidth: 760 }}>
        <MonthCalendar
          year={year}
          month0={month0}
          todayDay={todayDay}
          days={days}
          selected={selected}
          onSelect={setSelected}
          prevHref={`?m=${shiftMonth(m, -1)}`}
          nextHref={`?m=${shiftMonth(m, 1)}`}
        />

        <div style={{ marginTop: 18 }}>
          {selectedOccs.length > 0 ? (
            <div className="list">
              {selectedOccs.map((o) => {
                const meta = consultationPresentation({
                  status: o.status,
                  scheduledAtISO: o.scheduledAt,
                  nowMs: now,
                  viewer: "trainer",
                });
                return (
                  <ConsultationRow
                    key={o.id}
                    to={`/trener/podopieczni/${o.traineeId}/konsultacje/${o.id}`}
                    lead={fmtTime(o.scheduledAt)}
                    title={o.traineeName}
                    sub={`${o.title} · ${t("kalendarz.minUnit", { count: o.durationMin })}`}
                    label={tDyn(t, meta.labelKey)}
                    tone={meta.tone}
                  />
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <h3>
                {occurrences.length === 0
                  ? t("kalendarz.emptyMonthTitle")
                  : t("kalendarz.selectDayTitle")}
              </h3>
              <div>
                {occurrences.length === 0
                  ? t("kalendarz.emptyMonthBody")
                  : t("kalendarz.selectDayBody")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
