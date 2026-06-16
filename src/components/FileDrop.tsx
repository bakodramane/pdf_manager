import { useRef, useState } from "react";
import styles from "../App.module.css";

interface Props {
  onFiles: (files: File[]) => void;
  label?: string;
  accept?: string;
  multiple?: boolean;
}

/** Reusable drag-and-drop + click-to-browse file picker. */
export function FileDrop({
  onFiles,
  label = "Drop PDF files here, or click to browse",
  accept = "application/pdf",
  multiple = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      className={[styles.dropzone, over ? styles.over : ""].join(" ")}
      onClick={() => inputRef.current?.click()}
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
      {label}
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
