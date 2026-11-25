import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdfFile, makeId, PdfValidationError, type LoadBudget } from "../pdf/loader";
import { LIMITS } from "../pdf/limits";
import type {
  Annotation,
  FieldValue,
  FormValues,
  PageRef,
  PdfSource,
} from "../pdf/types";
import {
  deletePages,
  extractPages,
  insertPages,
  movePage,
  rotatePages,
} from "../pdf/operations";
import { dropRenderDoc } from "../pdf/render";
import { dropPageInfo } from "../pdf/pageInfo";
import {
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from "./history";

/** One undoable state of the document. */
export interface DocState {
  pages: PageRef[];
  /** Form values entered by the user, per source file. */
  forms: FormValues;
}

const EMPTY: DocState = { pages: [], forms: {} };

/** Two page lists are the same edit state if they hold the same refs in order. */
function samePages(a: PageRef[], b: PageRef[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

function sameState(a: DocState, b: DocState): boolean {
  return a.forms === b.forms && samePages(a.pages, b.pages);
}

/** Apply `edit` to the annotations of the page with id `pageId`. */
function editAnnotations(
  pages: PageRef[],
  pageId: string,
  edit: (list: Annotation[]) => Annotation[],
): PageRef[] {
  return pages.map((p) => (p.id === pageId ? { ...p, annotations: edit(p.annotations ?? []) } : p));
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
  const [history, setHistory] = useState<History<DocState>>(() => createHistory(EMPTY));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { pages, forms } = history.present;

  const getSource = useCallback((id: string) => sourcesRef.current.get(id), []);

  /** Apply an edit to the page list as one undoable step. */
  const commit = useCallback((edit: (prev: PageRef[]) => PageRef[]) => {
    setHistory((h) =>
      pushHistory(h, { ...h.present, pages: edit(h.present.pages) }, sameState),
    );
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
    const onScreen = new Set(history.present.pages.map((p) => p.sourceId));
    const used = new Set(onScreen);
    for (const step of [...history.past, ...history.future]) {
      for (const p of step.pages) used.add(p.sourceId);
    }
    for (const id of [...sourcesRef.current.keys()]) {
      if (!onScreen.has(id)) dropRenderDoc(id);
      if (!used.has(id)) {
        sourcesRef.current.delete(id);
        dropPageInfo(id);
      }
    }
  }, [history]);

  /**
   * Memory already committed: bytes of every registered source (including
   * those kept alive by undo steps) and pages currently in the document.
   */
  const budget = useCallback((): LoadBudget => {
    let loadedBytes = 0;
    for (const s of sourcesRef.current.values()) loadedBytes += s.bytes.byteLength;
    return { loadedBytes, loadedPages: history.present.pages.length };
  }, [history.present.pages.length]);

  /**
   * Load files (one at a time, so memory stays bounded) and append their
   * pages. Returns the per-file errors and the sources that loaded.
   */
  const addFiles = useCallback(
    async (files: File[]): Promise<{ errors: unknown[]; loaded: PdfSource[] }> => {
      const errors: unknown[] = [];
      const loaded: { source: PdfSource; pages: PageRef[] }[] = [];
      if (files.length > LIMITS.maxFilesPerAdd) {
        errors.push(
          new PdfValidationError("tooManyFiles", `Too many files at once (max ${LIMITS.maxFilesPerAdd}).`, {
            max: LIMITS.maxFilesPerAdd,
          }),
        );
        return { errors, loaded: [] };
      }
      const running = budget();
      for (const file of files) {
        try {
          const result = await loadPdfFile(file, running);
          running.loadedBytes += result.source.bytes.byteLength;
          running.loadedPages += result.pages.length;
          loaded.push(result);
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
      return { errors, loaded: loaded.map((l) => l.source) };
    },
    [commit, budget],
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
    async (file: File, afterIndex: number): Promise<{ error: unknown; source?: PdfSource }> => {
      try {
        const { source, pages: srcPages } = await loadPdfFile(file, budget());
        sourcesRef.current.set(source.id, source);
        commit((prev) => insertPages(prev, srcPages, afterIndex));
        return { error: null, source };
      } catch (err) {
        return { error: err };
      }
    },
    [commit, budget],
  );

  /**
   * Replace the working document with a single new source built from raw
   * bytes (used after compress so further edits stay consistent).
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
      setHistory((h) => pushHistory(h, { pages: newPages, forms: {} }, sameState));
      setSelected(new Set());
    },
    [],
  );

  /** Add an annotation to a page. */
  const addAnnotation = useCallback(
    (pageId: string, annotation: Annotation) =>
      commit((prev) => editAnnotations(prev, pageId, (list) => [...list, annotation])),
    [commit],
  );

  /** Change some properties of an annotation (one undo step). */
  const updateAnnotation = useCallback(
    (pageId: string, id: string, patch: Partial<Annotation>) =>
      commit((prev) =>
        editAnnotations(prev, pageId, (list) =>
          list.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
        ),
      ),
    [commit],
  );

  const removeAnnotation = useCallback(
    (pageId: string, id: string) =>
      commit((prev) => editAnnotations(prev, pageId, (list) => list.filter((a) => a.id !== id))),
    [commit],
  );

  /** Set a form field's value (one undo step; no step if unchanged). */
  const setFieldValue = useCallback((sourceId: string, name: string, value: FieldValue) => {
    setHistory((h) => {
      const current = h.present.forms[sourceId] ?? {};
      if (current[name] === value) return h;
      const forms = { ...h.present.forms, [sourceId]: { ...current, [name]: value } };
      return pushHistory(h, { ...h.present, forms }, sameState);
    });
  }, []);

  const undo = useCallback(() => setHistory(undoHistory), []);
  const redo = useCallback(() => setHistory(redoHistory), []);

  /** Close the document: clears pages, history, and all loaded sources. */
  const reset = useCallback(() => {
    for (const id of sourcesRef.current.keys()) dropRenderDoc(id);
    sourcesRef.current = new Map();
    setHistory(createHistory(EMPTY));
    setSelected(new Set());
  }, []);

  return {
    pages,
    forms,
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
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    setFieldValue,
    reset,
  };
}
