# Batch MT for RTL locales. Run from project root.
$files = @(
  'common.json',
  'auth.json',
  'onboarding.json',
  'activity.json',
  'governance.json',
  'documents.json',
  'admin.json',
  'organization.json'
)
foreach ($f in $files) {
  Write-Host "=== ar,fa,ur $f ==="
  python scripts/auto_translate_locales.py ar,fa,ur $f
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host "=== DONE ==="
