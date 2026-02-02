#!/bin/sh
set -e

echo "=== Docker Entrypoint Script Starting ==="

# 删除 musl 版本的 sharp（如果存在）
echo "Checking for musl version of sharp..."
if [ -d "/app/node_modules/@img/sharp-linuxmusl-x64" ]; then
  echo "Removing musl version of sharp..."
  rm -rf /app/node_modules/@img/sharp-linuxmusl-x64
  rm -rf /app/node_modules/@img/sharp-libvips-linuxmusl-x64
  echo "Musl version removed successfully"
else
  echo "No musl version found, using glibc version"
fi

# 验证正确的版本存在
if [ -d "/app/node_modules/@img/sharp-linux-x64" ]; then
  echo "Linux x64 version found - OK"
else
  echo "WARNING: Linux x64 version not found!"
fi

# 列出所有 sharp 相关包
echo "Available sharp packages:"
ls -la /app/node_modules/@img/ 2>/dev/null || echo "No @img directory found"

# 设置环境变量强制 sharp 使用 linux-x64 平台
export SHARP_IGNORE_GLOBAL_LIBVIPS=1
export npm_config_platform=linux
export npm_config_arch=x64

# 启动应用
echo "Starting application..."
exec npm start
