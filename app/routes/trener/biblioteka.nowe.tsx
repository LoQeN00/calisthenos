import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { CategoryPicker } from "~/components/exercise-fields";
import { FileDropzone } from "~/components/file-dropzone";
import { requireUser } from "~/lib/auth";
import { filterToKnownCategoryNames, listCategoriesForTrainer } from "~/lib/categories";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { maxUploadBytesFor, UploadCleanupQueue, UploadError, uploadFile } from "~/lib/file-uploads";

const ExerciseSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const categories = await listCategoriesForTrainer(db, user.id);
  // Limit kliencki MUSI pochodzić z tego samego źródła co serwerowy — inaczej
  // przeglądarka przepuszcza plik, który serwer i tak odrzuci, ale dopiero PO
  // zbuforowaniu całego ciała żądania w pamięci.
  return { categories, maxVideoBytes: maxUploadBytesFor("exercise_demo") };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = ExerciseSchema.safeParse({
    name: fd.get("name"),
    unit: fd.get("unit"),
    description: fd.get("description") ?? "",
    tracksRpe: fd.get("tracksRpe") === "on",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Sprawdź pola formularza.",
    };
  }

  const categories = await listCategoriesForTrainer(db, user.id);
  const selected = fd.getAll("categories").map((v) => v.toString());
  const tags = filterToKnownCategoryNames(categories, selected);

  const demoBlob = fd.get("demo");
  const hasDemo = demoBlob instanceof File && demoBlob.size > 0;

  const cleanup = new UploadCleanupQueue(db);
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = null;
      if (hasDemo) {
        const uploaded = await uploadFile(
          tx,
          {
            file: demoBlob as File,
            kind: "exercise_demo",
            trainerId: user.id,
            uploadedBy: user.id,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await tx.insert(schema.exercises).values({
        trainerId: user.id,
        name: parsed.data.name,
        unit: parsed.data.unit,
        description: parsed.data.description,
        tracksRpe: parsed.data.tracksRpe,
        tags,
        demoFileId,
      });
    });
    cleanup.commit();
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError) return { error: e.userMessage };
    throw e;
  }
  throw redirect("/trener/biblioteka");
}

export default function NoweCwiczenie() {
  const { categories, maxVideoBytes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  // Blokada podwójnej wysyłki — formularz niesie wideo demo, więc wysyłka trwa,
  // a drugie kliknięcie tworzy DRUGIE ćwiczenie i drugi blob na wolumenie.
  const navigation = useNavigation();
  const isSubmitting = navigation.formMethod != null;
  return (
    <div style={{ maxWidth: 580 }}>
      <div className="crumbs">
        <Link to="/trener/biblioteka">Biblioteka</Link>
        <span className="sep">›</span>
        <span className="current">Nowe</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Nowe ćwiczenie</h1>
        </div>
      </div>
      <Form
        method="post"
        encType="multipart/form-data"
        className="card"
        style={{ display: "grid", gap: 14 }}
      >
        <div className="field">
          <label htmlFor="ex-name">Nazwa</label>
          <input
            id="ex-name"
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="np. Pull-up"
            className="input"
          />
        </div>

        <div className="field">
          <label htmlFor="ex-unit">Jednostka</label>
          <select id="ex-unit" name="unit" required defaultValue="REPS" className="select">
            <option value="REPS">REPS (powtórzenia)</option>
            <option value="SEC">SEC (sekundy)</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="ex-desc">Opis</label>
          <textarea
            id="ex-desc"
            name="description"
            rows={4}
            maxLength={2000}
            placeholder="Krótki opis, na co zwrócić uwagę przy wykonaniu…"
            className="textarea"
          />
        </div>

        <label
          className="field"
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
        >
          <input type="checkbox" name="tracksRpe" defaultChecked style={{ marginTop: 3 }} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>
              Zbieraj ocenę trudności (RPE 1–10) przy logowaniu
            </span>
            <span className="text-xs muted">
              Wyłącz dla ćwiczeń, w których ocena wysiłku nie ma sensu — podopieczny nie zobaczy
              wtedy skali trudności.
            </span>
          </span>
        </label>

        <CategoryPicker categories={categories} selected={[]} />

        <FileDropzone
          name="demo"
          idSuffix="new"
          kind="video"
          label="Wideo demo (opcjonalne)"
          maxBytes={maxVideoBytes}
        />

        {actionData?.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {actionData.error}
          </p>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Zapisywanie…" : "Zapisz ćwiczenie"}
          </button>
          <Link to="/trener/biblioteka" className="btn btn-ghost">
            Anuluj
          </Link>
        </div>
      </Form>
    </div>
  );
}
