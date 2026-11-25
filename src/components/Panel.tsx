import type { ReactNode } from "react";
import styles from "../App.module.css";
import { useI18n, type MessageKey } from "../i18n";

export function PanelHeader({ title, description }: { title: MessageKey; description: MessageKey }) {
  const { t } = useI18n();
  return (
    <div className={styles.panelHeader}>
      <h2>{t(title)}</h2>
      <p>{t(description)}</p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
