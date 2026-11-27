// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatPopplerInstallHelp,
  isPopplerRequiredByEnv,
  requirePopplerExecutable,
  resolveOptionalPopplerExecutable,
  resolvePopplerExecutable,
} from "./poppler";

/** An env whose PATH is an empty folder, so no Poppler binary can be found. */
function noPopplerEnv(extra: NodeJS.ProcessEnv = {}): { env: NodeJS.ProcessEnv; cleanup: () => void } {
  const emptyDir = mkdtempSync(join(tmpdir(), "pdfm-empty-path-"));
  return { env: { PATH: emptyDir, ...extra }, cleanup: () => rmSync(emptyDir, { recursive: true, force: true }) };
}

describe("Poppler test prerequisite resolution", () => {
  it("reports a clear error when PDFTOTEXT_PATH does not exist", () => {
    const missing = join(tmpdir(), "pdfm-does-not-exist", "pdftotext.exe");
    const res = resolvePopplerExecutable("pdftotext", { PDFTOTEXT_PATH: missing }, "win32");
    expect(res.available).toBe(false);
    expect(res.reason).toContain("PDFTOTEXT_PATH does not exist");
    expect(() => requirePopplerExecutable("pdftotext", { PDFTOTEXT_PATH: missing }, "win32")).toThrow(
      /Missing external test prerequisite: Poppler \(pdftotext\)/,
    );
  });

  it("reports a clear error when PDFTOTEXT_PATH points to a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "pdfm-poppler-dir-"));
    try {
      const res = resolvePopplerExecutable("pdftotext", { PDFTOTEXT_PATH: dir }, "win32");
      expect(res.available).toBe(false);
      expect(res.reason).toContain("points to a directory");
      expect(res.reason).toContain("pdftotext.exe");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects NUL bytes in PDFTOTEXT_PATH", () => {
    const res = resolvePopplerExecutable("pdftotext", { PDFTOTEXT_PATH: "pdftotext\0bad" }, "linux");
    expect(res.available).toBe(false);
    expect(res.reason).toContain("NUL");
  });

  it("fails fast in optional resolution when PDFTOTEXT_PATH is set to an invalid path", () => {
    const missing = join(tmpdir(), "pdfm-bad-env", "pdftotext");
    expect(() => resolveOptionalPopplerExecutable("pdftotext", { PDFTOTEXT_PATH: missing }, "linux")).toThrow(
      /PDFTOTEXT_PATH does not exist/,
    );
  });

  it("fails in optional resolution when CI or PDFM_REQUIRE_POPPLER is set and Poppler is absent", () => {
    const { env, cleanup } = noPopplerEnv({ CI: "true" });
    try {
      expect(isPopplerRequiredByEnv(env)).toBe(true);
      expect(() => resolveOptionalPopplerExecutable("pdftotext", env, "linux")).toThrow(
        /sudo apt-get install -y poppler-utils/,
      );
    } finally {
      cleanup();
    }
    expect(isPopplerRequiredByEnv({ PDFM_REQUIRE_POPPLER: "1" })).toBe(true);
    expect(isPopplerRequiredByEnv({})).toBe(false);
  });

  it("returns null in optional resolution locally when Poppler is not on PATH", () => {
    const { env, cleanup } = noPopplerEnv();
    try {
      expect(resolveOptionalPopplerExecutable("pdftotext", env, "win32")).toBeNull();
    } finally {
      cleanup();
    }
  });

  it("prioritises platform-specific instructions including portable Windows without admin rights", () => {
    const winHeading = "Windows (no administrator privileges required):";
    const winHelp = formatPopplerInstallHelp("pdftotext", "win32", "not found");
    expect(winHelp).toContain(winHeading);
    expect(winHelp).toContain("oschwartz10612/poppler-windows");
    expect(winHelp).toContain("PDFTOTEXT_PATH");
    expect(winHelp).toContain("not need it");
    expect(winHelp.indexOf(winHeading)).toBeLessThan(winHelp.indexOf("Linux:"));

    const macHelp = formatPopplerInstallHelp("pdftotext", "darwin");
    expect(macHelp).toContain("brew install poppler");
    expect(macHelp.indexOf("macOS:")).toBeLessThan(macHelp.indexOf(winHeading));

    const linuxHelp = formatPopplerInstallHelp("pdftotext", "linux");
    expect(linuxHelp).toContain("poppler-utils");
    expect(linuxHelp.indexOf("Linux:")).toBeLessThan(linuxHelp.indexOf(winHeading));
  });
});
