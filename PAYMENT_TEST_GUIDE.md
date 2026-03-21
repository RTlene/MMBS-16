# 支付测试指南

> 更新时间：2026-01-26  
> 用途：支付功能测试完整指南

---

## ⚠️ 微信支付沙箱模式说明（APIv3）

当前在**沙箱模式**下发起小程序支付时，微信侧可能返回 **404**。原因包括：

- 微信支付 **APIv3 沙箱**对统一下单等接口的支持不明确或已调整，`/sandboxnew/v3/pay/transactions/jsapi` 可能不可用。
- 沙箱需使用沙箱商户号/沙箱密钥等单独配置，与正式环境不同。

**推荐做法：**

1. **生产环境小额测试**：在后台将微信支付切回「生产模式」，使用 **0.01 元**订单做真实支付，验证统一下单与回调流程。
2. **模拟回调验证**：不依赖微信沙箱时，可用脚本模拟支付成功回调，验证订单状态与后续逻辑：
   - 运行 `scripts/simulate-payment-notify.ps1`（参见脚本内说明传入订单号等参数）。

若沙箱模式下出现 404，接口会返回明确错误提示，并建议采用上述两种方式之一进行测试。

---

## 📋 支付方式说明

系统支持以下支付方式：

1. **微信支付** (`wechat`) - 需要配置微信支付商户号
2. **支付宝** (`alipay`) - 需要配置支付宝商户号
3. **银行卡** (`bank`) - 需要配置银行卡支付接口
4. **积分支付** (`points`) - 使用会员积分支付
5. **佣金支付** (`commission`) - 使用会员佣金余额支付
6. **测试支付** (`test`) - 用于测试，无需真实支付

---

## 🧪 测试方法

### 方法一：创建测试订单（推荐）

直接创建已支付的测试订单，用于快速测试订单流程。

#### 1. 获取管理员 Token

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

#### 2. 获取会员ID和商品ID

```bash
# 获取会员列表
GET http://localhost:3000/api/members
Authorization: Bearer {你的Token}

# 获取商品列表
GET http://localhost:3000/api/products
Authorization: Bearer {你的Token}
```

#### 3. 创建测试订单

```bash
POST http://localhost:3000/api/orders/test
Content-Type: application/json
Authorization: Bearer {你的Token}

{
  "memberId": 1,
  "productId": 1,
  "quantity": 2,
  "unitPrice": 99.00,
  "totalAmount": 198.00
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "测试订单创建成功",
  "data": {
    "order": {
      "id": 123,
      "orderNo": "TEST1706234567890ABCD",
      "memberId": 1,
      "productId": 1,
      "quantity": 2,
      "unitPrice": 99.00,
      "totalAmount": 198.00,
      "status": "paid",
      "paymentMethod": "test",
      "paymentTime": "2026-01-26T07:30:00.000Z",
      "isTest": true
    }
  }
}
```

**特点：**
- ✅ 订单自动设置为 `paid`（已支付）状态
- ✅ 支付方式自动设置为 `test`
- ✅ 自动标记为测试订单 (`isTest: true`)
- ✅ 自动计算佣金（如果配置了佣金规则）

---

### 方法二：创建待支付订单，然后手动更新状态

模拟真实支付流程：创建订单 → 支付 → 更新状态

#### 1. 创建待支付订单

```bash
POST http://localhost:3000/api/orders
Content-Type: application/json
Authorization: Bearer {你的Token}

{
  "memberId": 1,
  "productId": 1,
  "quantity": 1,
  "unitPrice": 99.00,
  "totalAmount": 99.00,
  "paymentMethod": "wechat"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "订单创建成功",
  "data": {
    "order": {
      "id": 124,
      "orderNo": "MINI1706234567890ABCD",
      "status": "pending",
      "paymentMethod": "wechat",
      "paymentTime": null
    }
  }
}
```

#### 2. 模拟支付成功，更新订单状态

```bash
PUT http://localhost:3000/api/orders/124/status
Content-Type: application/json
Authorization: Bearer {你的Token}

{
  "status": "paid"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "订单状态更新成功",
  "data": {
    "order": {
      "id": 124,
      "status": "paid",
      "paymentTime": "2026-01-26T07:35:00.000Z"
    }
  }
}
```

**注意：**
- 当状态更新为 `paid` 时，系统会自动设置 `paymentTime`
- 系统会自动触发佣金计算（如果配置了佣金规则）

---

### 方法三：使用小程序API创建订单（支持积分和佣金抵扣）

小程序订单接口支持更复杂的支付场景，包括积分和佣金抵扣。

#### 1. 小程序用户登录获取 Token

```bash
POST http://localhost:3000/api/auth/miniapp-login
Content-Type: application/json

{
  "code": "微信小程序登录code"
}
```

#### 2. 创建小程序订单（支持积分/佣金抵扣）

```bash
POST http://localhost:3000/api/miniapp/orders
Content-Type: application/json
Authorization: Bearer {小程序Token}

{
  "items": [
    {
      "productId": 1,
      "skuId": 1,
      "quantity": 2
    }
  ],
  "paymentMethod": "wechat",
  "pointsUsage": 1000,  // 可选：使用积分（100积分=1元）
  "commissionUsage": 50.00,  // 可选：使用佣金抵扣
  "shippingAddress": "测试地址",
  "receiverName": "测试用户",
  "receiverPhone": "13800138000",
  "remark": "测试订单"
}
```

