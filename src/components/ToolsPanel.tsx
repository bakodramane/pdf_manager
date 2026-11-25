import { useId, useState } from "react";
import styles from "../App.module.css";
import { useI18n, type MessageKey } from "../i18n";
import { Icon } from "./Icon";
import { FileDrop } from "./FileDrop";
import { PanelHeader, Section } from "./Panel";
import type { PageRef } from "../pdf/types";
import { parsePageRanges } from "../pdf/operations";
import { downloadBytes } from "../pdf/assemble";
import {
  PAGE_SIZES,
  addPageNumbers,
  addTextWatermark,
  blankPagesPdf,
  imagesToPdf,
  type NumberPosition,
  type PageSizeName,
} from "../pdf/pageTools";
import { readImage } from "./imageTools";

type RunFn = (
  label: string,
  fn: (setStatus: (s: string) => void, signal: AbortSignal) => Promise<void>,
  options?: { cancellable?: boolean },
) => Promise<void>;

export interface ToolsPanelProps {
  pages: PageRef[];
  selected: Set<string>;
  hasPages: boolean;
  baseName: string;
  assemble: () => Promise<Uint8Array>;
  run: RunFn;
  /** Insert a generated PDF after the given page index (-1 = start). */
  insertPdf: (bytes: Uint8Array, name: string, afterIndex: number) => Promise<void>;
  /** Replace the whole document with new bytes (undoable). */
  replaceAll: (bytes: Uint8Array, name: string, pageCount: number) => void;
  showSuccess: (text: string) => void;
}

/** "all" or a page range typed by the user → zero-based indices. */
function useScope(count: number) {
  const [scope, setScope] = useState<"all" | "range">("all");
  const [range, setRange] = useState("");
  const indices = () => (scope === "all" ? [...Array(count).keys()] : parsePageRanges(range, count));
  return { scope, setScope, range, setRange, indices };
}

function ScopePicker({ name, s }: { name: string; s: ReturnType<typeof useScope> }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <fieldset className={styles.fieldset}>
      <legend>{t("ocr.scope")}</legend>
      <label className={styles.radio}>
        <input type="radio" name={name} checked={s.scope === "all"} onChange={() => s.setScope("all")} />
        {t("ocr.scope.all")}
      </label>
      <label className={styles.radio}>
        <input type="radio" name={name} checked={s.scope === "range"} onChange={() => s.setScope("range")} />
        {t("ocr.scope.range")}
      </label>
      {s.scope === "range" && (
        <div className={styles.field}>
          <label htmlFor={id}>{t("pages.rangeLabel")}</label>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            placeholder={t("pages.rangePlaceholder")}
            value={s.range}
            onChange={(e) => s.setRange(e.target.value)}
          />
        </div>
      )}
    </fieldset>
  );
}

