import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { Icons } from "~/components/icons";
import { PhotoCard } from "~/components/photo-card";
import { requireUser } from "~/lib/auth";
import {
  addBodyPhoto,
  BodyPhotoError,
  deleteBodyPhoto,
  listBodyPhotosForTrainee,
} from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import { signFileUrl } from "~/lib/files";
import { todayISO } from "~/lib/format";

const UploadSchema = z.object({
  view: z.enum(["front", "side", "back"]),
  takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || null),
});

const DELETE_ACTION_PATH = "/podopieczny/sylwetka";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const photos = await listBodyPhotosForTrainee(db, user.id);
  return {
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) return { error: "Konto bez przypisanego trenera." };
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "delete") {
    const photoId = String(fd.get("photoId") ?? "");
    if (!photoId) return { error: "Brak id zdjęcia." };
    try {
      await deleteBodyPhoto(db, photoId, user.id);
    } catch (e) {
      console.error("[sylwetka] delete failed:", e);
      return { error: "Nie udało się usunąć zdjęcia. Spróbuj ponownie." };
    }
    return { ok: true };
  }

  // Default: upload
  const parsed = UploadSchema.safeParse({
    view: fd.get("view"),
    takenOn: fd.get("takenOn"),
    note: fd.get("note") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Sprawdź pola formularza." };
  }
  const fileBlob = fd.get("photo");
  if (!(fileBlob instanceof File) || fileBlob.size === 0) {
    return { error: "Wybierz zdjęcie." };
  }
  try {
    await addBodyPhoto(db, {
      trainerId: user.trainerId,
      traineeId: user.id,
      file: fileBlob,
      view: parsed.data.view,
      takenOn: parsed.data.takenOn,
      note: parsed.data.note,
    });
  } catch (e) {
    if (e instanceof BodyPhotoError) return { error: e.userMessage };
    throw e;
  }
  return { ok: true };
}

export default function TraineeBodyGallery() {
  const { photos } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Sylwetka</h1>
          <div className="sub">Wrzucaj cotygodniowe zdjęcia. Trener je widzi.</div>
        </div>
      </div>

      <details
        open={photos.length === 0}
        className="card"
        style={{ padding: "12px 16px", marginBottom: 18 }}
      >
        <summary
          style={{
            cursor: "pointer",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 500,
          }}
        >
          <Icons.Plus />
          <span>Dodaj zdjęcie</span>
        </summary>
        <Form
          method="post"
          encType="multipart/form-data"
          style={{ display: "grid", gap: 14, marginTop: 16 }}
        >
          <div className="grid grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="bp-view">Ujęcie</label>
              <select id="bp-view" name="view" required defaultValue="front" className="select">
                <option value="front">Przód</option>
                <option value="side">Bok</option>
                <option value="back">Tył</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="bp-date">Data</label>
              <input
                id="bp-date"
                name="takenOn"
                type="date"
                required
                defaultValue={todayISO()}
                className="input"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="bp-note">Notatka (opcjonalna)</label>
            <input
              id="bp-note"
              name="note"
              type="text"
              maxLength={500}
              placeholder="np. waga 72.4 kg, energia 8/10"
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="bp-file">Zdjęcie (jpg/png/webp)</label>
            <input
              id="bp-file"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              required
              className="input-file"
            />
          </div>
          {actionData?.error != null && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {actionData.error}
            </p>
          )}
          <div>
            <button type="submit" className="btn btn-primary">
              <Icons.Upload /> Dodaj zdjęcie
            </button>
          </div>
        </Form>
      </details>

      {photos.length === 0 ? (
        <div className="empty">
          <h3>Brak zdjęć</h3>
          <div>Dodaj pierwsze powyżej.</div>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((p) => (
            <PhotoCard
              key={p.id}
              id={p.id}
              url={p.url}
              takenOn={p.takenOn}
              view={p.view}
              note={p.note}
              canDelete
              deleteAction={DELETE_ACTION_PATH}
            />
          ))}
        </div>
      )}
    </div>
  );
}
