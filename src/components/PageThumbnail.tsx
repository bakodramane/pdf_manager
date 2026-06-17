import { useEffect, useState } from "react";
import styles from "../App.module.css";
import type { PageRef, PdfSource } from "../pdf/types";
import { getRenderDoc, renderPageThumbnail } from "../pdf/render";

interface Props {
  page: PageRef;
  index: number;
  pageCount: number;
  source: PdfSource | undefined;
  selected: boolean;
  dragging: boolean;
  onToggle: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
}

export function PageThumbnail({
  page,
  index,
  pageCount,
  source,
  selected,
  dragging,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    if (!source) return;
    (async () => {
      try {
        const doc = await getRenderDoc(source.id, source.bytes);
        const url = await renderPageThumbnail(doc, page.pageIndex, page.rotation);
        if (!cancelled) setDataUrl(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, page.pageIndex, page.rotation]);

  return (
    <div
      className={[
        styles.thumb,
        selected ? styles.selected : "",
        dragging ? styles.dragging : "",
      ].join(" ")}
      draggable
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Page ${index + 1}${selected ? ", selected" : ""}`}
      onClick={() => onToggle(page.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(page.id);
        }
      }}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      title="Click to select · drag to reorder"
    >
      {selected && <div className={styles.check}>✓</div>}
      <div className={styles.thumbControls} aria-label={`Move page ${index + 1}`}>
        <button
          type="button"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp(index);
          }}
          aria-label={`Move page ${index + 1} up`}
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={index === pageCount - 1}
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown(index);
          }}
          aria-label={`Move page ${index + 1} down`}
          title="Move down"
        >
          ↓
        </button>
      </div>
      {failed ? (
        <div className={styles.thumbLoading}>⚠ render failed</div>
      ) : dataUrl ? (
        <img src={dataUrl} alt={`Page ${index + 1}`} />
      ) : (
        <div className={styles.thumbLoading}>rendering…</div>
      )}
      <div className={styles.thumbMeta}>
        <span>#{index + 1}</span>
        {page.rotation !== 0 && <span>{page.rotation}°</span>}
      </div>
    </div>
  );
}
