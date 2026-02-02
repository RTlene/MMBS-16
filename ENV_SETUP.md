# 环境变量配置说明

## 必需的环境变量

### 1. 数据库配置
```env
MYSQL_USERNAME=你的数据库用户名
MYSQL_PASSWORD=你的数据库密码
MYSQL_ADDRESS=数据库地址:端口
# 例如：MYSQL_ADDRESS=localhost:3306
# 或者：MYSQL_ADDRESS=192.168.1.100:3306
```

### 2. JWT 密钥（必需，用于后台管理员登录）
```env
JWT_SECRET=你的随机密钥字符串
```

**如何生成安全的 JWT_SECRET：**
- 可以使用在线工具生成随机字符串（至少32个字符）
- 或者使用 Node.js 命令生成：
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- 示例：`JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6`

**注意：** 
- JWT_SECRET 用于签名和验证 JWT token，如果泄露会导致安全风险
- 生产环境必须使用强随机字符串，不要使用默认值
- 如果未设置，系统会使用默认值 `'your-secret-key-change-this'`，但这不安全

### 3. 微信小程序配置（小程序登录必需）
```env
WX_APPID=你的小程序AppID
WX_APPSECRET=你的小程序AppSecret
```

## 可选的环境变量

### Session 密钥
```env
SESSION_SECRET=你的随机密钥字符串
```
如果未设置，会使用 JWT_SECRET 的值。

### 其他配置
```env
NODE_ENV=production  # 或 development
PORT=3000           # 服务器端口
```

## 配置检查清单

- [ ] MYSQL_USERNAME 已设置
- [ ] MYSQL_PASSWORD 已设置
- [ ] MYSQL_ADDRESS 已设置（格式：地址:端口）
- [ ] JWT_SECRET 已设置（使用随机字符串）
- [ ] WX_APPID 已设置（小程序功能需要）
- [ ] WX_APPSECRET 已设置（小程序功能需要）

## 常见问题

### Q: JWT_SECRET 不设置会怎样？
A: 系统会使用默认值 `'your-secret-key-change-this'`，但这不安全。生产环境必须设置。

### Q: 如何验证环境变量是否正确加载？
A: 启动服务器后，检查控制台日志，确认数据库连接成功。

### Q: 数据库连接失败怎么办？
A: 检查：
1. MYSQL_ADDRESS 格式是否正确（地址:端口）
2. 数据库服务是否启动
3. 用户名密码是否正确
4. 防火墙是否允许连接

