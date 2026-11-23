import { useEffect, useState } from "react";
import styles from "../App.module.css";
import type { PageRef, PdfSource } from "../pdf/types";
import { getRenderDoc, renderPageThumbnail } from "../pdf/render";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

interface Props {
  page: PageRef;
  index: number;
  source: PdfSource | undefined;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onToggle: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function PageThumbnail({
  page,
  index,
  source,
  selected,
  dragging,
  dropTarget,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const { t } = useI18n();
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

  const label = t("thumb.alt", { n: index + 1 });

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-label={label}
      tabIndex={0}
      className={[
        styles.thumb,
        selected ? styles.selected : "",
        dragging ? styles.dragging : "",
        dropTarget ? styles.dropTarget : "",
      ].join(" ")}
      draggable
      onClick={() => onToggle(page.id)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
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
      onDragEnd={onDragEnd}
      title={t("toolbar.hint")}
    >
      <div className={styles.thumbSheet}>
        {failed ? (
          <div className={styles.thumbLoading}>{t("thumb.failed")}</div>
        ) : dataUrl ? (
          <img src={dataUrl} alt={label} draggable={false} />
        ) : (
          <div className={styles.thumbLoading}>
            <span className={styles.shimmer} />
            {t("thumb.rendering")}
          </div>
        )}
      </div>
      <span className={styles.check} aria-hidden="true">
        {selected && <Icon name="check" size={13} />}
      </span>
      <div className={styles.thumbMeta}>
        <span>{index + 1}</span>
        {page.rotation !== 0 && (
          <span className={styles.rotationTag}>{page.rotation}°</span>
        )}
      </div>
    </div>
  );
}
