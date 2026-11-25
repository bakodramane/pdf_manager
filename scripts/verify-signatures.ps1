# Verify Authenticode signatures of the final Windows artifacts.
# Usage: pwsh scripts/verify-signatures.ps1 -Path release [-RequireSigned]
# Checks every .exe in the release folder and in win-unpacked (the
# installed/extracted app). With -RequireSigned, any file that is not
# "Valid", lacks an RFC 3161 timestamp, or has another publisher fails.
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [switch]$RequireSigned,
  [string]$ExpectedPublisher = $env:PDFM_EXPECTED_PUBLISHER
)
$ErrorActionPreference = "Stop"
$files = @(Get-ChildItem -Path $Path -Filter *.exe -File)
$unpacked = Join-Path $Path "win-unpacked"
if (Test-Path $unpacked) { $files += Get-ChildItem -Path $unpacked -Filter *.exe -File -Recurse }
if ($files.Count -eq 0) { throw "No .exe files found under $Path" }

$failed = $false
foreach ($f in $files) {
  $sig = Get-AuthenticodeSignature -FilePath $f.FullName
  $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "-" }
  $stamped = [bool]$sig.TimeStamperCertificate
  "{0,-60} {1,-12} timestamp={2,-5} {3}" -f $f.Name, $sig.Status, $stamped, $subject
  if ($RequireSigned) {
    if ($sig.Status -ne "Valid" -or -not $stamped) { $failed = $true }
    if ($ExpectedPublisher -and $subject -notlike "*$ExpectedPublisher*") { $failed = $true }
  }
}
if ($failed) { throw "Signature verification failed (see table above)." }
if (-not $RequireSigned) { "Signature check informational only (unsigned build allowed)." }
