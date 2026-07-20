import { useTranslation } from "react-i18next";
import {
  Form,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { SkillError, createSkill } from "~/lib/skills";
import { SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  await requireUser(args.request, db, { role: "trainer" });
  return null;
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = SkillFormSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    description: String(fd.get("description") ?? ""),
  });
  if (!parsed.success) {
    // Komunikat walidacji Zod pochodzi z warstwy lib (SkillFormSchema, PL) —
    // renderowany dosłownie. Fallback to klucz tłumaczenia.
    return { error: parsed.error.issues[0]?.message ?? "umiejetnosci.nowa.errorInvalid" };
  }
  try {
    const skill = await createSkill(db, user.id, parsed.data.name, parsed.data.description);
    throw redirect(`/trener/umiejetnosci/${skill.id}`);
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function NowaUmiejetnosc() {
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("trenerPlany");
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("umiejetnosci.eyebrow")}
          </div>
          <h1>{t("umiejetnosci.nowa.title")}</h1>
        </div>
      </div>
      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosci.nowa.labelName")}</span>
          <input
            name="name"
            className="input"
            maxLength={120}
            required
            placeholder={t("umiejetnosci.nowa.namePlaceholder")}
          />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosci.nowa.labelDescription")}</span>
          <textarea name="description" className="input" maxLength={2000} rows={3} />
        </label>
        {actionData != null && "error" in actionData && actionData.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
            {actionData.error.startsWith("umiejetnosci.") ? tDyn(t, actionData.error) : actionData.error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          {t("umiejetnosci.nowa.create")}
        </button>
      </Form>
    </div>
  );
}
