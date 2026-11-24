import { useRef, useState } from "react";
import styles from "../App.module.css";
import type { PageRef, PdfSource } from "../pdf/types";
import { PageThumbnail } from "./PageThumbnail";

interface Props {
  pages: PageRef[];
  selected: Set<string>;
  getSource: (id: string) => PdfSource | undefined;
  onToggle: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  /** Open a page in the document view (double-click). */
  onOpen: (pageId: string) => void;
}

export function PageGrid({
  pages,
  selected,
  getSource,
  onToggle,
  onReorder,
  onOpen,
}: Props) {
  const dragFrom = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const endDrag = () => {
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className={styles.grid}>
      {pages.map((page, index) => (
        <PageThumbnail
          key={page.id}
          page={page}
          index={index}
          source={getSource(page.sourceId)}
          selected={selected.has(page.id)}
          dragging={dragIndex === index}
          dropTarget={dragIndex !== null && overIndex === index && dragIndex !== index}
          onToggle={onToggle}
          onOpen={onOpen}
          onDragStart={(i) => {
            dragFrom.current = i;
            setDragIndex(i);
          }}
          onDragOver={(i) => setOverIndex(i)}
          onDrop={() => {
            const from = dragFrom.current;
            if (from !== null && overIndex !== null && from !== overIndex) {
              onReorder(from, overIndex);
            }
            endDrag();
          }}
          onDragEnd={endDrag}
        />
      ))}
    </div>
  );
}
