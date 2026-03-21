# 微信小程序订单：结算与「确认收货」规则说明

本文说明**小程序交易订单**在公众平台侧进入**资金结算**相关流程时，官方能力与接口分工，便于与 `upload_shipping_info`、`notify_confirm_receive`、小程序端确认收货组件对齐。

## 1. 结算前提（官方能力总述）

在已开通**发货信息管理服务**的前提下，通常需同时满足：

1. **发货信息已录入**：通过 `upload_shipping_info`（或合单接口）将发货/履约信息同步到平台（用户会收到发货消息等）。
2. **确认收货流程完成**：用户在微信侧完成「确认收货」，或到达平台**自动确认收货**周期。

完成后，资金才会按微信支付/平台规则进入**可结算**等后续状态（具体周期以微信支付与平台最新规则为准）。

文档入口：[小程序发货信息管理服务](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html)

## 2. 用户在微信侧完成「确认收货」（推荐）

要让用户在**微信客户端**完成公众平台订单的确认收货（与结算强相关），应在小程序内拉起**确认收货组件**：

- 接口：`wx.openBusinessView`
- `businessType`：**固定** `weappOrderConfirm`
- `extraData` 中需能唯一定位支付单，二选一即可：
  - **`transaction_id`**：微信支付订单号；或
  - **`merchant_id` + `merchant_trade_no`**：商户号 + 商户订单号（与下单时 `out_trade_no` 一致）

文档：[小程序确认收货组件接入说明](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping-half.html)

**安全提示（官方）**：组件回调成功后，建议再通过服务端 **[查询订单发货状态](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/order_shipping/api_getorder.html)** 等接口二次校验，避免前端伪造。

## 3. 服务端「确认收货提醒」`notify_confirm_receive`

- **用途**：当你已从**快递/物流**侧获知用户**已签收**时，可调用该接口**提醒用户**尽快在微信内确认收货，以提高结算效率；**每个订单仅可调用一次**。
- **适用范围**：文档明确针对**物流快递**场景；**自提、同城配送等非「快递」类型不适用**，调用易返回如 **10060032** 等错误，本项目中应对**自提订单跳过**该接口。
- **请求体**：需携带能匹配支付单的 `order_key`（与发货接口一致：`transaction_id` 或 `mchid` + `out_trade_no`）；当前微信文档还要求 **`received_time`（签收时间 Unix 秒级时间戳）**。

文档：[确认收货提醒](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/shopping-order/order-shipping/order_shipping/order_shipping/order_shipping/api_notifyconfirmreceive.html)

**注意**：该接口是**提醒用户去点确认**，**不能**替代用户在小程序内通过 `weappOrderConfirm` 完成的确认流程本身。

## 4. 自提订单

- 发货侧：使用 `upload_shipping_info`，`logistics_type` 等为自提/到店履约（见发货文档）。
- **不要**对自提单调用 `notify_confirm_receive` 作为「用户已确认」的替代。
- 结算侧：依赖用户在微信内通过**确认收货组件**完成确认，或平台**超时自动确认**（周期以最新运营规范/文档为准）。

## 5. 快递发货订单

- **发货**：后台/店员「发货」时已调用 `upload_shipping_info`（`logistics_type=1`），写入物流公司与单号。
- **用户确认收货**：小程序内先拉起 **`weappOrderConfirm`**，再在服务端将订单置为 `delivered`。
- **服务端在用户确认时的同步**：对快递单再次调用 **`upload_shipping_info`（与发货参数一致，幂等）**，用于**补救**发货当时同步失败、公众平台长期显示不一致的情况；**不在此处**调用 `notify_confirm_receive`（该接口语义是「物流已签收 → 提醒用户去点确认」，用户已在组件内确认则无需再提醒）。
- **若需「签收后提醒用户确认」**：应在获知**物流签收**的业务时机单独调用 `notify_confirm_receive`（每单一次），与「用户已点确认收货」的接口分离。

## 6. 与本项目代码的对应关系

| 环节 | 说明 |
|------|------|
| 订单详情 API | 对微信支付订单下发 `wechatOrderConfirm`（`transactionId` / `merchantId` / `merchantTradeNo`），供小程序 `wx.openBusinessView` 使用 |
| 用户点击确认收货 | 优先拉起 `weappOrderConfirm`；成功回调后再更新本系统订单状态（`PUT .../status`） |
| 自提确认 | 仅同步发货等必要接口；**不调用** `notify_confirm_receive` |
| 快递确认（小程序用户） | 再次 **`upload_shipping_info`（幂等）**；**不**在用户确认后调 `notify_confirm_receive` |
| 快递「签收提醒」 | 仅在**物流签收后、用户尚未确认前**按需调用 `notify_confirm_receive` 并传 `received_time`（需单独业务入口，非用户确认接口内） |

更多发货同步细节见：`docs/WECHAT_ORDER_SHIPPING_SYNC.md`。
