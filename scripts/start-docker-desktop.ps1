$ErrorActionPreference = 'Continue'

Write-Host "=== Starting Docker Desktop service/process ==="

# Try start Windows service (may require admin)
try {
  Start-Service com.docker.service -ErrorAction Stop
  Write-Host "Service com.docker.service started."
} catch {
  Write-Host "Could not start com.docker.service (maybe need admin). Will try launching Docker Desktop..."
}

$exe = Join-Path $env:ProgramFiles "Docker\\Docker\\Docker Desktop.exe"
if (Test-Path $exe) {
  Start-Process -FilePath $exe | Out-Null
  Write-Host "Launched: $exe"
} else {
  Write-Host "Docker Desktop EXE not found at: $exe"
}

Write-Host ""
Write-Host "Waiting 20s for engine..."
Start-Sleep -Seconds 20

Write-Host ""
Write-Host "=== docker info (Registry Mirrors) ==="
docker info | Select-String -Pattern "Registry Mirrors" -Context 0,8

Write-Host ""
Write-Host "=== docker version ==="
docker version

