import { useRef, useState } from "react";
import styles from "../App.module.css";
import { Icon, type IconName } from "./Icon";

interface Props {
  onFiles: (files: File[]) => void;
  label: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  icon?: IconName;
  /** "hero" is the large landing-page drop zone; "compact" fits in a panel. */
  variant?: "hero" | "compact";
}

/** Reusable drag-and-drop + click-to-browse file picker. */
export function FileDrop({
  onFiles,
  label,
  hint,
  accept = "application/pdf",
  multiple = true,
  icon = "upload",
  variant = "compact",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const open = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        styles.dropzone,
        variant === "hero" ? styles.dropzoneHero : "",
        over ? styles.over : "",
      ].join(" ")}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      <span className={styles.dropIcon}>
        <Icon name={icon} size={variant === "hero" ? 30 : 18} />
      </span>
      <span className={styles.dropText}>
        <strong>{label}</strong>
        {hint && <span>{hint}</span>}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
