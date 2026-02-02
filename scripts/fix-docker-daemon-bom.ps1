$ErrorActionPreference = 'Stop'

Write-Host "=== 修复 Docker daemon.json 编码（去 BOM）===" -ForegroundColor Green

$paths = @(
  "$env:USERPROFILE\.docker\daemon.json",
  "$env:ProgramData\Docker\config\daemon.json"
)

foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    $raw = Get-Content -Raw -LiteralPath $p
    # 去掉 UTF-8 BOM (U+FEFF)
    $raw = $raw.TrimStart([char]0xFEFF)
    [System.IO.File]::WriteAllText($p, $raw, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "已修复: $p" -ForegroundColor Cyan
  } else {
    Write-Host "未发现: $p" -ForegroundColor DarkGray
  }
}

Write-Host ""
Write-Host "=== 重写镜像源配置（确保无 BOM）===" -ForegroundColor Green
& "E:\MMBS16\configure-docker-mirror.ps1"

Write-Host ""
Write-Host "=== 验证：docker info（Registry Mirrors）===" -ForegroundColor Green
try {
  docker info | Select-String -Pattern "Registry Mirrors" -Context 0,8
} catch {
  Write-Host "docker info 执行失败（通常是 Docker Desktop 尚未启动或仍在启动中）。" -ForegroundColor Yellow
  Write-Host "请先完全退出并重新打开 Docker Desktop，等待状态变为 Running 后再运行：" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File `\"E:\MMBS16\scripts\fix-docker-daemon-bom.ps1`\"" -ForegroundColor Yellow
  throw
}

Write-Host ""
Write-Host "=== 验证：docker version ===" -ForegroundColor Green
docker version

