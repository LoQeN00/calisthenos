import { and, eq } from "drizzle-orm";
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
import { z } from "zod";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { canReadCatalogRow } from "~/lib/authz";
import { forkExercise, isBrandOwned } from "~/lib/catalog";
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
import { findSkillForExercise } from "~/lib/skills";
import { CategoryPicker } from "~/components/exercise-fields";
import { FileDropzone } from "~/components/file-dropzone";
import { tDyn } from "~/i18n/translate";

const EditSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const exerciseId = args.params.exerciseId ?? "";

  // Ładujemy po id BEZ filtra trainer-only: ćwiczenie może być własne trenera
  // albo markowe (trainer_id NULL) z jego organizacji. Autoryzacja przez
  // canReadCatalogRow; brak/niedozwolone → 404 (nie 403, by nie zdradzać zasobu).
  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(eq(schema.exercises.id, exerciseId))
    .limit(1);

  const row = rows[0];
  if (!row || !canReadCatalogRow(user, row.exercise)) {
    throw new Response("not found", { status: 404 });
  }

  const categories = await listCategoriesForTrainer(db, user.id);

  return {
    exercise: row.exercise,
    isBrand: isBrandOwned(row.exercise),
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

  // Najpierw ustalamy własność celu (raz), nie filtrując po trenerze — bo „fork"
  // dotyczy markowego wiersza, którego trener NIE jest właścicielem.
  const [target] = await db
    .select({
      trainerId: schema.exercises.trainerId,
      organizationId: schema.exercises.organizationId,
    })
    .from(schema.exercises)
    .where(eq(schema.exercises.id, exerciseId))
    .limit(1);
  if (!target) throw new Response("not found", { status: 404 });

  if (intent === "fork") {
    const newId = await forkExercise(db, {
      trainerId: user.id,
      organizationId: user.organizationId,
      exerciseId,
    });
    if (!newId) throw new Response("not found", { status: 404 });
    throw redirect(`/trener/biblioteka/${newId}`);
  }

  // Każdy inny (zapisujący) intent jest zabroniony na markowym wierszu — 404
  // (read-only z poziomu trenera; edycja tylko przez fork → własna kopia).
  if (target.trainerId == null) throw new Response("not found", { status: 404 });

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
    // Inwariant: wariant aktywnej umiejętności nigdy nie wskazuje zarchiwizowanego
    // ćwiczenia — inaczej w drzewie/mapie Rozwoju wisiałby „duch". Blokujemy
    // archiwizację, dopóki ćwiczenie jest wariantem; trener musi je najpierw odpiąć.
    const skill = await findSkillForExercise(
      db,
      { trainerId: user.id, organizationId: user.organizationId },
      exerciseId,
    );
    if (skill) {
      return {
        errorKey: "bibliotekaForm.errors.exerciseIsVariant" as const,
        errorValues: { skill: skill.skillName },
      };
    }
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
    const issue = parsed.error.issues[0]?.message;
    return {
      errorKey:
        issue === "nameRequired"
          ? ("bibliotekaForm.errors.nameRequired" as const)
          : ("bibliotekaForm.errors.formInvalid" as const),
    };
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
            owner: { trainerId: user.id },
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
      // Best-effort post-commit (jak w deleteBodyPhoto / trainees): podmiana demo
      // jest już zatwierdzona w DB; błąd usunięcia starego blobu nie może dać 500.
      try {
        await deleteFileBlob(oldDemoStoragePathToDelete);
      } catch {
        // Swallow — osierocony blob zamiast wywrócenia udanej operacji.
      }
    }
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError)
      return {
        errorKey: "bibliotekaForm.errors.formInvalid" as const,
        errorMessage: e.userMessage,
      };
    throw e;
  }
  throw redirect("/trener/biblioteka");
}

