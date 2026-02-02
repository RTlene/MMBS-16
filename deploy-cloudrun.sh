#!/bin/bash

# ============================================
# 微信云托管部署脚本
# ============================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   微信云托管 - MMBS 后台服务部署${NC}"
echo -e "${GREEN}========================================${NC}"

# 检查是否安装了 Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: 未检测到 Docker，请先安装 Docker${NC}"
    exit 1
fi

# 读取配置
echo -e "\n${YELLOW}请输入以下配置信息：${NC}"

read -p "容器镜像仓库地址（例: ccr.ccs.tencentyun.com/your-namespace/mmbs-backend）: " REGISTRY
read -p "镜像版本号（默认: latest）: " VERSION
VERSION=${VERSION:-latest}

# 确认配置
echo -e "\n${YELLOW}配置确认：${NC}"
echo "镜像地址: $REGISTRY:$VERSION"
read -p "是否继续？(y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
    echo -e "${RED}已取消部署${NC}"
    exit 0
fi

# 构建镜像
echo -e "\n${GREEN}[1/3] 构建 Docker 镜像...${NC}"
docker build -f Dockerfile.cloudrun -t mmbs-backend:$VERSION .

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 镜像构建失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 镜像构建成功${NC}"

# 打标签
echo -e "\n${GREEN}[2/3] 为镜像打标签...${NC}"
docker tag mmbs-backend:$VERSION $REGISTRY:$VERSION

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 打标签失败${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 标签已创建${NC}"

# 推送镜像
echo -e "\n${GREEN}[3/3] 推送镜像到容器镜像仓库...${NC}"
docker push $REGISTRY:$VERSION

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 镜像推送失败${NC}"
    echo -e "${YELLOW}提示: 请先登录容器镜像仓库${NC}"
    echo -e "${YELLOW}运行: docker login $REGISTRY${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 镜像推送成功${NC}"

# 完成
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}   部署准备完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\n${YELLOW}下一步操作：${NC}"
echo "1. 登录微信云托管控制台"
echo "2. 创建或更新服务"
echo "3. 选择镜像: $REGISTRY:$VERSION"
echo "4. 配置环境变量（参考 .env.example）"
echo "5. 部署服务"
echo -e "\n${GREEN}祝您部署顺利！${NC}\n"

