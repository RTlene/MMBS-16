# 微信支付本地测试指南

> 更新时间：2026-01-26  
> 用途：说明微信支付 API 在本地测试的可行性和要求

---

## ✅ 本地测试可行性

**结论：可以在本地测试，但需要满足特定条件**

微信支付 API v3 支持本地测试，但有以下要求：

### 1. 回调地址要求

微信支付对回调地址（`notify_url`）有严格要求：

- ✅ **必须使用外网可访问的地址**
  - ❌ 不能使用 `localhost`、`127.0.0.1`
  - ❌ 不能使用内网 IP（如 `192.168.x.x`）
  - ✅ 必须使用公网可访问的域名或 IP

- ✅ **必须是完整的 URL**
  - 格式：`https://your-domain.com/api/payment/wechat/notify`
  - 必须包含协议（`http://` 或 `https://`）
  - 必须包含完整路径

- ✅ **不能携带参数**
  - ❌ 错误：`https://domain.com/notify?param=value`
  - ✅ 正确：`https://domain.com/api/payment/wechat/notify`

### 2. 协议要求

- **生产环境**：必须使用 HTTPS
- **测试环境**：可以使用 HTTP（但建议使用 HTTPS）

---

## 🛠️ 本地测试解决方案

### 方案一：使用内网穿透工具（推荐）

这是本地测试的标准解决方案。

#### 1. 使用 ngrok（最简单）

```bash
# 1. 下载 ngrok
# 访问：https://ngrok.com/download

# 2. 启动 ngrok（将本地 3000 端口映射到公网）
ngrok http 3000

# 3. 获得公网地址，例如：
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

**配置回调地址**：
```bash
# 在 .env 中配置
WX_PAY_NOTIFY_URL=https://abc123.ngrok.io/api/payment/wechat/notify
BASE_URL=https://abc123.ngrok.io
```

#### 2. 使用 frp（免费，更稳定）

```bash
# 1. 下载 frp
# 访问：https://github.com/fatedier/frp/releases

# 2. 配置 frpc.ini
[common]
server_addr = your-frp-server.com
server_port = 7000
token = your-token

[web]
type = http
local_port = 3000
custom_domains = your-domain.com
```

#### 3. 使用其他内网穿透工具

- **花生壳**：https://hsk.oray.com/
- **natapp**：https://natapp.cn/
- **localtunnel**：`npm install -g localtunnel && lt --port 3000`

---

### 方案二：使用沙箱环境

微信支付提供沙箱环境用于测试。

#### 1. 启用沙箱环境

```bash
# 在 .env 中设置
WX_PAY_SANDBOX=true
```

#### 2. 获取沙箱密钥

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com/)
2. 进入"开发配置" → "沙箱环境"
3. 获取沙箱 API 密钥

#### 3. 配置沙箱环境

```bash
# .env
WX_APPID=你的小程序AppID
WX_MCHID=你的商户号（或沙箱商户号）
WX_PAY_KEY=沙箱API密钥
WX_PAY_SANDBOX=true
WX_PAY_NOTIFY_URL=https://your-ngrok-url.ngrok.io/api/payment/wechat/notify
```

**注意**：即使使用沙箱环境，回调地址仍然必须是公网可访问的地址。

---

### 方案三：使用测试支付方式（无需真实支付）

如果只是想测试订单流程，可以使用测试支付方式：

```bash
# 创建测试订单（已支付）
POST /api/orders/test
{
  "memberId": 1,
  "productId": 1,
  "quantity": 1,
  "unitPrice": 99.00,
  "totalAmount": 99.00
}
```

这种方式：
- ✅ 无需配置微信支付
- ✅ 无需公网地址
- ✅ 订单自动设置为已支付状态
- ❌ 无法测试真实的支付流程

---

## 📋 本地测试完整流程

### 步骤1：配置内网穿透

```bash
# 使用 ngrok
ngrok http 3000

