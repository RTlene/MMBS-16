# 数据库 utf8mb4 迁移说明（支持 emoji 等 4 字节字符）

应用已改为使用 `utf8mb4` 连接与存储，以便正确保存昵称、备注等中的 emoji（如 🍼）。

**若数据库/表仍是旧版 `utf8`，需执行一次下面的 SQL，否则写入 4 字节字符会报错。**

## 1. 仅会员表（最小改动，解决会员导入 nickname 报错）

在 MySQL 中执行：

```sql
ALTER TABLE members CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. 推荐：整库默认字符集（新表也会是 utf8mb4）

```sql
ALTER DATABASE mall_admin CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
```

然后对**已有表**逐张转换（否则已有表仍是 utf8）：

```sql
ALTER TABLE members CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE member_addresses CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE orders CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE order_items CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE commission_withdrawals CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE return_requests CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE refund_records CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE order_operation_logs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE VerificationCodes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE Articles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE popups CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- 其他含用户输入文本的表可按需添加
```

## 3. 代码侧已做的改动

- **db.js**：连接增加 `charset: 'utf8mb4'`、`collate: 'utf8mb4_unicode_ci'`，新建表会使用 utf8mb4。
- **routes/member-routes.js**：会员导入不再剥离 emoji，昵称、姓名、地址、备注等原样写入。

执行完上述 SQL 并重启应用后，即可正常存储昵称等中的 emoji。


























