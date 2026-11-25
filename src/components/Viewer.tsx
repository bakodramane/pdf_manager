import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnnotationMode, TextLayer } from "pdfjs-dist";
import styles from "./Viewer.module.css";
import { Icon, type IconName } from "./Icon";
import { useI18n } from "../i18n";
import type { useEditor } from "../hooks/useEditor";
import type {
  Annotation,
  FieldValue,
  FontFamily,
  ImageAnnotation,
  PageRef,
  PdfSource,
  TextAnnotation,
} from "../pdf/types";
import {
  CSS_FONT,
  LINE_HEIGHT,
  resizeImage,
  rotateVec,
} from "../pdf/annotations";
import {
  cachedPageBox,
  getFormWidgets,
  getPageBox,
  loadPage,
  type FormWidget,
  type PageBox,
} from "../pdf/pageInfo";
import { OFF } from "../pdf/forms";
import {
  DEFAULT_STRENGTH,
  FULL_CROP,
  MAX_STRENGTH,
  MIN_STRENGTH,
  reframe,
  removeBackground,
} from "../pdf/background";
import { decodeRaster, encodePng, imageUrl, readImage } from "./imageTools";
import { LIMITS } from "../pdf/limits";
import { makeId } from "../pdf/loader";
import { AppError } from "../pdf/errors";

type EditorApi = ReturnType<typeof useEditor>;

/** A fixed zoom (1 = 100 %, actual size) or a fit mode. */
export type Zoom = number | "width" | "page";

export interface ViewerHandle {
  zoomIn(): void;
  zoomOut(): void;
  zoomReset(): void;
  /** Next click on a page places a text box. */
  startText(): void;
  /** Open the image picker; the image lands on the current page. */
  pickImage(): void;
  placeImage(file: File): Promise<void>;
}

interface ViewerProps {
  editor: EditorApi;
  zoom: Zoom;
  onZoomChange: (zoom: Zoom) => void;
  /** Page to show first (by page id). */
  startPageId: string | null;
  onCurrentPage: (pageId: string) => void;
  onError: (text: string) => void;
  /** Grid/document switch shown at the start of the toolbar. */
  viewSwitch: ReactNode;
}

type Tool = "select" | "text";
interface Selection {
  pageId: string;
  id: string;
}
type TextStyle = Pick<TextAnnotation, "size" | "font" | "bold" | "italic" | "color">;

