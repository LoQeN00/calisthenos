import { eq } from "drizzle-orm";
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
import { forkSkill } from "~/lib/catalog";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  SkillError,
  addPrerequisite,
  addVariation,
  archiveSkill,
  getSkillWithVariations,
  listAssignableExercises,
  listAssignablePrerequisites,
  listPrerequisitesForSkill,
  removePrerequisite,
  removeVariation,
  reorderVariations,
  updateSkill,
} from "~/lib/skills";
import { PrerequisiteFormSchema, ReorderFormSchema, SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skillId = args.params.skillId ?? "";
  const skill = await getSkillWithVariations(
    db,
    { trainerId: user.id, organizationId: user.organizationId },
    skillId,
  );
  if (!skill) throw new Response("not found", { status: 404 });
  const assignable = await listAssignableExercises(db, {
    trainerId: user.id,
    organizationId: user.organizationId,
  });
  const [prerequisites, assignablePrereqs] = await Promise.all([
    listPrerequisitesForSkill(db, user.id, skillId),
    listAssignablePrerequisites(db, user.id, skillId),
  ]);
  return { skill, assignable, prerequisites, assignablePrereqs };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skillId = args.params.skillId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  // „Dostosuj": forkuje markową umiejętność do własnej kopii trenera i przekierowuje
  // do edytora kopii. Jedyny intent dozwolony na markowym wierszu.
  if (intent === "fork") {
    const newId = await forkSkill(db, {
      trainerId: user.id,
      organizationId: user.organizationId,
      skillId,
    });
    if (!newId) throw new Response(null, { status: 404 });
    throw redirect(`/trener/umiejetnosci/${newId}`);
  }

  // Każdy inny (zapisujący) intent jest zabroniony na markowym wierszu (trainer_id
  // NULL) — 404 (read-only z poziomu trenera; edycja tylko przez fork → własna
  // kopia). Funkcje zapisu w repo i tak są scope'owane po trainerId (defense in
  // depth), ale jawne 404 jest czytelniejsze i spójne z biblioteką (T6).
  const [own] = await db
    .select({ trainerId: schema.skills.trainerId })
    .from(schema.skills)
    .where(eq(schema.skills.id, skillId))
    .limit(1);
  if (!own) throw new Response(null, { status: 404 });
  if (own.trainerId == null) throw new Response(null, { status: 404 });

  try {
    if (intent === "save") {
      const parsed = SkillFormSchema.safeParse({
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (!parsed.success)
        return { error: parsed.error.issues[0]?.message ?? "umiejetnosci.detail.errorInvalid" };
      await updateSkill(db, user.id, skillId, parsed.data.name, parsed.data.description);
      return { success: "umiejetnosci.detail.saved" };
    }
    if (intent === "add-variation") {
      const exerciseId = String(fd.get("exerciseId") ?? "");
      if (exerciseId)
        await addVariation(
          db,
          { trainerId: user.id, organizationId: user.organizationId },
          skillId,
          exerciseId,
        );
      return { ok: true };
    }
    if (intent === "remove-variation") {
      const variationId = String(fd.get("variationId") ?? "");
      if (variationId) await removeVariation(db, user.id, skillId, variationId);
      return { ok: true };
    }
    if (intent === "move") {
      const parsed = ReorderFormSchema.safeParse({
        variationIds: fd.getAll("variationIds").map(String),
      });
      if (!parsed.success)
        return { error: parsed.error.issues[0]?.message ?? "umiejetnosci.detail.errorInvalid" };
      await reorderVariations(db, user.id, skillId, parsed.data.variationIds);
      return { ok: true };
    }
    if (intent === "archive") {
      await archiveSkill(db, user.id, skillId);
      throw redirect("/trener/umiejetnosci");
    }
    if (intent === "add-prereq") {
      const parsed = PrerequisiteFormSchema.safeParse({
        skillId,
        requiresSkillId: String(fd.get("requiresSkillId") ?? ""),
      });
      if (!parsed.success)
        return { error: parsed.error.issues[0]?.message ?? "umiejetnosci.detail.errorInvalid" };
      await addPrerequisite(db, user.id, skillId, parsed.data.requiresSkillId);
      return { ok: true };
    }
    if (intent === "remove-prereq") {
      const requiresSkillId = String(fd.get("requiresSkillId") ?? "");
      if (requiresSkillId) await removePrerequisite(db, user.id, skillId, requiresSkillId);
      return { ok: true };
    }
    return null;
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function EdytorUmiejetnosci() {
  const { skill, assignable, prerequisites, assignablePrereqs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("trenerPlany");
  const ids = skill.variations.map((v) => v.id);

  // error/success mogą być kluczem (umiejetnosci.*) albo dosłownym komunikatem
  // z warstwy lib (Zod / SkillError, PL — poza zakresem ekstrakcji).
  const tMsg = (m: string) => (m.startsWith("umiejetnosci.") ? tDyn(t, m) : m);

  function reorderedIds(from: number, to: number): string[] {
    const copy = [...ids];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved!);
    return copy;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="crumbs">
        <Link to="/trener/umiejetnosci">{t("umiejetnosci.detail.crumbList")}</Link>
        <span className="sep">›</span>
        <span className="current">{skill.name}</span>
      </div>

      {skill.isBrand ? (
        <div className="card" style={{ padding: 16, display: "grid", gap: 14 }}>
          <div className="row between" style={{ alignItems: "flex-start", gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>{skill.name}</h1>
            <span className="badge" style={{ flexShrink: 0 }}>
              {t("umiejetnosci.brandBadge")}
            </span>
          </div>

          {skill.description.length > 0 && (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{skill.description}</div>
          )}

          <h2 style={{ fontSize: 17, margin: "8px 0 0" }}>
            {t("umiejetnosci.detail.variationsHeading")}
          </h2>
          {skill.variations.length === 0 ? (
            <div className="text-sm muted">{t("umiejetnosci.detail.variationsEmpty")}</div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {skill.variations.map((v) => (
                <div
                  key={v.id}
                  className="card row between"
                  style={{ padding: "10px 14px", gap: 10 }}
                >
                  <div className="row" style={{ gap: 10, alignItems: "center" }}>
                    <span className="mono text-xs muted">{v.ordinal}</span>
                    <span style={{ fontWeight: 500 }}>{v.exerciseName}</span>
                    <span className="badge">{v.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {prerequisites.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, margin: "8px 0 0" }}>
                {t("umiejetnosci.detail.prereqHeading")}
              </h2>
              <div className="row wrap" style={{ gap: 4 }}>
                {prerequisites.map((p) => (
                  <span key={p.id} className="tag">
                    {p.name}
                  </span>
                ))}
              </div>
            </>
          )}

          <p className="text-sm muted" style={{ margin: 0 }}>
            {t("umiejetnosci.brandReadonlyNote")}
          </p>

          <Form method="post">
            <input type="hidden" name="intent" value="fork" />
            <button type="submit" className="btn btn-primary">
              {t("umiejetnosci.customize")}
            </button>
          </Form>
        </div>
      ) : (
        <>
          {actionData != null && "error" in actionData && actionData.error != null && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
              {tMsg(actionData.error)}
            </p>
          )}

          {actionData != null && "success" in actionData && actionData.success != null && (
            <output
              style={{ display: "block", color: "var(--ok)", fontSize: 13, marginBottom: 12 }}
            >
              {tMsg(actionData.success)}
            </output>
          )}

          <Form
            method="post"
            className="card"
            style={{ padding: 16, display: "grid", gap: 12, marginBottom: 18 }}
          >
            <input type="hidden" name="intent" value="save" />
            <label className="col" style={{ gap: 4 }}>
              <span className="text-sm">{t("umiejetnosci.detail.labelName")}</span>
              <input
                name="name"
                className="input"
                defaultValue={skill.name}
                maxLength={120}
                required
              />
            </label>
            <label className="col" style={{ gap: 4 }}>
              <span className="text-sm">{t("umiejetnosci.detail.labelDescription")}</span>
              <textarea
                name="description"
                className="input"
                defaultValue={skill.description ?? ""}
                maxLength={2000}
                rows={3}
              />
            </label>
            <button type="submit" className="btn">
              {t("umiejetnosci.detail.save")}
            </button>
          </Form>

          <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>
            {t("umiejetnosci.detail.variationsHeading")}
          </h2>
          {skill.variations.length === 0 ? (
            <div className="text-sm muted" style={{ marginBottom: 12 }}>
              {t("umiejetnosci.detail.variationsEmpty")}
            </div>
          ) : (
            <div className="col" style={{ gap: 8, marginBottom: 16 }}>
              {skill.variations.map((v, i) => (
                <div
                  key={v.id}
                  className="card row between"
                  style={{ padding: "10px 14px", gap: 10 }}
                >
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
                          aria-label={t("umiejetnosci.detail.moveUp")}
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
                          aria-label={t("umiejetnosci.detail.moveDown")}
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
                        title={t("umiejetnosci.detail.removeVariation")}
                        confirmOptions={{
                          title: t("umiejetnosci.detail.confirmRemoveVariationTitle", {
                            name: v.exerciseName,
                          }),
                          message: t("umiejetnosci.detail.confirmRemoveVariationMessage"),
                          destructive: true,
                          confirmText: t("umiejetnosci.detail.confirmRemoveVariationConfirm"),
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

          <Form method="post" className="row" style={{ gap: 8 }}>
            <input type="hidden" name="intent" value="add-variation" />
            <select
              name="exerciseId"
              className="input"
              style={{ flex: 1 }}
              required
              defaultValue=""
            >
              <option value="" disabled>
                {t("umiejetnosci.detail.addVariationPlaceholder")}
              </option>
              {assignable.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name} ({ex.unit})
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              <Icons.Plus /> {t("umiejetnosci.detail.add")}
            </button>
          </Form>

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>
              {t("umiejetnosci.detail.prereqHeading")}
            </h2>
            <p className="text-sm muted" style={{ marginBottom: 12 }}>
              {t("umiejetnosci.detail.prereqIntro")}
            </p>
            {prerequisites.length === 0 ? (
              <div className="text-sm muted" style={{ marginBottom: 12 }}>
                {t("umiejetnosci.detail.prereqEmpty")}
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
                      <button
                        type="submit"
                        className="btn btn-sm btn-ghost"
                        style={{ color: "var(--danger)" }}
                        aria-label={t("umiejetnosci.detail.removePrereq", { name: p.name })}
                      >
                        <Icons.X />
                      </button>
                    </Form>
                  </div>
                ))}
              </div>
            )}
            {assignablePrereqs.length === 0 ? (
              <div className="text-sm muted" style={{ marginBottom: 16 }}>
                {t("umiejetnosci.detail.prereqNoneToAdd")}
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
                    {t("umiejetnosci.detail.addPrereqPlaceholder")}
                  </option>
                  {assignablePrereqs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary">
                  <Icons.Plus /> {t("umiejetnosci.detail.add")}
                </button>
              </Form>
            )}
          </div>

          <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <Form method="post">
              <input type="hidden" name="intent" value="archive" />
              <ConfirmSubmitButton
                className="btn btn-danger"
                confirmOptions={{
                  title: t("umiejetnosci.detail.confirmArchiveTitle", { name: skill.name }),
                  message: t("umiejetnosci.detail.confirmArchiveMessage"),
                  destructive: true,
                  confirmText: t("umiejetnosci.detail.confirmArchiveConfirm"),
                }}
              >
                <Icons.Trash /> {t("umiejetnosci.detail.archiveSkill")}
              </ConfirmSubmitButton>
            </Form>
          </div>
        </>
      )}
    </div>
  );
}
