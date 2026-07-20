import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import {
  BrandCatalogError,
  addBrandPrerequisite,
  addBrandVariation,
  archiveBrandSkill,
  getBrandSkillWithVariations,
  listAssignableBrandExercises,
  listAssignableBrandPrerequisites,
  listBrandPrerequisitesForSkill,
  removeBrandPrerequisite,
  removeBrandVariation,
  reorderBrandVariations,
  updateBrandSkill,
} from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";
import { SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const skillId = args.params.skillId ?? "";
  const skill = await getBrandSkillWithVariations(db, orgId, skillId);
  if (!skill) throw new Response("not found", { status: 404 });
  const [assignable, prerequisites, assignablePrereqs] = await Promise.all([
    listAssignableBrandExercises(db, orgId),
    listBrandPrerequisitesForSkill(db, orgId, skillId),
    listAssignableBrandPrerequisites(db, orgId, skillId),
  ]);
  return { skill, assignable, prerequisites, assignablePrereqs };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const skillId = args.params.skillId ?? "";
  const fd = await args.request.formData();
  const intent = (fd.get("intent") ?? "").toString();
  try {
    if (intent === "save") {
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
      await updateBrandSkill(db, orgId, skillId, parsed.data.name, parsed.data.description);
      return { ok: true as const };
    }
    if (intent === "add-variation") {
      await addBrandVariation(db, orgId, skillId, (fd.get("exerciseId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "remove-variation") {
      await removeBrandVariation(db, orgId, skillId, (fd.get("variationId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "move") {
      const ids = fd.getAll("variationIds").map((v) => v.toString());
      await reorderBrandVariations(db, orgId, skillId, ids);
      return { ok: true as const };
    }
    if (intent === "add-prereq") {
      await addBrandPrerequisite(db, orgId, skillId, (fd.get("requiresSkillId") ?? "").toString());
      return { ok: true as const };
    }
    if (intent === "remove-prereq") {
      await removeBrandPrerequisite(
        db,
        orgId,
        skillId,
        (fd.get("requiresSkillId") ?? "").toString(),
      );
      return { ok: true as const };
    }
    if (intent === "archive") {
      await archiveBrandSkill(db, orgId, skillId);
      throw redirect("/marka/umiejetnosci");
    }
    return { errorKey: "umiejetnosciForm.errors.generic" as const };
  } catch (e) {
    if (e instanceof BrandCatalogError)
      return { errorKey: "umiejetnosciForm.errors.generic" as const, errorMessage: e.userMessage };
    throw e;
  }
}

export default function MarkaEdytorUmiejetnosci() {
  const { skill, assignable, prerequisites, assignablePrereqs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("marka");
  const ids = skill.variations.map((v) => v.id);

  function reorderedIds(from: number, to: number): string[] {
    const copy = [...ids];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved!);
    return copy;
  }

  const tMsg = (key: string) => (key.startsWith("umiejetnosciForm.") ? tDyn(t, key) : key);

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="crumbs">
        <Link to="/marka/umiejetnosci">{t("umiejetnosciForm.crumbs")}</Link>
        <span className="sep">›</span>
        <span className="current">{skill.name}</span>
      </div>

      {actionData != null && "errorKey" in actionData && actionData.errorKey != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
          {"errorMessage" in actionData && actionData.errorMessage
            ? actionData.errorMessage
            : tMsg(actionData.errorKey)}
        </p>
      )}

      {actionData != null && "ok" in actionData && actionData.ok && (
        <output style={{ display: "block", color: "var(--ok)", fontSize: 13, marginBottom: 12 }}>
          {t("umiejetnosciForm.saved")}
        </output>
      )}

      {/* Edit name / description */}
      <Form
        method="post"
        className="card"
        style={{ padding: 16, display: "grid", gap: 12, marginBottom: 18 }}
      >
        <input type="hidden" name="intent" value="save" />
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosciForm.fieldName")}</span>
          <input name="name" className="input" defaultValue={skill.name} maxLength={120} required />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">{t("umiejetnosciForm.fieldDescription")}</span>
          <textarea
            name="description"
            className="input"
            defaultValue={skill.description ?? ""}
            maxLength={2000}
            rows={3}
          />
        </label>
        <button type="submit" className="btn">
          {t("umiejetnosciForm.save")}
        </button>
      </Form>

      {/* Variations */}
      <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>{t("umiejetnosciForm.variations")}</h2>
      {skill.variations.length === 0 ? (
        <div className="text-sm muted" style={{ marginBottom: 12 }}>
          {t("umiejetnosciForm.variationsEmpty")}
        </div>
      ) : (
        <div className="col" style={{ gap: 8, marginBottom: 16 }}>
          {skill.variations.map((v, i) => (
            <div key={v.id} className="card row between" style={{ padding: "10px 14px", gap: 10 }}>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className="mono text-xs muted">{v.ordinal}</span>
                <span style={{ fontWeight: 500 }}>{v.exerciseName}</span>
                <span className="badge">{v.unit}</span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {i > 0 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="move" />
                    {reorderedIds(i, i - 1).map((id) => (
                      <input key={id} type="hidden" name="variationIds" value={id} />
                    ))}
                    <button
                      type="submit"
                      className="btn btn-sm btn-ghost"
                      aria-label={t("umiejetnosciForm.moveUp")}
                    >
                      ↑
                    </button>
                  </Form>
                )}
                {i < skill.variations.length - 1 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="move" />
                    {reorderedIds(i, i + 1).map((id) => (
                      <input key={id} type="hidden" name="variationIds" value={id} />
                    ))}
                    <button
                      type="submit"
                      className="btn btn-sm btn-ghost"
                      aria-label={t("umiejetnosciForm.moveDown")}
                    >
                      ↓
                    </button>
                  </Form>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-variation" />
                  <input type="hidden" name="variationId" value={v.id} />
                  <ConfirmSubmitButton
                    className="btn btn-sm btn-ghost"
                    style={{ color: "var(--danger)" }}
                    title={t("umiejetnosciForm.removeVariation")}
                    confirmOptions={{
                      title: t("umiejetnosciForm.confirmRemoveVariationTitle", {
                        name: v.exerciseName,
                      }),
                      message: t("umiejetnosciForm.confirmRemoveVariationMessage"),
                      destructive: true,
                      confirmText: t("umiejetnosciForm.confirmRemoveVariationConfirm"),
                    }}
                  >
                    <Icons.X />
                  </ConfirmSubmitButton>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Form method="post" className="row" style={{ gap: 8, marginBottom: 32 }}>
        <input type="hidden" name="intent" value="add-variation" />
        <select name="exerciseId" className="input" style={{ flex: 1 }} required defaultValue="">
          <option value="" disabled>
            {t("umiejetnosciForm.addVariationPlaceholder")}
          </option>
          {assignable.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name} ({ex.unit})
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">
          <Icons.Plus /> {t("umiejetnosciForm.addVariation")}
        </button>
      </Form>

      {/* Prerequisites */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>{t("umiejetnosciForm.prereqs")}</h2>
        <p className="text-sm muted" style={{ marginBottom: 12 }}>
          {t("umiejetnosciForm.prereqIntro")}
        </p>
        {prerequisites.length === 0 ? (
          <div className="text-sm muted" style={{ marginBottom: 12 }}>
            {t("umiejetnosciForm.prereqEmpty")}
          </div>
        ) : (
          <div className="col" style={{ gap: 8, marginBottom: 16 }}>
            {prerequisites.map((p) => (
              <div
                key={p.id}
                className="card row between"
                style={{ padding: "10px 14px", gap: 10 }}
              >
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-prereq" />
                  <input type="hidden" name="requiresSkillId" value={p.id} />
                  <ConfirmSubmitButton
                    className="btn btn-sm btn-ghost"
                    style={{ color: "var(--danger)" }}
                    aria-label={t("umiejetnosciForm.removePrereq", { name: p.name })}
                    confirmOptions={{
                      title: t("umiejetnosciForm.confirmRemovePrereqTitle"),
                      message: t("umiejetnosciForm.confirmRemovePrereqMessage"),
                      destructive: true,
                      confirmText: t("umiejetnosciForm.confirmRemovePrereqConfirm"),
                    }}
                  >
                    <Icons.X />
                  </ConfirmSubmitButton>
                </Form>
              </div>
            ))}
          </div>
        )}
        {assignablePrereqs.length === 0 ? (
          <div className="text-sm muted" style={{ marginBottom: 16 }}>
            {t("umiejetnosciForm.prereqNoneToAdd")}
          </div>
        ) : (
          <Form method="post" className="row" style={{ gap: 8 }}>
            <input type="hidden" name="intent" value="add-prereq" />
            <select
              name="requiresSkillId"
              className="input"
              style={{ flex: 1 }}
              required
              defaultValue=""
            >
              <option value="" disabled>
                {t("umiejetnosciForm.addPrereqPlaceholder")}
              </option>
              {assignablePrereqs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              <Icons.Plus /> {t("umiejetnosciForm.addPrereq")}
            </button>
          </Form>
        )}
      </div>

      {/* Archive */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <Form method="post">
          <input type="hidden" name="intent" value="archive" />
          <ConfirmSubmitButton
            className="btn btn-danger"
            confirmOptions={{
              title: t("umiejetnosciForm.archiveConfirmTitle", { name: skill.name }),
              message: t("umiejetnosciForm.archiveConfirmMessage"),
              destructive: true,
              confirmText: t("umiejetnosciForm.archiveConfirmText"),
            }}
          >
            <Icons.Trash /> {t("umiejetnosciForm.archive")}
          </ConfirmSubmitButton>
        </Form>
      </div>
    </div>
  );
}
