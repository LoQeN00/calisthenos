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
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
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
  const skill = await getSkillWithVariations(db, user.id, skillId);
  if (!skill) throw new Response("not found", { status: 404 });
  const assignable = await listAssignableExercises(db, user.id);
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
  try {
    if (intent === "save") {
      const parsed = SkillFormSchema.safeParse({
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await updateSkill(db, user.id, skillId, parsed.data.name, parsed.data.description);
      return { success: "Zapisano zmiany." };
    }
    if (intent === "add-variation") {
      const exerciseId = String(fd.get("exerciseId") ?? "");
      if (exerciseId) await addVariation(db, user.id, skillId, exerciseId);
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
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
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
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
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
  const ids = skill.variations.map((v) => v.id);

  function reorderedIds(from: number, to: number): string[] {
    const copy = [...ids];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved!);
    return copy;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="crumbs">
        <Link to="/trener/umiejetnosci">Umiejętności</Link>
        <span className="sep">›</span>
        <span className="current">{skill.name}</span>
      </div>

      {actionData != null && "error" in actionData && actionData.error != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
          {actionData.error}
        </p>
      )}

      {actionData != null && "success" in actionData && actionData.success != null && (
        <output style={{ display: "block", color: "var(--ok)", fontSize: 13, marginBottom: 12 }}>
          {actionData.success}
        </output>
      )}

      <Form
        method="post"
        className="card"
        style={{ padding: 16, display: "grid", gap: 12, marginBottom: 18 }}
      >
        <input type="hidden" name="intent" value="save" />
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Nazwa</span>
          <input name="name" className="input" defaultValue={skill.name} maxLength={120} required />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Opis</span>
          <textarea
            name="description"
            className="input"
            defaultValue={skill.description ?? ""}
            maxLength={2000}
            rows={3}
          />
        </label>
        <button type="submit" className="btn">
          Zapisz
        </button>
      </Form>

      <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Warianty (od najłatwiejszego)</h2>
      {skill.variations.length === 0 ? (
        <div className="text-sm muted" style={{ marginBottom: 12 }}>
          Brak wariantów. Dodaj co najmniej jeden, by móc przypisać poziom startowy podopiecznemu.
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
                    <button type="submit" className="btn btn-sm btn-ghost" aria-label="W górę">
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
                    <button type="submit" className="btn btn-sm btn-ghost" aria-label="W dół">
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
                    title="Usuń wariant"
                    confirmOptions={{
                      title: `Usunąć wariant „${v.exerciseName}"?`,
                      message:
                        "Jeśli jest użyty w historii awansów, usunięcie zostanie zablokowane.",
                      destructive: true,
                      confirmText: "Usuń",
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
        <select name="exerciseId" className="input" style={{ flex: 1 }} required defaultValue="">
          <option value="" disabled>
            Dodaj ćwiczenie jako wariant…
          </option>
          {assignable.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name} ({ex.unit})
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">
          <Icons.Plus /> Dodaj
        </button>
      </Form>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Wymaga (prerekwizyty)</h2>
        <p className="text-sm muted" style={{ marginBottom: 12 }}>
          Umiejętności, które trzeba opanować, zanim odblokuje się ta.
        </p>
        {prerequisites.length === 0 ? (
          <div className="text-sm muted" style={{ marginBottom: 12 }}>
            Brak prerekwizytów — to korzeń drzewa.
          </div>
        ) : (
          <div className="col" style={{ gap: 8, marginBottom: 16 }}>
            {prerequisites.map((p) => (
              <div key={p.id} className="card row between" style={{ padding: "10px 14px", gap: 10 }}>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-prereq" />
                  <input type="hidden" name="requiresSkillId" value={p.id} />
                  <button
                    type="submit"
                    className="btn btn-sm btn-ghost"
                    style={{ color: "var(--danger)" }}
                    aria-label={`Usuń prerekwizyt ${p.name}`}
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
            Brak innych umiejętności do dodania.
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
                Dodaj wymaganą umiejętność…
              </option>
              {assignablePrereqs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              <Icons.Plus /> Dodaj
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
              title: `Zarchiwizować „${skill.name}"?`,
              message: "Umiejętność zniknie z listy. Historia awansów podopiecznych pozostanie.",
              destructive: true,
              confirmText: "Zarchiwizuj",
            }}
          >
            <Icons.Trash /> Zarchiwizuj umiejętność
          </ConfirmSubmitButton>
        </Form>
      </div>
    </div>
  );
}
