# 微信小程序：后台发货 / 确认收货 与公众平台订单同步说明

## 官方能力说明

微信将「小程序内支付订单」的发货与确认收货，纳入 **小程序发货信息管理服务**（又称订单与物流、交易管理服务）：

| 接口 | 路径 | 说明 |
|------|------|------|
| 发货信息录入 | [`/wxa/sec/order/upload_shipping_info`](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/api_uploadshippinginfo.html) | 支付后资金默认冻结，商家发货后需调用该接口录入发货信息，平台会向用户推送消息 |
| 确认收货提醒 | [`/wxa/sec/order/notify_confirm_receive`](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/api_notifyconfirmreceive.html) | **仅物流快递**场景下，商家从物流侧获知签收后提醒用户去微信内确认；**自提不适用**；**每个订单仅可成功调用一次** |
| 是否开通发货管理 | [`/wxa/sec/order/is_trade_managed`](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/api_istrademanaged.html) | 未开通时，上述接口往往无法在公众平台侧形成一致展示 |

其他相关能力（按需在微信公众平台配置）：

- **消息跳转路径**：[`set_msg_jump_path`](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/api_setmsgjumppath.html) — 用户点击发货/确认收货消息时进入小程序订单页。
- **交易结算管理确认**：[`is_trade_management_confirmation_completed`](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/api_istrademanagementconfirmationcompleted.html) — 商户号需完成订单管理授权等，否则可能影响结算与订单能力。

**结算前提、用户侧「确认收货组件」与 `notify_confirm_receive` 分工**（必读）：见 **`docs/WECHAT_ORDER_SETTLEMENT_CONFIRM.md`**。

## 本项目中的实现

- 服务代码：`services/wechatMiniappOrderService.js`
  - 使用 **微信支付单号** `transaction_id` 构造 `order_key`（`order_number_type: 2`），与微信侧支付单对齐。
  - 发货：快递 `logistics_type=1`，自提 `logistics_type=4`。
  - 调用发货/确认收货前会探测 **`is_trade_managed`**，未开通时在服务器日志中输出 **WARN**（关键词：`[WechatOrderSync]`）。

- **支付成功回调**（`routes/payment-routes.js`）：若订单为 **门店自提**（`utils/orderStoreEnrich.js` 中 `isPickupOrderByRaw`：按库表 raw 读取 `deliveryType` / `storeId` / **`shippingMethod`**），会在写入 `transactionId` 后自动调用 **`upload_shipping_info`**（自提模式），便于公众平台与订单资金状态对齐。快递订单仍仅在后台「发货」时同步。
- **若公众平台仍显示「待发货」**：先看云日志是否出现 `[WechatOrderSync] 支付回调：未识别为自提`（说明库中未写入自提标记）；或 `upload_shipping_info 失败` 的 `errcode`；或 `会员 openid 为空`。历史库若仅有 `shippingMethod=pickup` 而无 `deliveryType`/`storeId` 列，旧逻辑会跳过同步，已改为同时识别 `shippingMethod`。

### 小程序订单详情里的「自提门店」

- 依赖 **`orders.storeId`** + **`orders.deliveryType`**（或与 `shippingMethod=pickup` 配合），并由 **`GET /api/miniapp/orders/:id`** JOIN **`Store`** 返回 `order.store`。
- 若云日志里 **`[OrderStore] persist pickup fields OK`** 出现 **`storeCol: null`**，说明库里**没有 `storeId` 列**，无法写入门店 ID，详情会一直无门店。
- **处理**：部署后 **`db.js` 启动会自动**为 `orders` 表补充 `storeId`、`deliveryType` 列（与 `scripts/add-orders-delivery-store-columns.js` 一致）。也可手动执行该脚本。
- **已产生的老订单**在加列前若只写了 `shippingMethod`，可酌情 SQL 补 `storeId` / `deliveryType`，或让用户重新下单验证。

## 环境变量（必填）

| 变量 | 说明 |
|------|------|
| `WX_APPID` | 小程序 AppID（须与发起支付的 appid 一致） |
| `WX_APPSECRET` | 小程序 AppSecret，用于 `access_token` |
| `WX_MCHID` | 商户号；当订单上无 `transactionId` 时，用于 `order_key` 类型 1（商户订单号）回退 |

### HTTPS / 云托管

若日志出现 **`self-signed certificate`**（访问 `api.weixin.qq.com` 失败），多为云托管出网经代理导致 TLS 校验不通过。项目已通过 `utils/wechatHttpsAgent.js` 与登录接口一致，对微信 API 默认使用 **`rejectUnauthorized: false`**。若在可直连公网的环境希望严格校验证书，可设置 **`WX_HTTPS_STRICT=1`**。

### 常见 errcode

| errcode | 含义 | 处理 |
|--------|------|------|
| **40097** | invalid args | **`is_trade_managed`** 等接口 POST body 须带 **`appid`**（与 `WX_APPID` 一致），空 body 会报此错。 |
| **47001** | data format error | 多为 JSON 与文档不一致：例如误在 **`upload_shipping_info` 根级**传 **`receiver_contact`**（非官方示例字段）。收件人联系方式应放在 **`shipping_list[].contact.receiver_contact`**（如顺丰必填场景）。 |
| **10060001** | 支付单不存在 | 常见于**支付成功回调后立即**调用发货接口，微信侧订单尚未同步；本项目会对 **`transaction_id`（type=2）**自动间隔重试，仍失败则改用 **`mchid` + `out_trade_no`（type=1）**与统一下单一致。请确认 **`WX_MCHID`** 与支付商户号一致、**`orderNo`** 与微信侧商户订单号一致。 |
| **10060023** | 发货信息未更新 | 与**上次成功上传**的发货内容一致，微信认为无变更。常见于**支付回调已上传自提发货**后，用户在小程序再次「确认自提」又调 `upload_shipping_info`。**代码已按幂等成功处理**，不视为失败。 |

## 公众平台仍不同步时的排查清单

1. **是否已开通「发货信息管理服务」**  
   登录 [微信公众平台](https://mp.weixin.qq.com/) → 小程序 → **功能** → **发货信息管理服务**（或订单管理相关入口）完成开通。

2. **`WX_APPID` / `WX_APPSECRET` 是否对应正在使用的小程序**  
   若云托管与支付使用不同小程序或误配测试号，接口会成功但不对当前小程序订单生效。

3. **订单是否保存了微信支付 `transaction_id`**  
   支付回调需写入 `orders.transactionId`。无交易单号时，会使用 `WX_MCHID + orderNo` 作为 `order_key`，需与微信支付侧商户单号一致。

4. **确认收货提醒仅一次**  
   重复调用 `notify_confirm_receive` 会失败；日志中若提示重复，属预期，可忽略。

5. **查看云日志**  
   搜索 `[WechatOrderSync]`、`upload_shipping_info`、`notify_confirm_receive`、`is_trade_managed`，根据 `errcode` / `errmsg` 对照[微信全局返回码](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)与接口文档排查。

## 门店自提（订单详情无门店名）

若 `orders` 表中门店外键列与 Sequelize 模型字段不一致（如列为 `store_id`），或启动时从模型移除了 `storeId`，**`Order.create` 可能不会把门店写入数据库**。本项目在小程序创建订单后通过 `utils/orderStoreEnrich.js` 的 **`persistMiniappOrderPickupFields`** 按真实列名执行 **UPDATE** 强制落库，再结合 raw 查询补全详情展示。