# 记录获得的公网地址
# 例如：https://abc123.ngrok.io
```

### 步骤2：配置环境变量

```bash
# .env
WX_APPID=你的小程序AppID
WX_MCHID=你的商户号
WX_PAY_KEY=你的API密钥
WX_PAY_SANDBOX=true  # 使用沙箱环境
WX_PAY_NOTIFY_URL=https://abc123.ngrok.io/api/payment/wechat/notify
BASE_URL=https://abc123.ngrok.io
```

### 步骤3：配置微信支付商户平台

1. 登录微信支付商户平台
2. 进入"开发配置" → "支付回调"
3. 添加回调域名：`abc123.ngrok.io`（不包含协议和路径）

### 步骤4：测试支付流程

1. 在小程序中创建订单
2. 选择微信支付
3. 发起支付
4. 完成支付
5. 验证回调是否收到

---

## ⚠️ 重要限制

### 1. 回调地址限制

- **必须公网可访问**：微信服务器无法访问本地地址
- **必须 HTTPS（生产环境）**：安全要求
- **不能携带参数**：URL 必须干净

### 2. 小程序限制

- 小程序必须在微信开发者工具中运行
- 或者使用真机调试
- 小程序必须配置正确的 AppID

### 3. 证书要求

- 必须上传证书文件到服务器
- 证书文件路径必须正确
- 文件权限建议设置为 600

---

## 🔍 测试验证

### 1. 检查回调地址是否可访问

```bash
# 使用 curl 测试
curl https://your-ngrok-url.ngrok.io/api/payment/wechat/notify

# 应该返回错误（因为没有正确的请求），但能访问说明地址有效
```

### 2. 检查配置是否正确

```bash
# 在后台管理系统
# 系统设置 → 微信支付配置 → 测试连接
```

### 3. 查看日志

```bash
# 查看 Docker 日志
docker logs mmbs-app | grep -i "payment\|wechat"

# 查看回调日志
docker logs mmbs-app | grep -i "notify\|callback"
```

---

## 💡 推荐方案

### 开发阶段

1. **使用沙箱环境** + **内网穿透工具**
   - 配置简单
   - 无需真实费用
   - 可以测试完整流程

2. **使用测试支付方式**
   - 快速测试订单流程
   - 无需配置微信支付
   - 适合功能测试

### 生产环境

1. **必须使用 HTTPS**
2. **必须使用真实域名**
3. **必须使用生产环境配置**
4. **必须配置正确的回调域名**

---

## 📝 配置示例

### 本地测试配置（使用 ngrok）

```bash
# .env
WX_APPID=wx849e40856c0c2238
WX_MCHID=你的商户号
WX_PAY_KEY=你的API密钥
WX_PAY_SANDBOX=true
WX_PAY_NOTIFY_URL=https://abc123.ngrok.io/api/payment/wechat/notify
BASE_URL=https://abc123.ngrok.io
WX_PAY_CERT_PATH=/app/cert/apiclient_cert.pem
WX_PAY_KEY_PATH=/app/cert/apiclient_key.pem
```

### 生产环境配置

```bash
# .env
WX_APPID=wx849e40856c0c2238
WX_MCHID=你的商户号
WX_PAY_KEY=你的API密钥
WX_PAY_SANDBOX=false
WX_PAY_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
BASE_URL=https://your-domain.com
WX_PAY_CERT_PATH=/app/cert/apiclient_cert.pem
WX_PAY_KEY_PATH=/app/cert/apiclient_key.pem
```

---

## 🐛 常见问题

### Q1: 本地测试必须使用内网穿透吗？

**A**: 是的，因为微信支付的回调地址必须是公网可访问的。如果只是测试订单流程（不测试真实支付），可以使用测试支付方式。

### Q2: 可以使用 HTTP 吗？

**A**: 测试环境可以使用 HTTP，但生产环境必须使用 HTTPS。

### Q3: ngrok 地址会变化怎么办？

**A**: 
- 免费版 ngrok 地址每次启动都会变化
- 可以使用付费版获得固定域名
- 或者使用 frp 等工具配置固定域名

### Q4: 回调收不到怎么办？

**A**: 
1. 检查回调地址是否公网可访问
2. 检查回调地址格式是否正确
3. 检查商户平台是否配置了回调域名
4. 查看服务器日志是否有错误

### Q5: 沙箱环境和生产环境有什么区别？

**A**: 
- 沙箱环境：用于测试，不会产生真实费用
- 生产环境：真实支付，会产生实际费用
- 两者都需要公网可访问的回调地址

---

## 🔗 相关文档

- **完整对接指南**：`WECHAT_PAYMENT_GUIDE.md`
- **快速开始指南**：`WECHAT_PAYMENT_QUICK_START.md`
- **配置界面说明**：`WECHAT_PAYMENT_CONFIG_UI.md`
- **支付测试指南**：`PAYMENT_TEST_GUIDE.md`

---

## 📞 技术支持

- [微信支付商户平台](https://pay.weixin.qq.com/)
- [微信支付 API v3 文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [ngrok 文档](https://ngrok.com/docs)
