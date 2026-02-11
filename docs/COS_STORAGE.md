# 腾讯云 COS 对象存储配置

配置后，后台商品上传的**图片和视频**会写入腾讯云 COS，再次编辑时可正常加载（不依赖当前节点本地磁盘）。

## 1. 两种配置方式

### 方式一：微信云托管自动注入（推荐）

云托管控制台会为当前环境自动配置 **COS_BUCKET**、**COS_REGION**（在「环境变量」或「对象存储-存储配置」中可见）。  
**无需**再配置 SecretId/SecretKey：本服务会通过开放接口 `/_/cos/getauth` 获取临时密钥上传。

- 请确保在云托管控制台已开通 **开放接口服务**，并在 **微信令牌权限配置** 中勾选 COS 相关权限（若控制台有该选项）。
- 仅需保证环境变量中存在 `COS_BUCKET`、`COS_REGION` 即可使用。

### 方式二：自建 COS（非云托管或自建桶）

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com/cos5) 创建**存储桶**（地域如 `ap-guangzhou`），记下**存储桶名称**（格式 `名称-APPID`）、**地域**。
2. 在 [访问管理 - API 密钥](https://console.cloud.tencent.com/cam/capi) 获取 **SecretId**、**SecretKey**。
3. 在 `.env` 或部署环境中配置四件套：`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`。

## 2. 环境变量说明

| 变量 | 说明 |
|------|------|
| COS_BUCKET | 存储桶名称（云托管常自动注入） |
| COS_REGION | 地域，如 `ap-shanghai`、`ap-guangzhou`（云托管常自动注入） |
| COS_SECRET_ID | 可选。未配置时且存在 BUCKET+REGION 则使用云托管 getauth 临时密钥 |
| COS_SECRET_KEY | 可选。与 COS_SECRET_ID 成对使用 |
| COS_PREFIX | 可选，默认 `products`，对象键为 `products/{商品ID}/{文件名}` |
| COS_DOMAIN | 可选，自定义 CDN 域名 |

**优先级**：若同时存在 `COS_SECRET_ID`、`COS_SECRET_KEY`，则使用永久密钥；否则在仅有 `COS_BUCKET`、`COS_REGION` 时使用云托管临时密钥。

## 3. 行为说明

- 未配置 COS（无 BUCKET+REGION）时：使用本地磁盘或云托管自带存储（若已配置）。
- 配置后：上传会先写本地并压缩图片，再上传到 COS，数据库存 **COS 公网 URL**。若存储桶为私有读写，需在腾讯云侧改为公有读或使用带签名的访问方式。

## 4. 安装依赖

已加入依赖 `cos-nodejs-sdk-v5`，部署前执行：

```bash
npm install
```
