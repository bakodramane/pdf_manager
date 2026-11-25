"use strict";
/**
 * Authenticode signing hook for electron-builder (win.signtoolOptions.sign).
 * electron-builder calls it for every file it signs: the app executable,
 * the NSIS uninstaller and installer, and the portable wrapper, in the
 * right order (after Electron fuses are applied).
 *
 * Provider-neutral: the maintainer configures a signing method through
 * environment variables in a protected CI environment (never in the repo):
 *
 *   PDFM_SIGN_MODE=signtool        enable signing with Windows SDK signtool
 *   PDFM_SIGNTOOL=<path>           signtool.exe (default: "signtool" on PATH)
 *   PDFM_SIGNTOOL_ARGS=<json>      JSON array of certificate-selection
 *                                  arguments, for example
 *                                    ["/sha1","<thumbprint>"]  (hardware token / cert store)
 *                                    ["/dlib","<path>\\Azure.CodeSigning.Dlib.dll","/dmdf","<path>\\metadata.json"]
 *                                  (no passwords or keys: authentication
 *                                  stays with the token, HSM or OIDC login)
 *   PDFM_TIMESTAMP_URL=<url>       RFC 3161 timestamp server (required)
 *   PDFM_REQUIRE_SIGNING=1         fail the build if signing is not
 *                                  configured or does not verify
 *
 * Without PDFM_SIGN_MODE the build is UNSIGNED (development / clearly
 * labelled preview). It never creates or uses a self-signed certificate.
 */
const { execFileSync } = require("child_process");

module.exports = async function sign(configuration) {
  const file = configuration.path;
  const required = process.env.PDFM_REQUIRE_SIGNING === "1";
  const mode = process.env.PDFM_SIGN_MODE;

  if (!mode) {
    if (required) {
      throw new Error(`Signing is required (PDFM_REQUIRE_SIGNING=1) but PDFM_SIGN_MODE is not set; refusing to produce ${file} unsigned.`);
    }
    console.log(`  • UNSIGNED (no signing configured): ${file}`);
    return;
  }
  // SHA-256 only (no legacy SHA-1 dual signature).
  if (configuration.hash && configuration.hash !== "sha256") return;
  if (mode !== "signtool") throw new Error(`Unknown PDFM_SIGN_MODE "${mode}".`);

  const timestamp = process.env.PDFM_TIMESTAMP_URL;
  if (!timestamp || !/^https?:\/\//.test(timestamp)) {
    throw new Error("PDFM_TIMESTAMP_URL must be set to an RFC 3161 timestamp server URL.");
  }
  let selection;
  try {
    selection = JSON.parse(process.env.PDFM_SIGNTOOL_ARGS || "[]");
  } catch {
    throw new Error("PDFM_SIGNTOOL_ARGS must be a JSON array of strings.");
  }
  if (!Array.isArray(selection) || selection.some((a) => typeof a !== "string")) {
    throw new Error("PDFM_SIGNTOOL_ARGS must be a JSON array of strings.");
  }
  const signtool = process.env.PDFM_SIGNTOOL || "signtool";
  const description = ["/d", "PDF Manager", "/du", "https://github.com/bakodramane/pdf_manager"];
  execFileSync(signtool, ["sign", "/fd", "SHA256", "/tr", timestamp, "/td", "SHA256", ...description, ...selection, file], {
    stdio: "inherit",
  });
  // Fail closed: the file must verify under the default Authenticode policy.
  execFileSync(signtool, ["verify", "/pa", "/v", file], { stdio: "inherit" });
};
