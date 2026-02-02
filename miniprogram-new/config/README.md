# API 配置说明

## 环境配置

### 本地测试（开发环境）

1. **确保后端服务正在运行**
   - 检查服务器地址和端口是否正确
   - 确保服务器可以正常访问

2. **修改 `api.js` 配置**
   ```javascript
   const DEV_BASE_URL = 'http://你的本地服务器地址:端口';
   const ENV = 'development'; // 保持为 development
   ```

3. **常见本地服务器地址**
   - 本地：`http://localhost:3000`
   - 内网穿透：`http://your-frp-domain:port`
   - 局域网：`http://192.168.x.x:3000`

### 部署生产（生产环境）

1. **修改 `api.js` 配置**
   ```javascript
   const PROD_BASE_URL = 'https://你的生产域名';
   const ENV = 'production'; // 改为 production
   ```

2. **配置微信小程序合法域名**
   - 登录微信公众平台
   - 进入"开发" → "开发管理" → "开发设置"
   - 添加 `request合法域名`、`uploadFile合法域名`、`downloadFile合法域名`

3. **确保使用HTTPS**
   - 生产环境必须使用HTTPS协议
   - 确保SSL证书有效

## 配置示例

### 开发环境配置
```javascript
const DEV_BASE_URL = 'http://localhost:3000';
const ENV = 'development';
```

### 生产环境配置
```javascript
const PROD_BASE_URL = 'https://api.yourdomain.com';
const ENV = 'production';
```

## 环境自动检测

如果 `ENV` 设置为 `null` 或 `undefined`，系统会自动检测：
- **开发工具**：自动使用 `development`
- **真机环境**：自动使用 `production`

## 注意事项

1. **本地测试时**
   - 确保 `project.config.json` 中 `urlCheck: false`（开发阶段）
   - 确保后端服务正在运行
   - 检查防火墙是否阻止了连接

2. **部署前**
   - 将 `ENV` 改为 `production`
   - 配置正确的 `PROD_BASE_URL`
   - 确保域名已添加到微信小程序合法域名列表
   - 确保使用HTTPS协议

3. **调试技巧**
   - 查看控制台日志，确认当前使用的API地址
   - 使用开发者工具的Network面板查看请求详情
   - 检查服务器日志，确认请求是否到达

## 常见问题

### Q: 本地测试时请求失败
**A**: 
1. 检查服务器是否正在运行
2. 检查 `DEV_BASE_URL` 是否正确
3. 检查防火墙设置
4. 尝试在浏览器中直接访问API地址

### Q: 真机测试时无法连接
**A**:
1. 确保真机和服务器在同一网络，或使用内网穿透
2. 检查 `urlCheck` 设置（开发阶段可设为 `false`）
3. 在微信公众平台配置合法域名（HTTP需要特殊配置）

### Q: 部署后无法访问
**A**:
1. 确保 `ENV` 已改为 `production`
2. 确保 `PROD_BASE_URL` 使用HTTPS
3. 确保域名已添加到微信小程序合法域名列表
4. 检查SSL证书是否有效

