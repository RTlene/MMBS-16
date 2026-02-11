# 微信云托管部署指南

## 📋 准备工作

### 1. 开通微信云托管服务

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入小程序管理后台
3. 左侧菜单选择 "云开发" → "云托管"
4. 点击 "开通" 按钮
5. 选择服务地域（建议选择离用户最近的地域）

### 2. 创建容器镜像仓库

1. 在云托管控制台，点击 "镜像仓库"
2. 创建命名空间（例如：`mmbs-prod`）
3. 记录镜像仓库地址：`ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend`

### 3. 创建云托管 MySQL 数据库

1. 在云托管控制台，点击 "数据库"
2. 创建 MySQL 实例（建议选择 MySQL 5.7 或 8.0）
3. 记录数据库连接信息：
   - 主机地址：`xxx.mysql.tencentcdb.com`
   - 端口：`3306`
   - 用户名：`root`
   - 密码：（自己设置的密码）
   - 数据库名：`mmbs`

---

## 🚀 部署步骤

### 方式一：使用自动化脚本（推荐）

#### Step 1: 配置环境变量

在项目根目录创建 `.env` 文件（复制 `env.example`）：

```bash
cp env.example .env
```

编辑 `.env` 文件，填入真实配置：

```bash
# 数据库配置
MYSQL_HOST=你的MySQL地址.mysql.tencentcdb.com
MYSQL_PASSWORD=你的数据库密码

# 微信小程序配置
WX_APPID=wxXXXXXXXXXXXXXXXX
WX_APPSECRET=你的AppSecret
```

#### Step 2: 登录容器镜像仓库

```bash
# 使用云托管提供的临时登录令牌
docker login ccr.ccs.tencentyun.com --username=你的用户名
# 输入密码（在云托管控制台获取）
```

#### Step 3: 执行部署脚本

```bash
# 给脚本添加执行权限
chmod +x deploy-cloudrun.sh

# 运行部署脚本
./deploy-cloudrun.sh
```

按照提示输入：
- 容器镜像仓库地址：`ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend`
- 镜像版本号：`v1.0.0`（或 `latest`）

#### Step 4: 在云托管控制台创建服务

1. 登录云托管控制台
2. 点击 "新建服务"
3. 填写服务信息：
   - 服务名称：`mmbs-backend`
   - 镜像地址：选择刚刚推送的镜像
   - 端口：`80`
   - CPU：`0.25核`
   - 内存：`0.5GB`
   - 最小实例数：`0`（流量为0时自动缩容到0，节省费用）
   - 最大实例数：`5`
4. 配置环境变量（从 `env.example` 复制）
5. 点击 "部署"

---

### 方式二：手动构建和推送

#### Step 1: 构建 Docker 镜像

```bash
docker build -f Dockerfile.cloudrun -t mmbs-backend:latest .
```

#### Step 2: 打标签

```bash
docker tag mmbs-backend:latest ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:latest
```

#### Step 3: 推送到镜像仓库

```bash
docker push ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:latest
```

#### Step 4: 在云托管控制台部署

同上述 Step 4。

---

## ⚙️ 环境变量配置

在云托管控制台的 "环境变量" 中添加以下配置：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 应用端口 | `80` |
| `MYSQL_HOST` | 数据库地址 | `xxx.mysql.tencentcdb.com` |
| `MYSQL_PORT` | 数据库端口 | `3306` |
| `MYSQL_USER` | 数据库用户名 | `root` |
| `MYSQL_PASSWORD` | 数据库密码 | `你的密码` |
| `MYSQL_DATABASE` | 数据库名 | `mmbs` |
| `JWT_SECRET` | JWT密钥 | `随机字符串` |
| `WX_APPID` | 小程序AppID | `wxXXXXXXXXXXXXXXXX` |
| `WX_APPSECRET` | 小程序AppSecret | `你的AppSecret` |

---

## 🔍 验证部署

### 1. 检查服务状态

在云托管控制台查看服务状态，确保显示为 "运行中"。

### 2. 查看日志

点击 "日志" 标签，查看应用启动日志，确认没有错误。

### 3. 测试健康检查

```bash
curl https://你的云托管域名/health
```

应该返回：
```json
{
  "status": "ok",
  "timestamp": "2025-10-01T12:00:00.000Z"
}
```

### 4. 测试 API

```bash
# 测试商品列表接口
curl https://你的云托管域名/api/miniapp/products
```

---

## 📱 配置小程序合法域名

1. 登录微信公众平台
2. 进入小程序管理后台
3. 左侧菜单：开发 → 开发管理 → 开发设置
4. 找到 "服务器域名" 部分
5. 点击 "修改"，在 `request合法域名` 中添加：
   ```
   https://你的云托管域名
   ```
6. 保存

---

## 🔄 更新部署

### 快速更新

```bash
# 1. 修改代码后重新构建
./deploy-cloudrun.sh

# 2. 在云托管控制台点击 "重新部署"
```

### 版本管理

推荐使用语义化版本号：

```bash
# 部署 v1.0.0
docker tag mmbs-backend:latest ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:v1.0.0
docker push ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:v1.0.0

# 部署 v1.0.1（修复bug）
docker tag mmbs-backend:latest ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:v1.0.1
docker push ccr.ccs.tencentyun.com/你的命名空间/mmbs-backend:v1.0.1
```

