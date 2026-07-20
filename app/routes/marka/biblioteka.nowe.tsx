import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { FileDropzone } from "~/components/file-dropzone";
import { requireUser } from "~/lib/auth";
import { createBrandExercise } from "~/lib/brand-catalog";
import { db } from "~/lib/db/client";
import { UploadCleanupQueue, UploadError, uploadFile } from "~/lib/file-uploads";
import { tDyn } from "~/i18n/translate";

const ExerciseSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});

export async function loader(args: LoaderFunctionArgs) {
  await requireUser(args.request, db, { role: "brand_admin" });
  return {};
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const fd = await args.request.formData();
  const parsed = ExerciseSchema.safeParse({
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
            owner: { organizationId: orgId },
            uploadedBy: user.id,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await createBrandExercise(tx, orgId, {
        name: parsed.data.name,
        unit: parsed.data.unit,
        description: parsed.data.description,
        tracksRpe: parsed.data.tracksRpe,
        tags: [],
        demoFileId,
      });
    });
    cleanup.commit();
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

export default function NoweMarcoweCwiczenie() {
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("marka");
  const errorMsg =
    actionData?.errorKey != null
      ? "errorMessage" in actionData && actionData.errorMessage
        ? actionData.errorMessage
        : tDyn(t, actionData.errorKey)
      : null;
  return (
    <div style={{ maxWidth: 580 }}>
      <div className="crumbs">
        <Link to="/marka/biblioteka">{t("bibliotekaForm.crumbsLibrary")}</Link>
        <span className="sep">›</span>
        <span className="current">{t("bibliotekaForm.crumbNew")}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("bibliotekaForm.eyebrow")}
          </div>
          <h1>{t("bibliotekaForm.newTitle")}</h1>
        </div>
      </div>
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
            placeholder={t("bibliotekaForm.namePlaceholder")}
            className="input"
          />
        </div>

        <div className="field">
          <label htmlFor="ex-unit">{t("bibliotekaForm.fieldUnit")}</label>
          <select id="ex-unit" name="unit" required defaultValue="REPS" className="select">
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
            placeholder={t("bibliotekaForm.descriptionPlaceholder")}
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
              {t("bibliotekaForm.rpeTitle")}
            </span>
            <span className="text-xs muted">{t("bibliotekaForm.rpeHint")}</span>
          </span>
        </label>

        <FileDropzone
          name="demo"
          idSuffix="new"
          kind="video"
          label={t("bibliotekaForm.demoLabel")}
          maxBytes={250_000_000}
        />

        {errorMsg != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {errorMsg}
          </p>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary">
            {t("bibliotekaForm.saveNew")}
          </button>
          <Link to="/marka/biblioteka" className="btn btn-ghost">
            {t("bibliotekaForm.cancel")}
          </Link>
        </div>
      </Form>
    </div>
  );
}
