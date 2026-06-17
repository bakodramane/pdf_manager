import { useCallback, useMemo, useState } from "react";
import styles from "./App.module.css";
import { useEditor } from "./hooks/useEditor";
import { FileDrop } from "./components/FileDrop";
import { PageGrid } from "./components/PageGrid";
import { assemblePdf, deriveName, downloadBytes } from "./pdf/assemble";
import {
  AnnotatePanel,
  CompressPanel,
  ConvertPanel,
  ExportPanel,
  MergeSplitPanel,
  PagesPanel,
} from "./components/panels/EditorPanels";

type Tab = "pages" | "merge" | "annotate" | "compress" | "convert" | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "pages", label: "Pages" },
  { id: "merge", label: "Merge / Split" },
  { id: "annotate", label: "Annotate" },
  { id: "compress", label: "Compress" },
  { id: "convert", label: "Convert" },
  { id: "export", label: "Export" },
];

export default function App() {
  const editor = useEditor();
  const [tab, setTab] = useState<Tab>("pages");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { pages, selected, getSource } = editor;
  const baseName = useMemo(() => {
    const first = pages[0] && getSource(pages[0].sourceId);
    return first?.name ?? "document.pdf";
  }, [pages, getSource]);

  const run = useCallback(async (label: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  const handleAddFiles = useCallback(
    (files: File[]) =>
      run("Loading PDF...", async () => {
        const errs = await editor.addFiles(files);
        if (errs.length) setError(errs.join("\n"));
      }),
    [editor, run],
  );

  const assemble = useCallback(
    () => assemblePdf(pages, getSource),
    [pages, getSource],
  );

  const handleExport = useCallback(
    () =>
      run("Exporting...", async () => {
        const bytes = await assemble();
        downloadBytes(bytes, deriveName(baseName, "_edited"));
      }),
    [assemble, baseName, run],
  );

  const hasPages = pages.length > 0;
  const hasSelection = selected.size > 0;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h1>PDF Manager</h1>
          <span className={styles.badge}>100% local · no uploads</span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.muted} aria-live="polite">
            {hasPages ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : "no document"}
          </span>
          <button className="primary" disabled={!hasPages} onClick={handleExport}>
            Download
          </button>
          <button className="danger" disabled={!hasPages} onClick={editor.reset}>
            Reset
          </button>
        </div>
      </header>

      <div className={[styles.body, !hasPages ? styles.emptyBody : ""].join(" ")}>
        {hasPages && (
          <aside className={styles.sidebar} aria-label="PDF tools">
            <div className={styles.tabs} role="tablist" aria-label="Tool panels">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  className={[styles.tab, tab === t.id ? styles.active : ""].join(
                    " ",
                  )}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              id={`panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              className={styles.panel}
            >
              {tab === "pages" && (
                <PagesPanel editor={editor} onAddFiles={handleAddFiles} />
              )}
              {tab === "merge" && (
                <MergeSplitPanel
                  editor={editor}
                  run={run}
                  baseName={baseName}
                  onAddFiles={handleAddFiles}
                />
              )}
              {tab === "annotate" && (
                <AnnotatePanel
                  editor={editor}
                  run={run}
                  assemble={assemble}
                  baseName={baseName}
                  setError={setError}
                />
              )}
              {tab === "compress" && (
                <CompressPanel editor={editor} run={run} assemble={assemble} />
              )}
              {tab === "convert" && (
                <ConvertPanel
                  run={run}
                  assemble={assemble}
                  baseName={baseName}
                  hasPages={hasPages}
                />
              )}
              {tab === "export" && (
                <ExportPanel onExport={handleExport} hasPages={hasPages} />
              )}
            </div>
          </aside>
        )}

        <main className={styles.main}>
          {!hasPages ? (
            <div className={styles.empty}>
              <div className={styles.emptyIntro}>
                <h2>Start with a PDF</h2>
                <p>
                  Open one or more files to organize, annotate, compress,
                  convert, or export them locally in this browser.
                </p>
              </div>
              <FileDrop onFiles={handleAddFiles} variant="large" />
              <p className={styles.muted}>
                Everything runs on this device. Files are not uploaded.
              </p>
            </div>
          ) : (
            <>
              <SelectionToolbar
                selectedCount={selected.size}
                hasSelection={hasSelection}
                onSelectAll={editor.selectAll}
                onClear={editor.clearSelection}
                onRotateLeft={() => editor.rotateSelected(-90)}
                onRotateRight={() => editor.rotateSelected(90)}
                onExtract={editor.extractSelected}
                onDelete={editor.deleteSelected}
              />
              <PageGrid
                pages={pages}
                selected={selected}
                getSource={getSource}
                onToggle={editor.toggleSelect}
                onReorder={editor.reorder}
              />
            </>
          )}
        </main>
      </div>

      {busy && (
        <div className={styles.overlay} role="status" aria-live="assertive">
          <div className={styles.spinner} />
          <div>{busy}</div>
        </div>
      )}
      {error && (
        <button
          type="button"
          className={styles.toast}
          onClick={() => setError(null)}
          aria-label="Dismiss error"
        >
          {error}
          <span className={styles.toastHint}>Click to dismiss</span>
        </button>
      )}
    </div>
  );
}

function SelectionToolbar({
  selectedCount,
  hasSelection,
  onSelectAll,
  onClear,
  onRotateLeft,
  onRotateRight,
  onExtract,
  onDelete,
}: {
  selectedCount: number;
  hasSelection: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onExtract: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.actionBar} aria-label="Selected page actions">
      <div>
        <strong>{selectedCount}</strong>
        <span className={styles.muted}>
          {" "}
          page{selectedCount === 1 ? "" : "s"} selected
        </span>
      </div>
      <div className={styles.actionButtons}>
        <button onClick={onSelectAll}>Select all</button>
        <button disabled={!hasSelection} onClick={onClear}>
          Clear
        </button>
        <button disabled={!hasSelection} onClick={onRotateLeft} title="Rotate left">
          ⟲
        </button>
        <button disabled={!hasSelection} onClick={onRotateRight} title="Rotate right">
          ⟳
        </button>
        <button disabled={!hasSelection} onClick={onExtract}>
          Keep selected
        </button>
        <button className="danger" disabled={!hasSelection} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
