import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from "./history";

/** Two page lists are the same edit state if they hold the same refs in order. */
function samePages(a: PageRef[], b: PageRef[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

/**
 * Central editor state + actions, with undo/redo.
 *
 * The document is an ordered list of page references; every edit pushes a
 * new list onto the history. Loaded source PDFs live in a registry keyed by
 * id. Sources stay registered while any undo/redo step still uses them, and
 * are released (bytes and PDF.js render cache) once none does.
 */
export function useEditor() {
  const sourcesRef = useRef(new Map<string, PdfSource>());
  const [history, setHistory] = useState<History<PageRef[]>>(() => createHistory([]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pages = history.present;

  const getSource = useCallback((id: string) => sourcesRef.current.get(id), []);

  /** Apply an edit to the page list as one undoable step. */
  const commit = useCallback((edit: (prev: PageRef[]) => PageRef[]) => {
    setHistory((h) => pushHistory(h, edit(h.present), samePages));
  }, []);

  // Keep the selection limited to pages that exist after any change
  // (including undo/redo).
  useEffect(() => {
    const live = new Set(pages.map((p) => p.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pages]);

  // Release sources no history step refers to, and the render cache of
  // sources not on screen (it is rebuilt on demand after an undo).
  useEffect(() => {
    const onScreen = new Set(history.present.map((p) => p.sourceId));
    const used = new Set(onScreen);
    for (const step of [...history.past, ...history.future]) {
      for (const p of step) used.add(p.sourceId);
    }
    for (const id of [...sourcesRef.current.keys()]) {
      if (!onScreen.has(id)) dropRenderDoc(id);
      if (!used.has(id)) sourcesRef.current.delete(id);
    }
  }, [history]);

  /** Load files and append their pages. Returns the errors (if any) per file. */
  const addFiles = useCallback(
    async (files: File[]): Promise<unknown[]> => {
      const errors: unknown[] = [];
      const loaded: { source: PdfSource; pages: PageRef[] }[] = [];
      for (const file of files) {
        try {
          loaded.push(await loadPdfFile(file));
        } catch (err) {
          errors.push(err);
        }
      }
      if (loaded.length > 0) {
        // Register and commit in one synchronous step, so the clean-up effect
        // never sees a registered source that no page refers to yet.
        for (const { source } of loaded) sourcesRef.current.set(source.id, source);
        const newPages = loaded.flatMap((l) => l.pages);
        commit((prev) => [...prev, ...newPages]);
      }
      return errors;
    },
    [commit],
  );

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

  const deleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    commit((prev) => deletePages(prev, selected));
    setSelected(new Set());
  }, [selected, commit]);

  const rotateSelected = useCallback(
    (delta: number) => {
      if (selected.size === 0) return;
      commit((prev) => rotatePages(prev, selected, delta));
    },
    [selected, commit],
  );

  /** Keep only the selected pages. */
  const extractSelected = useCallback(() => {
    if (selected.size === 0) return;
    commit((prev) => extractPages(prev, selected));
  }, [selected, commit]);

  const reorder = useCallback(
    (from: number, to: number) => commit((prev) => movePage(prev, from, to)),
    [commit],
  );

  /** Load another PDF and insert its pages after the given page index. */
  const insertFromFile = useCallback(
    async (file: File, afterIndex: number): Promise<unknown> => {
      try {
        const { source, pages: srcPages } = await loadPdfFile(file);
        sourcesRef.current.set(source.id, source);
        commit((prev) => insertPages(prev, srcPages, afterIndex));
        return null;
      } catch (err) {
        return err;
      }
    },
    [commit],
  );

  /**
   * Replace the working document with a single new source built from raw
   * bytes (used after annotate/compress so further edits stay consistent).
   * Undo brings the previous pages back.
   */
  const replaceWithBytes = useCallback(
    (bytes: Uint8Array, name: string, pageCount: number) => {
      const id = makeId("src");
      sourcesRef.current.set(id, { id, name, bytes, pageCount });
      const newPages: PageRef[] = Array.from({ length: pageCount }, (_, i) => ({
        id: makeId("pg"),
        sourceId: id,
        pageIndex: i,
        rotation: 0,
      }));
      commit(() => newPages);
      setSelected(new Set());
    },
    [commit],
  );

  const undo = useCallback(() => setHistory(undoHistory), []);
  const redo = useCallback(() => setHistory(redoHistory), []);

  /** Close the document: clears pages, history, and all loaded sources. */
  const reset = useCallback(() => {
    for (const id of sourcesRef.current.keys()) dropRenderDoc(id);
    sourcesRef.current = new Map();
    setHistory(createHistory([]));
    setSelected(new Set());
  }, []);

  return {
    pages,
    selected,
    getSource,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undo,
    redo,
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
