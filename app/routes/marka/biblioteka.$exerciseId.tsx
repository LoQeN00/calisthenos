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
import { FileDropzone } from "~/components/file-dropzone";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import {
  archiveBrandExercise,
  findBrandSkillForExercise,
  getBrandExercise,
  restoreBrandExercise,
  updateBrandExercise,
} from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";
import {
  deleteFileBlob,
  deleteFileRow,
  UploadCleanupQueue,
  UploadError,
  uploadFile,
} from "~/lib/file-uploads";
import { signFileUrl } from "~/lib/files";
import { tDyn } from "~/i18n/translate";

const EditSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const exerciseId = args.params.exerciseId ?? "";
  const current = await getBrandExercise(db, orgId, exerciseId);
  if (!current) throw new Response("not found", { status: 404 });
  const demo =
    current.demoFile != null
      ? { url: signFileUrl(current.demoFile.id, user.id), mime: current.demoFile.mimeType }
      : null;
  return { exercise: current.exercise, demo };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const exerciseId = args.params.exerciseId ?? "";
  const current = await getBrandExercise(db, orgId, exerciseId);
  if (!current) throw new Response("not found", { status: 404 });
  const exercise = current.exercise;
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "archive") {
    const skill = await findBrandSkillForExercise(db, orgId, exerciseId);
    if (skill) {
      return {
        errorKey: "bibliotekaForm.errors.exerciseIsVariant" as const,
        errorValues: { skill: skill.skillName },
      };
    }
    await archiveBrandExercise(db, orgId, exerciseId);
    throw redirect("/marka/biblioteka");
  }
  if (intent === "unarchive") {
    await restoreBrandExercise(db, orgId, exerciseId);
    throw redirect(`/marka/biblioteka/${exerciseId}`);
  }

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
  const demoBlob = fd.get("demo");
  const hasNewDemo = demoBlob instanceof File && demoBlob.size > 0;
  const cleanup = new UploadCleanupQueue(db);
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
            owner: { organizationId: orgId },
            uploadedBy: user.id,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await updateBrandExercise(tx, orgId, exerciseId, {
        name: parsed.data.name,
        unit: parsed.data.unit,
        description: parsed.data.description,
        tracksRpe: parsed.data.tracksRpe,
        tags: [],
        demoFileId,
      });
      if (hasNewDemo && oldDemoFileId) {
        oldDemoStoragePathToDelete = await deleteFileRow(tx, oldDemoFileId);
      }
    });
    cleanup.commit();
    if (oldDemoStoragePathToDelete) {
      try {
        await deleteFileBlob(oldDemoStoragePathToDelete);
      } catch {}
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
  throw redirect("/marka/biblioteka");
}

export default function EdytujMarcoweCwiczenie() {
  const { exercise, demo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("marka");
  const isArchived = exercise.archivedAt != null;

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
        <Link to="/marka/biblioteka">{t("bibliotekaForm.crumbsLibrary")}</Link>
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
          <select id="ex-unit" name="unit" required defaultValue={exercise.unit} className="select">
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
          <Link to="/marka/biblioteka" className="btn btn-ghost">
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
    </div>
  );
}
