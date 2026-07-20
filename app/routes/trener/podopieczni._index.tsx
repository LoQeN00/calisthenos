import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { CopyButton } from "~/components/copy-button";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Modal } from "~/components/modal";
import { Pagination, parsePage } from "~/components/pagination";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { createInvite, requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { getEnv, stripeApiConfigured } from "~/lib/env";
import { parsePlnToGrosze, MonthlyAmountSchema } from "~/lib/money";
import { daysAgo, fmtDate } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";
import { countClientsForTrainer, listClientsForTrainer, type ClientSort } from "~/lib/workouts";

// Walidacja zwraca KLUCZE komunikatów (namespace trenerPodopieczni) — komponent
// tłumaczy je przez tDyn. Daty/locale liczone w komponencie.
const InviteSchema = z.object({
  displayName: z.string().trim().min(1, "lista.validation.nameRequired").max(80),
  email: z
    .string()
    .trim()
    .min(1, "lista.validation.emailRequired")
    .max(254)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "lista.validation.emailInvalid",
    }),
});

const PAGE_SIZE = 30;

/** Spec używany server-side do parseListControls — etykiety dokładamy w komponencie. */
const SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "name_asc", label: "" },
    { key: "name_desc", label: "" },
    { key: "last_session", label: "" },
    { key: "most_sessions", label: "" },
    { key: "newest", label: "" },
  ],
  defaultSort: "name_asc",
  filterGroups: [
    {
      param: "plan",
      label: "",
      options: [
        { value: "all", label: "" },
        { value: "with", label: "" },
        { value: "without", label: "" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const deletedName = url.searchParams.get("usuniety");

  const controls = parseListControls(url.searchParams, SPEC_BASE);
  const plan = (controls.filters.plan ?? "all") as "all" | "with" | "without";

  const total = await countClientsForTrainer(db, user.id, { q: controls.q, plan });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const clients = await listClientsForTrainer(db, user.id, {
    limit: PAGE_SIZE,
    offset,
    sort: controls.sort as ClientSort,
    q: controls.q,
    plan,
  });
  return {
    clients,
    controls,
    page: safePage,
    totalPages,
    total,
    deletedName,
    stripeAvailable: stripeApiConfigured(),
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();

  const parsed = InviteSchema.safeParse({
    displayName: fd.get("displayName"),
    email: fd.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "lista.form.fallbackError" };
  }

  const amountRaw = String(fd.get("monthlyAmount") ?? "").trim();
  let monthlyAmountGrosze: number | null = null;
  if (amountRaw !== "") {
    const g = parsePlnToGrosze(amountRaw);
    const parsedAmt = g === null ? null : MonthlyAmountSchema.safeParse(g);
    if (!parsedAmt || !parsedAmt.success) {
      return { error: "lista.validation.amountInvalid" };
    }
    monthlyAmountGrosze = parsedAmt.data;
  }

  const { token } = await createInvite(db, {
    trainerId: user.id,
    displayName: parsed.data.displayName,
    email: parsed.data.email,
    monthlyAmountGrosze,
  });

  const inviteUrl = `${getEnv().BASE_URL}/zaproszenie/${token}`;
  return {
    invite: {
      url: inviteUrl,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
    },
  };
}

export default function TrenerPodopieczniList() {
  const { clients, controls, page, totalPages, total, deletedName, stripeAvailable } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerPodopieczni");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const [showInviteModal, setShowInviteModal] = useState(false);

  const spec: ListControlsSpec = {
    ...SPEC_BASE,
    sortOptions: [
      { key: "name_asc", label: t("lista.sort.name_asc") },
      { key: "name_desc", label: t("lista.sort.name_desc") },
      { key: "last_session", label: t("lista.sort.last_session") },
      { key: "most_sessions", label: t("lista.sort.most_sessions") },
      { key: "newest", label: t("lista.sort.newest") },
    ],
    filterGroups: [
      {
        param: "plan",
        label: t("lista.filter.plan"),
        options: [
          { value: "all", label: t("lista.filter.planAll") },
          { value: "with", label: t("lista.filter.planWith") },
          { value: "without", label: t("lista.filter.planWithout") },
        ],
        defaultValue: "all",
      },
    ],
  };

  const hasInvite = actionData != null && "invite" in actionData && actionData.invite != null;

  // Auto-close the modal once an invite is successfully created — the result
  // card takes over below.
  useEffect(() => {
    if (hasInvite) setShowInviteModal(false);
  }, [hasInvite]);

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("lista.eyebrow")}
          </div>
          <h1>{t("lista.title")}</h1>
          <div className="sub">
            {total === 0 ? t("lista.empty") : t("lista.total", { count: total })}
          </div>
        </div>
        <button type="button" onClick={() => setShowInviteModal(true)} className="btn btn-primary">
          <Icons.Plus /> {t("lista.invite")}
        </button>
      </div>

      {deletedName != null && deletedName.length > 0 && (
        <output
          style={{
            display: "block",
            color: "var(--ok)",
            fontSize: 13,
            marginBottom: 14,
            padding: "8px 12px",
            border: "1px solid var(--ok)",
            borderRadius: 8,
            background: "var(--accent-soft)",
          }}
        >
          {t("lista.deleted", { name: deletedName })}
        </output>
      )}

      {hasInvite && actionData != null && "invite" in actionData && actionData.invite != null && (
        <InviteCreatedCard invite={actionData.invite} />
      )}

      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title={t("lista.form.title")}
      >
        <Form method="post">
          <div className="modal-body">
            <div className="field">
              <label htmlFor="inv-name">{t("lista.form.name")}</label>
              <input
                id="inv-name"
                name="displayName"
                type="text"
                required
                maxLength={80}
                placeholder={t("lista.form.namePlaceholder")}
                className="input"
                ref={(el) => {
                  // Focus the first field when the modal mounts.
                  el?.focus();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-email">{t("lista.form.email")}</label>
              <input
                id="inv-email"
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder={t("lista.form.emailPlaceholder")}
                className="input"
              />
            </div>
            {stripeAvailable && (
              <div className="field">
                <label htmlFor="inv-amount">{t("lista.form.amount")}</label>
                <input
                  id="inv-amount"
                  name="monthlyAmount"
                  type="text"
                  inputMode="decimal"
                  placeholder={t("lista.form.amountPlaceholder")}
                  className="input"
                />
                <p className="text-xs muted" style={{ margin: "4px 0 0" }}>
                  {t("lista.form.amountHint")}
                </p>
              </div>
            )}
            {actionData != null && "error" in actionData && actionData.error != null && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
                {tDyn(t, actionData.error)}
              </p>
            )}
          </div>
          <div className="modal-foot">
            <button
              type="button"
              onClick={() => setShowInviteModal(false)}
              className="btn btn-ghost"
            >
              {t("lista.form.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.Link /> {t("lista.form.generate")}
            </button>
          </div>
        </Form>
      </Modal>

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder={t("lista.searchPlaceholder")}
      />

      {total === 0 ? null : (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1.2fr 0.4fr", gap: 14 }}
          >
            <div>{t("lista.table.trainee")}</div>
            <div>{t("lista.table.activePlan")}</div>
            <div>{t("lista.table.lastSession")}</div>
            <div />
          </div>
          {clients.map((c) => (
            <Link
              key={c.id}
              to={`/trener/podopieczni/${c.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "2fr 1.4fr 1.2fr 0.4fr", gap: 14 }}
            >
              <div className="row" style={{ gap: 10 }}>
                <span className="avatar sm">{initialsOf(c.displayName)}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.displayName}</div>
                  {c.joinedOn && (
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {t("lista.table.since", { date: fmtDate(c.joinedOn, locale) })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                {c.activePlanName != null ? (
                  <span className="badge active">
                    <span className="badge-dot" />
                    {c.activePlanName}
                  </span>
                ) : (
                  <span className="text-xs muted">{t("lista.table.noPlan")}</span>
                )}
              </div>
              <div className="text-sm">
                {c.lastSession ? (
                  <span className="muted">{t("lista.table.lastAgo", { ago: daysAgo(c.lastSession, locale) })}</span>
                ) : (
                  <span className="muted">{t("lista.table.noSessions")}</span>
                )}
                {c.totalSessions > 0 && (
                  <span className="muted" style={{ marginLeft: 6 }}>
                    · <span className="mono">{c.totalSessions}</span>
                  </span>
                )}
              </div>
              <div style={{ textAlign: "right", color: "var(--muted-2)" }}>
                <Icons.Chev />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={t("lista.totalWord", { count: total })}
      />
    </div>
  );
}

function InviteCreatedCard({
  invite,
}: {
  invite: { url: string; displayName: string; email: string | null };
}) {
  const { t } = useTranslation("trenerPodopieczni");
  return (
    <div
      className="card"
      style={{
        background: "var(--ink)",
        color: "var(--bg)",
        border: 0,
        marginBottom: 20,
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 10,
          color: "var(--accent)",
          textTransform: "uppercase",
          letterSpacing: ".1em",
          marginBottom: 6,
        }}
      >
        {t("lista.inviteCard.generated")}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        {invite.displayName}
        {invite.email != null && (
          <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
            ({invite.email})
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
        {t("lista.inviteCard.instructions")}
      </div>
      <div className="row" style={{ gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
        <div
          className="mono"
          style={{
            background: "rgba(255,255,255,.08)",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12.5,
            wordBreak: "break-all",
            userSelect: "all",
            flex: 1,
            minWidth: 0,
          }}
        >
          {invite.url}
        </div>
        <CopyButton value={invite.url} variant="primary" label={t("lista.inviteCard.copy")} />
      </div>
      <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>
        {t("lista.inviteCard.tokenNote")}
      </div>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
