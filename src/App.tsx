import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import styles from "./App.module.css";
import { useEditor } from "./hooks/useEditor";
import { FileDrop } from "./components/FileDrop";
import { PageGrid } from "./components/PageGrid";
import { Icon, type IconName } from "./components/Icon";
import { Dialog } from "./components/Dialog";
import { Viewer, type ViewerHandle, type Zoom } from "./components/Viewer";
import { useShortcuts } from "./hooks/useShortcuts";
import { SHORTCUT_LIST, keyLabel, type ShortcutAction } from "./hooks/shortcuts";
import { assemblePdf, deriveName, downloadBytes } from "./pdf/assemble";
import { extractPages, parsePageRanges, splitIntoRanges } from "./pdf/operations";
import { compressPdf } from "./pdf/compress";
import { dropRenderDoc, getRenderDoc } from "./pdf/render";
import { pdfToDocx, pdfToXlsx } from "./pdf/convert";
import { AppError } from "./pdf/errors";
import { LANGUAGES, useI18n, type Lang, type MessageKey } from "./i18n";
import { AUTHOR } from "./about";
import { onDesktopMenuCommand, setDesktopLanguage, type MenuCommand } from "./desktop";

type Tab = "pages" | "merge" | "annotate" | "compress" | "convert" | "export";

const TABS: { id: Tab; label: MessageKey; icon: IconName }[] = [
  { id: "pages", label: "nav.pages", icon: "pages" },
  { id: "merge", label: "nav.merge", icon: "merge" },
  { id: "annotate", label: "nav.annotate", icon: "annotate" },
  { id: "compress", label: "nav.compress", icon: "compress" },
  { id: "convert", label: "nav.convert", icon: "convert" },
  { id: "export", label: "nav.export", icon: "export" },
];

type View = "grid" | "document";
type Notice = { kind: "error" | "success"; text: string };

/** App icon (public/icon.png), also used as the window and installer icon. */
const LOGO_URL = `${import.meta.env.BASE_URL}icon.png`;
type DialogId = "credits" | "shortcuts";

