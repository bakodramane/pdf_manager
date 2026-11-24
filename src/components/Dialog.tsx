import { useEffect, useRef, type ReactNode } from "react";
import styles from "../App.module.css";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

/**
 * Modal built on the native <dialog> element: it traps focus, closes on
 * Escape, and dims the page behind it. Clicking the backdrop also closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the <dialog> itself (not its content) is the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogBody}>
        <div className={styles.dialogHeader}>
          <h2>{title}</h2>
          <button
            className="icon"
            aria-label={t("dialog.close")}
            title={t("dialog.close")}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
