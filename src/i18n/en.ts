/**
 * English UI strings — the reference dictionary. Every other locale must
 * provide exactly the same keys (enforced by the `Messages` type and a test).
 *
 * Placeholders use `{name}` syntax and are filled by `translate()`.
 */
export const en = {
  // App shell
  "app.name": "PDF Manager",
  "app.tagline": "Edit, organise, and convert PDFs — privately",
  "app.badge": "100% local",
  "app.reset": "Close document",
  "app.language": "Language",
  "app.authorLinkTitle": "Visit the author's GitHub page",
  "app.privacyNote": "Files never leave this device",
  "app.undo": "Undo",
  "app.redo": "Redo",

  // Navigation
  "nav.pages": "Pages",
  "nav.merge": "Merge & Split",
  "nav.annotate": "Annotate",
  "nav.compress": "Compress",
  "nav.convert": "Convert",
  "nav.export": "Export",
  "nav.credits": "Credits",
  "nav.shortcuts": "Keyboard shortcuts",

  // Dialogs
  "dialog.close": "Close",
  "credits.title": "Credits",
  "credits.version": "Version {version}",
  "credits.createdBy": "Created by",
  "credits.github": "View GitHub profile",
  "credits.builtWith": "Built with React, pdf-lib, PDF.js, docx, ExcelJS, and Electron.",
  "credits.licence": "Released under the Apache License 2.0.",
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.open": "Open or add a PDF",
  "shortcuts.undo": "Undo the last change",
  "shortcuts.redo": "Redo the change you undid",
  "shortcuts.selectAll": "Select all pages",
  "shortcuts.clear": "Clear the selection",
  "shortcuts.rotateRight": "Rotate selected pages right",
  "shortcuts.rotateLeft": "Rotate selected pages left",
  "shortcuts.delete": "Delete selected pages",
  "shortcuts.extract": "Extraction (page range or selected pages)",
  "shortcuts.export": "Download the edited PDF",
  "shortcuts.help": "Show this list",
  "shortcuts.zoomIn": "Zoom in (document view)",
  "shortcuts.zoomOut": "Zoom out (document view)",
  "shortcuts.zoomReset": "Actual size (document view)",
  "shortcuts.hint": "Press ? for keyboard shortcuts",

  // Landing (empty state)
  "home.title": "Your PDF toolkit, right on your desktop",
  "home.subtitle":
    "Read, annotate, sign, and fill in PDFs; merge, split, extract, rotate, compress, and convert them to Word or Excel. Nothing is uploaded — everything happens on this device.",
  "home.drop": "Drop PDF files here",
  "home.dropHint": "or click to browse",
  "home.feature.organise": "Organise pages",
  "home.feature.organiseText": "Reorder, rotate, delete, and extract pages with a click.",
  "home.feature.merge": "Merge & split",
  "home.feature.mergeText": "Combine documents or cut them into parts.",
  "home.feature.convert": "Convert",
  "home.feature.convertText": "Turn PDFs into editable Word and Excel files.",
  "home.feature.private": "Private by design",
  "home.feature.privateText": "No uploads, no tracking, no account.",

  // Toolbar above the page grid
  "toolbar.pages": "{count} pages",
  "toolbar.page": "1 page",
  "toolbar.selected": "{count} selected",
  "toolbar.selectAll": "Select all",
  "toolbar.clear": "Clear selection",
  "toolbar.hint": "Click to select · drag to reorder",

  // View switch and document viewer
  "view.label": "View",
  "view.grid": "Page grid",
  "view.document": "Document",
  "viewer.prevPage": "Previous page",
  "viewer.nextPage": "Next page",
  "viewer.pageNumber": "Page number",
  "viewer.zoom": "Zoom",
  "viewer.zoomIn": "Zoom in (Ctrl +)",
  "viewer.zoomOut": "Zoom out (Ctrl −)",
  "viewer.fitWidth": "Fit width",
  "viewer.fitPage": "Fit page",
  "viewer.select": "Select and move",
  "viewer.addText": "Add text",
  "viewer.addImage": "Add a signature or image",
  "viewer.hint":
    "Ctrl + wheel to zoom · select text to copy it · double-click a text box to edit it",
  "viewer.hintText": "Click on the page where the text should go (Esc to cancel).",
  "viewer.formatText": "Text",
  "viewer.formatImage": "Signature / image",
  "thumb.annotations": "{count} annotation(s)",
  "thumb.open": "Double-click to open in the document view",

  // Pages panel
  "pages.title": "Pages",
  "pages.description": "Select pages in the grid, then choose an action.",
  "pages.add": "Add pages",
  "pages.addDrop": "Add a PDF",
  "pages.addHint": "New files are appended to the end.",
  "pages.selection": "Selection",
  "pages.selectAll": "Select all",
  "pages.clear": "Clear",
  "pages.edit": "Edit selected pages",
  "pages.rotateLeft": "Rotate left",
  "pages.rotateRight": "Rotate right",
  "pages.extraction": "Extraction",
  "pages.extractionHint":
    "Type pages or ranges (1-3, 7, 10-), or leave the box empty to use the pages selected in the grid. A new PDF is saved; the current document stays unchanged.",
  "pages.rangeLabel": "Pages to extract",
  "pages.rangePlaceholder": "e.g. 1-3, 7",
  "pages.rangeSelect": "Select",
  "pages.rangeSelectTitle": "Select these pages in the grid",
  "pages.keepOnly": "Keep only selected",
  "pages.delete": "Delete",
  "pages.reorderHint": "Reorder by dragging pages in the grid.",

  // Merge / split panel
  "merge.title": "Merge & Split",
  "merge.description": "Combine several PDFs or cut one into parts.",
  "merge.merge": "Merge",
  "merge.drop": "Add PDFs to merge",
  "merge.hint":
    "Added files are appended to the current document. Use Export to save the merged result.",
  "merge.split": "Split",
  "merge.splitLabel": "Split after page numbers (comma-separated)",
  "merge.splitPlaceholder": "e.g. 3, 7",
  "merge.splitButton": "Split & download parts",
  "merge.splitHint": "Each part downloads as its own PDF.",
  "merge.insert": "Insert pages from another PDF",
  "merge.insertAfter": "Insert after page #",
  "merge.insertDrop": "Pick a PDF to insert",
  "merge.insertHint": "Use 0 to insert at the very beginning.",

  // Annotate panel
  "annotate.title": "Annotate",
  "annotate.description":
    "Add text and signatures, fill in forms, and read the document at any zoom.",
  "annotate.add": "Add to the page",
  "annotate.addTextButton": "Add text",
  "annotate.addTextHint": "Then click on the page where the text should go.",
  "annotate.imageDrop": "Add a signature or image",
  "annotate.imageHint": "PNG, JPG, WebP, GIF, or BMP. It appears in the middle of the current page.",
  "annotate.howTo": "Editing on the page",
  "annotate.tipMove": "Drag a text or signature to move it.",
  "annotate.tipEdit": "Double-click a text to change it.",
  "annotate.tipFormat": "Select a text to change its font, size, style, and colour in the bar above the page.",
  "annotate.tipResize": "Drag a signature's corners to resize it, or its edges to reshape it.",
  "annotate.tipDelete": "Press Delete to remove the selected item; arrow keys nudge it.",
  "annotate.forms": "Forms",
  "annotate.formsHint":
    "Fillable fields are highlighted in blue on the page: type in them, tick boxes, and pick options. Entries are saved into the fields when you export.",
  "annotate.flattenNote":
    "Annotations stay editable until you export, compress, or convert the document.",
  "annotate.defaultText": "Text",
  "annotate.font": "Font",
  "annotate.fontSize": "Font size (pt)",
  "annotate.smaller": "Smaller text",
  "annotate.larger": "Larger text",
  "annotate.bold": "Bold",
  "annotate.italic": "Italic",
  "annotate.colour": "Text colour",
  "annotate.editText": "Edit text",
  "annotate.keepRatio": "Keep proportions",
  "annotate.resizeHint": "Corners resize · edges reshape · Shift switches proportions",
  "annotate.remove": "Remove (Del)",
  "annotate.imageTitle": "Drag to move · drag the handles to resize",
  "annotate.textTitle": "Drag to move · double-click to edit",

  // Compress panel
  "compress.title": "Compress",
  "compress.description": "Make the document lighter to share.",
  "compress.button": "Compress document",
  "compress.result": "Saved {pct}% ({before} → {after}). Use Export to download.",
  "compress.hint":
    "Re-packs the PDF structure with object streams. Embedded images are not re-encoded, so gains vary.",

  // Convert panel
  "convert.title": "Convert",
  "convert.description": "Turn the current document into an Office file.",
  "convert.word": "PDF → Word",
  "convert.excel": "PDF → Excel",
  "convert.hint":
    "Keeps headings, fonts, tables, and images. Excel gets one sheet per page with numbers stored as real numbers. Scanned PDFs are not recognised (no OCR).",

  // Export panel
  "export.title": "Export",
  "export.description": "Save your work as a new PDF.",
  "export.button": "Download edited PDF",
  "export.hint":
    "Applies the current page order, rotations, and deletions, and saves your annotations and form entries into the pages.",

  // Thumbnails
  "thumb.rendering": "Rendering…",
  "thumb.failed": "Preview unavailable",
  "thumb.alt": "Page {n}",

  // Busy / status messages
  "busy.loading": "Loading PDF…",
  "busy.splitting": "Splitting…",
  "busy.inserting": "Inserting…",
  "busy.extracting": "Extracting pages…",
  "busy.compressing": "Compressing…",
  "busy.toWord": "Converting to Word…",
  "busy.toWordPage": "Converting to Word… page {done} of {total}",
  "busy.toExcel": "Converting to Excel…",
  "busy.toExcelPage": "Converting to Excel… page {done} of {total}",
  "busy.exporting": "Exporting…",

  // Success notices
  "notice.extracted": "Extracted {count} page(s) to {file}",
  "notice.exported": "Saved {file}",
  "notice.split": "Downloaded {count} parts",
  "notice.dismiss": "Dismiss",

  // Errors
  "error.splitPoints":
    "Provide at least one valid split point (e.g. 3, 7) inside the page range.",
  "error.imageType": "This image could not be read. Use a PNG, JPG, WebP, GIF, or BMP image.",
  "error.loadFirst": "Load a PDF first.",
  "error.noSelection": "Select at least one page first.",
  "error.noFile": "No file provided.",
  "error.notPdf": "“{name}” is not a PDF file.",
  "error.empty": "“{name}” is empty.",
  "error.tooLarge": "“{name}” is too large (max {max} MB).",
  "error.invalid": "“{name}” does not look like a valid PDF.",
  "error.encrypted":
    "“{name}” is password-protected. Remove the password and try again.",
  "error.corrupted": "“{name}” could not be read — it may be corrupted.",
  "error.noPages": "“{name}” has no pages.",
  "error.nothingToExport": "Nothing to export — the document has no pages.",
  "error.missingSource": "A source PDF is missing.",
  "error.invalidRange":
    "“{range}” is not a valid page range. Use page numbers and ranges such as 1-3, 7.",
  "error.rangeOutOfBounds": "Page {page} does not exist — the document has {max} pages.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