export default function EdytujCwiczenie() {
  const { exercise, isBrand, demo, categories } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("trener");
  const isArchived = exercise.archivedAt != null;
  const knownTags = filterToKnownCategoryNames(categories, exercise.tags);

  const errorMsg =
    actionData?.errorKey != null
      ? "errorMessage" in actionData && actionData.errorMessage
        ? actionData.errorMessage
        : tDyn(
            t,
            actionData.errorKey,
            "errorValues" in actionData ? actionData.errorValues : undefined,
          )
      : null;

  return (
    <div style={{ maxWidth: 580 }}>
      <div className="crumbs">
        <Link to="/trener/biblioteka">{t("bibliotekaForm.crumbsLibrary")}</Link>
        <span className="sep">›</span>
        <span className="current">{exercise.name}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("bibliotekaForm.exerciseEyebrow", { unit: exercise.unit })}
          </div>
          <h1>{exercise.name}</h1>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {isBrand && <span className="badge">{t("biblioteka.brandBadge")}</span>}
          {isArchived && (
            <span className="badge archived">
              <span className="badge-dot" />
              {t("bibliotekaForm.archived")}
            </span>
          )}
        </div>
      </div>

      {demo && (
        <div style={{ marginBottom: 18 }}>
          <div className="field-label" style={{ marginBottom: 6 }}>
            {t("bibliotekaForm.currentDemo")}
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

      {isBrand ? (
        <>
          <div className="card" style={{ display: "grid", gap: 14 }}>
            <div className="field">
              <div className="field-label">{t("bibliotekaForm.fieldUnit")}</div>
              <div>
                {exercise.unit === "REPS"
                  ? t("bibliotekaForm.unitReps")
                  : t("bibliotekaForm.unitSec")}
              </div>
            </div>

            {exercise.description.length > 0 && (
              <div className="field">
                <div className="field-label">{t("bibliotekaForm.fieldDescription")}</div>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                  {exercise.description}
                </div>
              </div>
            )}

            {knownTags.length > 0 && (
              <div className="row wrap" style={{ gap: 4 }}>
                {knownTags.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm muted" style={{ margin: 0 }}>
              {t("biblioteka.brandReadonlyNote")}
            </p>

            <Form method="post">
              <input type="hidden" name="intent" value="fork" />
              <button type="submit" className="btn btn-primary">
                {t("biblioteka.customize")}
              </button>
            </Form>
          </div>
        </>
      ) : (
        <>
          <Form
            method="post"
            encType="multipart/form-data"
            className="card"
            style={{ display: "grid", gap: 14 }}
          >
            <div className="field">
              <label htmlFor="ex-name">{t("bibliotekaForm.fieldName")}</label>
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
              <label htmlFor="ex-unit">{t("bibliotekaForm.fieldUnit")}</label>
              <select
                id="ex-unit"
                name="unit"
                required
                defaultValue={exercise.unit}
                className="select"
              >
                <option value="REPS">{t("bibliotekaForm.unitReps")}</option>
                <option value="SEC">{t("bibliotekaForm.unitSec")}</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="ex-desc">{t("bibliotekaForm.fieldDescription")}</label>
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
                  {t("bibliotekaForm.rpeTitle")}
                </span>
                <span className="text-xs muted">{t("bibliotekaForm.rpeHint")}</span>
              </span>
            </label>

            <CategoryPicker categories={categories} selected={exercise.tags} />

            <FileDropzone
              name="demo"
              idSuffix="edit"
              kind="video"
              label={demo ? t("bibliotekaForm.demoReplaceLabel") : t("bibliotekaForm.demoLabel")}
              maxBytes={250_000_000}
            />

            {errorMsg != null && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
                {errorMsg}
              </p>
            )}

            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn btn-primary">
                {t("bibliotekaForm.saveEdit")}
              </button>
              <Link to="/trener/biblioteka" className="btn btn-ghost">
                {t("bibliotekaForm.cancel")}
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
                {t("bibliotekaForm.unarchive")}
              </button>
            ) : (
              <ConfirmSubmitButton
                name="intent"
                value="archive"
                className="btn btn-danger"
                confirmOptions={{
                  title: t("bibliotekaForm.archiveConfirmTitle"),
                  message: t("bibliotekaForm.archiveConfirmMessage"),
                  destructive: true,
                  confirmText: t("bibliotekaForm.archiveConfirmText"),
                }}
              >
                <Icons.Arch /> {t("bibliotekaForm.archive")}
              </ConfirmSubmitButton>
            )}
          </Form>
        </>
      )}
    </div>
  );
}
