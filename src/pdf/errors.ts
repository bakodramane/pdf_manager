/**
 * Errors raised by the PDF layer carry a stable `code` plus parameters so the
 * UI can show them in the user's language. `message` stays in English for
 * logs and tests.
 */
export type ErrorCode =
  | "noFile"
  | "notPdf"
  | "empty"
  | "tooLarge"
  | "totalTooLarge"
  | "tooManyPages"
  | "tooManyFiles"
  | "imageTooLarge"
  | "invalid"
  | "encrypted"
  | "corrupted"
  | "noPages"
  | "nothingToExport"
  | "missingSource"
  | "invalidRange"
  | "rangeOutOfBounds"
  | "imageType";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}