/** CSS pixels per PDF point at 100 % (PDF uses 72 points per inch). */
const CSS_PER_PT = 96 / 72;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const PAD = 24; // around the pages, px
const GAP = 16; // between pages, px
/** Largest canvas rendered per page (pixels); beyond this it is upscaled. */
const MAX_CANVAS_PIXELS = LIMITS.maxRenderPixels;
const DEFAULT_BOX: PageBox = { x: 0, y: 0, width: 612, height: 792, rotate: 0 };
const DEFAULT_STYLE: TextStyle = {
  size: 14,
  font: "helvetica",
  bold: false,
  italic: false,
  color: "#111111",
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const totalRotation = (box: PageBox, page: PageRef) => (box.rotate + page.rotation) % 360;

export const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  { editor, zoom, onZoomChange, startPageId, onCurrentPage, onError, viewSwitch },
  ref,
) {
  const { t } = useI18n();
  const { pages, forms, getSource } = editor;
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pageEls = useRef(new Map<string, HTMLDivElement>());

  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [lockRatio, setLockRatio] = useState(true);
  const [textStyle, setTextStyle] = useState<TextStyle>(DEFAULT_STYLE);
  const [current, setCurrent] = useState(0);
  const [near, setNear] = useState<Set<string>>(new Set());
  const [viewport, setViewport] = useState({ width: 800, height: 600 });

  /* ---------------- page sizes ---------------- */

  const [boxVersion, setBoxVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const missing = pages.filter((p) => !cachedPageBox(p.sourceId, p.pageIndex));
    if (missing.length === 0) return;
    void Promise.all(
      missing.map((p) => {
        const src = getSource(p.sourceId);
        return src ? getPageBox(src, p.pageIndex).catch(() => null) : null;
      }),
    ).then(() => {
      if (!cancelled) setBoxVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [pages, getSource]);

  const boxes = useMemo(() => {
    void boxVersion; // re-read the cache once more sizes are known
    return pages.map((p) => cachedPageBox(p.sourceId, p.pageIndex) ?? DEFAULT_BOX);
  }, [pages, boxVersion]);

  /* ---------------- zoom ---------------- */

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewport({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Effective zoom factor (1 = 100 %). */
  const factor = useMemo(() => {
    if (typeof zoom === "number") return zoom;
    let maxW = 1;
    let maxH = 1;
    pages.forEach((p, i) => {
      const b = boxes[i];
      const turned = totalRotation(b, p) % 180 !== 0;
      maxW = Math.max(maxW, turned ? b.height : b.width);
      maxH = Math.max(maxH, turned ? b.width : b.height);
    });
    const byWidth = (viewport.width - 2 * PAD) / (maxW * CSS_PER_PT);
    const byPage = Math.min(byWidth, (viewport.height - 2 * PAD) / (maxH * CSS_PER_PT));
    return clamp(zoom === "width" ? byWidth : byPage, MIN_ZOOM, MAX_ZOOM);
  }, [zoom, pages, boxes, viewport]);
  const scale = factor * CSS_PER_PT;

  // Keep the point under the pointer (or the centre) still while zooming.
  const anchor = useRef<{ x: number; y: number; scale: number } | null>(null);
  const setZoomAround = useCallback(
    (next: Zoom, at?: { x: number; y: number }) => {
      const el = scrollRef.current;
      if (el) {
        anchor.current = {
          x: at?.x ?? el.clientWidth / 2,
          y: at?.y ?? el.clientHeight / 2,
          scale,
        };
      }
      onZoomChange(typeof next === "number" ? clamp(next, MIN_ZOOM, MAX_ZOOM) : next);
    },
    [scale, onZoomChange],
  );
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el || !a || a.scale === scale) return;
    const k = scale / a.scale;
    el.scrollLeft = (el.scrollLeft + a.x) * k - a.x;
    el.scrollTop = (el.scrollTop + a.y - PAD) * k + PAD - a.y;
  }, [scale]);

  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const next =
        dir > 0
          ? ZOOM_STEPS.find((z) => z > factor + 0.001) ?? MAX_ZOOM
          : [...ZOOM_STEPS].reverse().find((z) => z < factor - 0.001) ?? MIN_ZOOM;
      setZoomAround(next);
    },
    [factor, setZoomAround],
  );

  // Ctrl + wheel (and trackpad pinch) zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const next = factor * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
      setZoomAround(Math.round(next * 100) / 100, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [factor, setZoomAround]);

  /* ---------------- visibility & current page ---------------- */

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const id = (e.target as HTMLElement).dataset.pageId!;
            if (e.isIntersecting) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      },
      { root, rootMargin: "600px 0px" },
    );
    pageEls.current.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);

  const updateCurrent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // At the very bottom the last page counts as current even when it is
    // too short to reach the reading line.
    if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      setCurrent(pages.length - 1);
      return;
    }
    const line = el.scrollTop + el.clientHeight * 0.35;
    let index = 0;
    pages.forEach((p, i) => {
      const pe = pageEls.current.get(p.id);
      if (pe && pe.offsetTop <= line) index = i;
    });
    setCurrent(index);
  }, [pages]);
  useEffect(updateCurrent, [updateCurrent, scale]);

  const currentId = pages[Math.min(current, pages.length - 1)]?.id;
  useEffect(() => {
    if (currentId) onCurrentPage(currentId);
  }, [currentId, onCurrentPage]);

  const goTo = useCallback(
    (index: number) => {
      const p = pages[clamp(index, 0, pages.length - 1)];
      const el = p && pageEls.current.get(p.id);
      if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - PAD;
    },
    [pages],
  );

  // Open at the requested page once the layout exists.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    const i = pages.findIndex((p) => p.id === startPageId);
    if (i > 0) goTo(i);
  }, [pages, startPageId, goTo]);

  /* ---------------- annotations ---------------- */

  // Drop the selection when its annotation disappears (delete, undo, …).
  const selected = useMemo(() => {
    if (!selection) return null;
    const page = pages.find((p) => p.id === selection.pageId);
    const a = page?.annotations?.find((x) => x.id === selection.id);
    return page && a ? { page, annotation: a } : null;
  }, [selection, pages]);
  useEffect(() => {
    if (selection && !selected) {
      setSelection(null);
      setEditing(null);
    }
  }, [selection, selected]);

  const update = useCallback(
    (pageId: string, id: string, patch: Partial<Annotation>) =>
      editor.updateAnnotation(pageId, id, patch),
    [editor],
  );

  const updateText = (patch: Partial<TextStyle>) => {
    setTextStyle((s) => ({ ...s, ...patch }));
    if (selected?.annotation.kind === "text") {
      update(selected.page.id, selected.annotation.id, patch);
    }
  };

  const remove = useCallback(() => {
    if (!selected) return;
    editor.removeAnnotation(selected.page.id, selected.annotation.id);
    setSelection(null);
    setEditing(null);
  }, [editor, selected]);

  /**
   * Remove the selected image's background with the given strength, or put
   * the original image back (`null`). Always starts from the image as
   * imported; the frame shrinks to the signature (or grows back) without
   * moving the signature on the page. One undo step.
   */
  const [cleaning, setCleaning] = useState(false);
  const cleanImage = useCallback(
    async (strength: number | null) => {
      if (selected?.annotation.kind !== "image") return;
      const { page, annotation: a } = selected;
      const original = a.original ?? { bytes: a.bytes, mime: a.mime, url: a.url };
      const shown = a.cleanup?.crop ?? FULL_CROP;
      if (strength === null) {
        if (!a.original) return;
        update(page.id, a.id, {
          ...reframe(a, shown, FULL_CROP),
          ...original,
          original: undefined,
          cleanup: undefined,
        });
        return;
      }
      setCleaning(true);
      try {
        // Let the "Removing…" state paint before the pixel work starts.
        await new Promise((r) => setTimeout(r, 20));
        const raster = await decodeRaster(original.bytes, original.mime);
        // Faint signatures: fall back to the gentlest setting before giving up.
        let result = removeBackground(raster, strength);
        if (!result && strength > MIN_STRENGTH) {
          strength = MIN_STRENGTH;
          result = removeBackground(raster, strength);
        }
        if (!result) {
          onError(t("error.noSignature"));
          return;
        }
        const bytes = await encodePng(result.image);
        update(page.id, a.id, {
          ...reframe(a, shown, result.crop),
          bytes,
          mime: "image/png",
          url: imageUrl(bytes, "image/png"),
          original,
          cleanup: { strength, crop: result.crop },
        });
      } catch {
        onError(t("error.imageType"));
      } finally {
        setCleaning(false);
      }
    },
    [selected, update, onError, t],
  );

  const createText = (page: PageRef, box: PageBox, x: number, y: number) => {
    const angle = (360 - totalRotation(box, page)) % 360;
    const a: TextAnnotation = {
      id: makeId("ann"),
      kind: "text",
      x,
      y,
      angle,
      text: t("annotate.defaultText"),
      ...textStyle,
    };
    editor.addAnnotation(page.id, a);
    setSelection({ pageId: page.id, id: a.id });
    setEditing(a.id);
    setTool("select");
  };

  const placeImage = useCallback(
    async (file: File) => {
      const page = pages[current];
      const source = page && getSource(page.sourceId);
      if (!page || !source) return;
      try {
        const [img, box] = await Promise.all([readImage(file), getPageBox(source, page.pageIndex)]);
        const rot = totalRotation(box, page);
        const angle = (360 - rot) % 360;
        const shownWidth = rot % 180 ? box.height : box.width;
        const width = Math.min(shownWidth * 0.3, img.width * 0.75);
        const height = (width * img.height) / img.width;
        // Centre it on the page as seen on screen.
        const [hx, hy] = rotateVec(width / 2, height / 2, angle);
        const a: ImageAnnotation = {
          id: makeId("ann"),
          kind: "image",
          x: box.width / 2 - hx,
          y: box.height / 2 - hy,
          angle,
          width,
          height,
          bytes: img.bytes,
          mime: img.mime,
          url: imageUrl(img.bytes, img.mime),
        };
        editor.addAnnotation(page.id, a);
        setSelection({ pageId: page.id, id: a.id });
        setEditing(null);
        setTool("select");
      } catch (err) {
        onError(err instanceof AppError ? t(`error.${err.code}`) : t("error.imageType"));
      }
    },
    [pages, current, getSource, editor, onError, t],
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => stepZoom(1),
      zoomOut: () => stepZoom(-1),
      zoomReset: () => setZoomAround(1),
      startText: () => {
        setSelection(null);
        setEditing(null);
        setTool("text");
      },
      pickImage: () => fileRef.current?.click(),
      placeImage,
    }),
    [stepZoom, setZoomAround, placeImage],
  );

  // Keys for the selected annotation. Runs before the app's shortcuts
  // (capture phase) and marks handled keys, so Delete removes the
  // annotation rather than pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && (tool !== "select" || selection)) {
        setTool("select");
        setSelection(null);
        e.preventDefault();
        return;
      }
      if (!selected || e.ctrlKey || e.metaKey || e.altKey) return;
      const { page, annotation: a } = selected;
      if (e.key === "Delete" || e.key === "Backspace") {
        remove();
      } else if (e.key === "Enter" && a.kind === "text") {
        setEditing(a.id);
      } else if (e.key.startsWith("Arrow")) {
        const step = e.shiftKey ? 10 : 1;
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
          e.key
        ];
        if (!dir) return;
        const i = pages.indexOf(page);
        const [dx, dy] = rotateVec(dir[0] * step, dir[1] * step, -totalRotation(boxes[i], page));
        update(page.id, a.id, { x: a.x + dx, y: a.y + dy });
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tool, selection, selected, pages, boxes, remove, update]);

  /* ---------------- render ---------------- */

  const zoomLabel = `${Math.round(factor * 100)}%`;
  const zoomValue = typeof zoom === "number" ? String(zoom) : zoom;

  return (
    <div className={styles.viewer}>
      <div className={styles.toolbar}>
        {viewSwitch}
        <span className={styles.divider} />
        <div className={styles.group}>
          <ToolButton
            icon="chevronLeft"
            label={t("viewer.prevPage")}
            disabled={current <= 0}
            onClick={() => goTo(current - 1)}
          />
          <PageNumber current={current} count={pages.length} onGo={goTo} />
          <ToolButton
            icon="chevronRight"
            label={t("viewer.nextPage")}
            disabled={current >= pages.length - 1}
            onClick={() => goTo(current + 1)}
          />
        </div>
        <span className={styles.divider} />
        <div className={styles.group}>
          <ToolButton icon="zoomOut" label={t("viewer.zoomOut")} onClick={() => stepZoom(-1)} />
          <select
            className={styles.zoomSelect}
            aria-label={t("viewer.zoom")}
            value={ZOOM_STEPS.includes(zoom as number) || typeof zoom === "string" ? zoomValue : "custom"}
            onChange={(e) => {
              const v = e.target.value;
              setZoomAround(v === "width" || v === "page" ? v : Number(v));
            }}
          >
            {typeof zoom === "number" && !ZOOM_STEPS.includes(zoom) && (
              <option value="custom">{zoomLabel}</option>
            )}
            <option value="width">{t("viewer.fitWidth")}</option>
            <option value="page">{t("viewer.fitPage")}</option>
            {ZOOM_STEPS.map((z) => (
              <option key={z} value={String(z)}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <ToolButton icon="zoomIn" label={t("viewer.zoomIn")} onClick={() => stepZoom(1)} />
          <ToolButton
            icon="fitWidth"
            label={t("viewer.fitWidth")}
            active={zoom === "width"}
            onClick={() => setZoomAround("width")}
          />
        </div>
        <span className={styles.divider} />
        <div className={styles.group}>
          <ToolButton
            icon="pointer"
            label={t("viewer.select")}
            active={tool === "select"}
            onClick={() => setTool("select")}
          />
          <ToolButton
            icon="text"
            label={t("viewer.addText")}
            active={tool === "text"}
            onClick={() => {
              setSelection(null);
              setEditing(null);
              setTool(tool === "text" ? "select" : "text");
            }}
          />
          <ToolButton
            icon="signature"
            label={t("viewer.addImage")}
            onClick={() => fileRef.current?.click()}
          />
        </div>
        <span className={styles.zoomReadout}>{zoomLabel}</span>
      </div>

      {selected ? (
        <FormatBar
          annotation={selected.annotation}
          lockRatio={lockRatio}
          onLockRatio={setLockRatio}
          cleaning={cleaning}
          onCleanup={(strength) => void cleanImage(strength)}
          onText={updateText}
          onEdit={() => setEditing(selected.annotation.id)}
          onRemove={remove}
        />
      ) : (
        <div className={styles.hintBar}>
          <Icon name={tool === "text" ? "text" : "info"} size={14} />
          {tool === "text" ? t("viewer.hintText") : t("viewer.hint")}
        </div>
      )}

      <div
        ref={scrollRef}
        className={[styles.scroll, tool === "text" ? styles.placing : ""].join(" ")}
        onScroll={updateCurrent}
        onPointerDown={(e) => {
          // A click outside any annotation clears the selection.
          if (!(e.target as HTMLElement).closest("[data-annotation]")) {
            setSelection(null);
            if (editing) (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
      >
        <div className={styles.pages} style={{ padding: PAD, gap: GAP }}>
          {pages.map((page, i) => {
            const source = getSource(page.sourceId);
            return (
              <PageView
                key={page.id}
                ref={(el) => {
                  if (el) pageEls.current.set(page.id, el);
                  else pageEls.current.delete(page.id);
                }}
                page={page}
                index={i}
                source={source}
                box={boxes[i]}
                scale={scale}
                near={near.has(page.id)}
                tool={tool}
                selectedId={selection?.pageId === page.id ? selection.id : null}
                editingId={editing}
                lockRatio={lockRatio}
                values={forms[page.sourceId]}
                onPlaceText={(x, y) => createText(page, boxes[i], x, y)}
                onSelect={(id) => {
                  setSelection({ pageId: page.id, id });
                  if (editing !== id) setEditing(null);
                }}
                onChange={(id, patch) => update(page.id, id, patch)}
                onStartEdit={(id) => setEditing(id)}
                onEndEdit={(id, text) => {
                  setEditing(null);
                  const a = page.annotations?.find((x) => x.id === id);
                  if (!a || a.kind !== "text") return;
                  if (!text.trim()) editor.removeAnnotation(page.id, id);
                  else if (text !== a.text) update(page.id, id, { text });
                }}
                onFieldChange={(name, value) => editor.setFieldValue(page.sourceId, name, value)}
              />
            );
          })}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void placeImage(file);
          e.target.value = "";
        }}
      />
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Toolbar pieces                                                      */
/* ------------------------------------------------------------------ */

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={["icon", danger ? "danger" : "", active ? styles.active : ""].join(" ")}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function PageNumber({
  current,
  count,
  onGo,
}: {
  current: number;
  count: number;
  onGo: (index: number) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className={styles.pageNumber}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={t("viewer.pageNumber")}
        value={draft ?? String(current + 1)}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = parseInt(draft ?? "", 10);
            if (!Number.isNaN(n)) onGo(n - 1);
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <span>/ {count}</span>
    </span>
  );
}

const FONT_NAMES: Record<FontFamily, string> = {
  helvetica: "Helvetica",
  times: "Times",
  courier: "Courier",
};

function FormatBar({
  annotation: a,
  lockRatio,
  onLockRatio,
  cleaning,
  onCleanup,
  onText,
  onEdit,
  onRemove,
}: {
  annotation: Annotation;
  lockRatio: boolean;
  onLockRatio: (v: boolean) => void;
  /** Background removal is running. */
  cleaning: boolean;
  /** Remove the background at this strength, or restore the original (null). */
  onCleanup: (strength: number | null) => void;
  onText: (patch: Partial<TextStyle>) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [sizeDraft, setSizeDraft] = useState<string | null>(null);
  const commitSize = (value: string) => {
    const n = parseFloat(value);
    if (!Number.isNaN(n)) onText({ size: clamp(Math.round(n * 2) / 2, 4, 400) });
    setSizeDraft(null);
  };

  // The strength slider previews nothing by itself: the removal re-runs
  // once the slider rests, as one undo step.
  const [strengthDraft, setStrengthDraft] = useState<number | null>(null);
  const cleanupRef = useRef(onCleanup);
  cleanupRef.current = onCleanup;
  useEffect(() => {
    if (strengthDraft === null) return;
    const timer = setTimeout(() => {
      cleanupRef.current(strengthDraft);
      setStrengthDraft(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [strengthDraft]);
  const strength =
    strengthDraft ?? (a.kind === "image" ? a.cleanup?.strength : undefined) ?? DEFAULT_STRENGTH;

  return (
    <div className={styles.formatBar} data-annotation>
      {a.kind === "text" ? (
        <>
          <span className={styles.formatLabel}>{t("viewer.formatText")}</span>
          <select
            aria-label={t("annotate.font")}
            title={t("annotate.font")}
            value={a.font}
            onChange={(e) => onText({ font: e.target.value as FontFamily })}
          >
            {(Object.keys(FONT_NAMES) as FontFamily[]).map((f) => (
              <option key={f} value={f} style={{ fontFamily: CSS_FONT[f] }}>
                {FONT_NAMES[f]}
              </option>
            ))}
          </select>
          <div className={styles.group}>
            <ToolButton
              icon="minus"
              label={t("annotate.smaller")}
              onClick={() => onText({ size: Math.max(4, a.size - 1) })}
            />
            <input
              className={styles.sizeInput}
              type="text"
              inputMode="decimal"
              aria-label={t("annotate.fontSize")}
              title={t("annotate.fontSize")}
              value={sizeDraft ?? String(a.size)}
              onChange={(e) => setSizeDraft(e.target.value)}
              onBlur={(e) => commitSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSize(e.currentTarget.value);
              }}
            />
            <ToolButton
              icon="plus"
              label={t("annotate.larger")}
              onClick={() => onText({ size: Math.min(400, a.size + 1) })}
            />
          </div>
          <button
            className={["icon", styles.letter, a.bold ? styles.active : ""].join(" ")}
            aria-pressed={a.bold}
            aria-label={t("annotate.bold")}
            title={t("annotate.bold")}
            onClick={() => onText({ bold: !a.bold })}
          >
            <b>B</b>
          </button>
          <button
            className={["icon", styles.letter, a.italic ? styles.active : ""].join(" ")}
            aria-pressed={a.italic}
            aria-label={t("annotate.italic")}
            title={t("annotate.italic")}
            onClick={() => onText({ italic: !a.italic })}
          >
            <i>I</i>
          </button>
          <label className={styles.colour} title={t("annotate.colour")}>
            <input
              type="color"
              aria-label={t("annotate.colour")}
              value={a.color}
              onChange={(e) => onText({ color: e.target.value })}
            />
          </label>
          <button className="ghost" onClick={onEdit}>
            {t("annotate.editText")}
          </button>
        </>
      ) : (
        <>
          <span className={styles.formatLabel}>{t("viewer.formatImage")}</span>
          <button
            className={["ghost", lockRatio ? styles.active : ""].join(" ")}
            aria-pressed={lockRatio}
            onClick={() => onLockRatio(!lockRatio)}
          >
            <Icon name={lockRatio ? "lock" : "unlock"} size={16} />
            {t("annotate.keepRatio")}
          </button>
          <span className={styles.divider} />
          {!a.cleanup ? (
            <button disabled={cleaning} onClick={() => onCleanup(DEFAULT_STRENGTH)}>
              <Icon name="eraser" size={16} />
              {cleaning ? t("annotate.removingBackground") : t("annotate.removeBackground")}
            </button>
          ) : (
            <>
              <label className={styles.strength} title={t("annotate.strengthHint")}>
                <Icon name="eraser" size={16} />
                {t("annotate.strength")}
                <input
                  type="range"
                  min={MIN_STRENGTH}
                  max={MAX_STRENGTH}
                  step={1}
                  value={strength}
                  disabled={cleaning}
                  onChange={(e) => setStrengthDraft(Number(e.target.value))}
                />
                <output>{cleaning ? "…" : strength}</output>
              </label>
              <button className="ghost" disabled={cleaning} onClick={() => onCleanup(null)}>
                <Icon name="undo" size={16} />
                {t("annotate.restoreOriginal")}
              </button>
            </>
          )}
          <span
            className={styles.formatHint}
            title={a.cleanup ? t("annotate.strengthHint") : t("annotate.resizeHint")}
          >
            {a.cleanup ? t("annotate.strengthHint") : t("annotate.resizeHint")}
          </span>
        </>
      )}
      <span className={styles.spacer} />
      <ToolButton icon="trash" label={t("annotate.remove")} danger onClick={onRemove} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One page                                                            */
/* ------------------------------------------------------------------ */

interface PageViewProps {
  page: PageRef;
  index: number;
  source: PdfSource | undefined;
  box: PageBox;
  scale: number;
  near: boolean;
  tool: Tool;
  selectedId: string | null;
  editingId: string | null;
  lockRatio: boolean;
  values: Record<string, FieldValue> | undefined;
  onPlaceText: (x: number, y: number) => void;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Annotation>) => void;
  onStartEdit: (id: string) => void;
  onEndEdit: (id: string, text: string) => void;
  onFieldChange: (name: string, value: FieldValue) => void;
}

const PageView = forwardRef<HTMLDivElement, PageViewProps>(function PageView(props, ref) {
  const { t } = useI18n();
  const { page, index, source, box, scale, near, tool } = props;
  const rotation = totalRotation(box, page);
  const turned = rotation % 180 !== 0;
  const w = box.width * scale;
  const h = box.height * scale;
  const outerRef = useRef<HTMLDivElement | null>(null);

  /** Client point → page point (unrotated box, y down, points). */
  const toPage = (clientX: number, clientY: number) => {
    const r = outerRef.current!.getBoundingClientRect();
    const [u, v] = rotateVec(clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2), -rotation);
    return { x: (u + w / 2) / scale, y: (v + h / 2) / scale };
  };

  const sheetStyle = {
    width: w,
    height: h,
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    "--scale-factor": scale,
  } as CSSProperties;

  return (
    <div
      ref={(el) => {
        outerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={styles.page}
      data-page-id={page.id}
      style={{ width: turned ? h : w, height: turned ? w : h }}
      aria-label={t("thumb.alt", { n: index + 1 })}
    >
      <div className={styles.sheet} style={sheetStyle}>
        {near && source && (
          <>
            <CanvasLayer source={source} pageIndex={page.pageIndex} scale={scale} />
            <TextLayerView source={source} pageIndex={page.pageIndex} scale={scale} />
            <FormLayer
              source={source}
              pageIndex={page.pageIndex}
              box={box}
              scale={scale}
              values={props.values}
              onChange={props.onFieldChange}
            />
          </>
        )}
        <div
          className={[styles.annotationLayer, tool === "text" ? styles.placing : ""].join(" ")}
          onPointerDown={(e) => {
            if (tool !== "text" || e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const p = toPage(e.clientX, e.clientY);
            props.onPlaceText(p.x, p.y);
          }}
        >
          {(page.annotations ?? []).map((a) => (
            <AnnotationItem
              key={a.id}
              a={a}
              scale={scale}
              rotation={rotation}
              box={box}
              tool={tool}
              selected={props.selectedId === a.id}
              editing={props.editingId === a.id}
              lockRatio={props.lockRatio}
              onSelect={() => props.onSelect(a.id)}
              onChange={(patch) => props.onChange(a.id, patch)}
              onStartEdit={() => props.onStartEdit(a.id)}
              onEndEdit={(text) => props.onEndEdit(a.id, text)}
            />
          ))}
        </div>
      </div>
      {!near && <span className={styles.pageLabel}>{index + 1}</span>}
    </div>
  );
});

function CanvasLayer({
  source,
  pageIndex,
  scale,
}: {
  source: PdfSource;
  pageIndex: number;
  scale: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    // Wait for zooming to settle before re-rendering; the previous canvas
    // stays (stretched) meanwhile.
    const timer = setTimeout(async () => {
      try {
        const page = await loadPage(source, pageIndex);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1, rotation: 0 });
        let ratio = scale * (window.devicePixelRatio || 1);
        const pixels = base.width * base.height * ratio * ratio;
        if (pixels > MAX_CANVAS_PIXELS) ratio *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);
        const viewport = page.getViewport({ scale: ratio, rotation: 0 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const render = page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          // Fillable fields are drawn by the form layer instead.
          annotationMode: AnnotationMode.ENABLE_FORMS,
        });
        task = render;
        await render.promise;
        if (!cancelled) holder.current?.replaceChildren(canvas);
      } catch {
        // Cancelled or failed: keep whatever is shown.
      }
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [source, pageIndex, scale]);
  return <div ref={holder} className={styles.canvas} />;
}

/** Invisible, selectable text over the page (copy text like any viewer). */
function TextLayerView({
  source,
  pageIndex,
  scale,
}: {
  source: PdfSource;
  pageIndex: number;
  scale: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let layer: TextLayer | null = null;
    const timer = setTimeout(async () => {
      try {
        const page = await loadPage(source, pageIndex);
        const content = await page.getTextContent();
        if (cancelled || !holder.current) return;
        const div = document.createElement("div");
        div.className = "textLayer";
        layer = new TextLayer({
          textContentSource: content,
          container: div,
          viewport: page.getViewport({ scale, rotation: 0 }),
        });
        await layer.render();
        if (!cancelled) holder.current?.replaceChildren(div);
      } catch {
        // No selectable text for this page.
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      layer?.cancel();
    };
  }, [source, pageIndex, scale]);
  return <div ref={holder} className={styles.textHolder} />;
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

function FormLayer({
  source,
  pageIndex,
  box,
  scale,
  values,
  onChange,
}: {
  source: PdfSource;
  pageIndex: number;
  box: PageBox;
  scale: number;
  values: Record<string, FieldValue> | undefined;
  onChange: (name: string, value: FieldValue) => void;
}) {
  const [widgets, setWidgets] = useState<FormWidget[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getFormWidgets(source, pageIndex).then((list) => {
      if (!cancelled) setWidgets(list);
    });
    return () => {
      cancelled = true;
    };
  }, [source, pageIndex]);
  if (widgets.length === 0) return null;
  return (
    <div className={styles.formLayer}>
      {widgets.map((wd) => (
        <FormField
          key={wd.id}
          widget={wd}
          box={box}
          scale={scale}
          value={values?.[wd.name] ?? wd.initial}
          onChange={(v) => onChange(wd.name, v)}
        />
      ))}
    </div>
  );
}

function FormField({
  widget: wd,
  box,
  scale,
  value,
  onChange,
}: {
  widget: FormWidget;
  box: PageBox;
  scale: number;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  const [x1, y1, x2, y2] = wd.rect;
  const width = Math.abs(x2 - x1) * scale;
  const height = Math.abs(y2 - y1) * scale;
  const autoSize = wd.multiline ? 12 : Math.abs(y2 - y1) * 0.65;
  const style: CSSProperties = {
    left: (Math.min(x1, x2) - box.x) * scale,
    top: (box.y + box.height - Math.max(y1, y2)) * scale,
    width,
    height,
    fontSize: Math.max(4, (wd.fontSize || autoSize) * scale),
    textAlign: wd.align,
  };
  const [draft, setDraft] = useState<string | null>(null);
  const title = wd.name;

  if (wd.type === "checkbox" || wd.type === "radio") {
    const checked = value === wd.onValue;
    return (
      <button
        type="button"
        role={wd.type}
        aria-checked={checked}
        aria-label={title}
        title={title}
        disabled={wd.readOnly}
        className={[styles.field, styles.check, wd.type === "radio" ? styles.radio : ""].join(" ")}
        style={{ ...style, fontSize: Math.min(width, height) * 0.8 }}
        onClick={() => {
          if (wd.type === "radio") onChange(checked ? value : wd.onValue);
          else onChange(checked ? OFF : wd.onValue);
        }}
      >
        {checked && (wd.type === "radio" ? "●" : "✓")}
      </button>
    );
  }

  if (wd.type === "choice") {
    return (
      <select
        className={styles.field}
        style={style}
        title={title}
        aria-label={title}
        disabled={wd.readOnly}
        size={wd.combo ? undefined : Math.max(2, Math.floor(height / (style.fontSize as number) / 1.2))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {wd.combo && !wd.options.includes(value) && <option value={value}>{value}</option>}
        {wd.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  const common = {
    className: styles.field,
    style,
    title,
    "aria-label": title,
    readOnly: wd.readOnly,
    maxLength: wd.maxLen ?? undefined,
    value: draft ?? value,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      if (draft !== null && draft !== value) onChange(draft);
      setDraft(null);
    },
  };
  return wd.multiline ? (
    <textarea {...common} />
  ) : (
    <input
      type="text"
      {...common}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Annotations                                                         */
/* ------------------------------------------------------------------ */

const HANDLES: { sx: -1 | 0 | 1; sy: -1 | 0 | 1; cursor: string }[] = [
  { sx: -1, sy: -1, cursor: "nwse-resize" },
  { sx: 0, sy: -1, cursor: "ns-resize" },
  { sx: 1, sy: -1, cursor: "nesw-resize" },
  { sx: 1, sy: 0, cursor: "ew-resize" },
  { sx: 1, sy: 1, cursor: "nwse-resize" },
  { sx: 0, sy: 1, cursor: "ns-resize" },
  { sx: -1, sy: 1, cursor: "nesw-resize" },
  { sx: -1, sy: 0, cursor: "ew-resize" },
];

function AnnotationItem({
  a,
  scale,
  rotation,
  box,
  tool,
  selected,
  editing,
  lockRatio,
  onSelect,
  onChange,
  onStartEdit,
  onEndEdit,
}: {
  a: Annotation;
  scale: number;
  /** Rotation of the page on screen (degrees clockwise). */
  rotation: number;
  box: PageBox;
  tool: Tool;
  selected: boolean;
  editing: boolean;
  lockRatio: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Annotation>) => void;
  onStartEdit: () => void;
  onEndEdit: (text: string) => void;
}) {
  const { t } = useI18n();
  // Position/size while dragging; committed as one undo step on release.
  const [draft, setDraft] = useState<Partial<ImageAnnotation> | null>(null);
  const shown = (draft ? { ...a, ...draft } : a) as Annotation;

  const drag = (
    e: React.PointerEvent<HTMLElement>,
    handle: { sx: -1 | 0 | 1; sy: -1 | 0 | 1 } | null,
  ) => {
    if (e.button !== 0 || tool !== "select") return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const start = { x: e.clientX, y: e.clientY };
    let latest: Partial<ImageAnnotation> | null = null;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!latest && Math.hypot(dx, dy) < 3) return;
      if (!handle) {
        const [lx, ly] = rotateVec(dx, dy, -rotation);
        latest = {
          x: clamp(a.x + lx / scale, 0, box.width),
          y: clamp(a.y + ly / scale, 0, box.height),
        };
      } else if (a.kind === "image") {
        const [lx, ly] = rotateVec(dx, dy, -(rotation + a.angle));
        const keep = ev.shiftKey ? !lockRatio : lockRatio;
        latest = resizeImage(a, handle.sx, handle.sy, lx / scale, ly / scale, keep);
      }
      setDraft(latest);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      if (latest) onChange(latest);
      setDraft(null);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  const style: CSSProperties = {
    left: shown.x * scale,
    top: shown.y * scale,
    transform: shown.angle ? `rotate(${shown.angle}deg)` : undefined,
  };
  const className = [
    styles.annotation,
    selected ? styles.annotationSelected : "",
    tool === "select" ? "" : styles.inert,
  ].join(" ");

  if (shown.kind === "image") {
    return (
      <div
        data-annotation
        className={className}
        style={{ ...style, width: shown.width * scale, height: shown.height * scale }}
        title={t("annotate.imageTitle")}
        onPointerDown={(e) => drag(e, null)}
      >
        <img src={shown.url} alt="" draggable={false} />
        {selected &&
          HANDLES.map((hd) => (
            <span
              key={`${hd.sx},${hd.sy}`}
              className={styles.handle}
              style={{
                left: `${(hd.sx + 1) * 50}%`,
                top: `${(hd.sy + 1) * 50}%`,
                cursor: hd.cursor,
              }}
              onPointerDown={(e) => drag(e, hd)}
            />
          ))}
      </div>
    );
  }

  const textStyle: CSSProperties = {
    ...style,
    fontFamily: CSS_FONT[shown.font],
    fontSize: shown.size * scale,
    lineHeight: LINE_HEIGHT,
    fontWeight: shown.bold ? 700 : 400,
    fontStyle: shown.italic ? "italic" : "normal",
    color: shown.color,
  };
  if (editing) {
    return <TextEditor text={shown.text} style={textStyle} className={className} onDone={onEndEdit} />;
  }
  return (
    <div
      data-annotation
      className={className}
      style={textStyle}
      title={t("annotate.textTitle")}
      onPointerDown={(e) => drag(e, null)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      {shown.text}
    </div>
  );
}

/** In-place text editing (plain text; Enter adds a line, Esc finishes). */
function TextEditor({
  text,
  style,
  className,
  onDone,
}: {
  text: string;
  style: CSSProperties;
  className: string;
  onDone: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // Only on mount: the text is owned by the element while editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const finish = () => {
    if (done.current || !ref.current) return;
    done.current = true;
    onDone(ref.current.innerText.replace(/\n$/, ""));
  };
  return (
    <div
      ref={ref}
      data-annotation
      className={`${className} ${styles.editing}`}
      style={style}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          ref.current?.blur();
        }
      }}
    />
  );
}
