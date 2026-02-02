# API 测试指南

> 更新时间：2025-01-28  
> 用途：现有API功能测试文档

---

## 📋 测试准备

### 1. 启动服务

确保后端服务已启动：

```bash
node index.js
```

或者使用你的启动脚本。

### 2. 配置测试环境

#### 获取管理员Token（用于测试管理后台API）

1. 使用默认管理员账号登录：
   - 用户名：`admin`
   - 密码：`admin123`

2. 调用登录接口获取Token：
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

3. 保存返回的Token用于后续请求：
```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

#### 小程序API测试（可选）

小程序API需要openid，如果使用Postman或其他工具测试，需要先调用登录接口：

```bash
POST http://localhost:3000/api/auth/miniapp-login
Content-Type: application/json

{
  "code": "微信小程序登录code（从微信获取）"
}
```

---

## 🧪 测试工具推荐

1. **Postman**（推荐）- 图形界面，易于使用
2. **curl** - 命令行工具
3. **Thunder Client** - VS Code扩展
4. **测试脚本** - 本项目提供的自动化测试脚本

---

## 📚 API接口清单

### 一、基础接口

#### 1. 健康检查
- **GET** `/health`
- **无需认证**
- **用途**：检查服务是否正常运行

#### 2. 用户认证

##### 2.1 管理员登录
- **POST** `/api/auth/login`
- **无需认证**
- **Body**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

##### 2.2 小程序登录
- **POST** `/api/auth/miniapp-login`
- **无需认证**
- **Body**:
```json
{
  "code": "微信小程序code"
}
```

##### 2.3 获取当前用户信息
- **GET** `/api/auth/me`
- **需要认证**（管理员Token）

##### 2.4 登出
- **POST** `/api/auth/logout`
- **需要认证**（管理员Token）

---

### 二、商品管理API

#### 1. 获取商品列表（管理后台）
- **GET** `/api/products?page=1&limit=10&search=&categoryId=&status=`
- **需要认证**（管理员Token）

#### 2. 获取单个商品（管理后台）
- **GET** `/api/products/:id`
- **需要认证**（管理员Token）

#### 3. 创建商品
- **POST** `/api/products`
- **需要认证**（管理员Token）
- **Body**:
```json
{
  "name": "商品名称",
  "description": "商品描述",
  "categoryId": 1,
  "brand": "品牌",
  "status": "active",
  "images": ["url1", "url2"],
  "detailImages": ["url1"],
  "videos": [],
  "detailContent": "详情内容"
}
```

#### 4. 更新商品
- **PUT** `/api/products/:id`
- **需要认证**（管理员Token）

#### 5. 删除商品
- **DELETE** `/api/products/:id`
- **需要认证**（管理员Token）

---

### 三、小程序商品API（无需认证）

#### 1. 获取商品列表（小程序）
- **GET** `/api/miniapp/products?page=1&limit=20&categoryId=&keyword=&sortBy=&sortOrder=`
- **无需认证**

#### 2. 获取商品详情（小程序）
- **GET** `/api/miniapp/products/:id/detail`
- **无需认证**（可选：小程序用户Token）

#### 3. 搜索商品
- **GET** `/api/miniapp/products/search?keyword=手机&page=1&limit=20`
- **无需认证**

#### 4. 获取推荐商品
- **GET** `/api/miniapp/products/recommended?limit=10`
- **无需认证**

#### 5. 获取分类列表
- **GET** `/api/miniapp/categories`
- **无需认证**

#### 6. 获取商品SKU列表
- **GET** `/api/miniapp/products/:productId/skus`
- **无需认证**

#### 7. 计算价格
- **POST** `/api/miniapp/products/calculate-price`
- **无需认证**
- **Body**:
```json
{
  "productId": 1,
  "skuId": 1,
  "quantity": 2,
  "memberId": 1
}
```

---

### 四、订单管理API

#### 1. 创建测试订单
- **POST** `/api/orders/test`
- **需要认证**（管理员Token）
- **Body**:
```json
{
  "memberId": 1,
  "productId": 1,
  "quantity": 1,
  "unitPrice": 100.00,
  "totalAmount": 100.00
}
```

#### 2. 获取会员订单列表
- **GET** `/api/orders/member/:memberId?page=1&limit=10&status=`
- **需要认证**（管理员Token）

#### 3. 获取订单详情
- **GET** `/api/orders/:id`
- **需要认证**（管理员Token）

#### 4. 更新订单状态
- **PUT** `/api/orders/:id/status`
- **需要认证**（管理员Token）
- **Body**:
```json
{
  "status": "paid"
}
```

#### 5. 发货
- **PUT** `/api/orders/:id/ship`
- **需要认证**（管理员Token）
- **Body**:
```json
{
  "shippingCompany": "顺丰快递",
  "trackingNumber": "SF1234567890"
}
```

#### 6. 确认收货
- **PUT** `/api/orders/:id/deliver`
- **需要认证**（管理员Token）

---

### 五、小程序订单API

#### 1. 创建订单（小程序）
- **POST** `/api/miniapp/orders`
- **需要认证**（小程序用户Token）
- **Body**:
```json
{
  "productId": 1,
  "skuId": 1,
  "quantity": 1,
  "shippingAddress": "地址",
  "receiverName": "收货人",
  "receiverPhone": "手机号"
}
```

#### 2. 获取订单列表（小程序）
- **GET** `/api/miniapp/orders?page=1&limit=10&status=`
- **需要认证**（小程序用户Token）

#### 3. 获取订单详情（小程序）
- **GET** `/api/miniapp/orders/:id`
- **需要认证**（小程序用户Token）

#### 4. 更新订单状态（小程序）
- **PUT** `/api/miniapp/orders/:id/status`
- **需要认证**（小程序用户Token）
- **Body**:
```json
{
  "status": "cancelled"
}
```

#### 5. 申请退货
- **POST** `/api/miniapp/orders/:id/return`
- **需要认证**（小程序用户Token）

#### 6. 申请退款
- **POST** `/api/miniapp/orders/:id/refund`
- **需要认证**（小程序用户Token）

#### 7. 订单统计
- **GET** `/api/miniapp/orders/stats`
- **需要认证**（小程序用户Token）

---

### 六、会员管理API

#### 1. 获取会员列表
- **GET** `/api/members?page=1&limit=10&search=&status=`
- **需要认证**（管理员Token）

#### 2. 获取会员详情
- **GET** `/api/members/:id`
- **需要认证**（管理员Token）

#### 3. 创建会员
- **POST** `/api/members`
- **需要认证**（管理员Token）

#### 4. 更新会员信息
- **PUT** `/api/members/:id`
- **需要认证**（管理员Token）

#### 5. 获取会员积分记录
- **GET** `/api/members/:id/points`
- **需要认证**（管理员Token）

#### 6. 获取会员佣金记录
- **GET** `/api/members/:id/commission`
- **需要认证**（管理员Token）

#### 7. 获取会员等级变更记录
- **GET** `/api/members/:id/level-changes`
- **需要认证**（管理员Token）

---

### 七、小程序会员API

#### 1. 创建/更新会员（小程序）
- **POST** `/api/miniapp/members`
- **无需认证**
- **Body**:
```json
{
  "code": "微信登录code",
  "nickname": "昵称",
  "avatar": "头像URL"
}
```

#### 2. 获取个人资料
- **GET** `/api/miniapp/members/profile`
- **需要认证**（小程序用户Token）

#### 3. 更新个人资料
- **PUT** `/api/miniapp/members/profile`
- **需要认证**（小程序用户Token）

#### 4. 获取团队信息
- **GET** `/api/miniapp/members/team`
- **需要认证**（小程序用户Token）

#### 5. 获取会员统计
- **GET** `/api/miniapp/members/stats`
- **需要认证**（小程序用户Token）

---

### 八、分类管理API

#### 1. 获取分类列表
- **GET** `/api/categories?page=1&limit=10`
- **需要认证**（管理员Token）

#### 2. 获取单个分类
- **GET** `/api/categories/:id`
- **需要认证**（管理员Token）

#### 3. 创建分类
- **POST** `/api/categories`
- **需要认证**（管理员Token）

#### 4. 更新分类
- **PUT** `/api/categories/:id`
- **需要认证**（管理员Token）

#### 5. 删除分类
- **DELETE** `/api/categories/:id`
- **需要认证**（管理员Token）

---

### 九、其他管理API

#### 1. 会员等级管理
- **GET** `/api/member-levels` - 获取列表
- **POST** `/api/member-levels` - 创建
- **PUT** `/api/member-levels/:id` - 更新
- **DELETE** `/api/member-levels/:id` - 删除

#### 2. 分销等级管理
- **GET** `/api/distributor-levels` - 获取列表
- **POST** `/api/distributor-levels` - 创建
- **PUT** `/api/distributor-levels/:id` - 更新
- **DELETE** `/api/distributor-levels/:id` - 删除

#### 3. 团队拓展等级管理
- **GET** `/api/team-expansion-levels` - 获取列表
- **POST** `/api/team-expansion-levels` - 创建
- **PUT** `/api/team-expansion-levels/:id` - 更新
- **DELETE** `/api/team-expansion-levels/:id` - 删除

#### 4. 积分商城管理
- **GET** `/api/point-mall/products` - 获取商品列表
- **POST** `/api/point-mall/products` - 创建商品
- **POST** `/api/point-mall/exchange` - 兑换商品

#### 5. 促销活动管理
- **GET** `/api/promotions` - 获取列表
- **POST** `/api/promotions` - 创建活动
- **PUT** `/api/promotions/:id` - 更新活动

#### 6. 横幅管理
- **GET** `/api/banners` - 获取列表
- **POST** `/api/banners` - 创建横幅
- **PUT** `/api/banners/:id` - 更新横幅
- **GET** `/api/banners/public/:position` - 公开接口（无需认证）

#### 7. 弹窗管理
- **GET** `/api/popups` - 获取列表
- **POST** `/api/popups` - 创建弹窗
- **GET** `/api/popups/public/active` - 获取活跃弹窗（无需认证）

#### 8. 积分设置管理
- **GET** `/api/point-settings/source-configs` - 获取积分来源配置
- **POST** `/api/point-settings/source-configs` - 创建配置
- **GET** `/api/point-settings/multiplier-configs` - 获取倍率配置
- **GET** `/api/point-settings/rule-configs` - 获取规则配置

---

## ✅ 测试检查清单

### 基础功能测试
- [ ] 健康检查接口 `/health`
- [ ] 管理员登录 `/api/auth/login`
- [ ] 获取当前用户信息 `/api/auth/me`

### 商品管理测试
- [ ] 获取商品列表 `/api/products`
- [ ] 创建商品 `/api/products` (POST)
- [ ] 获取商品详情 `/api/products/:id`
- [ ] 更新商品 `/api/products/:id` (PUT)
- [ ] 删除商品 `/api/products/:id` (DELETE)

### 小程序商品API测试
- [ ] 获取商品列表 `/api/miniapp/products`
- [ ] 获取商品详情 `/api/miniapp/products/:id/detail`
- [ ] 搜索商品 `/api/miniapp/products/search`
- [ ] 获取推荐商品 `/api/miniapp/products/recommended`
- [ ] 获取分类列表 `/api/miniapp/categories`
- [ ] 获取SKU列表 `/api/miniapp/products/:productId/skus`
- [ ] 计算价格 `/api/miniapp/products/calculate-price`

### 订单管理测试
- [ ] 创建测试订单 `/api/orders/test`
- [ ] 获取订单列表 `/api/orders/member/:memberId`
- [ ] 获取订单详情 `/api/orders/:id`
- [ ] 更新订单状态 `/api/orders/:id/status`
- [ ] 发货 `/api/orders/:id/ship`
- [ ] 确认收货 `/api/orders/:id/deliver`

### 会员管理测试
- [ ] 获取会员列表 `/api/members`
- [ ] 创建会员 `/api/members` (POST)
- [ ] 获取会员详情 `/api/members/:id`
- [ ] 更新会员信息 `/api/members/:id` (PUT)
- [ ] 获取会员积分记录 `/api/members/:id/points`
- [ ] 获取会员佣金记录 `/api/members/:id/commission`

### 分类管理测试
- [ ] 获取分类列表 `/api/categories`
- [ ] 创建分类 `/api/categories` (POST)
- [ ] 更新分类 `/api/categories/:id` (PUT)
- [ ] 删除分类 `/api/categories/:id` (DELETE)

### 其他功能测试
- [ ] 会员等级管理
- [ ] 分销等级管理
- [ ] 积分商城管理
- [ ] 促销活动管理
- [ ] 横幅管理
- [ ] 弹窗管理

---

## 🐛 常见问题

### 1. Token过期
**问题**：返回401错误  
**解决**：重新登录获取新的Token

### 2. 数据库连接失败
**问题**：返回500错误，日志显示数据库连接失败  
**解决**：检查`.env`文件中的数据库配置

### 3. 跨域问题
**问题**：浏览器提示CORS错误  
**解决**：确保服务器已配置CORS，或在测试工具中测试（Postman不受CORS限制）

### 4. 接口返回404
**问题**：接口路径不存在  
**解决**：检查URL路径是否正确，注意大小写和参数

---

## 📝 测试记录模板

```markdown
## 测试日期：2025-01-28

### 测试接口：[接口名称]
- **URL**: [接口地址]
- **Method**: [GET/POST/PUT/DELETE]
- **请求参数**: [参数说明]
- **预期结果**: [预期返回]
- **实际结果**: [实际返回]
- **状态**: ✅ 通过 / ❌ 失败
- **备注**: [问题说明]
```

---

**提示**：建议使用提供的测试脚本进行自动化测试，详见 `test-api.ps1` 文件。

