# 本地 Docker 部署：停止 -> 重新构建（使用 Dockerfile 内镜像源）-> 启动
# 用法: .\scripts\deploy-local.ps1
# 强制完全重建: .\scripts\deploy-local.ps1 -NoCache

param(
    [switch]$NoCache = $false
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "docker-compose.yml"))) {
    Write-Host "未找到 docker-compose.yml，请在项目根目录执行或指定正确路径。" -ForegroundColor Red
    exit 1
}

Set-Location $root
Write-Host "项目目录: $root" -ForegroundColor Cyan
Write-Host "停止容器..." -ForegroundColor Yellow
docker-compose down

$buildArgs = @()
if ($NoCache) {
    Write-Host "构建镜像（无缓存，确保代码变更生效）..." -ForegroundColor Yellow
    $buildArgs = @("--no-cache")
} else {
    Write-Host "构建镜像（Dockerfile 内已配置阿里云 apt 镜像 + 腾讯 npm 镜像）..." -ForegroundColor Yellow
}
docker-compose build @buildArgs

Write-Host "启动容器..." -ForegroundColor Yellow
docker-compose up -d

Write-Host "查看最近日志..." -ForegroundColor Cyan
docker-compose logs --tail 20

Write-Host "完成。访问 http://localhost:3000" -ForegroundColor Green
