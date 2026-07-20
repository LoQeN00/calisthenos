import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { SideBySideSection, type ResolvedPair } from "~/components/body-photo-compare";
import { FileDropzone } from "~/components/file-dropzone";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Modal } from "~/components/modal";
import { Pagination, parsePage } from "~/components/pagination";
import { PhotoCard } from "~/components/photo-card";
import { PhotoLightbox, type LightboxPhoto } from "~/components/photo-lightbox";
import { requireUser } from "~/lib/auth";
import {
  addBodyPhoto,
  BodyPhotoError,
  countBodyPhotosForTrainee,
  deleteBodyPhoto,
  listBodyPhotosForTrainee,
} from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import type { BodyPhotoView } from "~/lib/db/schema";
import { signFileUrl } from "~/lib/files";
import { todayISO } from "~/lib/format";
import { errorMeta, logger } from "~/lib/logger";
import { type ListControlsSpec, parseListControls } from "~/lib/list-params";
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

const PAGE_SIZE = 60;

const SYLWETKA_SPEC_BASE: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "" },
    { key: "oldest", label: "" },
  ],
  defaultSort: "newest",
  filterGroups: [],
  searchable: false,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);

  const controls = parseListControls(url.searchParams, SYLWETKA_SPEC_BASE);

  const total = await countBodyPhotosForTrainee(db, user.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const [photos, pairs] = await Promise.all([
    listBodyPhotosForTrainee(db, user.id, {
      limit: PAGE_SIZE,
      offset,
      sort: controls.sort as "newest" | "oldest",
    }),
    getSideBySidePhotoPairs(db, user.id),
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

  return {
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
    page: safePage,
    totalPages,
    total,
    resolvedPairs,
    controls,
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) return { errorKey: "sylwetka.errors.noTrainer" as const };
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "delete") {
    const photoId = String(fd.get("photoId") ?? "");
    if (!photoId) return { errorKey: "sylwetka.errors.noPhotoId" as const };
    try {
      await deleteBodyPhoto(db, photoId, user.id);
    } catch (e) {
      logger.error("body_photo.delete_failed", errorMeta(e));
      return { errorKey: "sylwetka.errors.deleteFailed" as const };
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
    return { errorKey: "sylwetka.errors.formInvalid" as const };
  }
  const fileBlob = fd.get("photo");
  if (!(fileBlob instanceof File) || fileBlob.size === 0) {
    return { errorKey: "sylwetka.errors.noFile" as const };
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
    if (e instanceof BodyPhotoError)
      return { errorKey: "sylwetka.errors.formInvalid" as const, errorMessage: e.userMessage };
    throw e;
  }
  return { ok: true };
}

type ViewFilter = "all" | BodyPhotoView;

export default function TraineeBodyGallery() {
  const { photos, page, totalPages, total, resolvedPairs, controls } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("podopieczny");
  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const uploadOk = actionData != null && "ok" in actionData && actionData.ok === true;
  useEffect(() => {
    if (uploadOk) {
      setShowAddModal(false);
      // Close lightbox after delete so we don't show a stale photo on the
      // refreshed list.
      setLightboxId(null);
    }
  }, [uploadOk]);

  const sylwetkaSpec: ListControlsSpec = {
    ...SYLWETKA_SPEC_BASE,
    sortOptions: [
      { key: "newest", label: t("sylwetka.sortOptions.newest") },
      { key: "oldest", label: t("sylwetka.sortOptions.oldest") },
    ],
  };

  const counts = useMemo(() => countByView(photos), [photos]);
  const filteredPhotos = useMemo(
    () => (filter === "all" ? photos : photos.filter((p) => p.view === filter)),
    [photos, filter],
  );

  // Lightbox navigation is always scoped to the clicked photo's VIEW (so
  // tapping a "tył" photo lets you swipe through other "tył" photos, even if
  // the gallery filter is "Wszystkie"). The filter only controls what's
  // visible in the grid.
  const activeLightboxPhotos: LightboxPhoto[] = useMemo(() => {
    if (lightboxId == null) return [];
    const opened = photos.find((p) => p.id === lightboxId);
    if (!opened) return [];
    return photos
      .filter((p) => p.view === opened.view)
      .map((p) => ({
        id: p.id,
        url: p.url,
        view: p.view,
        takenOn: p.takenOn,
        note: p.note,
        mimeType: p.mimeType,
      }));
  }, [lightboxId, photos]);

  const groups = useMemo(
    () => groupByMonth(filteredPhotos, i18n.language),
    [filteredPhotos, i18n.language],
  );

  const errorMsg =
    actionData != null && "errorKey" in actionData && actionData.errorKey != null
      ? "errorMessage" in actionData && actionData.errorMessage
        ? actionData.errorMessage
        : t(actionData.errorKey)
      : null;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("sylwetka.eyebrow")}
          </div>
          <h1>{t("sylwetka.title")}</h1>
          <div className="sub">{t("sylwetka.subtitle")}</div>
        </div>
        <button type="button" onClick={() => setShowAddModal(true)} className="btn btn-primary">
          <Icons.Plus /> {t("sylwetka.addBtn")}
        </button>
      </div>

      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t("sylwetka.modalTitle")}
      >
        <Form method="post" encType="multipart/form-data">
          <div className="modal-body">
            <div className="grid grid-2" style={{ gap: 14 }}>
              <div className="field">
                <label htmlFor="bp-view">{t("sylwetka.fieldView")}</label>
                <select id="bp-view" name="view" required defaultValue="front" className="select">
                  <option value="front">{t("sylwetka.viewFront")}</option>
                  <option value="side">{t("sylwetka.viewSide")}</option>
                  <option value="back">{t("sylwetka.viewBack")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="bp-date">{t("sylwetka.fieldDate")}</label>
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
              <label htmlFor="bp-note">{t("sylwetka.fieldNote")}</label>
              <input
                id="bp-note"
                name="note"
                type="text"
                maxLength={500}
                placeholder={t("sylwetka.notePlaceholder")}
                className="input"
              />
            </div>
            <FileDropzone
              name="photo"
              kind="image"
              label={t("sylwetka.fieldPhoto")}
              required
              capture
              maxBytes={250_000_000}
            />
            {errorMsg != null && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
                {errorMsg}
              </p>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-ghost">
              {t("sylwetka.cancelBtn")}
            </button>
            <button type="submit" className="btn btn-primary">
              <Icons.Upload /> {t("sylwetka.uploadBtn")}
            </button>
          </div>
        </Form>
      </Modal>

      {total === 0 ? (
        <div className="empty">
          <h3>{t("sylwetka.empty.title")}</h3>
          <div>{t("sylwetka.empty.subtitle")}</div>
        </div>
      ) : (
        <>
          <ListControls spec={sylwetkaSpec} state={controls} />

          <SideBySideSection pairs={resolvedPairs} onOpenPhoto={setLightboxId} />

          <FilterTabs filter={filter} setFilter={setFilter} counts={counts} t={t} />

          {filteredPhotos.length === 0 ? (
            <div className="empty" style={{ marginTop: 12 }}>
              <h3>{t("sylwetka.emptyView.title")}</h3>
              <div>{t("sylwetka.emptyView.subtitle")}</div>
            </div>
          ) : (
            <PhotoGrid groups={groups} onOpenPhoto={setLightboxId} />
          )}

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            totalLabel={t("sylwetka.totalLabel", { count: total })}
          />
        </>
      )}

      <PhotoLightbox
        photos={activeLightboxPhotos}
        currentId={lightboxId}
        onClose={() => setLightboxId(null)}
        onNavigate={setLightboxId}
        deleteAction={DELETE_ACTION_PATH}
      />
    </div>
  );
}

// ============================================================
// Filter tabs
// ============================================================

function FilterTabs({
  filter,
  setFilter,
  counts,
  t,
}: {
  filter: ViewFilter;
  setFilter: (f: ViewFilter) => void;
  counts: Record<ViewFilter, number>;
  // biome-ignore lint/suspicious/noExplicitAny: TFunction overloads are complex; narrow to what we need
  t: (...args: any[]) => string;
}) {
  const TABS: Array<{ key: ViewFilter; label: string }> = [
    { key: "all", label: t("sylwetka.filterAll") },
    { key: "front", label: t("sylwetka.filterFront") },
    { key: "side", label: t("sylwetka.filterSide") },
    { key: "back", label: t("sylwetka.filterBack") },
  ];
  return (
    <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
      {TABS.map((tab) => {
        const isActive = filter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={isActive ? "btn btn-sm btn-dark" : "btn btn-sm"}
          >
            {tab.label}
            <span
              className="mono"
              style={{
                marginLeft: 8,
                fontSize: 10,
                opacity: 0.7,
              }}
            >
              {counts[tab.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Grid grouped by month
// ============================================================

interface PhotoGroup {
  label: string;
  photos: Array<{
    id: string;
    url: string;
    takenOn: string;
    view: BodyPhotoView;
    note: string | null;
  }>;
}

function PhotoGrid({
  groups,
  onOpenPhoto,
}: {
  groups: PhotoGroup[];
  onOpenPhoto: (id: string) => void;
}) {
  return (
    <div className="col" style={{ gap: 18 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {g.label} · {g.photos.length}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            {g.photos.map((p) => (
              <PhotoCard
                key={p.id}
                id={p.id}
                url={p.url}
                takenOn={p.takenOn}
                view={p.view}
                note={p.note}
                onOpen={onOpenPhoto}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function countByView(photos: Array<{ view: BodyPhotoView }>): Record<ViewFilter, number> {
  const out: Record<ViewFilter, number> = {
    all: photos.length,
    front: 0,
    side: 0,
    back: 0,
  };
  for (const p of photos) {
    out[p.view] += 1;
  }
  return out;
}

function groupByMonth<
  T extends { id: string; url: string; takenOn: string; view: BodyPhotoView; note: string | null },
>(photos: T[], lang = "pl"): PhotoGroup[] {
  // Arrives pre-sorted by takenOn from the loader (kierunek zależny od ?sort=); grupowanie zachowuje tę kolejność.
  const groups = new Map<string, PhotoGroup>();
  const order: string[] = [];
  const monthFmt = new Intl.DateTimeFormat(lang, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  for (const p of photos) {
    const d = new Date(p.takenOn);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const label = monthFmt.format(d);
    let g = groups.get(key);
    if (!g) {
      g = { label, photos: [] };
      groups.set(key, g);
      order.push(key);
    }
    g.photos.push({
      id: p.id,
      url: p.url,
      takenOn: p.takenOn,
      view: p.view,
      note: p.note,
    });
  }
  return order.map((k) => groups.get(k)!);
}
