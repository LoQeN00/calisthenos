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
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/api/auth";
import { filterToKnownCategoryNames, listCategoriesForTrainer } from "~/lib/categories";
import { db } from "~/lib/db/client";
import {
  getExerciseForTrainer,
  getExerciseWithDemoForTrainer,
  setExerciseArchived,
  updateExerciseWithDemo,
} from "~/lib/exercises";
import { maxUploadBytesFor, UploadError } from "~/lib/file-uploads";
import { signFileUrl } from "~/lib/files";
import { findSkillForExercise } from "~/lib/skills";
import { CategoryPicker } from "~/components/exercise-fields";
import { FileDropzone } from "~/components/file-dropzone";

const EditSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";

  const row = await getExerciseWithDemoForTrainer(db, user.id, exerciseId);
  if (row == null) {
    throw new Response("not found", { status: 404 });
  }

  const categories = await listCategoriesForTrainer(api);

  return {
    exercise: row.exercise,
    categories,
    // Ten sam limit co na serwerze — patrz komentarz w biblioteka.nowe.tsx.
    maxVideoBytes: maxUploadBytesFor("exercise_demo"),
    demo:
      row.demoFile != null
        ? { url: signFileUrl(row.demoFile.id, user.id), mime: row.demoFile.mimeType }
        : null,
  };
}

export async function action(args: ActionFunctionArgs) {
  const { api, user } = requireUser(args.context, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  // Verify tenant ownership before any mutation.
  const existing = await getExerciseForTrainer(db, user.id, exerciseId);
  if (existing == null) {
    throw new Response("not found", { status: 404 });
  }
  const exercise = existing;

  if (intent === "archive") {
    // Inwariant: wariant aktywnej umiejętności nigdy nie wskazuje zarchiwizowanego
    // ćwiczenia — inaczej w drzewie/mapie Rozwoju wisiałby „duch". Blokujemy
    // archiwizację, dopóki ćwiczenie jest wariantem; trener musi je najpierw odpiąć.
    const skill = await findSkillForExercise(db, user.id, exerciseId);
    if (skill) {
      return {
        error: `To ćwiczenie jest wariantem umiejętności „${skill.skillName}". Usuń je z wariantów tej umiejętności, zanim je zarchiwizujesz.`,
      };
    }
    await setExerciseArchived(db, user.id, exerciseId, true);
    throw redirect("/trener/biblioteka");
  }

  if (intent === "unarchive") {
    await setExerciseArchived(db, user.id, exerciseId, false);
    throw redirect(`/trener/biblioteka/${exerciseId}`);
  }

  // Default: save.
  const parsed = EditSchema.safeParse({
    name: fd.get("name"),
    unit: fd.get("unit"),
    description: fd.get("description") ?? "",
    tracksRpe: fd.get("tracksRpe") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Sprawdź pola formularza." };
  }
  const categories = await listCategoriesForTrainer(api);
  const selected = fd.getAll("categories").map((v) => v.toString());
  const tags = filterToKnownCategoryNames(categories, selected);

  const demoBlob = fd.get("demo");
  const demo = demoBlob instanceof File && demoBlob.size > 0 ? demoBlob : null;

  try {
    await updateExerciseWithDemo(db, {
      trainerId: user.id,
      exerciseId,
      // Z wiersza wczytanego wyżej przy sprawdzeniu własności — bez drugiego SELECT-a.
      currentDemoFileId: exercise.demoFileId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      description: parsed.data.description,
      tags,
      tracksRpe: parsed.data.tracksRpe,
      demo,
    });
  } catch (e) {
    if (e instanceof UploadError) return { error: e.userMessage };
    throw e;
  }
  throw redirect("/trener/biblioteka");
}

export default function EdytujCwiczenie() {
  const { exercise, demo, categories, maxVideoBytes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isArchived = exercise.archivedAt != null;
  // Blokada podwójnej wysyłki na formularzu zapisu — niesie wideo demo, więc wysyłka
  // trwa, a drugie kliknięcie wgrywa drugi blob na wolumen. Dotyczy wyłącznie tego
  // przycisku; osobne intencje (archiwizacja/przywrócenie) zostają bez zmian.
  const navigation = useNavigation();
  const isSubmitting = navigation.formMethod != null;

  return (
    <div style={{ maxWidth: 580 }}>
      <div className="crumbs">
        <Link to="/trener/biblioteka">Biblioteka</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Ćwiczenie · {exercise.unit}
          </div>
          <h1>{exercise.name}</h1>
        </div>
        {isArchived && (
          <span className="badge archived">
            <span className="badge-dot" />
            archiwum
          </span>
        )}
      </div>

      {demo && (
        <div style={{ marginBottom: 18 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            Aktualne demo
          </div>
          <video
            src={demo.url}
            controls
            preload="metadata"
            playsInline
            style={{
              width: "100%",
              maxWidth: 480,
              borderRadius: 8,
              background: "var(--surface-2)",
              display: "block",
            }}
          />
        </div>
      )}

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
            defaultValue={exercise.name}
            className="input"
          />
        </div>

        <div className="field">
          <label htmlFor="ex-unit">Jednostka</label>
          <select id="ex-unit" name="unit" required defaultValue={exercise.unit} className="select">
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
            defaultValue={exercise.description}
            className="textarea"
          />
        </div>

        <label
          className="field"
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
        >
          <input
            type="checkbox"
            name="tracksRpe"
            defaultChecked={exercise.tracksRpe}
            style={{ marginTop: 3 }}
          />
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

        <CategoryPicker categories={categories} selected={exercise.tags} />

        <FileDropzone
          name="demo"
          idSuffix="edit"
          kind="video"
          label={demo ? "Zastąp wideo demo (opcjonalne)" : "Wideo demo (opcjonalne)"}
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
            {isSubmitting ? "Zapisywanie…" : "Zapisz zmiany"}
          </button>
          <Link to="/trener/biblioteka" className="btn btn-ghost">
            Anuluj
          </Link>
        </div>
      </Form>

      {/* Separate form for archive / unarchive so it doesn't carry the file input. */}
      <Form
        method="post"
        style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--line)" }}
      >
        {isArchived ? (
          <button type="submit" name="intent" value="unarchive" className="btn">
            Przywróć z archiwum
          </button>
        ) : (
          <ConfirmSubmitButton
            name="intent"
            value="archive"
            className="btn btn-danger"
            confirmOptions={{
              title: "Zarchiwizować ćwiczenie?",
              message:
                "Będzie ukryte na liście, ale plany historyczne pozostaną nietknięte. Możesz przywrócić je później.",
              destructive: true,
              confirmText: "Archiwizuj",
            }}
          >
            <Icons.Arch /> Archiwizuj
          </ConfirmSubmitButton>
        )}
      </Form>
    </div>
  );
}
