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

# npm 安装依赖（容器构建环境即 linux，直接安装即可）
RUN npm install

# 将当前目录（dockerfile所在目录）下所有文件都拷贝到工作目录下（.dockerignore中文件除外）
COPY . /app

# 使用仓库内置启动脚本（避免运行时安装依赖导致探针失败）
RUN chmod +x /app/docker-entrypoint.sh

# 执行启动命令
# 写多行独立的CMD命令是错误写法！只有最后一行CMD命令会被执行，之前的都会被忽略，导致业务报错。
# 请参考[Docker官方文档之CMD命令](https://docs.docker.com/engine/reference/builder/#cmd)
# 使用 ENTRYPOINT 确保启动脚本总是执行
ENTRYPOINT ["/app/docker-entrypoint.sh"]
