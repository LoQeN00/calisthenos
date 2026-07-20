import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { BrandCatalogError, createBrandSkill } from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";
import { SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  // Spójnie z akcją: prezes bez organizacji nie ma katalogu marki → 404 (nie 403).
  if (!user.organizationId) throw new Response("not found", { status: 404 });
  return {};
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const fd = await args.request.formData();
  const parsed = SkillFormSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    description: String(fd.get("description") ?? ""),
  });
  if (!parsed.success) {
    const firstPath = parsed.error.issues[0]?.path[0];
    return firstPath === "name"
      ? { errorKey: "umiejetnosciForm.errors.nameRequired" as const }
      : { errorKey: "umiejetnosciForm.errors.formInvalid" as const };
  }
  try {
    const skill = await createBrandSkill(db, orgId, parsed.data.name, parsed.data.description);
    throw redirect(`/marka/umiejetnosci/${skill.id}`);
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof BrandCatalogError)
      return { errorKey: "umiejetnosciForm.errors.generic" as const, errorMessage: e.userMessage };
    throw e;
  }
}

export default function MarkaNowaUmiejetnosc() {
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("marka");
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="crumbs">
        <Link to="/marka/umiejetnosci">{t("umiejetnosciForm.crumbs")}</Link>
        <span className="sep">›</span>
        <span className="current">{t("umiejetnosciForm.crumbNew")}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("umiejetnosci.eyebrow")}
          </div>
          <h1>{t("umiejetnosciForm.newTitle")}</h1>
        </div>
      </div>
      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosciForm.fieldName")}</span>
          <input
            name="name"
            className="input"
            maxLength={120}
            required
            placeholder={t("umiejetnosciForm.namePlaceholder")}
          />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosciForm.fieldDescription")}</span>
          <textarea name="description" className="input" maxLength={2000} rows={3} />
        </label>
        {actionData != null && "errorKey" in actionData && actionData.errorKey != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
            {"errorMessage" in actionData && actionData.errorMessage
              ? actionData.errorMessage
              : tDyn(t, actionData.errorKey)}
          </p>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            {t("umiejetnosciForm.save")}
          </button>
          <Link to="/marka/umiejetnosci" className="btn">
            {t("umiejetnosciForm.cancel")}
          </Link>
        </div>
      </Form>
    </div>
  );
}
