import { eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { CopyButton } from "~/components/copy-button";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Modal } from "~/components/modal";
import { Pagination, parsePage } from "~/components/pagination";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { AmbassadorError, inviteAmbassador, listAmbassadors } from "~/lib/ambassadors";
import { AmbassadorInviteSchema } from "~/lib/ambassador-types";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getEnv } from "~/lib/env";
import { fmtDate } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";

const PAGE_SIZE = 30;

const SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "name_asc", label: "" },
    { key: "name_desc", label: "" },
  ],
  defaultSort: "name_asc",
  filterGroups: [
    {
      param: "status",
      label: "",
      options: [
        { value: "all", label: "" },
        { value: "active", label: "" },
        { value: "suspended", label: "" },
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });

  const [ambassadors, regions] = await Promise.all([
    listAmbassadors(db, orgId),
    db
      .select({ id: schema.regions.id, name: schema.regions.name })
      .from(schema.regions)
      .where(eq(schema.regions.organizationId, orgId))
      .orderBy(schema.regions.name),
  ]);
  return { ambassadors, regions };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });

  const fd = await args.request.formData();
  const parsed = AmbassadorInviteSchema.safeParse({
    displayName: fd.get("displayName"),
    email: fd.get("email"),
    regionId: fd.get("regionId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ambasadorzy.form.fallbackError" };
  }

  try {
    const token = await inviteAmbassador(db, {
      organizationId: orgId,
      invitedByUserId: user.id,
      regionId: parsed.data.regionId,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
    });
    return {
      invite: {
        url: `${getEnv().BASE_URL}/zaproszenie/${token}`,
        displayName: parsed.data.displayName,
        email: parsed.data.email,
      },
    };
  } catch (e) {
    if (e instanceof AmbassadorError) {
      return { error: "ambasadorzy.validation.regionInvalid" as const };
    }
    throw e;
  }
}

