import { useMemo, useState } from "react";
import styles from "../../App.module.css";
import type { useEditor } from "../../hooks/useEditor";
import { assemblePdf, deriveName, downloadBytes } from "../../pdf/assemble";
import { compressPdf } from "../../pdf/compress";
import { pdfToDocx, pdfToXlsx } from "../../pdf/convert";
import { applyImageOverlay, applyTextOverlay } from "../../pdf/overlay";
import { splitIntoRanges } from "../../pdf/operations";
import { getRenderDoc } from "../../pdf/render";
import { FileDrop } from "../FileDrop";

type EditorApi = ReturnType<typeof useEditor>;
type RunFn = (label: string, fn: () => Promise<void>) => Promise<void>;
type AssembleFn = () => Promise<Uint8Array>;

interface SharedPanelProps {
  editor: EditorApi;
  run: RunFn;
  baseName: string;
}

export function PagesPanel({
  editor,
  onAddFiles,
}: {
  editor: EditorApi;
  onAddFiles: (files: File[]) => void;
}) {
  return (
    <>
      <div className={styles.section}>
        <h3>Add pages</h3>
        <FileDrop onFiles={onAddFiles} label="Add PDF pages" />
        <p>New files are appended to the end of the current document.</p>
      </div>
      <div className={styles.section}>
        <h3>Organize</h3>
        <p>
          Select pages in the grid, then use the action bar above the document
          to rotate, extract, delete, or clear the selection.
        </p>
        <p>
          Drag thumbnails to reorder, or use the up/down controls on each page
          for touch and keyboard-friendly movement.
        </p>
      </div>
      <div className={styles.section}>
        <h3>Document</h3>
        <div className={styles.row}>
          <button onClick={editor.selectAll}>Select all</button>
          <button onClick={editor.clearSelection}>Clear</button>
        </div>
      </div>
    </>
  );
}

