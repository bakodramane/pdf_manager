import { useEffect, useState } from "react";
import styles from "../App.module.css";
import type { PageRef, PdfSource } from "../pdf/types";
import { getRenderDoc, renderPageThumbnail } from "../pdf/render";

interface Props {
  page: PageRef;
  index: number;
  source: PdfSource | undefined;
  selected: boolean;
  dragging: boolean;
  onToggle: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
}

export function PageThumbnail({
  page,
  index,
  source,
  selected,
  dragging,
  onToggle,
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
      onClick={() => onToggle(page.id)}
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
