import { PDFDocument } from "pdf-lib";

/**
 * "Compress" in a browser-only app is limited. pdf-lib cannot re-encode
 * embedded images, so the realistic wins come from object-stream packing and
 * dropping redundant structure. We re-save with object streams enabled, which
 * for many PDFs (especially ones exported by office software) meaningfully
 * reduces size. See README for the honest limitations.
 */
export async function compressPdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
}
