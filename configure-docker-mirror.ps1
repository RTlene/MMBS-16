# Docker Desktop 镜像源配置脚本
$daemonJsonPath = "$env:USERPROFILE\.docker\daemon.json"

Write-Host "正在配置 Docker 镜像源..." -ForegroundColor Green

# 创建 .docker 目录
$dockerDir = "$env:USERPROFILE\.docker"
if (-not (Test-Path $dockerDir)) {
    New-Item -ItemType Directory -Path $dockerDir -Force | Out-Null
}

# 配置内容
$config = @{
    "registry-mirrors" = @(
        "https://docker.xuanyuan.me",
        "https://docker.1ms.run",
        "https://mirror.ccs.tencentyun.com",
        "https://docker.mirrors.ustc.edu.cn",
        "http://hub-mirror.c.163.com"
    )
}

# 保存配置
$configJson = $config | ConvertTo-Json -Depth 10
# 重要：Docker 的 daemon.json 对 UTF-8 BOM 很敏感，Windows PowerShell 的 Out-File -Encoding UTF8 默认会写入 BOM
# 这里强制用“UTF-8 无 BOM”写入，避免启动时报：invalid character 'ï' looking for beginning of value
[System.IO.File]::WriteAllText(
    $daemonJsonPath,
    $configJson,
    (New-Object System.Text.UTF8Encoding($false))
)

Write-Host ""
Write-Host "配置已保存到: $daemonJsonPath" -ForegroundColor Green
Write-Host ""
Write-Host "配置内容:" -ForegroundColor Cyan
Write-Host $configJson
Write-Host ""
Write-Host "请重启 Docker Desktop 使配置生效!" -ForegroundColor Yellow
Write-Host ""
Write-Host "验证命令: docker info | Select-String 'Registry Mirrors'" -ForegroundColor Cyan
