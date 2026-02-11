# 腾讯云 COS 对象存储配置

配置后，后台商品上传的**图片和视频**会写入腾讯云 COS，再次编辑时可正常加载（不依赖当前节点本地磁盘）。

## 1. 开通与创建

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/cos5)
2. 创建**存储桶**（Bucket）  
   - 地域：选离你用户近的（如 `ap-guangzhou`）  
   - 名称：如 `mmbs-uploads`  
   - 访问权限：建议**公有读私有写**（商品图需公网可访问）
3. 记下：**存储桶名称**（格式 `名称-APPID`）、**地域**（如 `ap-guangzhou`）

## 2. 获取密钥

1. 打开 [访问管理 - API 密钥](https://console.cloud.tencent.com/cam/capi)
2. 创建或使用已有 **SecretId**、**SecretKey**（建议用子账号并仅授权 COS 读写）

## 3. 环境变量

在 `.env` 或云托管环境变量中配置：

```bash
COS_SECRET_ID=你的SecretId
COS_SECRET_KEY=你的SecretKey
COS_BUCKET=你的存储桶名-APPID
COS_REGION=ap-guangzhou
```

可选：

- **COS_PREFIX**：对象前缀，默认 `products`，文件会存为 `products/{商品ID}/{文件名}`
- **COS_DOMAIN**：自定义 CDN 域名（如 `https://cdn.example.com`），不填则用 COS 默认域名

## 4. 行为说明

- 未配置上述 4 个变量时：仍使用**本地磁盘**上传，与之前一致。
- 配置后：每次上传会先写本地并做图片压缩，再**上传到 COS**，数据库里存的是 **COS 公网 URL**，后台/小程序都用该 URL 访问，任意节点、重启后都能加载。

## 5. 安装依赖

已加入依赖 `cos-nodejs-sdk-v5`，部署前执行：

```bash
npm install
```
