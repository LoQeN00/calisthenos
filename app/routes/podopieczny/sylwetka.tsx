import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import {
  SideBySideSection,
  TimelineSection,
  type ResolvedPair,
  type TimelineByView,
} from "~/components/body-photo-compare";
import { FileDropzone } from "~/components/file-dropzone";
import { Icons } from "~/components/icons";
import { Modal } from "~/components/modal";
import { Pagination, parsePage } from "~/components/pagination";
import { PhotoCard } from "~/components/photo-card";
import { requireUser } from "~/lib/auth";
import {
  addBodyPhoto,
  BodyPhotoError,
  countBodyPhotosForTrainee,
  deleteBodyPhoto,
  listBodyPhotosForTrainee,
} from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import { signFileUrl } from "~/lib/files";
import { todayISO } from "~/lib/format";
import { getSideBySidePhotoPairs } from "~/lib/stats";

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

const PAGE_SIZE = 24;

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  const total = await countBodyPhotosForTrainee(db, user.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const [photos, pairs, allPhotos] = await Promise.all([
    listBodyPhotosForTrainee(db, user.id, { limit: PAGE_SIZE, offset }),
    getSideBySidePhotoPairs(db, user.id),
    // For the timeline strip we want every photo — but cap at 500 so we don't
    // blow up the page if a trainee uploads daily for years.
    listBodyPhotosForTrainee(db, user.id, { limit: 500 }),
  ]);

  const resolvedPairs: ResolvedPair[] = pairs.map((p) => ({
    view: p.view,
    hasPair: p.hasPair,
    daysBetween: p.daysBetween,
    first: p.first
      ? {
          id: p.first.id,
          url: signFileUrl(p.first.fileId, user.id),
          takenOn: p.first.takenOn,
        }
      : null,
    latest: p.latest
      ? {
          id: p.latest.id,
          url: signFileUrl(p.latest.fileId, user.id),
          takenOn: p.latest.takenOn,
        }
      : null,
  }));

  const timelineRows: TimelineByView[] = (["front", "side", "back"] as const).map(
    (view) => ({
      view,
      photos: allPhotos
        .filter((p) => p.view === view)
        .sort((a, b) => (a.takenOn < b.takenOn ? -1 : 1))
        .map((p) => ({
          id: p.id,
          url: signFileUrl(p.fileId, user.id),
          takenOn: p.takenOn,
        })),
    }),
  );

  return {
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
    page: safePage,
    totalPages,
    total,
    resolvedPairs,
    timelineRows,
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
  const { photos, page, totalPages, total, resolvedPairs, timelineRows } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showAddModal, setShowAddModal] = useState(false);

  // Auto-close the modal after a successful upload so the trainee sees the
  // gallery update.
  const uploadOk = actionData != null && "ok" in actionData && actionData.ok === true;
  useEffect(() => {
    if (uploadOk) setShowAddModal(false);
  }, [uploadOk]);

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
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="btn btn-primary"
        >
          <Icons.Plus /> Dodaj zdjęcie
        </button>
      </div>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Dodaj zdjęcie sylwetki"
      >
        <Form method="post" encType="multipart/form-data">
          <div className="modal-body">
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
            <FileDropzone
              name="photo"
              kind="image"
              label="Zdjęcie"
              required
              capture
              maxBytes={250_000_000}
            />
            {actionData != null && "error" in actionData && actionData.error != null && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
                {actionData.error}
              </p>
            )}
          </div>
          <div className="modal-foot">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn btn-ghost"
            >
              Anuluj
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.Upload /> Dodaj zdjęcie
            </button>
          </div>
        </Form>
      </Modal>

      {total === 0 ? (
        <div className="empty">
          <h3>Brak zdjęć</h3>
          <div>Dodaj pierwsze powyżej.</div>
        </div>
      ) : (
        <>
          <SideBySideSection pairs={resolvedPairs} />
          <TimelineSection rows={timelineRows} />

          <h2 style={{ fontSize: 17, margin: "8px 0 12px" }}>Wszystkie zdjęcia</h2>
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
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            totalLabel={total === 1 ? "zdjęcie" : "zdjęć"}
          />
        </>
      )}
    </div>
  );
}
