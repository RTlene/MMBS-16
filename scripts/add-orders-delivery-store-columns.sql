-- 为 orders 表增加 deliveryType、storeId（门店自提功能）
-- 在 MySQL 中执行：source scripts/add-orders-delivery-store-columns.sql 或复制到控制台执行
-- 若列已存在会报错，可忽略该条或先执行：SHOW COLUMNS FROM orders LIKE 'deliveryType';

ALTER TABLE `orders` ADD COLUMN `deliveryType` ENUM('delivery','pickup') DEFAULT 'delivery' COMMENT '配送方式：delivery-配送上门，pickup-门店自提';
ALTER TABLE `orders` ADD COLUMN `storeId` INT NULL COMMENT '门店自提时的门店ID';
