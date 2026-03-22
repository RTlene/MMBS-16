# 后台登录验证码

## 说明

- **接口**
  - `GET /api/auth/captcha`：返回 `{ code: 0, data: { captchaToken, imageDataUrl } }`，`imageDataUrl` 为 SVG Base64，可直接赋给 `<img src>`。
  - `POST /api/auth/login`：请求体在原有 `username`、`password` 基础上增加 **`captchaToken`**、**`captcha`**（用户输入的验证码，不区分大小写）。
- **多实例**：验证码为**无状态 JWT**（`services/captchaService.js`）：正确答案以 HMAC 写入短期 JWT，**不依赖进程内存**；各实例只需配置相同的 **`JWT_SECRET`** 即可在负载均衡下正常工作。
- **依赖**：`svg-captcha`、`jsonwebtoken`（已列入 `package.json`）。

## 前端

- `public/login.html`：验证码输入框、图片、换一张。
- `public/js/auth.js`：`fetchCaptcha()`、`login(..., captchaToken, captcha)`；登录失败或无法加载验证码时会刷新图片。

## 兼容

- 旧版请求若仍传 `captchaId` 字段（值为 JWT 字符串），后端会当作 `captchaToken` 使用。
