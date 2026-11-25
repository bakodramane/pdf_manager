import { useEffect, useId, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import styles from "../App.module.css";
import { useI18n, type MessageKey } from "../i18n";
import { Icon } from "./Icon";
import { PanelHeader, Section } from "./Panel";
import { formatBytes } from "../format";
import type { PageRef } from "../pdf/types";
import { parsePageRanges } from "../pdf/operations";
import { deriveName, downloadBytes } from "../pdf/assemble";
import { dropRenderDoc, getRenderDoc } from "../pdf/render";
import { pdfToDocx, pdfToXlsx } from "../pdf/convert";
import { LOW_CONFIDENCE, type OcrLanguage, type OcrPage } from "../pdf/ocr/types";
import type { OcrQuality, OcrRunResult } from "../pdf/ocr/run";

type Scope = "all" | "selected" | "range";

interface OcrManifest {
  languages: Record<"eng" | "fra", { bytes: number }>;
  engineFiles: { file: string; bytes: number }[];
}

export interface OcrPanelProps {
  pages: PageRef[];
  selected: Set<string>;
  hasPages: boolean;
  baseName: string;
  assemble: () => Promise<Uint8Array>;
  run: (
    label: string,
    fn: (setStatus: (s: string) => void, signal: AbortSignal) => Promise<void>,
    options?: { cancellable?: boolean },
  ) => Promise<void>;
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
}

/** Results of the last OCR run, tied to the page list it was made from. */
interface Session {
  pagesSnapshot: PageRef[];
  bytes: Uint8Array;
  result: OcrRunResult;
  /** Text as edited by the user (per page index); used for copy / .txt only. */
  edited: Record<number, string>;
  language: OcrLanguage;
  quality: OcrQuality;
}

export function OcrPanel(props: OcrPanelProps) {
  const { pages, selected, hasPages, baseName, assemble, run, showSuccess, showError } = props;
  const { t } = useI18n();
  const ids = { lang: useId(), quality: useId(), range: useId() };
  const [scope, setScope] = useState<Scope>("all");
  const [range, setRange] = useState("");
  const [language, setLanguage] = useState<OcrLanguage>("eng+fra");
  const [quality, setQuality] = useState<OcrQuality>("standard");
  const [includeText, setIncludeText] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [manifest, setManifest] = useState<OcrManifest | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(new URL("ocr/manifest.json", document.baseURI).href)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => alive && setManifest(m))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Results are stale as soon as the document changes (pages added,
  // removed, rotated, annotated…): positions would no longer match.
  const stale = session !== null && session.pagesSnapshot !== pages;

  const engineBytes = manifest?.engineFiles.reduce((n, f) => Math.max(n, f.bytes), 0) ?? 0;
  const langBytes = manifest
    ? language.split("+").reduce((n, l) => n + (manifest.languages[l as "eng" | "fra"]?.bytes ?? 0), 0)
    : 0;
  const isDesktop = typeof window !== "undefined" && !!window.pdfManager;

  const targetPages = (): number[] => {
    if (scope === "selected") {
      return pages.map((p, i) => (selected.has(p.id) ? i : -1)).filter((i) => i >= 0);
    }
    if (scope === "range") return parsePageRanges(range, pages.length);
    return pages.map((_, i) => i);
  };

  const recognise = (only?: number[]) =>
    run(
      t("ocr.busy.starting"),
      async (setStatus, signal) => {
        const indices = only ?? targetPages();
        if (!indices.length) throw new Error(t("error.noSelection"));
        const bytes = only && session && !stale ? session.bytes : await assemble();
        const { recognizePdf } = await import("../pdf/ocr/run");
        const result = await recognizePdf(bytes, {
          pages: indices,
          language,
          quality,
          includePagesWithText: includeText,
          signal,
          onProgress: ({ done, total, page, stage, detail }) => {
            if (stage === "done") return;
            const pct = detail && stage === "recognise" ? ` ${Math.round(detail.progress * 100)} %` : "";
            setStatus(t("ocr.busy.page", { page, done: done + 1, total }) + pct);
          },
        });
        // Merge a retry into the previous results.
        const merged: OcrRunResult =
          only && session && !stale
            ? {
                ...result,
                pages: [...session.result.pages.filter((p) => !indices.includes(p.pageIndex)), ...result.pages].sort(
                  (a, b) => a.pageIndex - b.pageIndex,
                ),
                skippedWithText: session.result.skippedWithText,
              }
            : result;
        setSession({ pagesSnapshot: pages, bytes, result: merged, edited: {}, language, quality });
        if (result.cancelled) showError(t("ocr.cancelled", { count: result.pages.length }));
        else if (!result.pages.length && !result.failed.length && result.skippedWithText.length)
          showSuccess(t("ocr.allHadText"));
        else if (result.failed.length) showError(t("ocr.someFailed", { pages: result.failed.map((f) => f.page + 1).join(", ") }));
        else showSuccess(t("ocr.done", { count: result.pages.length }));
      },
      { cancellable: true },
    );

  const textOf = (p: OcrPage) => session?.edited[p.pageIndex] ?? p.text;
  const allText = () =>
    (session?.result.pages ?? []).map((p) => `${t("ocr.pageLabel", { page: p.pageIndex + 1 })}\n\n${textOf(p)}`).join("\n\n");

  const saveSearchable = () =>
    run(t("ocr.busy.building"), async () => {
      if (!session) return;
      const { makeSearchablePdf } = await import("../pdf/ocr/run");
      const out = await makeSearchablePdf(session.bytes, session.result.pages);
      const file = deriveName(baseName, "_ocr");
      downloadBytes(out, file);
      showSuccess(t("notice.exported", { file }));
    });

  const saveText = () =>
    run(t("ocr.busy.building"), async () => {
      if (!session) return;
      const { ocrTextFile } = await import("../pdf/ocr/run");
      const pagesWithEdits = session.result.pages.map((p) => ({ ...p, text: textOf(p) }));
      const file = deriveName(baseName, "_ocr", "txt");
      downloadBytes(ocrTextFile(pagesWithEdits, (n) => t("ocr.pageLabel", { page: n })), file, "text/plain;charset=utf-8");
      showSuccess(t("notice.exported", { file }));
    });

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(allText());
      showSuccess(t("ocr.copied"));
    } catch {
      showError(t("ocr.copyFailed"));
    }
  };

  /** OCR-assisted Word / Excel: convert the searchable copy. */
  const convert = (kind: "docx" | "xlsx") =>
    run(t(kind === "docx" ? "busy.toWord" : "busy.toExcel"), async (setStatus) => {
      if (!session) return;
      const { makeSearchablePdf } = await import("../pdf/ocr/run");
      const searchable = await makeSearchablePdf(session.bytes, session.result.pages);
      const id = `ocr-convert-${Date.now()}`;
      try {
        const doc: PDFDocumentProxy = await getRenderDoc(id, searchable);
        const ocrPages = new Set(session.result.pages.map((p) => p.pageIndex));
        const progress = (done: number, total: number) =>
          setStatus(t(kind === "docx" ? "busy.toWordPage" : "busy.toExcelPage", { done, total }));
        const out = kind === "docx" ? await pdfToDocx(doc, progress, { ocrPages }) : await pdfToXlsx(doc, progress);
        const mime =
          kind === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        const file = deriveName(baseName, "_ocr", kind);
        downloadBytes(out, file, mime);
        showSuccess(t("notice.exported", { file }));
      } finally {
        dropRenderDoc(id);
      }
    });

  const results = session?.result;
  const lowPages = useMemo(
    () => (results?.pages ?? []).filter((p) => p.confidence < LOW_CONFIDENCE).map((p) => p.pageIndex + 1),
    [results],
  );

  return (
    <>
      <PanelHeader title="ocr.title" description="ocr.description" />
      <Section title={t("ocr.settings")}>
        <fieldset className={styles.fieldset}>
          <legend>{t("ocr.scope")}</legend>
          {(["all", "selected", "range"] as Scope[]).map((s) => (
            <label key={s} className={styles.radio}>
              <input type="radio" name="ocr-scope" checked={scope === s} onChange={() => setScope(s)} />
              {t(`ocr.scope.${s}` as MessageKey)}
            </label>
          ))}
          {scope === "range" && (
            <div className={styles.field}>
              <label htmlFor={ids.range}>{t("pages.rangeLabel")}</label>
              <input
                id={ids.range}
                type="text"
                inputMode="numeric"
                placeholder={t("pages.rangePlaceholder")}
                value={range}
                onChange={(e) => setRange(e.target.value)}
              />
            </div>
          )}
        </fieldset>
        <div className={styles.field}>
          <label htmlFor={ids.lang}>{t("ocr.language")}</label>
          <select id={ids.lang} value={language} onChange={(e) => setLanguage(e.target.value as OcrLanguage)}>
            <option value="eng+fra">{t("ocr.lang.both")}</option>
            <option value="eng">{t("ocr.lang.eng")}</option>
            <option value="fra">{t("ocr.lang.fra")}</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.quality}>{t("ocr.quality")}</label>
          <select id={ids.quality} value={quality} onChange={(e) => setQuality(e.target.value as OcrQuality)}>
            <option value="fast">{t("ocr.quality.fast")}</option>
            <option value="standard">{t("ocr.quality.standard")}</option>
            <option value="high">{t("ocr.quality.high")}</option>
          </select>
        </div>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} />
          {t("ocr.includeText")}
        </label>
        {includeText && <p className={styles.warning}>{t("ocr.includeTextWarning")}</p>}
        <button className="primary block" disabled={!hasPages} onClick={() => void recognise()}>
          <Icon name="scan" size={16} />
          {t("ocr.button")}
        </button>
        <p>
          {isDesktop
            ? t("ocr.offlineDesktop")
            : engineBytes > 0
              ? t("ocr.offlineWeb", { size: formatBytes(engineBytes + langBytes) })
              : t("ocr.offlineWebNoSize")}
        </p>
      </Section>

      {results && (
        <Section title={t("ocr.results")}>
          {stale && <p className={styles.warning}>{t("ocr.stale")}</p>}
          <p aria-live="polite">
            {t("ocr.summary", {
              done: results.pages.length,
              skipped: results.skippedWithText.length,
              failed: results.failed.length,
            })}
          </p>
          {results.skippedWithText.length > 0 && (
            <p>{t("ocr.skippedText", { pages: results.skippedWithText.map((i) => i + 1).join(", ") })}</p>
          )}
          {lowPages.length > 0 && <p className={styles.warning}>{t("ocr.lowConfidence", { pages: lowPages.join(", ") })}</p>}
          {results.failed.length > 0 && (
            <button disabled={stale} onClick={() => void recognise(results.failed.map((f) => f.page))}>
              {t("ocr.retryFailed")}
            </button>
          )}
          <div className={styles.row}>
            <button disabled={stale || !results.pages.length} onClick={() => void saveSearchable()}>
              <Icon name="document" size={16} />
              {t("ocr.saveSearchable")}
            </button>
          </div>
          <div className={styles.row}>
            <button disabled={!results.pages.length} onClick={() => void copyText()}>
              <Icon name="copy" size={16} />
              {t("ocr.copy")}
            </button>
            <button disabled={!results.pages.length} onClick={() => void saveText()}>
              <Icon name="export" size={16} />
              {t("ocr.saveText")}
            </button>
          </div>
          <div className={styles.row}>
            <button disabled={stale || !results.pages.length} onClick={() => void convert("docx")}>
              <Icon name="word" size={16} />
              {t("ocr.toWord")}
            </button>
            <button disabled={stale || !results.pages.length} onClick={() => void convert("xlsx")}>
              <Icon name="table" size={16} />
              {t("ocr.toExcel")}
            </button>
          </div>
          <p>{t("ocr.convertHint")}</p>
          {results.pages.map((p) => (
            <details key={p.pageIndex} className={styles.ocrPage}>
              <summary>
                {t("ocr.pageLabel", { page: p.pageIndex + 1 })} · {t("ocr.confidence", { value: Math.round(p.confidence) })}
                {p.confidence < LOW_CONFIDENCE ? ` · ${t("ocr.low")}` : ""}
              </summary>
              <textarea
                aria-label={t("ocr.pageText", { page: p.pageIndex + 1 })}
                value={textOf(p)}
                rows={8}
                lang={session?.language === "fra" ? "fr" : session?.language === "eng" ? "en" : undefined}
                onChange={(e) =>
                  setSession((s) => (s ? { ...s, edited: { ...s.edited, [p.pageIndex]: e.target.value } } : s))
                }
              />
            </details>
          ))}
          <p>{t("ocr.editHint")}</p>
        </Section>
      )}
      <Section title={t("ocr.limitsTitle")}>
        <ul className={styles.tips}>
          <li>{t("ocr.limit.confidence")}</li>
          <li>{t("ocr.limit.orientation")}</li>
          <li>{t("ocr.limit.layout")}</li>
        </ul>
      </Section>
    </>
  );
}
