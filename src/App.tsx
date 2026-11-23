import { useCallback, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import styles from "./App.module.css";
import { useEditor } from "./hooks/useEditor";
import { FileDrop } from "./components/FileDrop";
import { PageGrid } from "./components/PageGrid";
import { assemblePdf, deriveName, downloadBytes } from "./pdf/assemble";
import { splitIntoRanges } from "./pdf/operations";
import { compressPdf } from "./pdf/compress";
import { applyImageOverlay, applyTextOverlay } from "./pdf/overlay";
import { dropRenderDoc, getRenderDoc } from "./pdf/render";
import { pdfToDocx, pdfToXlsx } from "./pdf/convert";

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

  /** Run an async action with a global loading state + error capture. */
  const run = useCallback(
    async (
      label: string,
      fn: (setStatus: (status: string) => void) => Promise<void>,
    ) => {
      setError(null);
      setBusy(label);
      try {
        await fn((status) => setBusy(status));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleAddFiles = useCallback(
    (files: File[]) =>
      run("Loading PDF…", async () => {
        const errs = await editor.addFiles(files);
        if (errs.length) setError(errs.join("\n"));
      }),
    [editor, run],
  );

  /** Assemble current working order into bytes (shared by export/convert). */
  const assemble = useCallback(
    () => assemblePdf(pages, getSource),
    [pages, getSource],
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
        <div className={styles.row}>
          <span className={styles.muted}>
            {hasPages ? `${pages.length} page(s)` : "no document"}
          </span>
          <button className="danger" disabled={!hasPages} onClick={editor.reset}>
            Reset
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button
                key={t.id}
                className={[styles.tab, tab === t.id ? styles.active : ""].join(
                  " ",
                )}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "pages" && (
            <PagesPanel editor={editor} hasSelection={hasSelection} />
          )}
          {tab === "merge" && (
            <MergeSplitPanel editor={editor} run={run} baseName={baseName} />
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
            <ExportPanel
              run={run}
              assemble={assemble}
              baseName={baseName}
              hasPages={hasPages}
            />
          )}
        </aside>

        <main className={styles.main}>
          {!hasPages ? (
            <div className={styles.empty}>
              <FileDrop onFiles={handleAddFiles} />
              <p className={styles.muted}>
                Everything runs in your browser. Files never leave this device.
              </p>
            </div>
          ) : (
            <PageGrid
              pages={pages}
              selected={selected}
              getSource={getSource}
              onToggle={editor.toggleSelect}
              onReorder={editor.reorder}
            />
          )}
        </main>
      </div>

      {busy && (
        <div className={styles.overlay}>
          <div className={styles.spinner} />
          <div>{busy}</div>
        </div>
      )}
      {error && (
        <div className={styles.toast} onClick={() => setError(null)}>
          {error}
          <div className={styles.muted}>(click to dismiss)</div>
        </div>
      )}
    </div>
  );
}

type EditorApi = ReturnType<typeof useEditor>;
type RunFn = (
  label: string,
  fn: (setStatus: (status: string) => void) => Promise<void>,
) => Promise<void>;
type AssembleFn = () => Promise<Uint8Array>;

function PagesPanel({
  editor,
  hasSelection,
}: {
  editor: EditorApi;
  hasSelection: boolean;
}) {
  return (
    <>
      <div className={styles.section}>
        <h3>Add pages</h3>
        <FileDrop onFiles={(f) => editor.addFiles(f)} label="Add a PDF" />
        <p>New files are appended to the end. Drag thumbnails to reorder.</p>
      </div>
      <div className={styles.section}>
        <h3>Selection</h3>
        <div className={styles.row}>
          <button onClick={editor.selectAll}>Select all</button>
          <button onClick={editor.clearSelection}>Clear</button>
        </div>
      </div>
      <div className={styles.section}>
        <h3>Edit selected</h3>
        <div className={styles.row}>
          <button disabled={!hasSelection} onClick={() => editor.rotateSelected(-90)}>
            ⟲ Left
          </button>
          <button disabled={!hasSelection} onClick={() => editor.rotateSelected(90)}>
            ⟳ Right
          </button>
        </div>
        <div className={styles.row}>
          <button disabled={!hasSelection} onClick={editor.extractSelected}>
            Keep only selected
          </button>
          <button
            className="danger"
            disabled={!hasSelection}
            onClick={editor.deleteSelected}
          >
            Delete
          </button>
        </div>
        <p>Reorder by dragging pages in the grid.</p>
      </div>
    </>
  );
}

function MergeSplitPanel({
  editor,
  run,
  baseName,
}: {
  editor: EditorApi;
  run: RunFn;
  baseName: string;
}) {
  const [boundaries, setBoundaries] = useState("");

  const doSplit = () =>
    run("Splitting…", async () => {
      const nums = boundaries
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      const chunks = splitIntoRanges(editor.pages, nums);
      if (chunks.length <= 1) {
        throw new Error(
          "Provide at least one valid split point (e.g. 3, 7) inside the page range.",
        );
      }
      for (let i = 0; i < chunks.length; i++) {
        const bytes = await assemblePdf(chunks[i], editor.getSource);
        downloadBytes(bytes, deriveName(baseName, `_part${i + 1}`));
      }
    });

  return (
    <>
      <div className={styles.section}>
        <h3>Merge</h3>
        <FileDrop onFiles={(f) => editor.addFiles(f)} label="Add PDFs to merge" />
        <p>
          Added files are appended to the current document. Export from the
          Export tab to save the merged result.
        </p>
      </div>
      <div className={styles.section}>
        <h3>Split</h3>
        <label className={styles.field}>
          Split after page numbers (comma-separated)
          <input
            type="text"
            placeholder="e.g. 3, 7"
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!editor.pages.length} onClick={doSplit}>
          Split &amp; download parts
        </button>
        <p>Each part downloads as its own PDF.</p>
      </div>
      <InsertSection editor={editor} run={run} />
    </>
  );
}

function InsertSection({ editor, run }: { editor: EditorApi; run: RunFn }) {
  const [after, setAfter] = useState(0);
  return (
    <div className={styles.section}>
      <h3>Insert pages from another PDF</h3>
      <label className={styles.field}>
        Insert after page #
        <input
          type="number"
          min={0}
          max={editor.pages.length}
          value={after}
          onChange={(e) => setAfter(parseInt(e.target.value, 10) || 0)}
        />
      </label>
      <FileDrop
        multiple={false}
        label="Pick a PDF to insert"
        onFiles={(files) =>
          run("Inserting…", async () => {
            const err = await editor.insertFromFile(files[0], after - 1);
            if (err) throw new Error(err);
          })
        }
      />
      <p>Use 0 to insert at the very beginning.</p>
    </div>
  );
}

function AnnotatePanel({
  editor,
  run,
  assemble,
  baseName,
  setError,
}: {
  editor: EditorApi;
  run: RunFn;
  assemble: AssembleFn;
  baseName: string;
  setError: (s: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [x, setX] = useState(0.1);
  const [y, setY] = useState(0.1);
  const [size, setSize] = useState(24);

  const applyText = () =>
    run("Adding text…", async () => {
      if (!text.trim()) throw new Error("Enter some text first.");
      const bytes = await assemble();
      const out = await applyTextOverlay(bytes, {
        pageIndex: pageNo - 1,
        text,
        x,
        y,
        size,
      });
      editor.replaceWithBytes(out, deriveName(baseName, "_annotated"), editor.pages.length);
      setText("");
    });

  const applyImage = (files: File[]) =>
    run("Adding image…", async () => {
      const file = files[0];
      if (!/image\/(png|jpe?g)/.test(file.type)) {
        throw new Error("Use a PNG or JPG image.");
      }
      const imgBytes = new Uint8Array(await file.arrayBuffer());
      const bytes = await assemble();
      const out = await applyImageOverlay(bytes, {
        pageIndex: pageNo - 1,
        imageBytes: imgBytes,
        mime: file.type,
        x,
        y,
        widthFraction: 0.3,
      });
      editor.replaceWithBytes(out, deriveName(baseName, "_signed"), editor.pages.length);
    });

  const disabled = editor.pages.length === 0;

  return (
    <>
      <div className={styles.section}>
        <h3>Position</h3>
        <label className={styles.field}>
          Page #
          <input
            type="number"
            min={1}
            max={editor.pages.length}
            value={pageNo}
            onChange={(e) => setPageNo(parseInt(e.target.value, 10) || 1)}
          />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            X (0–1 from left)
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={x}
              onChange={(e) => setX(parseFloat(e.target.value) || 0)}
            />
          </label>
          <label className={styles.field}>
            Y (0–1 from top)
            <input
              type="number"
              step={0.05}
              min={0}
              max={1}
              value={y}
              onChange={(e) => setY(parseFloat(e.target.value) || 0)}
            />
          </label>
        </div>
      </div>
      <div className={styles.section}>
        <h3>Text annotation</h3>
        <label className={styles.field}>
          Text
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className={styles.field}>
          Font size
          <input
            type="number"
            min={6}
            max={144}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10) || 24)}
          />
        </label>
        <button className="primary" disabled={disabled} onClick={applyText}>
          Add text
        </button>
      </div>
      <div className={styles.section}>
        <h3>Signature / image</h3>
        <FileDrop
          multiple={false}
          accept="image/png,image/jpeg"
          label="Pick a PNG/JPG (30% page width)"
          onFiles={(f) => {
            if (disabled) {
              setError("Load a PDF first.");
              return;
            }
            applyImage(f);
          }}
        />
        <p>The image anchors at the X/Y position above.</p>
      </div>
    </>
  );
}

