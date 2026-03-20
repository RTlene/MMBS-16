# 微信小程序「订单发货信息」同步说明

## 公众平台仍显示「待发货」的常见原因

1. **接口参数不符合微信文档**（本项目已修正）  
   - `upload_time` 必须为 **RFC 3339** 时间字符串（如 `2025-03-20T15:30:00.000+08:00`），不能为 Unix 秒。  
   - `delivery_mode`：**1** = 统一发货，**2** = 分拆发货；自提/单笔快递均应使用 **1**（误将自提填成 2 会报「发货模式非法」）。  
   - `order_key`：**类型 2** 仅搭配微信支付 **`transaction_id`**；类型 1 搭配 **`mchid` + `out_trade_no`**。不要混用。

2. **订单未写入微信支付单号**  
   支付回调需把 `transaction_id` 写入订单字段 `transactionId`。若无该字段，会退化为商户单号模式，请保证 **`WX_MCHID` 与下单商户号一致**。

3. **物流公司须为运力编码**  
   接口要求 `express_company` 为微信文档中的编码（如 `SF`、`YTO`、`ZTO`）。后台中文名称会映射为编码；无法识别时用 `OTHER`。

4. **自提订单**  
   应使用 `logistics_type = 4`（用户自提），`shipping_list` 仅 **1 条**且只需 **`item_desc`**，不要填快递单号。后台请点 **「确认用户自提」**，不要走「快递发货」。

官方文档：  
[小程序发货信息管理服务](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html)

## 后台操作对应关系

| 订单类型 | 后台操作 | 微信侧 |
|----------|----------|--------|
| 快递配送 | 「发货」填写物流公司与单号 | `logistics_type=1`，录入快递信息 |
| 门店自提 | 「确认用户自提」 | `logistics_type=4` + 随后确认收货通知 |

## 环境变量

- `WX_APPID` / `WX_APPSECRET`：调用 `upload_shipping_info` 所需 `access_token`  
- `WX_MCHID`：使用商户单号模式匹配支付单时必填  

## 小程序后台配置

在微信公众平台 / 小程序后台开通 **发货信息管理服务**，并按指引完成交易结算等确认；若使用第三方平台托管，需保证代调用权限与 token 正确。
