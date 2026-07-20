import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import {
  AmbassadorError,
  deactivateAmbassador,
  getAmbassadorProfile,
  reactivateAmbassador,
} from "~/lib/ambassadors";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { fmtMoney } from "~/lib/money";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const trainerId = args.params.trainerId ?? "";
  const profile = await getAmbassadorProfile(db, orgId, trainerId);
  if (!profile) throw new Response("not found", { status: 404 });
  return { profile };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const trainerId = args.params.trainerId ?? "";
  const intent = (await args.request.formData()).get("intent");
  try {
    if (intent === "deactivate") await deactivateAmbassador(db, orgId, trainerId);
    else if (intent === "reactivate") await reactivateAmbassador(db, orgId, trainerId);
    else return { error: "ambasadorzy.profil.actionError" as const };
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AmbassadorError) return { error: "ambasadorzy.profil.actionError" as const };
    throw e;
  }
}

export default function MarkaAmbasadorProfile() {
  const { profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("marka");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";

  return (
    <div>
      <div className="crumbs">
        <Link to="/marka/ambasadorzy">{t("ambasadorzy.profil.crumbs")}</Link>
        <span className="sep">›</span>
        <span className="current">{profile.displayName}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow">{t("ambasadorzy.profil.eyebrow")}</div>
          <h1>{profile.displayName}</h1>
          <div
            className="row"
            style={{ gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}
          >
            {profile.active ? (
              <span className="badge active">
                <span className="badge-dot" />
                {t("ambasadorzy.profil.statusActive")}
              </span>
            ) : (
              <span className="badge">
                <span className="badge-dot" style={{ background: "var(--muted-2)" }} />
                {t("ambasadorzy.profil.statusSuspended")}
              </span>
            )}
            <span className="text-sm muted">{profile.email}</span>
            <span className="text-sm muted">
              {profile.regionName ?? t("ambasadorzy.table.noRegion")}
            </span>
            {profile.joinedOn && (
              <span className="text-sm muted">
                {t("ambasadorzy.table.since", { date: fmtDate(profile.joinedOn, locale) })}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        className="card"
        style={{
          display: "flex",
          gap: 28,
          padding: "16px 20px",
          marginBottom: 22,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div className="stat">
          <div className="v">{profile.traineeCount}</div>
          <div className="k">{t("ambasadorzy.profil.trainees")}</div>
        </div>
        <span className="vdiv" style={{ height: 36 }} />
        <div className="stat">
          <div className="v">{profile.logs7d}</div>
          <div className="k">{t("ambasadorzy.profil.logs7d")}</div>
        </div>
        <span className="vdiv" style={{ height: 36 }} />
        <div className="stat">
          <div className="v">{profile.logs30d}</div>
          <div className="k">{t("ambasadorzy.profil.logs30d")}</div>
        </div>
        <span className="vdiv" style={{ height: 36 }} />
        <div className="stat">
          <div className="v">{fmtMoney(profile.mrrGrosze, locale, "pln")}</div>
          <div className="k">{t("ambasadorzy.profil.mrr")}</div>
        </div>
      </div>

      {actionData != null && "error" in actionData && actionData.error != null && (
        <p
          role="alert"
          style={{
            color: "var(--danger)",
            fontSize: 13,
            marginBottom: 14,
            padding: "8px 12px",
            border: "1px solid var(--danger)",
            borderRadius: 8,
          }}
        >
          {tDyn(t, actionData.error)}
        </p>
      )}
      {actionData != null && "ok" in actionData && actionData.ok && (
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
          {t("ambasadorzy.profil.saved")}
        </output>
      )}

      <Form method="post">
        {profile.active ? (
          <ConfirmSubmitButton
            name="intent"
            value="deactivate"
            className="btn btn-danger"
            confirmOptions={{
              title: t("ambasadorzy.profil.deactivateConfirmTitle"),
              message: t("ambasadorzy.profil.deactivateConfirmMessage"),
              destructive: true,
              confirmText: t("ambasadorzy.profil.deactivateConfirmText"),
            }}
          >
            {t("ambasadorzy.profil.deactivate")}
          </ConfirmSubmitButton>
        ) : (
          <button type="submit" name="intent" value="reactivate" className="btn">
            {t("ambasadorzy.profil.reactivate")}
          </button>
        )}
      </Form>
    </div>
  );
}