export function ToolsPanel(props: ToolsPanelProps) {
  const { pages, selected, hasPages, baseName, assemble, run, insertPdf, replaceAll, showSuccess } = props;
  const { t } = useI18n();
  const ids = {
    blankSize: useId(),
    imgSize: useId(),
    numPos: useId(),
    numTpl: useId(),
    numStart: useId(),
    wmText: useId(),
    wmOpacity: useId(),
    wmAngle: useId(),
    exFormat: useId(),
    exDpi: useId(),
  };

  // Insert position: after the last selected page, or at the end.
  const lastSelected = pages.reduce((last, p, i) => (selected.has(p.id) ? i : last), -1);
  const insertAfter = lastSelected >= 0 ? lastSelected : pages.length - 1;

  const [blankSize, setBlankSize] = useState<PageSizeName>("a4");
  const [imgSize, setImgSize] = useState<PageSizeName | "image">("a4");
  const [numPos, setNumPos] = useState<NumberPosition>("bottom-center");
  const [numTpl, setNumTpl] = useState("{n} / {total}");
  const [numStart, setNumStart] = useState(1);
  const numScope = useScope(pages.length);
  const [wmText, setWmText] = useState("");
  const [wmOpacity, setWmOpacity] = useState(0.15);
  const [wmAngle, setWmAngle] = useState(45);
  const wmScope = useScope(pages.length);
  const [exFormat, setExFormat] = useState<"png" | "jpeg">("png");
  const [exDpi, setExDpi] = useState(150);
  const exScope = useScope(pages.length);

  const addBlank = () =>
    run(t("busy.inserting"), async () => {
      const [w, h] = PAGE_SIZES[blankSize];
      await insertPdf(await blankPagesPdf(1, w, h), "blank.pdf", insertAfter);
      showSuccess(t("tools.blankAdded", { page: insertAfter + 2 }));
    });

  const addImages = (files: File[]) =>
    run(t("busy.inserting"), async () => {
      const images = [];
      for (const f of files) images.push(await readImage(f));
      const bytes = await imagesToPdf(images, { pageSize: imgSize, margin: imgSize === "image" ? 0 : 28 });
      await insertPdf(bytes, "images.pdf", hasPages ? insertAfter : -1);
      showSuccess(t("tools.imagesAdded", { count: images.length }));
    });

  const applyNumbers = () =>
    run(t("busy.exporting"), async () => {
      const bytes = await assemble();
      const out = await addPageNumbers(bytes, {
        position: numPos,
        template: numTpl || "{n}",
        start: numStart,
        size: 10,
        pages: numScope.indices(),
      });
      replaceAll(out, "numbered.pdf", pages.length);
      showSuccess(t("tools.numbersAdded"));
    });

  const applyWatermark = () =>
    run(t("busy.exporting"), async () => {
      if (!wmText.trim()) throw new Error(t("tools.watermarkEmpty"));
      const bytes = await assemble();
      const out = await addTextWatermark(bytes, {
        text: wmText.trim(),
        size: 54,
        opacity: wmOpacity,
        angle: wmAngle,
        color: [0.75, 0.1, 0.1],
        pages: wmScope.indices(),
      });
      replaceAll(out, "watermarked.pdf", pages.length);
      showSuccess(t("tools.watermarkAdded"));
    });

  const exportImages = () =>
    run(
      t("tools.exporting"),
      async (setStatus, signal) => {
        const bytes = await assemble();
        const { pdfToImages } = await import("./pdfToImages");
        const out = await pdfToImages(
          bytes,
          exScope.indices(),
          { format: exFormat, dpi: exDpi, quality: 0.9, baseName },
          signal,
          (done, total) => setStatus(t("tools.exportProgress", { done, total })),
        );
        downloadBytes(out.bytes, out.name, out.mime);
        showSuccess(t("notice.exported", { file: out.name }));
      },
      { cancellable: true },
    );

  return (
    <>
      <PanelHeader title="tools.title" description="tools.description" />

      <Section title={t("tools.blank")}>
        <div className={styles.field}>
          <label htmlFor={ids.blankSize}>{t("tools.pageSize")}</label>
          <select id={ids.blankSize} value={blankSize} onChange={(e) => setBlankSize(e.target.value as PageSizeName)}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <button className="block" onClick={() => void addBlank()}>
          <Icon name="plus" size={16} />
          {t("tools.blankButton")}
        </button>
        <p>{t("tools.insertHint")}</p>
      </Section>

      <Section title={t("tools.images")}>
        <div className={styles.field}>
          <label htmlFor={ids.imgSize}>{t("tools.pageSize")}</label>
          <select id={ids.imgSize} value={imgSize} onChange={(e) => setImgSize(e.target.value as PageSizeName | "image")}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
            <option value="image">{t("tools.imageSize")}</option>
          </select>
        </div>
        <FileDrop
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          icon="image"
          label={t("tools.imagesDrop")}
          onFiles={(files) => void addImages(files)}
        />
        <p>{t("tools.imagesHint")}</p>
      </Section>

      <Section title={t("tools.numbers")}>
        <div className={styles.field}>
          <label htmlFor={ids.numPos}>{t("tools.position")}</label>
          <select id={ids.numPos} value={numPos} onChange={(e) => setNumPos(e.target.value as NumberPosition)}>
            {(["bottom-center", "bottom-right", "top-right"] as NumberPosition[]).map((p) => (
              <option key={p} value={p}>
                {t(`tools.position.${p}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.numTpl}>{t("tools.template")}</label>
          <input id={ids.numTpl} type="text" value={numTpl} onChange={(e) => setNumTpl(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.numStart}>{t("tools.start")}</label>
          <input
            id={ids.numStart}
            type="number"
            min={0}
            value={numStart}
            onChange={(e) => setNumStart(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>
        <ScopePicker name="num-scope" s={numScope} />
        <button className="block" disabled={!hasPages} onClick={() => void applyNumbers()}>
          {t("tools.numbersButton")}
        </button>
        <p>{t("tools.templateHint")}</p>
      </Section>

      <Section title={t("tools.watermark")}>
        <div className={styles.field}>
          <label htmlFor={ids.wmText}>{t("tools.watermarkText")}</label>
          <input
            id={ids.wmText}
            type="text"
            maxLength={60}
            placeholder={t("tools.watermarkPlaceholder")}
            value={wmText}
            onChange={(e) => setWmText(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.wmOpacity}>{t("tools.opacity", { value: Math.round(wmOpacity * 100) })}</label>
          <input
            id={ids.wmOpacity}
            type="range"
            min={0.05}
            max={0.6}
            step={0.05}
            value={wmOpacity}
            onChange={(e) => setWmOpacity(Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.wmAngle}>{t("tools.angle")}</label>
          <select id={ids.wmAngle} value={wmAngle} onChange={(e) => setWmAngle(Number(e.target.value))}>
            <option value={0}>0°</option>
            <option value={45}>45°</option>
            <option value={90}>90°</option>
          </select>
        </div>
        <ScopePicker name="wm-scope" s={wmScope} />
        <button className="block" disabled={!hasPages || !wmText.trim()} onClick={() => void applyWatermark()}>
          {t("tools.watermarkButton")}
        </button>
        <p>{t("tools.watermarkHint")}</p>
      </Section>

      <Section title={t("tools.exportImages")}>
        <div className={styles.field}>
          <label htmlFor={ids.exFormat}>{t("tools.format")}</label>
          <select id={ids.exFormat} value={exFormat} onChange={(e) => setExFormat(e.target.value as "png" | "jpeg")}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor={ids.exDpi}>{t("tools.resolution")}</label>
          <select id={ids.exDpi} value={exDpi} onChange={(e) => setExDpi(Number(e.target.value))}>
            <option value={96}>96 dpi</option>
            <option value={150}>150 dpi</option>
            <option value={300}>300 dpi</option>
          </select>
        </div>
        <ScopePicker name="ex-scope" s={exScope} />
        <button className="block" disabled={!hasPages} onClick={() => void exportImages()}>
          <Icon name="image" size={16} />
          {t("tools.exportImagesButton")}
        </button>
        <p>{t("tools.exportImagesHint")}</p>
      </Section>
    </>
  );
}
