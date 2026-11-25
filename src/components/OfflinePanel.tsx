import { useCallback, useEffect, useState } from "react";
import styles from "../App.module.css";
import { useI18n } from "../i18n";
import { formatBytes } from "../format";
import { ocrFilesFor, offlineStatus, prepareOcr, resetOfflineData, type OfflineStatus } from "../pwa";

interface Manifest {
  languages: Record<"eng" | "fra", { bytes: number }>;
  engineFiles: { file: string; bytes: number }[];
}

/** Web edition: what works offline, and explicit OCR language packs. */
export function OfflinePanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    offlineStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refresh();
    fetch(new URL("ocr/manifest.json", document.baseURI).href)
      .then((r) => (r.ok ? r.json() : null))
      .then(setManifest)
      .catch(() => undefined);
  }, [refresh]);

  const engineSize = manifest ? Math.max(...manifest.engineFiles.map((f) => f.bytes)) + 111_000 : 0;
  const ready = (lang: "eng" | "fra") => !!status?.ocrFiles.includes(`ocr/lang/${lang}.traineddata.gz`);

  const prepare = async (lang: "eng" | "fra") => {
    setError(null);
    try {
      const files = await ocrFilesFor([lang]);
      await prepareOcr(files, (done, total) => setBusy(t("offline.preparing", { done, total })));
      refresh();
    } catch (err) {
      setError(err instanceof Error && err.message === "offline-not-ready" ? t("offline.notReady") : t("offline.failed"));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!window.confirm(t("offline.resetConfirm"))) return;
    await resetOfflineData();
    setStatus(null);
    setError(null);
  };

  return (
    <div className={styles.credits}>
      <p>{t("offline.intro")}</p>
      <p role="status">
        <strong>{status?.shellReady ? t("offline.appReady") : t("offline.appNotReady")}</strong>
      </p>
      <h3>{t("offline.ocrTitle")}</h3>
      <p>{t("offline.ocrIntro", { engine: formatBytes(engineSize) })}</p>
      {(["eng", "fra"] as const).map((lang) => (
        <div key={lang} className={styles.row}>
          <span>
            {t(lang === "eng" ? "ocr.lang.eng" : "ocr.lang.fra")}
            {manifest ? ` (${formatBytes(manifest.languages[lang].bytes)})` : ""}
            {" — "}
            {ready(lang) ? t("offline.packReady") : t("offline.packMissing")}
          </span>
          {!ready(lang) && (
            <button disabled={!!busy || !status} onClick={() => void prepare(lang)}>
              {t("offline.prepare")}
            </button>
          )}
        </div>
      ))}
      {busy && <p aria-live="polite">{busy}</p>}
      {error && (
        <p className={styles.warning} role="alert">
          {error}
        </p>
      )}
      <p>{t("offline.never")}</p>
      <button className="ghost" onClick={() => void reset()}>
        {t("offline.reset")}
      </button>
    </div>
  );
}