export default function App() {
  const { t, lang } = useI18n();
  const editor = useEditor();
  const [tab, setTab] = useState<Tab>("pages");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const [extractRange, setExtractRange] = useState("");
  const [view, setView] = useState<View>("grid");
  const [zoom, setZoom] = useState<Zoom>("width");
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<ViewerHandle>(null);

  const { pages, forms, selected, getSource } = editor;

  /** Show the document view, optionally starting at a page. */
  const openDocument = useCallback((pageId?: string) => {
    if (pageId) setCurrentPageId(pageId);
    setView("document");
  }, []);
  const baseName = useMemo(() => {
    const first = pages[0] && getSource(pages[0].sourceId);
    return first?.name ?? "document.pdf";
  }, [pages, getSource]);

  /** Turn any thrown value into a message in the current language. */
  const formatError = useCallback(
    (err: unknown): string => {
      if (err instanceof AppError) return t(`error.${err.code}`, err.params);
      return err instanceof Error ? err.message : String(err);
    },
    [t],
  );

  const showError = useCallback(
    (text: string) => setNotice({ kind: "error", text }),
    [],
  );
  const showSuccess = useCallback(
    (text: string) => setNotice({ kind: "success", text }),
    [],
  );

  // Success notices fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  /** Run an async action with a global loading state + error capture. */
  const run = useCallback<RunFn>(
    async (label, fn) => {
      setNotice(null);
      setBusy(label);
      try {
        await fn((status) => setBusy(status));
      } catch (err) {
        showError(formatError(err));
      } finally {
        setBusy(null);
      }
    },
    [formatError, showError],
  );

  const addFiles = useCallback(
    (files: File[]) =>
      run(t("busy.loading"), async () => {
        const errs = await editor.addFiles(files);
        if (errs.length) showError(errs.map(formatError).join("\n"));
      }),
    [editor, run, t, showError, formatError],
  );

  /** Assemble current working order into bytes (shared by export/convert). */
  const assemble = useCallback(
    () => assemblePdf(pages, getSource, forms),
    [pages, getSource, forms],
  );

  /**
   * Extraction: save the pages typed in the range box (e.g. "1-3, 7") — or,
   * when the box is empty, the pages selected in the grid — as a new PDF.
   * The open document is left untouched.
   */
  const extractSelection = useCallback(
    () =>
      run(t("busy.extracting"), async () => {
        const chosen = extractRange.trim()
          ? parsePageRanges(extractRange, pages.length).map((i) => pages[i])
          : extractPages(pages, selected);
        if (chosen.length === 0) throw new Error(t("error.noSelection"));
        const bytes = await assemblePdf(chosen, getSource, forms);
        const file = deriveName(baseName, "_extraction");
        downloadBytes(bytes, file);
        showSuccess(t("notice.extracted", { count: chosen.length, file }));
      }),
    [run, t, extractRange, pages, selected, getSource, forms, baseName, showSuccess],
  );

  /** Highlight the pages typed in the range box in the grid. */
  const selectRange = useCallback(() => {
    try {
      const ids = parsePageRanges(extractRange, pages.length).map((i) => pages[i].id);
      editor.selectPages(ids);
    } catch (err) {
      showError(formatError(err));
    }
  }, [extractRange, pages, editor, showError, formatError]);

  const exportPdf = useCallback(
    () =>
      run(t("busy.exporting"), async () => {
        const bytes = await assemble();
        const file = deriveName(baseName, "_edited");
        downloadBytes(bytes, file);
        showSuccess(t("notice.exported", { file }));
      }),
    [run, t, assemble, baseName, showSuccess],
  );

  const hasPages = pages.length > 0;
  const hasSelection = selected.size > 0;
  const canExtract = hasPages && (hasSelection || extractRange.trim() !== "");
  const inDocument = hasPages && view === "document";

  const onShortcut = (action: ShortcutAction) => {
    // Page-grid actions do nothing in the document view, so Delete or R
    // never change pages the user cannot see selected.
    const gridOnly = ["selectAll", "clearSelection", "delete", "rotateRight", "rotateLeft"];
    if (inDocument && gridOnly.includes(action)) return;
    switch (action) {
      case "zoomIn":
        viewerRef.current?.zoomIn();
        break;
      case "zoomOut":
        viewerRef.current?.zoomOut();
        break;
      case "zoomReset":
        viewerRef.current?.zoomReset();
        break;
      case "open":
        openInputRef.current?.click();
        break;
      case "selectAll":
        editor.selectAll();
        break;
      case "clearSelection":
        editor.clearSelection();
        setNotice(null);
        break;
      case "delete":
        if (hasSelection) editor.deleteSelected();
        break;
      case "rotateRight":
        if (hasSelection) editor.rotateSelected(90);
        break;
      case "rotateLeft":
        if (hasSelection) editor.rotateSelected(-90);
        break;
      case "extract":
        if (canExtract) void extractSelection();
        break;
      case "export":
        if (hasPages) void exportPdf();
        break;
      case "undo":
        editor.undo();
        break;
      case "redo":
        editor.redo();
        break;
      case "help":
        setDialog("shortcuts");
        break;
    }
  };
  useShortcuts(onShortcut, busy === null);

  // Desktop window menu (Electron): keep its language in sync and run its
  // commands. Ignored while an operation is in progress.
  const menuHandler = useRef<(command: MenuCommand) => void>(() => undefined);
  menuHandler.current = (command) => {
    if (busy !== null) return;
    switch (command) {
      case "open":
      case "export":
      case "undo":
      case "redo":
      case "zoomIn":
      case "zoomOut":
      case "zoomReset":
        onShortcut(command);
        break;
      case "close":
        editor.reset();
        break;
      case "shortcuts":
      case "credits":
        setDialog(command);
        break;
    }
  };
  useEffect(() => onDesktopMenuCommand((command) => menuHandler.current(command)), []);
  useEffect(() => setDesktopLanguage(lang), [lang]);
  const ctx: PanelCtx = {
    editor,
    run,
    assemble,
    baseName,
    hasPages,
    hasSelection,
    addFiles,
    extractSelection,
    extractRange,
    setExtractRange,
    selectRange,
    canExtract,
    exportPdf,
    showError,
    showSuccess,
    view,
    setView,
    openDocument,
    viewerRef,
  };

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <img className={styles.logoImage} src={LOGO_URL} alt="" width={36} height={36} />
          <div className={styles.brandText}>
            <h1>{t("app.name")}</h1>
            <span>{t("app.tagline")}</span>
          </div>
        </div>
        <div className={styles.topActions}>
          <div className={styles.historyButtons}>
            <IconButton
              icon="undo"
              label={withKeys(t("app.undo"), ["Mod", "Z"])}
              disabled={!editor.canUndo}
              onClick={editor.undo}
            />
            <IconButton
              icon="redo"
              label={withKeys(t("app.redo"), ["Mod", "Y"])}
              disabled={!editor.canRedo}
              onClick={editor.redo}
            />
          </div>
          <span className={styles.badge}>
            <Icon name="shield" size={14} />
            {t("app.badge")}
          </span>
          <LanguageSwitch />
          {hasPages && (
            <button className="ghost" onClick={editor.reset}>
              <Icon name="close" size={16} />
              {t("app.reset")}
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <nav className={styles.rail} aria-label={t("app.name")}>
          {TABS.map((item) => (
            <button
              key={item.id}
              className={[styles.railItem, tab === item.id ? styles.active : ""].join(" ")}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => {
                setTab(item.id);
                if (item.id === "annotate") setView("document");
              }}
            >
              <Icon name={item.icon} size={20} />
              <span>{t(item.label)}</span>
            </button>
          ))}
          <div className={styles.railSpacer} />
          <button
            className={[styles.railItem, dialog === "shortcuts" ? styles.active : ""].join(" ")}
            title={`${t("nav.shortcuts")} (?)`}
            onClick={() => setDialog("shortcuts")}
          >
            <Icon name="keyboard" size={20} />
            <span>{t("nav.shortcuts")}</span>
          </button>
          <button
            className={[styles.railItem, dialog === "credits" ? styles.active : ""].join(" ")}
            onClick={() => setDialog("credits")}
          >
            <Icon name="info" size={20} />
            <span>{t("nav.credits")}</span>
          </button>
        </nav>

        <aside className={styles.panel}>
          {tab === "pages" && <PagesPanel {...ctx} />}
          {tab === "merge" && <MergeSplitPanel {...ctx} />}
          {tab === "annotate" && <AnnotatePanel {...ctx} />}
          {tab === "compress" && <CompressPanel {...ctx} />}
          {tab === "convert" && <ConvertPanel {...ctx} />}
          {tab === "export" && <ExportPanel {...ctx} />}
        </aside>

        <main className={styles.workspace}>
          {hasPages && view === "document" ? (
            <Viewer
              ref={viewerRef}
              editor={editor}
              zoom={zoom}
              onZoomChange={setZoom}
              startPageId={currentPageId}
              onCurrentPage={setCurrentPageId}
              onError={showError}
              viewSwitch={<ViewSwitch view={view} onChange={setView} />}
            />
          ) : hasPages ? (
            <>
              <Toolbar {...ctx} />
              <div className={styles.gridScroll}>
                <PageGrid
                  pages={pages}
                  selected={selected}
                  getSource={getSource}
                  onToggle={editor.toggleSelect}
                  onReorder={editor.reorder}
                  onOpen={openDocument}
                />
              </div>
            </>
          ) : (
            <Home onFiles={addFiles} />
          )}
        </main>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerNote}>
          <Icon name="shield" size={12} />
          {t("app.privacyNote")}
        </span>
        <button className={styles.footerHint} onClick={() => setDialog("shortcuts")}>
          <Icon name="keyboard" size={12} />
          {t("shortcuts.hint")}
        </button>
      </footer>

      {/* Hidden picker used by the Ctrl+O shortcut. */}
      <input
        ref={openInputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void addFiles(files);
          e.target.value = "";
        }}
      />

      <Dialog
        open={dialog === "credits"}
        onClose={() => setDialog(null)}
        title={t("credits.title")}
      >
        <CreditsContent />
      </Dialog>
      <Dialog
        open={dialog === "shortcuts"}
        onClose={() => setDialog(null)}
        title={t("shortcuts.title")}
      >
        <ShortcutsContent />
      </Dialog>

      {busy && (
        <div className={styles.overlay} role="status" aria-live="polite">
          <div className={styles.overlayCard}>
            <div className={styles.spinner} />
            <div>{busy}</div>
          </div>
        </div>
      )}
      {notice && (
        <div
          className={[
            styles.toast,
            notice.kind === "error" ? styles.toastError : styles.toastSuccess,
          ].join(" ")}
          role={notice.kind === "error" ? "alert" : "status"}
        >
          <Icon name={notice.kind === "error" ? "alert" : "check"} size={18} />
          <div className={styles.toastText}>{notice.text}</div>
          <button
            className="icon"
            aria-label={t("notice.dismiss")}
            title={t("notice.dismiss")}
            onClick={() => setNotice(null)}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

type EditorApi = ReturnType<typeof useEditor>;
type RunFn = (
  label: string,
  fn: (setStatus: (status: string) => void) => Promise<void>,
) => Promise<void>;
type AssembleFn = () => Promise<Uint8Array>;

interface PanelCtx {
  editor: EditorApi;
  run: RunFn;
  assemble: AssembleFn;
  baseName: string;
  hasPages: boolean;
  hasSelection: boolean;
  addFiles: (files: File[]) => Promise<void>;
  extractSelection: () => Promise<void>;
  extractRange: string;
  setExtractRange: (value: string) => void;
  selectRange: () => void;
  canExtract: boolean;
  exportPdf: () => Promise<void>;
  showError: (text: string) => void;
  showSuccess: (text: string) => void;
  view: View;
  setView: (view: View) => void;
  openDocument: (pageId?: string) => void;
  viewerRef: React.RefObject<ViewerHandle>;
}

/* ------------------------------------------------------------------ */
/* Shell pieces                                                        */
/* ------------------------------------------------------------------ */

function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={styles.segmented} role="group" aria-label={t("app.language")}>
      {(Object.keys(LANGUAGES) as Lang[]).map((code) => (
        <button
          key={code}
          className={lang === code ? styles.segmentActive : ""}
          aria-pressed={lang === code}
          title={LANGUAGES[code].label}
          onClick={() => setLang(code)}
        >
          {LANGUAGES[code].short}
        </button>
      ))}
    </div>
  );
}