**特点：**
- ✅ 支持积分抵扣（100积分 = 1元）
- ✅ 支持佣金余额抵扣
- ✅ 如果抵扣后金额为0，自动设置为已支付
- ✅ 自动扣除会员的积分和佣金余额

---

## 🔍 验证支付结果

### 1. 查询订单详情

```bash
GET http://localhost:3000/api/orders/123
Authorization: Bearer {你的Token}
```

**检查字段：**
- `status`: 应为 `paid`
- `paymentMethod`: 支付方式
- `paymentTime`: 支付时间（不应为 null）
- `isTest`: 是否为测试订单

### 2. 查询会员订单列表

```bash
GET http://localhost:3000/api/orders/member/1
Authorization: Bearer {你的Token}
```

### 3. 检查佣金是否计算

```bash
GET http://localhost:3000/api/members/1/commission
Authorization: Bearer {你的Token}
```

---

## 📝 测试场景

### 场景1：测试订单完整流程

1. 创建测试订单（已支付）
2. 查询订单详情
3. 发货：`PUT /api/orders/:id/ship`
4. 确认收货：用户在小程序完成（或 `PUT /api/miniapp/orders/:id/status` 置为 `delivered`）；后台不再提供 `PUT /api/orders/:id/deliver`
5. 验证佣金是否到账

### 场景2：测试不同支付方式

```bash
# 测试微信支付
POST /api/orders/test
{ "paymentMethod": "wechat", ... }

# 测试支付宝
POST /api/orders/test
{ "paymentMethod": "alipay", ... }

# 测试积分支付（通过小程序接口）
POST /api/miniapp/orders
{ "pointsUsage": 1000, ... }

# 测试佣金支付（通过小程序接口）
POST /api/miniapp/orders
{ "commissionUsage": 50.00, ... }
```

### 场景3：测试支付失败和退款

```bash
# 创建待支付订单
POST /api/orders
{ "status": "pending", ... }

# 取消订单
PUT /api/orders/:id/status
{ "status": "cancelled" }

# 退款（需要先支付）
PUT /api/orders/:id/status
{ "status": "refunded" }
```

---

## 🛠️ 使用 Postman 测试

### 1. 导入环境变量

创建 Postman Environment，设置：
- `base_url`: `http://localhost:3000`
- `admin_token`: （登录后获取）
- `member_id`: 1
- `product_id`: 1

### 2. 创建测试集合

**请求1：管理员登录**
```
POST {{base_url}}/api/auth/login
Body: { "username": "admin", "password": "admin123" }
Tests: pm.environment.set("admin_token", pm.response.json().data.token);
```

**请求2：创建测试订单**
```
POST {{base_url}}/api/orders/test
Headers: Authorization: Bearer {{admin_token}}
Body: {
  "memberId": {{member_id}},
  "productId": {{product_id}},
  "quantity": 1,
  "unitPrice": 99.00,
  "totalAmount": 99.00
}
Tests: pm.environment.set("order_id", pm.response.json().data.order.id);
```

**请求3：查询订单详情**
```
GET {{base_url}}/api/orders/{{order_id}}
Headers: Authorization: Bearer {{admin_token}}
```

---

## 🐛 常见问题

### 1. 订单创建失败：会员不存在
**解决**：先创建会员或使用已存在的会员ID

```bash
POST /api/members
{
  "nickname": "测试用户",
  "phone": "13800138000",
  "openid": "test_openid_123"
}
```

### 2. 订单创建失败：商品不存在
**解决**：先创建商品或使用已存在的商品ID

```bash
POST /api/products
{
  "name": "测试商品",
  "price": 99.00,
  "stock": 100
}
```

### 3. 积分/佣金不足
**解决**：先给会员充值积分或佣金

```bash
# 更新会员积分
PUT /api/members/:id
{
  "availablePoints": 10000
}

# 更新会员佣金
PUT /api/members/:id
{
  "availableCommission": 500.00
}
```

### 4. 支付后佣金未计算
**检查**：
- 订单状态是否为 `paid`
- 是否配置了分销等级和佣金规则
- 查看服务器日志是否有佣金计算错误

---

## 📊 测试检查清单

- [ ] 创建测试订单成功
- [ ] 订单状态为 `paid`
- [ ] 支付时间已设置
- [ ] 查询订单详情正常
- [ ] 佣金计算正确（如果配置了）
- [ ] 积分/佣金抵扣正确（小程序订单）
- [ ] 订单列表显示正确
- [ ] 不同支付方式都能正常工作
- [ ] 订单状态流转正常（pending → paid → shipped → delivered）

---

## 💡 提示

1. **快速测试**：使用 `/api/orders/test` 接口创建已支付的测试订单
2. **完整流程测试**：使用 `/api/orders` 创建订单，然后手动更新状态
3. **真实场景测试**：使用小程序API接口，支持积分和佣金抵扣
4. **生产环境**：需要配置真实的微信支付或支付宝商户号

---

## 🔗 相关接口

- 创建测试订单：`POST /api/orders/test`
- 创建订单：`POST /api/orders`
- 更新订单状态：`PUT /api/orders/:id/status`
- 查询订单详情：`GET /api/orders/:id`
- 查询会员订单：`GET /api/orders/member/:memberId`
- 小程序创建订单：`POST /api/miniapp/orders`

---

## 📞 技术支持

如有问题，请查看：
- API 测试指南：`API_TEST_GUIDE.md`
- 项目状态文档：`PROJECT_STATUS.md`
