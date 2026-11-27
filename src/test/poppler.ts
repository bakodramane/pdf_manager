import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export type PopplerTool = "pdftotext" | "pdfinfo";

export interface PopplerCheckResult {
  available: boolean;
  tool: PopplerTool;
  executable?: string;
  source?: "env" | "sibling" | "path";
  version?: string;
  reason?: string;
}

function binaryFilename(tool: PopplerTool, platform: NodeJS.Platform): string {
  return platform === "win32" ? `${tool}.exe` : tool;
}

function probeExecutable(executable: string): { ok: boolean; version?: string; error?: string } {
  const res = spawnSync(executable, ["-v"], {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  if (res.error) {
    const err = res.error as NodeJS.ErrnoException;
    return { ok: false, error: err.code ? `${err.code}: ${err.message}` : err.message };
  }
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim().split(/\r?\n/)[0];
    return {
      ok: false,
      error: `exited with code ${res.status}${detail ? ` (${detail})` : ""}`,
    };
  }
  const output = `${res.stderr ?? ""}\n${res.stdout ?? ""}`.trim();
  const version = output.split(/\r?\n/)[0]?.trim() || undefined;
  return { ok: true, version };
}

/**
 * True when missing Poppler must fail rather than degrade to optional checks
 * (always true on CI or when PDFM_REQUIRE_POPPLER=1 is set).
 */
export function isPopplerRequiredByEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CI === "true" || env.CI === "1" || env.PDFM_REQUIRE_POPPLER === "1";
}

/**
 * Resolve a Poppler CLI executable (`pdftotext` or `pdfinfo`).
 *
 * Resolution order:
 * - For `pdftotext`: `PDFTOTEXT_PATH` (when set), otherwise `pdftotext` on `PATH`.
 * - For `pdfinfo`: sibling `pdfinfo(.exe)` next to `PDFTOTEXT_PATH` (when set),
 *   otherwise `pdfinfo` on `PATH`.
 */
export function resolvePopplerExecutable(
  tool: PopplerTool,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): PopplerCheckResult {
  const configuredRaw = env.PDFTOTEXT_PATH?.trim();

  if (configuredRaw) {
    if (configuredRaw.includes("\0")) {
      return {
        available: false,
        tool,
        reason: "PDFTOTEXT_PATH contains an invalid NUL byte.",
      };
    }

    if (tool === "pdftotext") {
      if (!existsSync(configuredRaw)) {
        return {
          available: false,
          tool,
          reason: `PDFTOTEXT_PATH does not exist: ${configuredRaw}`,
        };
      }
      if (statSync(configuredRaw).isDirectory()) {
        const suggested = join(configuredRaw, binaryFilename("pdftotext", platform));
        return {
          available: false,
          tool,
          reason: `PDFTOTEXT_PATH points to a directory (${configuredRaw}). Point it to the executable instead, e.g. ${suggested}`,
        };
      }
      const probe = probeExecutable(configuredRaw);
      if (!probe.ok) {
        return {
          available: false,
          tool,
          reason: `PDFTOTEXT_PATH could not be executed (${configuredRaw}): ${probe.error}`,
        };
      }
      return {
        available: true,
        tool,
        executable: configuredRaw,
        source: "env",
        version: probe.version,
      };
    }

    // For pdfinfo: check for a sibling binary in the same Poppler bin folder first.
    const siblingDir = existsSync(configuredRaw) && statSync(configuredRaw).isDirectory()
      ? configuredRaw
      : dirname(configuredRaw);
    const sibling = join(siblingDir, binaryFilename("pdfinfo", platform));
    if (existsSync(sibling) && !statSync(sibling).isDirectory()) {
      const probe = probeExecutable(sibling);
      if (probe.ok) {
        return {
          available: true,
          tool,
          executable: sibling,
          source: "sibling",
          version: probe.version,
        };
      }
    }
  }

  const probe = probeExecutable(tool);
  if (probe.ok) {
    return {
      available: true,
      tool,
      executable: tool,
      source: "path",
      version: probe.version,
    };
  }

  return {
    available: false,
    tool,
    reason: `${tool} was not found on PATH (${probe.error}).`,
  };
}

