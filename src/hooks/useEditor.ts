import { useCallback, useRef, useState } from "react";
import { loadPdfFile, makeId } from "../pdf/loader";
import type { PageRef, PdfSource } from "../pdf/types";
import {
  deletePages,
  extractPages,
  insertPages,
  movePage,
  rotatePages,
} from "../pdf/operations";
import { dropRenderDoc } from "../pdf/render";

export interface EditorState {
  sources: Map<string, PdfSource>;
  pages: PageRef[];
  selected: Set<string>;
}

/**
 * Central editor state + actions. Keeps the source registry and the working
 * page order; all PDF byte work lives in the ./pdf modules.
 */
export function useEditor() {
  const sourcesRef = useRef(new Map<string, PdfSource>());
  const [pages, setPages] = useState<PageRef[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [version, setVersion] = useState(0); // bumped when sources change

  const getSource = useCallback(
    (id: string) => sourcesRef.current.get(id),
    [],
  );

  /** Load files and append their pages. Returns the errors (if any) per file. */
  const addFiles = useCallback(async (files: File[]): Promise<unknown[]> => {
    const errors: unknown[] = [];
    const newPages: PageRef[] = [];
    for (const file of files) {
      try {
        const { source, pages: srcPages } = await loadPdfFile(file);
        sourcesRef.current.set(source.id, source);
        newPages.push(...srcPages);
      } catch (err) {
        errors.push(err);
      }
    }
    if (newPages.length > 0) {
      setPages((prev) => [...prev, ...newPages]);
      setVersion((v) => v + 1);
    }
    return errors;
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(pages.map((p) => p.id)));
  }, [pages]);

  /** Replace the selection with the given page ids. */
  const selectPages = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const pruneSelection = useCallback((nextPages: PageRef[]) => {
    const live = new Set(nextPages.map((p) => p.id));
    setSelected((prev) => new Set([...prev].filter((id) => live.has(id))));
  }, []);

  const deleteSelected = useCallback(() => {
    setPages((prev) => {
      const next = deletePages(prev, selected);
      return next;
    });
    setSelected(new Set());
  }, [selected]);

  const rotateSelected = useCallback(
    (delta: number) => {
      setPages((prev) => rotatePages(prev, selected, delta));
    },
    [selected],
  );

  const extractSelected = useCallback(() => {
    setPages((prev) => {
      const next = extractPages(prev, selected);
      pruneSelection(next);
      return next;
    });
  }, [selected, pruneSelection]);

  const reorder = useCallback((from: number, to: number) => {
    setPages((prev) => movePage(prev, from, to));
  }, []);

  /** Load another PDF and insert its pages after the given page index. */
  const insertFromFile = useCallback(
    async (file: File, afterIndex: number): Promise<unknown> => {
      try {
        const { source, pages: srcPages } = await loadPdfFile(file);
        sourcesRef.current.set(source.id, source);
        setPages((prev) => insertPages(prev, srcPages, afterIndex));
        setVersion((v) => v + 1);
        return null;
      } catch (err) {
        return err;
      }
    },
    [],
  );

  /**
   * Replace the entire working document with a single new source built from
   * raw bytes (used after overlay/compress so further edits stay consistent).
   */
  const replaceWithBytes = useCallback(
    (bytes: Uint8Array, name: string, pageCount: number) => {
      // Drop old render docs to free memory.
      for (const id of sourcesRef.current.keys()) dropRenderDoc(id);
      const id = makeId("src");
      const source: PdfSource = { id, name, bytes, pageCount };
      sourcesRef.current = new Map([[id, source]]);
      const newPages: PageRef[] = Array.from({ length: pageCount }, (_, i) => ({
        id: makeId("pg"),
        sourceId: id,
        pageIndex: i,
        rotation: 0,
      }));
      setPages(newPages);
      setSelected(new Set());
      setVersion((v) => v + 1);
    },
    [],
  );

  const reset = useCallback(() => {
    for (const id of sourcesRef.current.keys()) dropRenderDoc(id);
    sourcesRef.current = new Map();
    setPages([]);
    setSelected(new Set());
    setVersion((v) => v + 1);
  }, []);

  return {
    pages,
    selected,
    version,
    getSource,
    addFiles,
    toggleSelect,
    clearSelection,
    selectAll,
    selectPages,
    deleteSelected,
    rotateSelected,
    extractSelected,
    reorder,
    insertFromFile,
    replaceWithBytes,
    reset,
  };
}
