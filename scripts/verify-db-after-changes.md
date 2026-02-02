# 数据库变更后验证说明

## 本次变更摘要

1. **设计规范**：模型不再使用 `unique: true` / `index: true`，业务唯一性在应用层保证，避免 MySQL 单表 64 索引上限。
2. **VerificationCodes.code**：去掉唯一索引，核销码唯一性由 `generateUniqueVerificationCode()` 在创建前查重保证。
3. **init()**：按表逐个 sync，单表失败会记录表名并汇总报错，便于定位问题。

## 已执行的验证（针对当前 Docker 部署）

- **健康检查**：`GET /health` 返回 `{ status: "ok" }`。
- **test-api.ps1 全量通过**（13 项）：
  - Health、Admin 登录、当前用户、商品列表、分类列表
  - 小程序商品/分类（无鉴权）
  - 会员列表、订单列表（按会员）、会员等级、分销等级、Banner、公开 Banner

以上接口覆盖 Users、Categories、Products、Members、Orders、OrderItems、MemberLevels、Banners 等表，说明本次数据库同步与现有读写路径正常。

## 与核销码相关的逻辑

- **创建**：下单/支付成功后，对服务类商品调用 `generateUniqueVerificationCode()` + `VerificationCode.bulkCreate()`，通过“生成→查库→不存在才写入”保证唯一。
- **查询**：员工端 `GET /api/staff/verification-codes/:code`、小程序端 `GET /api/miniapp/verification-codes` 使用 `findOne` / `findAndCountAll`，不依赖唯一索引。
- **建议**：若有员工/小程序账号，可再手动验证：下一单服务类商品并支付，然后在员工端或小程序“我的核销码”中查看、核销，确认无报错即可。

## 本地非 Docker 运行说明

当前 `.env` 中 `MYSQL_ADDRESS=host.docker.internal:3306` 仅适用于 Docker 内访问宿主机 MySQL。若要在本机直接运行 `npm start` 做验证，请将 `MYSQL_ADDRESS` 改为本机 MySQL 地址（如 `127.0.0.1:3306`），并确保数据库 `mall_admin` 已存在且可连接。
