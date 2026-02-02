# 微信支付对接指南

> 更新时间：2026-01-26  
> 用途：微信支付商户号对接完整指南

---

## 📋 准备工作

### 1. 微信支付商户号申请

1. 登录 [微信支付商户平台](https://pay.weixin.qq.com/)
2. 完成商户号申请和认证
3. 获取以下信息：
   - **商户号（MCHID）**：如 `1234567890`
   - **API密钥（API Key）**：在商户平台设置
   - **API证书**：下载证书文件（`apiclient_cert.pem` 和 `apiclient_key.pem`）
   - **证书序列号**：从证书中提取

### 2. 小程序配置

1. 在 [微信公众平台](https://mp.weixin.qq.com/) 配置小程序
2. 获取 **小程序 AppID** 和 **AppSecret**
3. 在微信支付商户平台关联小程序 AppID

### 3. 配置支付目录和回调域名

1. **支付目录**：在商户平台设置小程序支付目录
   - 例如：`pages/order-detail`、`pages/order-confirm`

2. **支付回调域名**：设置支付结果通知回调地址
   - 例如：`https://your-domain.com`
   - 回调路径：`/api/payment/wechat/notify`

---

## 🔧 环境配置

### 1. 配置环境变量

编辑 `.env` 文件，添加以下配置：

```bash
# 微信小程序配置
WX_APPID=你的小程序AppID
WX_APPSECRET=你的小程序AppSecret

# 微信支付配置
WX_MCHID=你的商户号
WX_PAY_KEY=你的API密钥
WX_PAY_CERT_PATH=/app/cert/apiclient_cert.pem
WX_PAY_KEY_PATH=/app/cert/apiclient_key.pem
WX_PAY_CERT_SERIAL_NO=你的证书序列号
WX_PAY_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
WX_PAY_SANDBOX=false  # 是否使用沙箱环境（测试时设为true）

# 基础URL（用于生成回调地址）
BASE_URL=https://your-domain.com
```

### 2. 上传证书文件

将微信支付证书文件上传到服务器：

```bash
# 创建证书目录
mkdir -p cert

# 上传证书文件
# apiclient_cert.pem - 商户证书
# apiclient_key.pem - 商户私钥
```

**注意**：
- 证书文件需要放在服务器可访问的路径
- 确保文件权限正确（建议 600）
- 生产环境建议使用环境变量配置路径

---

## 📦 安装依赖（如需要）

如果使用第三方微信支付 SDK，可以安装：

```bash
npm install wechatpay-node-v3
# 或
npm install weixinpay
```

**注意**：当前实现使用原生 axios 和 crypto，无需额外依赖。

---

## 🔄 支付流程

### 完整支付流程

```
1. 用户在小程序选择商品并创建订单
   ↓
2. 用户点击"立即支付"
   ↓
3. 小程序调用后端接口：POST /api/payment/wechat/create
   ↓
4. 后端调用微信支付统一下单API，获取 prepay_id
   ↓
5. 后端生成小程序支付参数，返回给前端
   ↓
6. 小程序调用 wx.requestPayment() 调起支付
   ↓
7. 用户完成支付
   ↓
8. 微信支付服务器发送支付结果通知到回调地址
   ↓
9. 后端处理回调，更新订单状态
   ↓
10. 小程序查询订单状态，显示支付结果
```

---

## 🧪 测试步骤

### 步骤1：配置测试环境

#### 1.1 使用微信支付沙箱环境（推荐用于开发测试）

```bash
# 在 .env 中设置
WX_PAY_SANDBOX=true
```

**获取沙箱密钥**：
1. 登录微信支付商户平台
2. 进入"开发配置" → "沙箱环境"
3. 获取沙箱 API 密钥

#### 1.2 配置本地测试环境变量

```bash
# .env
WX_APPID=你的小程序AppID
WX_MCHID=你的商户号（或沙箱商户号）
WX_PAY_KEY=你的API密钥（或沙箱密钥）
WX_PAY_SANDBOX=true  # 测试时启用沙箱
```

### 步骤2：创建测试订单

#### 2.1 通过小程序创建订单

1. 在小程序中选择商品
2. 填写收货信息
3. 选择支付方式为"微信支付"
4. 提交订单

#### 2.2 或通过API创建订单

```bash
POST http://localhost:3000/api/miniapp/orders
Authorization: Bearer {小程序Token}
Content-Type: application/json

{
  "items": [
    {
      "productId": 1,
      "skuId": 1,
      "quantity": 1
    }
  ],
  "paymentMethod": "wechat",
  "shippingAddress": "测试地址",
  "receiverName": "测试用户",
  "receiverPhone": "13800138000"
}
```

### 步骤3：发起支付

#### 3.1 小程序端支付

在小程序订单详情页点击"立即支付"按钮，系统会：
1. 调用 `/api/payment/wechat/create` 创建支付订单
2. 获取支付参数
3. 调起微信支付界面

#### 3.2 或通过API测试支付流程

```bash
# 1. 创建支付订单
POST http://localhost:3000/api/payment/wechat/create
Authorization: Bearer {小程序Token}
Content-Type: application/json

{
  "orderId": 123
}

# 响应示例：
{
  "code": 0,
  "message": "支付参数生成成功",
  "data": {
    "orderId": 123,
    "orderNo": "MINI1706234567890ABCD",
    "prepayId": "wx1234567890abcdef",
    "payParams": {
      "appId": "wx849e40856c0c2238",
      "timeStamp": "1706234567",
      "nonceStr": "abc123def456",
      "package": "prepay_id=wx1234567890abcdef",
      "signType": "MD5",
      "paySign": "ABCDEF1234567890"
    }
  }
}
```

### 步骤4：验证支付结果

#### 4.1 查询支付状态

```bash
GET http://localhost:3000/api/payment/wechat/query/123
Authorization: Bearer {小程序Token}
```

#### 4.2 查询订单详情

```bash
GET http://localhost:3000/api/miniapp/orders/123
Authorization: Bearer {小程序Token}
```

**检查字段**：
- `status`: 应为 `paid`
- `paymentTime`: 支付时间（不应为 null）
- `transactionId`: 微信支付交易号

---

## 🔍 支付回调处理

### 回调地址配置

支付回调地址格式：`https://your-domain.com/api/payment/wechat/notify`

### 回调数据格式

微信支付 API v3 的回调数据是加密的 JSON 格式：

```json
{
  "id": "event-id",
  "create_time": "2026-01-26T07:30:00+08:00",
  "resource_type": "encrypt-resource",
  "event_type": "TRANSACTION.SUCCESS",
  "summary": "支付成功",
  "resource": {
    "original_type": "transaction",
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "...",
    "associated_data": "transaction",
    "nonce": "..."
  }
}
```

### 回调验证

当前实现中，回调验证逻辑需要完善：

1. **验证签名**：使用 `Wechatpay-Signature` 头验证
2. **解密数据**：使用证书解密 `resource.ciphertext`
3. **验证订单**：检查订单号和金额
4. **更新订单**：更新订单状态和支付时间
5. **返回响应**：必须返回成功响应，否则微信会重复通知

---

## 🛠️ 开发调试

### 1. 本地测试回调

由于微信支付回调需要公网可访问的地址，本地测试可以使用：

1. **内网穿透工具**（推荐）：
   - ngrok: `ngrok http 3000`
   - frp: 配置内网穿透
   - 其他内网穿透工具

2. **配置回调地址**：
   ```bash
   WX_PAY_NOTIFY_URL=https://your-ngrok-url.ngrok.io/api/payment/wechat/notify
   ```

### 2. 查看日志

```bash
# 查看支付相关日志
docker logs mmbs-app | grep -i "payment\|wechat\|支付"
```

### 3. 测试支付回调

可以使用 Postman 模拟支付回调：

```bash
POST https://your-domain.com/api/payment/wechat/notify
Content-Type: application/json
Wechatpay-Signature: {签名}
Wechatpay-Timestamp: {时间戳}
Wechatpay-Nonce: {随机字符串}
Wechatpay-Serial: {证书序列号}

{
  "id": "test-event-id",
  "create_time": "2026-01-26T07:30:00+08:00",
  "resource_type": "encrypt-resource",
  "event_type": "TRANSACTION.SUCCESS",
  "summary": "支付成功",
  "resource": {
    "original_type": "transaction",
    "algorithm": "AEAD_AES_256_GCM",
    "ciphertext": "{加密数据}",
    "associated_data": "transaction",
    "nonce": "{随机数}"
  }
}
```

---

## 📝 API 接口说明

### 1. 创建支付订单

**接口**：`POST /api/payment/wechat/create`

**请求头**：
```
Authorization: Bearer {小程序Token}
Content-Type: application/json
```

**请求体**：
```json
{
  "orderId": 123
}
```

**响应**：
```json
{
  "code": 0,
  "message": "支付参数生成成功",
  "data": {
    "orderId": 123,
    "orderNo": "MINI1706234567890ABCD",
    "prepayId": "wx1234567890abcdef",
    "payParams": {
      "appId": "wx849e40856c0c2238",
      "timeStamp": "1706234567",
      "nonceStr": "abc123def456",
      "package": "prepay_id=wx1234567890abcdef",
      "signType": "MD5",
      "paySign": "ABCDEF1234567890"
    }
  }
}
```

### 2. 查询支付状态

**接口**：`GET /api/payment/wechat/query/:orderId`

**请求头**：
```
Authorization: Bearer {小程序Token}
```

**响应**：
```json
{
  "code": 0,
  "message": "查询成功",
  "data": {
    "orderId": 123,
    "status": "paid",
    "paymentTime": "2026-01-26T07:30:00.000Z"
  }
}
```

### 3. 关闭支付订单

**接口**：`POST /api/payment/wechat/close/:orderId`

**请求头**：
```
Authorization: Bearer {小程序Token}
```

**响应**：
```json
{
  "code": 0,
  "message": "订单已关闭",
  "data": {
    "order": { ... }
  }
}
```

### 4. 支付回调通知

**接口**：`POST /api/payment/wechat/notify`

**请求头**：
```
Content-Type: application/json
Wechatpay-Signature: {签名}
Wechatpay-Timestamp: {时间戳}
Wechatpay-Nonce: {随机字符串}
Wechatpay-Serial: {证书序列号}
```

**响应**（必须返回）：
```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

---

## 🐛 常见问题

### 1. 统一下单失败：商户号不存在

**原因**：`WX_MCHID` 配置错误或商户号未关联小程序

**解决**：
- 检查 `.env` 中的 `WX_MCHID` 是否正确
- 在微信支付商户平台确认商户号已关联小程序 AppID

### 2. 统一下单失败：签名错误

**原因**：证书配置错误或签名算法不正确

**解决**：
- 检查证书文件路径是否正确
- 确认证书文件内容完整
- 检查 `WX_PAY_KEY` 是否正确

### 3. 小程序调起支付失败：参数错误

**原因**：支付参数生成错误或签名不正确

**解决**：
- 检查 `WX_APPID` 是否与小程序 AppID 一致
- 确认 `payParams` 中的 `appId` 与小程序 AppID 一致
- 检查签名算法是否正确

### 4. 支付回调未收到

**原因**：
- 回调地址不可访问
- 回调地址未在商户平台配置
- 回调处理失败，未返回正确响应

**解决**：
- 确认回调地址可以从公网访问
- 在商户平台配置正确的回调域名
- 检查回调处理逻辑，确保返回成功响应

### 5. 订单状态未更新

**原因**：
- 支付回调处理失败
- 回调签名验证失败
- 数据库更新失败

**解决**：
- 查看服务器日志，检查回调处理错误
- 手动查询微信支付状态并更新订单
- 检查数据库连接和权限

---

## 🔐 安全注意事项

1. **证书安全**：
   - 证书文件不要提交到代码仓库
   - 使用环境变量配置证书路径
   - 生产环境使用安全的证书存储方式

2. **API密钥安全**：
   - 不要在代码中硬编码密钥
   - 使用环境变量管理密钥
   - 定期更换API密钥

3. **回调验证**：
   - 必须验证回调签名
   - 验证订单金额和状态
   - 防止重复处理回调

4. **HTTPS**：
   - 生产环境必须使用 HTTPS
   - 回调地址必须是 HTTPS

---

## 📊 测试检查清单

### 配置检查
- [ ] 微信支付商户号已申请
- [ ] 小程序 AppID 已配置
- [ ] API 密钥已配置
- [ ] 证书文件已上传
- [ ] 回调地址已配置
- [ ] 支付目录已设置

### 功能测试
- [ ] 创建支付订单成功
- [ ] 获取支付参数成功
- [ ] 小程序调起支付成功
- [ ] 支付成功回调正常
- [ ] 订单状态更新正确
- [ ] 支付失败处理正确
- [ ] 订单关闭功能正常

### 异常测试
- [ ] 支付取消处理
- [ ] 支付超时处理
- [ ] 重复支付处理
- [ ] 回调重复通知处理
- [ ] 订单不存在处理

---

## 💡 开发建议

1. **使用沙箱环境**：开发阶段使用微信支付沙箱环境，避免产生真实费用

2. **日志记录**：详细记录支付流程的每个步骤，便于排查问题

3. **错误处理**：完善错误处理逻辑，给用户友好的错误提示

4. **状态同步**：支付成功后，主动查询订单状态，不依赖回调

5. **测试工具**：使用 Postman 等工具测试支付接口

---

## 🔗 相关文档

- [微信支付商户平台](https://pay.weixin.qq.com/)
- [微信支付 API v3 文档](https://pay.weixin.qq.com/wiki/doc/apiv3/index.shtml)
- [小程序支付开发文档](https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestPayment.html)
- [支付测试指南](./PAYMENT_TEST_GUIDE.md)

---

## 📞 技术支持

如有问题，请查看：
- 微信支付商户平台帮助中心
- 项目 API 测试指南：`API_TEST_GUIDE.md`
- 支付测试指南：`PAYMENT_TEST_GUIDE.md`