/**
 * Format actionable, cross-platform installation instructions for Poppler.
 */
export function formatPopplerInstallHelp(
  tool: PopplerTool,
  platform: NodeJS.Platform = process.platform,
  detail?: string,
): string {
  const winBlock = [
    "Windows (no administrator privileges required):",
    "  - Portable archive: download the latest Release-*.zip from",
    "    https://github.com/oschwartz10612/poppler-windows/releases,",
    "    extract it to e.g. %USERPROFILE%\\Tools\\Poppler, and either add",
    "    ...\\Library\\bin to your user PATH or set PDFTOTEXT_PATH:",
    '      PowerShell: $env:PDFTOTEXT_PATH = "$env:USERPROFILE\\Tools\\Poppler\\poppler-<version>\\Library\\bin\\pdftotext.exe"',
    '      cmd.exe:    set PDFTOTEXT_PATH=%USERPROFILE%\\Tools\\Poppler\\poppler-<version>\\Library\\bin\\pdftotext.exe',
    "  - Scoop (user-space):  scoop install poppler",
    "  - Winget:              winget install -e --id oschwartz10612.Poppler",
  ];
  const linuxBlock = [
    "Linux:",
    "  - Debian / Ubuntu:  sudo apt-get update && sudo apt-get install -y poppler-utils",
    "  - Fedora / RHEL:    sudo dnf install -y poppler-utils",
    "  - Arch Linux:       sudo pacman -S poppler",
  ];
  const macBlock = [
    "macOS:",
    "  - Homebrew:         brew install poppler",
  ];

  const orderedBlocks =
    platform === "win32"
      ? [winBlock, linuxBlock, macBlock]
      : platform === "darwin"
        ? [macBlock, winBlock, linuxBlock]
        : [linuxBlock, winBlock, macBlock];

  return [
    `Missing external test prerequisite: Poppler (${tool}).`,
    detail ? `Cause: ${detail}` : null,
    "",
    "Poppler is a development/testing dependency only (independent PDF verification).",
    "End users of the Windows portable, NSIS installer, and web editions do not need it.",
    "",
    ...orderedBlocks.flatMap((block) => [...block, ""]),
    "Explicit override on any platform:",
    "  Set PDFTOTEXT_PATH to the full path of the pdftotext executable,",
    "  then verify your setup with: npm run test:check-prereqs",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Return the resolved Poppler executable or throw an error with actionable
 * cross-platform installation instructions.
 */
export function requirePopplerExecutable(
  tool: PopplerTool,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const result = resolvePopplerExecutable(tool, env, platform);
  if (!result.available || !result.executable) {
    throw new Error(formatPopplerInstallHelp(tool, platform, result.reason));
  }
  return result.executable;
}

/**
 * Resolve a Poppler tool for tests that are optional locally when Poppler is
 * not installed, while still failing fast when:
 * - PDFTOTEXT_PATH is explicitly set to an invalid path, or
 * - CI / PDFM_REQUIRE_POPPLER=1 requires Poppler to be installed.
 */
export function resolveOptionalPopplerExecutable(
  tool: PopplerTool,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const result = resolvePopplerExecutable(tool, env, platform);
  if (result.available && result.executable) {
    return result.executable;
  }
  if (tool === "pdftotext" && env.PDFTOTEXT_PATH?.trim()) {
    throw new Error(formatPopplerInstallHelp(tool, platform, result.reason));
  }
  if (isPopplerRequiredByEnv(env)) {
    throw new Error(formatPopplerInstallHelp(tool, platform, result.reason));
  }
  return null;
}

/** Run Poppler's `pdftotext` with UTF-8 output and no shell interpolation. */
export function runPdftotext(args: string[], executable?: string): string {
  const bin = executable ?? requirePopplerExecutable("pdftotext");
  return execFileSync(bin, args, { encoding: "utf8", windowsHide: true });
}

/** Run Poppler's `pdfinfo` with UTF-8 output and no shell interpolation. */
export function runPdfinfo(args: string[], executable?: string): string {
  const bin = executable ?? requirePopplerExecutable("pdfinfo");
  return execFileSync(bin, args, { encoding: "utf8", windowsHide: true });
}