export default function MarkaAmbasadorzyList() {
  const { ambassadors, regions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("marka");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const [searchParams] = useSearchParams();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const spec: ListControlsSpec = {
    ...SPEC_BASE,
    sortOptions: [
      { key: "name_asc", label: t("ambasadorzy.sort.name_asc") },
      { key: "name_desc", label: t("ambasadorzy.sort.name_desc") },
    ],
    filterGroups: [
      {
        param: "status",
        label: t("ambasadorzy.filterStatus.label"),
        options: [
          { value: "all", label: t("ambasadorzy.filterStatus.all") },
          { value: "active", label: t("ambasadorzy.filterStatus.active") },
          { value: "suspended", label: t("ambasadorzy.filterStatus.suspended") },
        ],
        defaultValue: "all",
      },
    ],
  };

  const controls = parseListControls(searchParams, SPEC_BASE);

  // In-memory filter + sort (ambassador list expected to be small)
  let filtered = ambassadors.slice();

  // Filter by status
  const statusFilter = controls.filters.status ?? "all";
  if (statusFilter === "active") {
    filtered = filtered.filter((a) => a.active);
  } else if (statusFilter === "suspended") {
    filtered = filtered.filter((a) => !a.active);
  }

  // Filter by search query
  if (controls.q) {
    const q = controls.q.toLowerCase();
    filtered = filtered.filter(
      (a) =>
        a.displayName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.regionName ?? "").toLowerCase().includes(q),
    );
  }

  // Sort
  if (controls.sort === "name_desc") {
    filtered = [...filtered].sort((a, b) => b.displayName.localeCompare(a.displayName));
  } else {
    filtered = [...filtered].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Pagination (in-memory)
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(parsePage(searchParams), totalPages);
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(offset, offset + PAGE_SIZE);

  const hasInvite = actionData != null && "invite" in actionData && actionData.invite != null;

  useEffect(() => {
    if (hasInvite) setShowInviteModal(false);
  }, [hasInvite]);

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("ambasadorzy.eyebrow")}
          </div>
          <h1>{t("ambasadorzy.title")}</h1>
          <div className="sub">
            {ambassadors.length === 0
              ? t("ambasadorzy.empty")
              : t("ambasadorzy.total", { count: ambassadors.length })}
          </div>
        </div>
        <button type="button" onClick={() => setShowInviteModal(true)} className="btn btn-primary">
          <Icons.Plus /> {t("ambasadorzy.invite")}
        </button>
      </div>

      {hasInvite && actionData != null && "invite" in actionData && actionData.invite != null && (
        <InviteCreatedCard invite={actionData.invite} />
      )}

      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title={t("ambasadorzy.form.title")}
      >
        <Form method="post">
          <div className="modal-body">
            <div className="field">
              <label htmlFor="inv-name">{t("ambasadorzy.form.name")}</label>
              <input
                id="inv-name"
                name="displayName"
                type="text"
                required
                maxLength={80}
                placeholder={t("ambasadorzy.form.namePlaceholder")}
                className="input"
                ref={(el) => {
                  el?.focus();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="inv-email">{t("ambasadorzy.form.email")}</label>
              <input
                id="inv-email"
                name="email"
                type="email"
                required
                maxLength={254}
                placeholder={t("ambasadorzy.form.emailPlaceholder")}
                className="input"
              />
            </div>
            <div className="field">
              <label htmlFor="inv-region">{t("ambasadorzy.form.region")}</label>
              <select id="inv-region" name="regionId" required className="input">
                <option value="">{t("ambasadorzy.form.regionPlaceholder")}</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
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
              {t("ambasadorzy.form.cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.Link /> {t("ambasadorzy.form.generate")}
            </button>
          </div>
        </Form>
      </Modal>

      <ListControls
        spec={spec}
        state={controls}
        searchPlaceholder={t("ambasadorzy.searchPlaceholder")}
      />

      {total > 0 && (
        <div className="list">
          <div
            className="list-head"
            style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 0.8fr 1fr 0.4fr", gap: 14 }}
          >
            <div>{t("ambasadorzy.table.ambassador")}</div>
            <div>{t("ambasadorzy.table.region")}</div>
            <div>{t("ambasadorzy.table.trainees")}</div>
            <div>{t("ambasadorzy.table.status")}</div>
            <div />
          </div>
          {pageRows.map((a) => (
            <Link
              key={a.id}
              to={`/marka/ambasadorzy/${a.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "2fr 1.4fr 0.8fr 1fr 0.4fr", gap: 14 }}
            >
              <div className="row" style={{ gap: 10 }}>
                <span className="avatar sm">{initialsOf(a.displayName)}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{a.displayName}</div>
                  {a.joinedOn && (
                    <div className="text-xs muted" style={{ marginTop: 2 }}>
                      {t("ambasadorzy.table.since", { date: fmtDate(a.joinedOn, locale) })}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm muted">{a.regionName ?? t("ambasadorzy.table.noRegion")}</div>
              <div className="text-sm mono">{a.traineeCount}</div>
              <div>
                {a.active ? (
                  <span className="badge active">
                    <span className="badge-dot" />
                    {t("ambasadorzy.table.active")}
                  </span>
                ) : (
                  <span className="badge">
                    <span className="badge-dot" style={{ background: "var(--muted-2)" }} />
                    {t("ambasadorzy.table.suspended")}
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
        totalLabel={t("ambasadorzy.totalWord")}
      />
    </div>
  );
}

function InviteCreatedCard({
  invite,
}: {
  invite: { url: string; displayName: string; email: string };
}) {
  const { t } = useTranslation("marka");
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
        {t("ambasadorzy.inviteCard.generated")}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        {invite.displayName}
        <span style={{ opacity: 0.6, fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
          ({invite.email})
        </span>
      </div>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
        {t("ambasadorzy.inviteCard.instructions")}
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
        <CopyButton value={invite.url} variant="primary" label={t("ambasadorzy.inviteCard.copy")} />
      </div>
      <div className="mono" style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>
        {t("ambasadorzy.inviteCard.tokenNote")}
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
