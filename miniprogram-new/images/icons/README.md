# 个人中心图标说明（扁平单色）

当前页面使用**单色文字**作为占位图标，风格统一、无多余色彩。  
若需使用**矢量/位图图标**，推荐以下免费可商用资源，下载后可按下表替换。

---

## 推荐图标库（可下载 SVG/PNG）

### 1. IconPark（字节跳动开源，推荐）

- **官网**：https://iconpark.oceanengine.com  
- **风格**：线性 outline / 填充 filled，可调颜色、线宽  
- **导出**：SVG、PNG  
- **协议**：Apache 2.0，可商用  

### 2. Iconoir

- **官网**：https://iconoir.com  
- **风格**：统一线性、扁平  
- **导出**：SVG 等  
- **协议**：MIT，可商用  

---

## 图标与关键词对照表

下载时在官网搜索下列英文关键词，选择**线性、单色**款式，颜色建议统一为 `#64748B`，尺寸建议 **48px** 或 **96px** 导出 PNG 放入本目录。

| 用途       | 建议文件名           | IconPark / Iconoir 搜索关键词     |
|------------|----------------------|-----------------------------------|
| 待付款     | order-pending.png    | wallet, payment, money            |
| 待发货     | order-ship.png       | box, package, deliver             |
| 待收货     | order-deliver.png    | truck, logistics, delivery        |
| 已完成     | order-done.png       | check, check circle, done         |
| 收货地址   | address.png          | location, address, map pin        |
| 我的团队   | team.png             | people, group, team               |
| 我的优惠券 | coupon.png           | ticket, coupon                    |
| 我的核销码 | verification.png     | qr code, scan, verify              |
| 联系客服   | service.png          | message, chat, customer service    |
| 关于我们   | about.png            | info, about, information          |

---

## 替换方式

1. 将下载好的 PNG 放入本目录：`miniprogram-new/images/icons/`  
2. 在 `pages/profile/profile.wxml` 中，把对应项的  
   `<text class="stat-icon">…</text>` 或 `<text class="menu-icon">…</text>`  
   改为：  
   `<image class="stat-icon" src="/images/icons/order-pending.png" mode="aspectFit" />`  
   （文件名与上表一致即可）  
3. 在 `profile.wxss` 中已为 `.stat-icon`、`.menu-icon` 预留尺寸，若用图片可设：  
   `width: 40rpx; height: 40rpx;`（可按需微调）

当前未放图标文件时，页面使用单色文字占位，视觉已保持扁平统一。