function CreditsContent() {
  const { t } = useI18n();
  return (
    <div className={styles.credits}>
      <div className={styles.creditsApp}>
        <img className={styles.logoImage} src={LOGO_URL} alt="" width={36} height={36} />
        <div>
          <strong>{t("app.name")}</strong>
          <span>{t("credits.version", { version: __APP_VERSION__ })}</span>
        </div>
      </div>
      <div className={styles.creditsAuthor}>
        <span className={styles.creditsLabel}>{t("credits.createdBy")}</span>
        <strong>{AUTHOR.name}</strong>
        <a
          href={AUTHOR.url}
          target="_blank"
          rel="noopener noreferrer"
          title={t("app.authorLinkTitle")}
        >
          <Icon name="github" size={14} />
          {AUTHOR.url.replace(/^https:\/\//, "")}
        </a>
      </div>
      <p>{t("credits.builtWith")}</p>
      <p>{t("credits.licence")}</p>
      <p className={styles.creditsPrivacy}>
        <Icon name="shield" size={14} />
        {t("app.privacyNote")}
      </p>
    </div>
  );
}

function ShortcutsContent() {
  const { t } = useI18n();
  return (
    <table className={styles.shortcuts}>
      <tbody>
        {SHORTCUT_LIST.map((s) => (
          <tr key={s.label}>
            <td>{t(s.label)}</td>
            <td>
              {s.keys.map((k, i) => (
                <span key={k}>
                  {i > 0 && " + "}
                  <kbd>{keyLabel(k)}</kbd>
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Home({ onFiles }: { onFiles: (files: File[]) => void }) {
  const { t } = useI18n();
  const features: { icon: IconName; title: MessageKey; text: MessageKey }[] = [
    { icon: "pages", title: "home.feature.organise", text: "home.feature.organiseText" },
    { icon: "merge", title: "home.feature.merge", text: "home.feature.mergeText" },
    { icon: "convert", title: "home.feature.convert", text: "home.feature.convertText" },
    { icon: "shield", title: "home.feature.private", text: "home.feature.privateText" },
  ];
  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <h2>{t("home.title")}</h2>
        <p>{t("home.subtitle")}</p>
        <FileDrop
          variant="hero"
          onFiles={onFiles}
          label={t("home.drop")}
          hint={t("home.dropHint")}
        />
      </div>
      <ul className={styles.features}>
        {features.map((f) => (
          <li key={f.title}>
            <span className={styles.featureIcon}>
              <Icon name={f.icon} size={18} />
            </span>
            <strong>{t(f.title)}</strong>
            <span>{t(f.text)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const { t } = useI18n();
  const items: { id: View; icon: IconName; label: MessageKey }[] = [
    { id: "grid", icon: "pages", label: "view.grid" },
    { id: "document", icon: "document", label: "view.document" },
  ];
  return (
    <div className={styles.segmented} role="group" aria-label={t("view.label")}>
      {items.map((item) => (
        <button
          key={item.id}
          className={view === item.id ? styles.segmentActive : ""}
          aria-pressed={view === item.id}
          title={t(item.label)}
          onClick={() => onChange(item.id)}
        >
          <Icon name={item.icon} size={14} />
          <span className={styles.hideNarrow}>{t(item.label)}</span>
        </button>
      ))}
    </div>
  );
}

function Toolbar({ editor, hasSelection, extractSelection, canExtract, view, setView }: PanelCtx) {
  const { t } = useI18n();
  const count = editor.pages.length;
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarInfo}>
        <ViewSwitch view={view} onChange={setView} />
        <strong>
          {count === 1 ? t("toolbar.page") : t("toolbar.pages", { count })}
        </strong>
        {hasSelection && (
          <span className={styles.pill}>
            {t("toolbar.selected", { count: editor.selected.size })}
          </span>
        )}
      </div>
      <div className={styles.toolbarActions}>
        <button
          className="ghost"
          title={withKeys(t("toolbar.selectAll"), ["Mod", "A"])}
          onClick={editor.selectAll}
        >
          <Icon name="selectAll" size={16} />
          <span className={styles.hideNarrow}>{t("toolbar.selectAll")}</span>
        </button>
        {hasSelection && (
          <button
            className="ghost"
            title={withKeys(t("toolbar.clear"), ["Esc"])}
            onClick={editor.clearSelection}
          >
            <Icon name="close" size={16} />
            <span className={styles.hideNarrow}>{t("toolbar.clear")}</span>
          </button>
        )}
        <span className={styles.divider} />
        <IconButton
          icon="rotateLeft"
          label={withKeys(t("pages.rotateLeft"), ["Shift", "R"])}
          disabled={!hasSelection}
          onClick={() => editor.rotateSelected(-90)}
        />
        <IconButton
          icon="rotateRight"
          label={withKeys(t("pages.rotateRight"), ["R"])}
          disabled={!hasSelection}
          onClick={() => editor.rotateSelected(90)}
        />
        <IconButton
          icon="trash"
          label={withKeys(t("pages.delete"), ["Del"])}
          danger
          disabled={!hasSelection}
          onClick={editor.deleteSelected}
        />
        <button
          className="primary"
          disabled={!canExtract}
          title={withKeys(t("pages.extraction"), ["Mod", "E"])}
          onClick={extractSelection}
        >
          <Icon name="extract" size={16} />
          {t("pages.extraction")}
        </button>
      </div>
    </div>
  );
}

/** "Rotate right" + ["R"] → "Rotate right (R)" for tooltips. */
function withKeys(label: string, keys: string[]): string {
  return `${label} (${keys.map(keyLabel).join("+")})`;
}

function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={danger ? "icon danger" : "icon"}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function PanelHeader({ title, description }: { title: MessageKey; description: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className={styles.panelHeader}>
      <h2>{t(title)}</h2>
      <p>{t(description)}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tool panels                                                         */
/* ------------------------------------------------------------------ */

function PagesPanel({
  editor,
  hasPages,
  hasSelection,
  addFiles,
  extractSelection,
  extractRange,
  setExtractRange,
  selectRange,
  canExtract,
}: PanelCtx) {
  const { t } = useI18n();
  const rangeId = useId();
  return (
    <>
      <PanelHeader title="pages.title" description="pages.description" />
      <Section title={t("pages.extraction")}>
        <div className={styles.field}>
          <label htmlFor={rangeId}>{t("pages.rangeLabel")}</label>
          <div className={styles.inputGroup}>
            <input
              id={rangeId}
              type="text"
              inputMode="numeric"
              placeholder={t("pages.rangePlaceholder")}
              value={extractRange}
              onChange={(e) => setExtractRange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canExtract) void extractSelection();
              }}
            />
            <button
              disabled={!hasPages || !extractRange.trim()}
              title={t("pages.rangeSelectTitle")}
              onClick={selectRange}
            >
              {t("pages.rangeSelect")}
            </button>
          </div>
        </div>
        <button
          className="primary block"
          disabled={!canExtract}
          title={withKeys(t("pages.extraction"), ["Mod", "E"])}
          onClick={extractSelection}
        >
          <Icon name="extract" size={16} />
          {t("pages.extraction")}
        </button>
        <p>{t("pages.extractionHint")}</p>
      </Section>
      <Section title={t("pages.edit")}>
        <div className={styles.row}>
          <button disabled={!hasSelection} onClick={() => editor.rotateSelected(-90)}>
            <Icon name="rotateLeft" size={16} />
            {t("pages.rotateLeft")}
          </button>
          <button disabled={!hasSelection} onClick={() => editor.rotateSelected(90)}>
            <Icon name="rotateRight" size={16} />
            {t("pages.rotateRight")}
          </button>
        </div>
        <div className={styles.row}>
          <button disabled={!hasSelection} onClick={editor.extractSelected}>
            <Icon name="keep" size={16} />
            {t("pages.keepOnly")}
          </button>
          <button className="danger" disabled={!hasSelection} onClick={editor.deleteSelected}>
            <Icon name="trash" size={16} />
            {t("pages.delete")}
          </button>
        </div>
        <p>{t("pages.reorderHint")}</p>
      </Section>
      <Section title={t("pages.selection")}>
        <div className={styles.row}>
          <button disabled={!editor.pages.length} onClick={editor.selectAll}>
            {t("pages.selectAll")}
          </button>
          <button disabled={!hasSelection} onClick={editor.clearSelection}>
            {t("pages.clear")}
          </button>
        </div>
      </Section>
      <Section title={t("pages.add")}>
        <FileDrop onFiles={addFiles} label={t("pages.addDrop")} icon="plus" />
        <p>{t("pages.addHint")}</p>
      </Section>
    </>
  );
}

function MergeSplitPanel({ editor, run, baseName, addFiles, showSuccess }: PanelCtx) {
  const { t } = useI18n();
  const [boundaries, setBoundaries] = useState("");

  const doSplit = () =>
    run(t("busy.splitting"), async () => {
      const nums = boundaries
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      const chunks = splitIntoRanges(editor.pages, nums);
      if (chunks.length <= 1) throw new Error(t("error.splitPoints"));
      for (let i = 0; i < chunks.length; i++) {
        const bytes = await assemblePdf(chunks[i], editor.getSource, editor.forms);
        downloadBytes(bytes, deriveName(baseName, `_part${i + 1}`));
      }
      showSuccess(t("notice.split", { count: chunks.length }));
    });

  return (
    <>
      <PanelHeader title="merge.title" description="merge.description" />
      <Section title={t("merge.merge")}>
        <FileDrop onFiles={addFiles} label={t("merge.drop")} icon="plus" />
        <p>{t("merge.hint")}</p>
      </Section>
      <Section title={t("merge.split")}>
        <label className={styles.field}>
          {t("merge.splitLabel")}
          <input
            type="text"
            placeholder={t("merge.splitPlaceholder")}
            value={boundaries}
            onChange={(e) => setBoundaries(e.target.value)}
          />
        </label>
        <button className="primary block" disabled={!editor.pages.length} onClick={doSplit}>
          <Icon name="scissors" size={16} />
          {t("merge.splitButton")}
        </button>
        <p>{t("merge.splitHint")}</p>
      </Section>
      <InsertSection editor={editor} run={run} />
    </>
  );
}

function InsertSection({ editor, run }: { editor: EditorApi; run: RunFn }) {
  const { t } = useI18n();
  const [after, setAfter] = useState(0);
  return (
    <Section title={t("merge.insert")}>
      <label className={styles.field}>
        {t("merge.insertAfter")}
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
        label={t("merge.insertDrop")}
        icon="plus"
        onFiles={(files) =>
          run(t("busy.inserting"), async () => {
            const err = await editor.insertFromFile(files[0], after - 1);
            if (err) throw err;
          })
        }
      />
      <p>{t("merge.insertHint")}</p>
    </Section>
  );
}

function AnnotatePanel({ editor, hasPages, showError, view, openDocument, viewerRef }: PanelCtx) {
  const { t } = useI18n();
  const count = editor.pages.reduce((n, p) => n + (p.annotations?.length ?? 0), 0);

  /** Make sure the document view is showing, then act on it. */
  const withViewer = (fn: (viewer: ViewerHandle) => void) => {
    if (!hasPages) {
      showError(t("error.loadFirst"));
      return;
    }
    if (view !== "document") openDocument();
    // The viewer mounts on the next render when switching views.
    setTimeout(() => viewerRef.current && fn(viewerRef.current), 0);
  };

  return (
    <>
      <PanelHeader title="annotate.title" description="annotate.description" />
      <Section title={t("annotate.add")}>
        <button className="primary block" disabled={!hasPages} onClick={() => withViewer((v) => v.startText())}>
          <Icon name="text" size={16} />
          {t("annotate.addTextButton")}
        </button>
        <p>{t("annotate.addTextHint")}</p>
        <FileDrop
          multiple={false}
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          icon="signature"
          label={t("annotate.imageDrop")}
          onFiles={(files) => withViewer((v) => void v.placeImage(files[0]))}
        />
        <p>{t("annotate.imageHint")}</p>
      </Section>
      <Section title={t("annotate.howTo")}>
        <ul className={styles.tips}>
          <li>{t("annotate.tipMove")}</li>
          <li>{t("annotate.tipEdit")}</li>
          <li>{t("annotate.tipFormat")}</li>
          <li>{t("annotate.tipResize")}</li>
          <li>{t("annotate.tipDelete")}</li>
        </ul>
        {count > 0 && (
          <p className={styles.success}>{t("thumb.annotations", { count })}</p>
        )}
        <p>{t("annotate.flattenNote")}</p>
      </Section>
      <Section title={t("annotate.forms")}>
        <p>{t("annotate.formsHint")}</p>
      </Section>
    </>
  );
}

function CompressPanel({ editor, run, assemble, hasPages }: PanelCtx) {
  const { t } = useI18n();
  const [result, setResult] = useState<string | null>(null);
  const doCompress = () =>
    run(t("busy.compressing"), async () => {
      const before = await assemble();
      const after = await compressPdf(before);
      const pct = Math.max(0, Math.round((1 - after.length / before.length) * 100));
      editor.replaceWithBytes(after, "compressed.pdf", editor.pages.length);
      setResult(
        t("compress.result", { pct, before: fmt(before.length), after: fmt(after.length) }),
      );
    });
  return (
    <>
      <PanelHeader title="compress.title" description="compress.description" />
      <Section title={t("compress.title")}>
        <button className="primary block" disabled={!hasPages} onClick={doCompress}>
          <Icon name="compress" size={16} />
          {t("compress.button")}
        </button>
        {result && <p className={styles.success}>{result}</p>}
        <p>{t("compress.hint")}</p>
      </Section>
    </>
  );
}

function ConvertPanel({ run, assemble, baseName, hasPages }: PanelCtx) {
  const { t } = useI18n();

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
    run(t("busy.toWord"), async (setStatus) => {
      const bytes = await assemble();
      const out = await withTempDoc(bytes, (doc) =>
        pdfToDocx(doc, (done, total) => setStatus(t("busy.toWordPage", { done, total }))),
      );
      downloadBytes(
        out,
        deriveName(baseName, "", "docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

  const toExcel = () =>
    run(t("busy.toExcel"), async (setStatus) => {
      const bytes = await assemble();
      const out = await withTempDoc(bytes, (doc) =>
        pdfToXlsx(doc, (done, total) => setStatus(t("busy.toExcelPage", { done, total }))),
      );
      downloadBytes(
        out,
        deriveName(baseName, "", "xlsx"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
    });

  return (
    <>
      <PanelHeader title="convert.title" description="convert.description" />
      <Section title={t("convert.title")}>
        <button className={`${styles.convertCard} ${styles.word}`} disabled={!hasPages} onClick={toWord}>
          <Icon name="word" size={22} />
          <span>{t("convert.word")}</span>
        </button>
        <button className={`${styles.convertCard} ${styles.excel}`} disabled={!hasPages} onClick={toExcel}>
          <Icon name="table" size={22} />
          <span>{t("convert.excel")}</span>
        </button>
        <p>{t("convert.hint")}</p>
      </Section>
    </>
  );
}

function ExportPanel({ hasPages, exportPdf }: PanelCtx) {
  const { t } = useI18n();
  return (
    <>
      <PanelHeader title="export.title" description="export.description" />
      <Section title={t("export.title")}>
        <button
          className="primary block"
          disabled={!hasPages}
          title={withKeys(t("export.button"), ["Mod", "S"])}
          onClick={exportPdf}
        >
          <Icon name="export" size={16} />
          {t("export.button")}
        </button>
        <p>{t("export.hint")}</p>
      </Section>
    </>
  );
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
