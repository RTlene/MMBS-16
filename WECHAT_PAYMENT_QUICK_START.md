# 微信支付快速开始指南

## 🚀 快速配置（5分钟）

### 1. 配置环境变量

编辑 `.env` 文件，添加微信支付配置：

```bash
# 微信小程序配置（已有）
WX_APPID=wx849e40856c0c2238
WX_APPSECRET=a01ee3823ebf9e1e795c250b7e16f883

# 微信支付配置（新增）
WX_MCHID=你的商户号
WX_PAY_KEY=你的API密钥
WX_PAY_CERT_PATH=/app/cert/apiclient_cert.pem
WX_PAY_KEY_PATH=/app/cert/apiclient_key.pem
WX_PAY_CERT_SERIAL_NO=你的证书序列号
WX_PAY_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
WX_PAY_SANDBOX=true  # 测试时使用沙箱环境
BASE_URL=http://localhost:3000  # 本地测试
```

### 2. 准备证书文件

1. 从微信支付商户平台下载证书
2. 创建 `cert` 目录
3. 上传证书文件：
   - `apiclient_cert.pem`
   - `apiclient_key.pem`

### 3. 重启服务

```bash
docker-compose restart
```

## 🧪 测试流程

### 方式一：小程序端测试（推荐）

1. **创建订单**
   - 在小程序中选择商品
   - 选择支付方式为"微信支付"
   - 提交订单

2. **发起支付**
   - 在订单详情页点击"立即支付"
   - 系统会自动调起微信支付

3. **完成支付**
   - 在微信支付界面完成支付
   - 系统会自动更新订单状态

### 方式二：API 测试

#### 步骤1：创建订单

```bash
POST http://localhost:3000/api/miniapp/orders
Authorization: Bearer {小程序Token}

{
  "items": [{"productId": 1, "skuId": 1, "quantity": 1}],
  "paymentMethod": "wechat",
  "shippingAddress": "测试地址",
  "receiverName": "测试用户",
  "receiverPhone": "13800138000"
}
```

#### 步骤2：创建支付订单

```bash
POST http://localhost:3000/api/payment/wechat/create
Authorization: Bearer {小程序Token}

{
  "orderId": 123
}
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "payParams": {
      "appId": "wx849e40856c0c2238",
      "timeStamp": "1706234567",
      "nonceStr": "abc123",
      "package": "prepay_id=wx1234567890",
      "signType": "RSA",
      "paySign": "签名"
    }
  }
}
```

#### 步骤3：在小程序中调起支付

使用返回的 `payParams` 调用 `wx.requestPayment()`：

```javascript
wx.requestPayment({
  appId: payParams.appId,
  timeStamp: payParams.timeStamp,
  nonceStr: payParams.nonceStr,
  package: payParams.package,
  signType: payParams.signType,
  paySign: payParams.paySign,
  success: (res) => {
    console.log('支付成功', res);
  },
  fail: (err) => {
    console.error('支付失败', err);
  }
});
```

## 📋 测试检查清单

### 配置检查
- [ ] 商户号已配置（WX_MCHID）
- [ ] API密钥已配置（WX_PAY_KEY）
- [ ] 证书文件已上传
- [ ] 证书序列号已配置
- [ ] 回调地址已配置（生产环境）

### 功能测试
- [ ] 创建支付订单接口正常
- [ ] 获取支付参数成功
- [ ] 小程序调起支付成功
- [ ] 支付成功回调正常
- [ ] 订单状态更新正确

## 🔍 验证支付结果

### 查询订单状态

```bash
GET http://localhost:3000/api/payment/wechat/query/123
Authorization: Bearer {小程序Token}
```

### 检查订单详情

```bash
GET http://localhost:3000/api/miniapp/orders/123
Authorization: Bearer {小程序Token}
```

**验证字段**：
- `status`: `paid`
- `paymentTime`: 有值
- `transactionId`: 微信交易号

## 🐛 常见问题

### 1. 统一下单失败：配置不完整

**解决**：检查 `.env` 文件中的配置是否完整

### 2. 证书加载失败

**解决**：
- 检查证书文件路径是否正确
- 确认文件权限（建议 600）
- 检查证书文件内容是否完整

### 3. 小程序调起支付失败

**解决**：
- 确认 `appId` 与小程序 AppID 一致
- 检查支付目录是否在商户平台配置
- 确认小程序已关联商户号

## 📚 详细文档

- **完整对接指南**：`WECHAT_PAYMENT_GUIDE.md`
- **支付测试指南**：`PAYMENT_TEST_GUIDE.md`
- **API 测试指南**：`API_TEST_GUIDE.md`

## 💡 提示

1. **开发测试**：使用沙箱环境（`WX_PAY_SANDBOX=true`）
2. **回调测试**：使用内网穿透工具（ngrok、frp等）
3. **日志查看**：`docker logs mmbs-app | grep -i payment`