export function MergeSplitPanel({
  editor,
  run,
  baseName,
  onAddFiles,
}: SharedPanelProps & { onAddFiles: (files: File[]) => void }) {
  const [boundaries, setBoundaries] = useState("");
  const splitPoints = useMemo(
    () =>
      boundaries
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n)),
    [boundaries],
  );
  const validSplitPoints = splitPoints.filter(
    (n, index, all) =>
      n >= 1 && n < editor.pages.length && all.indexOf(n) === index,
  );
  const partCount = validSplitPoints.length + 1;

  const doSplit = () =>
    run("Splitting...", async () => {
      const chunks = splitIntoRanges(editor.pages, splitPoints);
      if (chunks.length <= 1) {
        throw new Error(
          "Provide at least one valid split point, such as 3 or 3, 7.",
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
        <FileDrop onFiles={onAddFiles} label="Add PDFs to merge" />
        <p>Added files are appended to the current document.</p>
      </div>
      <div className={styles.section}>
        <h3>Split</h3>
        <label className={styles.field}>
          Split after page numbers
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 3, 7"
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
          />
        </label>
        <div className={styles.feedback} aria-live="polite">
          {validSplitPoints.length > 0
            ? `Will create ${partCount} PDFs after page ${validSplitPoints.join(
                ", ",
              )}.`
            : "Enter page numbers inside the current page range."}
        </div>
        <button
          className="primary"
          disabled={!editor.pages.length || validSplitPoints.length === 0}
          onClick={doSplit}
        >
          Split and download
        </button>
      </div>
      <InsertSection editor={editor} run={run} />
    </>
  );
}

function InsertSection({ editor, run }: { editor: EditorApi; run: RunFn }) {
  const [after, setAfter] = useState(0);
  return (
    <div className={styles.section}>
      <h3>Insert pages</h3>
      <label className={styles.field}>
        Insert after page
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
          run("Inserting...", async () => {
            if (!files[0]) throw new Error("Choose a PDF to insert.");
            const err = await editor.insertFromFile(files[0], after - 1);
            if (err) throw new Error(err);
          })
        }
      />
      <p>Use 0 to insert at the beginning.</p>
    </div>
  );
}

export function AnnotatePanel({
  editor,
  run,
  assemble,
  baseName,
  setError,
}: SharedPanelProps & {
  assemble: AssembleFn;
  setError: (s: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [pageNo, setPageNo] = useState(1);
  const [x, setX] = useState(0.1);
  const [y, setY] = useState(0.1);
  const [size, setSize] = useState(24);

  const applyText = () =>
    run("Adding text...", async () => {
      if (!text.trim()) throw new Error("Enter some text first.");
      const bytes = await assemble();
      const out = await applyTextOverlay(bytes, {
        pageIndex: pageNo - 1,
        text,
        x,
        y,
        size,
      });
      editor.replaceWithBytes(
        out,
        deriveName(baseName, "_annotated"),
        editor.pages.length,
      );
      setText("");
    });

  const applyImage = (files: File[]) =>
    run("Adding image...", async () => {
      const file = files[0];
      if (!file) throw new Error("Choose a PNG or JPG image.");
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
        <h3>Placement</h3>
        <label className={styles.field}>
          Page
          <input
            type="number"
            min={1}
            max={editor.pages.length}
            value={pageNo}
            onChange={(e) => setPageNo(parseInt(e.target.value, 10) || 1)}
          />
        </label>
        <div className={styles.positionGrid}>
          <label className={styles.field}>
            X position
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
            Y position
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
        <p>Positions use 0 to 1 from the top-left of the selected page.</p>
      </div>
      <div className={styles.section}>
        <h3>Text</h3>
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
        <h3>Signature or image</h3>
        <FileDrop
          multiple={false}
          accept="image/png,image/jpeg"
          label="Pick a PNG/JPG"
          onFiles={(f) => {
            if (disabled) {
              setError("Load a PDF first.");
              return;
            }
            applyImage(f);
          }}
        />
        <p>The image uses 30% of the page width.</p>
      </div>
    </>
  );
}

export function CompressPanel({
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
    run("Compressing...", async () => {
      const before = await assemble();
      const after = await compressPdf(before);
      const pct = Math.max(0, Math.round((1 - after.length / before.length) * 100));
      editor.replaceWithBytes(after, "compressed.pdf", editor.pages.length);
      setResult(
        `Saved ${pct}% (${fmt(before.length)} to ${fmt(after.length)}). Export to download.`,
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
      {result && (
        <p className={styles.feedback} aria-live="polite">
          {result}
        </p>
      )}
      <p>
        Re-packs the PDF structure with object streams. Embedded images are not
        re-encoded, so gains vary.
      </p>
    </div>
  );
}

export function ConvertPanel({
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
  const toWord = () =>
    run("Converting to Word...", async () => {
      const bytes = await assemble();
      const doc = await getRenderDoc("convert-tmp-" + Date.now(), bytes);
      const out = await pdfToDocx(doc);
      downloadBytes(
        out,
        deriveName(baseName, "", "docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

  const toExcel = () =>
    run("Converting to Excel...", async () => {
      const bytes = await assemble();
      const doc = await getRenderDoc("convert-tmp-" + Date.now(), bytes);
      const out = await pdfToXlsx(doc);
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
          PDF to Word
        </button>
        <button className="primary" disabled={!hasPages} onClick={toExcel}>
          PDF to Excel
        </button>
      </div>
      <p>
        Text-layer extraction only. OCR, exact layout, fonts, and images are not
        preserved.
      </p>
    </div>
  );
}

export function ExportPanel({
  onExport,
  hasPages,
}: {
  onExport: () => void;
  hasPages: boolean;
}) {
  return (
    <div className={styles.section}>
      <h3>Export</h3>
      <button className="primary" disabled={!hasPages} onClick={onExport}>
        Download edited PDF
      </button>
      <p>Applies the current page order, rotations, deletions, and inserts.</p>
    </div>
  );
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
