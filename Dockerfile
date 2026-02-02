# 二开推荐阅读[如何提高项目构建效率](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/src/scene/build/speed.html)
FROM node:18-slim

# 容器默认时区为UTC，如需使用上海时间请启用以下时区设置命令
# RUN apt-get update && apt-get install -y tzdata && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && echo Asia/Shanghai > /etc/timezone

# 使用国内镜像源加速 apt（sources.list 存在时替换，否则用默认源）
RUN (test -f /etc/apt/sources.list && sed -i.bak 's|http://deb.debian.org|https://mirrors.aliyun.com|g; s|http://security.debian.org|https://mirrors.aliyun.com|g' /etc/apt/sources.list) || true; \
    apt-get update && apt-get install -y \
    ca-certificates \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# # 指定工作目录
WORKDIR /app

# 拷贝包管理文件（只复制 package.json，让 npm 根据平台选择正确的二进制文件）
COPY package.json /app/

# npm 国内镜像源（构建与运行时 sharp 安装均会更快）
ENV NPM_CONFIG_REGISTRY=https://mirrors.cloud.tencent.com/npm/
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/

# npm 安装依赖（先安装所有依赖，然后卸载 sharp，稍后在启动脚本中重新安装）
RUN npm install && \
    npm uninstall sharp || true

# 将当前目录（dockerfile所在目录）下所有文件都拷贝到工作目录下（.dockerignore中文件除外）
COPY . /app

# 创建启动脚本，在启动时安装正确的 sharp 版本
RUN echo '#!/bin/sh' > /app/docker-entrypoint.sh && \
    echo 'set -e' >> /app/docker-entrypoint.sh && \
    echo 'echo "=== Docker Entrypoint Script Starting ==="' >> /app/docker-entrypoint.sh && \
    echo 'echo "Installing sharp for linux platform..."' >> /app/docker-entrypoint.sh && \
    echo 'cd /app' >> /app/docker-entrypoint.sh && \
    echo 'npm config set registry ${NPM_CONFIG_REGISTRY:-https://mirrors.cloud.tencent.com/npm/}' >> /app/docker-entrypoint.sh && \
    echo 'npm install sharp@0.33.0 --platform=linux --arch=x64 --no-save' >> /app/docker-entrypoint.sh && \
    echo 'echo "Verifying sharp installation..."' >> /app/docker-entrypoint.sh && \
    echo 'ls -la /app/node_modules/@img/ 2>/dev/null | grep -v musl || echo "No @img directory"' >> /app/docker-entrypoint.sh && \
    echo 'echo "Removing any musl versions if present..."' >> /app/docker-entrypoint.sh && \
    echo 'rm -rf /app/node_modules/@img/sharp-linuxmusl-x64 /app/node_modules/@img/sharp-libvips-linuxmusl-x64 2>/dev/null || true' >> /app/docker-entrypoint.sh && \
    echo 'export SHARP_IGNORE_GLOBAL_LIBVIPS=1' >> /app/docker-entrypoint.sh && \
    echo 'export npm_config_platform=linux' >> /app/docker-entrypoint.sh && \
    echo 'export npm_config_arch=x64' >> /app/docker-entrypoint.sh && \
    echo 'echo "Starting application..."' >> /app/docker-entrypoint.sh && \
    echo 'exec npm start' >> /app/docker-entrypoint.sh && \
    chmod +x /app/docker-entrypoint.sh

# 执行启动命令
# 写多行独立的CMD命令是错误写法！只有最后一行CMD命令会被执行，之前的都会被忽略，导致业务报错。
# 请参考[Docker官方文档之CMD命令](https://docs.docker.com/engine/reference/builder/#cmd)
# 使用 ENTRYPOINT 确保启动脚本总是执行
ENTRYPOINT ["/app/docker-entrypoint.sh"]
