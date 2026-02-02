$ErrorActionPreference = 'Stop'

Write-Host "=== 1) Wait for app startup log ===" -ForegroundColor Green
$ErrorActionPreference = 'Continue'
$started = $false
for ($i = 0; $i -lt 24; $i++) {
  $line = docker logs mmbs-app 2>&1 | Select-String "启动成功" | Select-Object -Last 1
  if ($line) { $line; $started = $true; break }
  Start-Sleep -Seconds 5
}
if (-not $started) {
  Write-Host "No 'startup success' log yet (maybe still initializing DB)." -ForegroundColor Yellow
}
$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "=== 2) Verify container env WX_PAY_SANDBOX ===" -ForegroundColor Green
docker exec mmbs-app sh -lc 'echo WX_PAY_SANDBOX=$WX_PAY_SANDBOX'

Write-Host ""
Write-Host "=== 3) Verify admin API: /api/payment-config/get ===" -ForegroundColor Green
$loginBody = @{ username = "admin"; password = "admin123" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $login.data.token
$headers = @{ Authorization = "Bearer $token" }
$cfg = Invoke-RestMethod -Uri "http://localhost:3000/api/payment-config/get" -Headers $headers
$cfg | ConvertTo-Json -Depth 6

