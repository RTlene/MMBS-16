# 云托管自带对象存储

使用**微信云托管自带的对象存储**，无需单独开通腾讯云 COS，上传的图片/视频会持久化在云托管环境内。

## 1. 上传与展示逻辑

- **上传**：后台商品文件上传时，若配置了 `WX_CLOUD_ENV`（或 `CBR_ENV_ID`），会先落盘并压缩图片，再通过 `tcb/uploadfile` 上传到云托管存储，数据库存 **file_id**（`cloud://xxx`）。
- **小程序**：`<image src="cloud://...">`、`<video src="cloud://...">` 可直接使用云文件 ID。
- **H5 后台**：对 `cloud://` 的地址会转为请求 `/api/storage/temp-url?fileId=xxx`，该接口会 302 到临时下载链接，图片/视频可正常展示。

## 2. 环境变量

在云托管控制台或 `.env` 中配置：

```bash
# 云托管环境 ID（控制台「概览」可见；部分部署会自动注入为 CBR_ENV_ID）
WX_CLOUD_ENV=你的环境ID
```

若不设置 `WX_CLOUD_ENV`，程序会尝试使用 `CBR_ENV_ID`（云托管有时会自动注入）。

## 3. 开放接口与权限

云托管通过「开放接口服务」调用微信接口，**无需**在代码里传 access_token。

1. 云托管控制台 → 当前环境 → **开放接口服务**，确认已开通。
2. **微信令牌权限配置** 中勾选：
   - `/tcb/uploadfile`
   - `/tcb/batchdownloadfile`

保存后生效。

## 4. 优先级说明

商品文件上传时的存储优先级：

1. **云托管存储**：`WX_CLOUD_ENV` 或 `CBR_ENV_ID` 已配置 → 上传到云托管，存 `file_id`。
2. **腾讯云 COS**：未配置云托管但配置了 COS 四件套 → 上传到 COS，存 https URL。
3. **本地**：都未配置 → 存本地路径（云托管实例重启/换节点后可能丢失，仅适合开发）。

## 5. 可选：存储路径前缀

云上路径默认为 `products/{商品ID}/{文件名}`。可通过环境变量改前缀（不要以 `/` 开头）：

```bash
# 与 COS 共用同一变量，默认 products
WX_CLOUD_STORAGE_PREFIX=products
# 或
COS_PREFIX=products
```

## 6. 接口说明

- **GET /api/storage/temp-url?fileId=cloud://xxx**  
  根据 file_id 换取临时下载链接并 302 跳转，供 H5 后台展示 `cloud://` 图片/视频。不鉴权，便于 `<img src="...">` 直接请求。