---

## 🐛 常见问题

### Q1: 镜像推送失败，提示 "unauthorized"

**A**: 需要先登录容器镜像仓库：

```bash
docker login ccr.ccs.tencentyun.com
# 输入用户名和密码（在云托管控制台获取）
```

### Q2: 服务启动失败，日志显示 "connect ECONNREFUSED"

**A**: 检查数据库配置，确保：
1. 数据库地址正确
2. 数据库已创建（`mmbs`）
3. 数据库密码正确
4. 云托管和数据库在同一 VPC（私有网络）

### Q3: 小程序请求后台返回 "request:fail"

**A**: 检查：
1. 小程序是否添加了云托管域名到 `request合法域名`
2. 云托管服务是否正常运行
3. 小程序代码中的 API 地址是否正确

### Q4: 流量较大时服务响应变慢

**A**: 调整云托管配置：
1. 增加最小实例数（避免冷启动）
2. 提高 CPU 和内存配置
3. 启用 CDN 加速静态资源

### Q5: 商品主图/详情图/视频上传后，再次编辑或小程序详情页显示 404

**原因**：云托管容器磁盘是**临时存储**，重启、缩容或重新部署后 `public/uploads` 下的文件会丢失，数据库里仍保存着旧路径，导致请求图片/视频时 404。

**建议**：
1. **生产环境**：将商品图片/视频上传到**对象存储**（如腾讯云 COS、云开发存储），在后台保存文件 URL，而不是本地路径。
2. **临时方案**：每次重新部署后，需在后台重新上传商品主图/详情图/视频；或保持最小实例数 ≥ 1 且不重新部署，以减少文件丢失。

### Q6: 小程序发起支付时提示「服务器错误」或 500

**A**: 检查：
1. 云托管环境变量是否配置：`WX_APPID`、`WX_MCHID`、`WX_PAY_KEY`、`WX_PAY_NOTIFY_URL`、`BASE_URL`（与云托管公网地址一致）。
2. 是否已上传微信支付商户证书：`apiclient_key.pem`、`apiclient_cert.pem` 到镜像或挂载目录（如 `/app/cert/`），并配置 `WX_PAY_KEY_PATH`、`WX_PAY_CERT_PATH`、`WX_PAY_CERT_SERIAL_NO`。
3. 若日志出现 `self-signed certificate`，当前代码已对微信支付 API 请求跳过证书校验，重新部署后即可。
4. 查看云托管日志中 `[Payment] 创建支付订单失败:` 和 `[Payment] 详细错误:` 后的具体报错，按提示排查。

### Q7: 日志报错 Table 'nodejs_demo.products' doesn't exist（或其它表不存在）

**原因**：当前连接的数据库（如 `nodejs_demo`）里还没有建表。启动时为了加快冷启动，默认**不会**自动执行建表（未设置 `DB_SYNC=true`）。

**处理**：
1. 在云托管该服务的「环境变量」中**临时**增加：`DB_SYNC` = `true`。
2. 保存并**重新部署**一次，让服务启动时执行一次数据库同步（建表）。
3. 部署成功、确认表已生成后，将 `DB_SYNC` 删掉或改为 `false`，再部署一次，避免每次启动都做同步。
4. 若你使用的是已有数据库（如 `mall_admin`）且表已存在，请将 `MYSQL_DATABASE` 设为该库名，并确保表名与代码一致（如商品表为 `Products`）。

---

## 💰 费用说明

微信云托管采用 **按量计费** 模式：

- **免费额度**（每月）：
  - CPU：1000 核时
  - 内存：2000 GB时
  - 流量：1 GB

- **超出免费额度后**：
  - CPU：约 0.055 元/核/小时
  - 内存：约 0.032 元/GB/小时
  - 流量：约 0.8 元/GB

**节省费用的建议**：
1. 设置最小实例数为 0（无流量时自动缩容）
2. 使用云开发存储服务存储图片（更便宜）
3. 启用 CDN 加速，减少源站流量

---

## ❓ 常见问题

### 上传商品图片/视频报 413 Payload Too Large

网关（云托管/反向代理）可能限制了请求体大小。可尝试：
1. **一次少传几个文件**：例如主图、详情图、视频分批上传，或每次只传 1～2 个文件。
2. **在部署侧提高限制**：若使用 Nginx 等，可设置 `client_max_body_size 32m;`（或更大）。
3. 单文件服务端限制为 10MB，多文件合计不要超过网关上限。

### 后台编辑商品时图片 404、小程序端却能看见

若后台与接口同域，编辑页已改为用当前域名绝对路径请求图片，一般可正常显示。若仍 404，多为**容器内上传目录非持久化**（重启/多实例后文件丢失），建议将上传目录改为对象存储（如云开发存储、COS）。

---

## 📞 技术支持

如有问题，请参考：

- [微信云托管官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudrun/)
- [Docker 官方文档](https://docs.docker.com/)
- [Node.js 最佳实践](https://github.com/goldbergyoni/nodebestpractices)

---

**祝您部署顺利！** 🎉

