# 微信支付配置界面说明

## ✅ 已完成的功能

### 1. 配置页面

**文件位置**：`public/sub-pages/wechat-payment-config.html`

**功能特性**：
- ✅ 基础配置表单（AppID、商户号、API密钥等）
- ✅ 证书路径配置
- ✅ 环境模式选择（生产/沙箱）
- ✅ 配置状态显示
- ✅ 连接测试功能
- ✅ 配置说明和帮助文档

### 2. JavaScript 功能

**文件位置**：`public/js/wechat-payment-config.js`

**功能特性**：
- ✅ 配置加载和保存
- ✅ 表单验证
- ✅ 配置状态检查
- ✅ 连接测试
- ✅ 友好的错误提示

### 3. 后端 API

**文件位置**：`routes/payment-config-routes.js`

**API 接口**：
- `GET /api/payment-config/get` - 获取配置
- `POST /api/payment-config/save` - 保存配置
- `POST /api/payment-config/test` - 测试连接

### 4. 菜单集成

**文件位置**：`index.html`

**菜单位置**：系统设置 → 微信支付配置

## 🚀 使用方法

### 1. 访问配置页面

1. 登录后台管理系统
2. 在左侧菜单找到"系统设置"
3. 点击"微信支付配置"

### 2. 配置步骤

1. **填写基础配置**：
   - 小程序 AppID
   - 商户号 (MCHID)
   - API 密钥
   - 证书序列号（可选）
   - 回调通知地址
   - 基础 URL

2. **选择环境模式**：
   - 生产环境：正式环境
   - 沙箱环境：测试环境

3. **上传证书文件**：
   - 从微信支付商户平台下载证书
   - 上传到服务器的 `/app/cert/` 目录
   - 确保文件权限为 600

4. **保存配置**：
   - 点击"保存配置"按钮
   - 系统会验证配置并保存

5. **测试连接**：
   - 点击"测试连接"按钮
   - 系统会检查配置是否正确

## ⚠️ 重要提示

### 配置持久化

**当前实现**：
- 配置保存在 `config/wechat-payment-config.json` 文件中
- 同时更新当前进程的环境变量
- **重启服务后需要重新配置或设置环境变量**

**推荐做法**：
1. 在 `.env` 文件中配置环境变量（推荐）
2. 或在服务器环境变量中配置
3. 配置页面主要用于查看和临时测试

### 安全注意事项

1. **API 密钥安全**：
   - 配置页面不会显示已保存的 API 密钥
   - 建议在 `.env` 文件中直接配置，不要通过页面保存

2. **证书文件安全**：
   - 证书文件不要提交到代码仓库
   - 确保文件权限为 600（仅所有者可读写）

3. **配置文件安全**：
   - `config/wechat-payment-config.json` 已添加到 `.gitignore`
   - 不要将配置文件提交到代码仓库

## 🔧 配置说明

### 必填字段

- **小程序 AppID**：微信小程序的 AppID
- **商户号 (MCHID)**：微信支付商户号
- **API 密钥**：微信支付商户平台的 API 密钥
- **回调通知地址**：支付结果通知回调地址（必须是 HTTPS）

### 可选字段

- **证书序列号**：从证书中提取的序列号
- **基础 URL**：用于生成回调地址的基础 URL
- **环境模式**：选择生产环境或沙箱环境

### 证书配置

- **证书路径**：`/app/cert/apiclient_cert.pem`
- **私钥路径**：`/app/cert/apiclient_key.pem`

## 🧪 测试功能

### 连接测试

点击"测试连接"按钮，系统会检查：
- ✅ 基础配置是否完整
- ✅ 证书文件是否存在
- ✅ 服务是否正常初始化

### 配置验证

保存配置时，系统会验证：
- ✅ 必填字段是否填写
- ✅ 回调地址格式是否正确
- ✅ URL 格式是否有效

## 📝 配置示例

### 生产环境配置

```json
{
  "wxAppId": "wx849e40856c0c2238",
  "wxMchId": "1234567890",
  "wxPayKey": "your-api-key-32-characters",
  "wxCertSerialNo": "YOUR_CERT_SERIAL_NO",
  "wxNotifyUrl": "https://your-domain.com/api/payment/wechat/notify",
  "baseUrl": "https://your-domain.com",
  "sandbox": false,
  "certPath": "/app/cert/apiclient_cert.pem",
  "keyPath": "/app/cert/apiclient_key.pem"
}
```

### 沙箱环境配置

```json
{
  "wxAppId": "wx849e40856c0c2238",
  "wxMchId": "sandbox-merchant-id",
  "wxPayKey": "sandbox-api-key",
  "wxNotifyUrl": "https://your-ngrok-url.ngrok.io/api/payment/wechat/notify",
  "baseUrl": "https://your-ngrok-url.ngrok.io",
  "sandbox": true,
  "certPath": "/app/cert/apiclient_cert.pem",
  "keyPath": "/app/cert/apiclient_key.pem"
}
```

## 🔗 相关文档

- **完整对接指南**：`WECHAT_PAYMENT_GUIDE.md`
- **快速开始指南**：`WECHAT_PAYMENT_QUICK_START.md`
- **支付测试指南**：`PAYMENT_TEST_GUIDE.md`

## 🐛 常见问题

### 1. 配置保存后不生效

**原因**：配置只更新了当前进程，重启后需要重新配置

**解决**：
- 在 `.env` 文件中配置环境变量
- 或在服务器环境变量中配置
- 重启服务后配置会从环境变量加载

### 2. 证书文件不存在

**原因**：证书文件未上传到服务器

**解决**：
- 从微信支付商户平台下载证书
- 通过 SSH 或 FTP 上传到 `/app/cert/` 目录
- 确保文件权限为 600

### 3. 连接测试失败

**原因**：配置不完整或证书文件不存在

**解决**：
- 检查必填字段是否填写
- 确认证书文件已上传
- 检查文件路径是否正确

## 💡 最佳实践

1. **生产环境**：
   - 在 `.env` 文件中配置环境变量
   - 不要通过配置页面保存敏感信息
   - 定期检查配置是否正确

2. **开发测试**：
   - 使用沙箱环境
   - 使用内网穿透工具测试回调
   - 通过配置页面快速测试

3. **安全建议**：
   - 定期更换 API 密钥
   - 保护证书文件安全
   - 不要将配置文件提交到代码仓库