function CompressPanel({
  editor,
  run,
  assemble,
}: {
  editor: EditorApi;
  run: RunFn;
  assemble: AssembleFn;
}) {
  const [result, setResult] = useState<string | null>(null);
  const doCompress = () =>
    run("Compressing…", async () => {
      const before = await assemble();
      const after = await compressPdf(before);
      const pct = Math.max(0, Math.round((1 - after.length / before.length) * 100));
      editor.replaceWithBytes(after, "compressed.pdf", editor.pages.length);
      setResult(
        `Saved ${pct}% (${fmt(before.length)} → ${fmt(after.length)}). Export to download.`,
      );
    });
  return (
    <div className={styles.section}>
      <h3>Compress</h3>
      <button
        className="primary"
        disabled={editor.pages.length === 0}
        onClick={doCompress}
      >
        Compress document
      </button>
      {result && <p>{result}</p>}
      <p>
        Re-packs the PDF structure with object streams. Embedded images are not
        re-encoded, so gains vary — see the README.
      </p>
    </div>
  );
}

function ConvertPanel({
  run,
  assemble,
  baseName,
  hasPages,
}: {
  run: RunFn;
  assemble: AssembleFn;
  baseName: string;
  hasPages: boolean;
}) {
  /** Open a temporary PDF.js document, run `fn`, and always release it. */
  const withTempDoc = async <T,>(
    bytes: Uint8Array,
    fn: (doc: PDFDocumentProxy) => Promise<T>,
  ): Promise<T> => {
    const id = "convert-tmp-" + Date.now();
    try {
      return await fn(await getRenderDoc(id, bytes));
    } finally {
      dropRenderDoc(id);
    }
  };

  const toWord = () =>
    run("Converting to Word…", async (setStatus) => {
      const bytes = await assemble();
      const out = await withTempDoc(bytes, (doc) =>
        pdfToDocx(doc, (done, total) =>
          setStatus(`Converting to Word… page ${done} of ${total}`),
        ),
      );
      downloadBytes(
        out,
        deriveName(baseName, "", "docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

  const toExcel = () =>
    run("Converting to Excel…", async (setStatus) => {
      const bytes = await assemble();
      const out = await withTempDoc(bytes, (doc) =>
        pdfToXlsx(doc, (done, total) =>
          setStatus(`Converting to Excel… page ${done} of ${total}`),
        ),
      );
      downloadBytes(
        out,
        deriveName(baseName, "", "xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    });

  return (
    <div className={styles.section}>
      <h3>Convert</h3>
      <div className={styles.row}>
        <button className="primary" disabled={!hasPages} onClick={toWord}>
          PDF → Word
        </button>
        <button className="primary" disabled={!hasPages} onClick={toExcel}>
          PDF → Excel
        </button>
      </div>
      <p>
        Keeps headings, fonts, tables and images. Excel gets one sheet per page
        with numbers as real numbers. No OCR for scanned PDFs. See README.
      </p>
    </div>
  );
}

function ExportPanel({
  run,
  assemble,
  baseName,
  hasPages,
}: {
  run: RunFn;
  assemble: AssembleFn;
  baseName: string;
  hasPages: boolean;
}) {
  const doExport = () =>
    run("Exporting…", async () => {
      const bytes = await assemble();
      downloadBytes(bytes, deriveName(baseName, "_edited"));
    });
  return (
    <div className={styles.section}>
      <h3>Export</h3>
      <button className="primary" disabled={!hasPages} onClick={doExport}>
        Download edited PDF
      </button>
      <p>Applies the current page order, rotations, and deletions.</p>
    </div>
  );
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
