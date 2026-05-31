import { and, eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { filterToKnownCategoryNames, listCategoriesForTrainer } from "~/lib/categories";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  deleteFileBlob,
  deleteFileRow,
  UploadCleanupQueue,
  UploadError,
  uploadFile,
} from "~/lib/file-uploads";
import { signFileUrl } from "~/lib/files";
import { CategoryPicker } from "~/components/exercise-fields";
import { FileDropzone } from "~/components/file-dropzone";

const EditSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";

  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, user.id)))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Response("not found", { status: 404 });
  }

  const categories = await listCategoriesForTrainer(db, user.id);

  return {
    exercise: row.exercise,
    categories,
    demo:
      row.demoFile != null
        ? { url: signFileUrl(row.demoFile.id, user.id), mime: row.demoFile.mimeType }
        : null,
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  // Verify tenant ownership before any mutation.
  const existing = await db
    .select()
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, user.id)))
    .limit(1);
  if (existing.length === 0) {
    throw new Response("not found", { status: 404 });
  }
  const exercise = existing[0]!;

  if (intent === "archive") {
    await db
      .update(schema.exercises)
      .set({ archivedAt: new Date() })
      .where(eq(schema.exercises.id, exerciseId));
    throw redirect("/trener/biblioteka");
  }

  if (intent === "unarchive") {
    await db
      .update(schema.exercises)
      .set({ archivedAt: null })
      .where(eq(schema.exercises.id, exerciseId));
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
  const categories = await listCategoriesForTrainer(db, user.id);
  const selected = fd.getAll("categories").map((v) => v.toString());
  const tags = filterToKnownCategoryNames(categories, selected);

  const demoBlob = fd.get("demo");
  const hasNewDemo = demoBlob instanceof File && demoBlob.size > 0;

  const cleanup = new UploadCleanupQueue(db);
  // Path of the previous demo file. Set inside the tx if a replacement landed
  // successfully; deleted from disk only AFTER the tx commits, so a rollback
  // doesn't leave the file gone while the DB row is restored.
  let oldDemoStoragePathToDelete: string | null = null;
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = exercise.demoFileId;
      const oldDemoFileId = exercise.demoFileId;

      if (hasNewDemo) {
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

      await tx
        .update(schema.exercises)
        .set({
          name: parsed.data.name,
          unit: parsed.data.unit,
          description: parsed.data.description,
          tracksRpe: parsed.data.tracksRpe,
          tags,
          demoFileId,
        })
        .where(eq(schema.exercises.id, exerciseId));

      if (hasNewDemo && oldDemoFileId) {
        // Drop the previous demo's DB row inside the tx. Blob removal happens
        // post-commit (below) so a rollback doesn't leave the file gone.
        oldDemoStoragePathToDelete = await deleteFileRow(tx, oldDemoFileId);
      }
    });
    cleanup.commit();
    if (oldDemoStoragePathToDelete) {
      await deleteFileBlob(oldDemoStoragePathToDelete);
    }
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError) return { error: e.userMessage };
    throw e;
  }
  throw redirect("/trener/biblioteka");
}

export default function EdytujCwiczenie() {
  const { exercise, demo, categories } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isArchived = exercise.archivedAt != null;

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

        <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <input type="checkbox" name="tracksRpe" defaultChecked={exercise.tracksRpe} style={{ marginTop: 3 }} />
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
          maxBytes={250_000_000}
        />

        {actionData?.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {actionData.error}
          </p>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            Zapisz zmiany
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
