import {
  Form,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
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
    return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
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
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Nowa umiejętność</h1>
        </div>
      </div>
      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Nazwa</span>
          <input
            name="name"
            className="input"
            maxLength={120}
            required
            placeholder="np. Front Lever"
          />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Opis (opcjonalny)</span>
          <textarea name="description" className="input" maxLength={2000} rows={3} />
        </label>
        {actionData != null && "error" in actionData && actionData.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
            {actionData.error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Utwórz
        </button>
      </Form>
    </div>
  );
}
