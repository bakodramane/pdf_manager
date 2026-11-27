// Cross-platform check for external test prerequisites (Poppler CLI tools
// used as independent PDF verifiers in unit/integration and E2E tests).
// Poppler is a development/testing dependency only; end users never need it.
//
// Usage:
//   node scripts/check-test-prerequisites.mjs [--e2e]
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const platform = process.platform;
const checkE2e = process.argv.includes("--e2e");

function binName(tool) {
  return platform === "win32" ? `${tool}.exe` : tool;
}

function probe(executable, args = ["-v"]) {
  const res = spawnSync(executable, args, {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true,
  });
  if (res.error) {
    return { ok: false, error: res.error.code ? `${res.error.code}: ${res.error.message}` : res.error.message };
  }
  if (res.status !== 0) {
    const line = `${res.stderr || res.stdout || ""}`.trim().split(/\r?\n/)[0];
    return { ok: false, error: `exit ${res.status}${line ? ` (${line})` : ""}` };
  }
  const version = `${res.stderr || ""}\n${res.stdout || ""}`.trim().split(/\r?\n/)[0]?.trim();
  return { ok: true, version };
}

function resolveTool(tool) {
  const configured = process.env.PDFTOTEXT_PATH?.trim();
  if (configured) {
    if (configured.includes("\0")) {
      return { ok: false, tool, reason: "PDFTOTEXT_PATH contains an invalid NUL byte." };
    }
    if (tool === "pdftotext") {
      if (!existsSync(configured)) {
        return { ok: false, tool, reason: `PDFTOTEXT_PATH does not exist: ${configured}` };
      }
      if (statSync(configured).isDirectory()) {
        return {
          ok: false,
          tool,
          reason: `PDFTOTEXT_PATH points to a directory (${configured}). Point it to ${join(configured, binName("pdftotext"))}.`,
        };
      }
      const res = probe(configured);
      return res.ok
        ? { ok: true, tool, executable: configured, source: "PDFTOTEXT_PATH", version: res.version }
        : { ok: false, tool, reason: `PDFTOTEXT_PATH could not be executed (${configured}): ${res.error}` };
    }

    const siblingDir = existsSync(configured) && statSync(configured).isDirectory()
      ? configured
      : dirname(configured);
    const sibling = join(siblingDir, binName(tool));
    if (existsSync(sibling) && !statSync(sibling).isDirectory()) {
      const res = probe(sibling);
      if (res.ok) {
        return { ok: true, tool, executable: sibling, source: "sibling of PDFTOTEXT_PATH", version: res.version };
      }
    }
  }

  const res = probe(tool);
  return res.ok
    ? { ok: true, tool, executable: tool, source: "PATH", version: res.version }
    : { ok: false, tool, reason: `${tool} was not found on PATH (${res.error}).` };
}

function printInstallHelp(missing) {
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
  const blocks =
    platform === "win32"
      ? [winBlock, linuxBlock, macBlock]
      : platform === "darwin"
        ? [macBlock, winBlock, linuxBlock]
        : [linuxBlock, winBlock, macBlock];

  console.error("Missing external test prerequisite(s):");
  for (const m of missing) console.error(`  - ${m.tool}: ${m.reason}`);
  console.error("");
  console.error("Poppler is a development/testing dependency only (independent PDF verification).");
  console.error("End users of the Windows portable, NSIS installer, and web editions do not need it.");
  console.error("");
  for (const block of blocks) {
    for (const line of block) console.error(line);
    console.error("");
  }
}

const results = [resolveTool("pdftotext"), resolveTool("pdfinfo")];
const missing = results.filter((r) => !r.ok);

for (const r of results) {
  if (r.ok) {
    console.log(`ok  ${r.tool}: ${r.executable} (${r.source}${r.version ? ` — ${r.version}` : ""})`);
  }
}

if (missing.length > 0) {
  printInstallHelp(missing);
  process.exit(1);
}

if (checkE2e && platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  const xvfb = probe("xvfb-run", ["--help"]);
  if (!xvfb.ok) {
    console.error("Missing Linux headless display wrapper for Electron E2E tests: xvfb-run.");
    console.error("Install Xvfb (e.g. sudo apt-get install -y xvfb) and run: xvfb-run -a npm run test:e2e");
    process.exit(1);
  }
  console.log("ok  xvfb-run: available for headless Electron E2E (run with: xvfb-run -a npm run test:e2e)");
}
