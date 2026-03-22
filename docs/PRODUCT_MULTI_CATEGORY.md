# 商品多分类说明

## 数据模型

- 表 **`product_categories`**：`productId`、`categoryId` 联合主键，可选 `sortOrder`（与 `Products` / `Categories` 对应）。
- 字段 **`Products.categoryId`** 保留为**主分类**（与列表、历史逻辑兼容），在保存多分类时自动设为 **`categoryIds` 的第一个**。

## 后台界面

- 商品编辑表单中分类为 **勾选列表**（多选框），至少勾选一项。

## 后台 API

- 创建/更新商品时传 **`categoryIds`**：`[1, 2, 3]`（至少一个）。
- 仍兼容单独传 **`categoryId`**（视为仅一个分类）。
- 按分类筛选列表/导出时：商品落在**任一**关联分类或主分类上即命中。

## CSV 导入

- 新增列 **`categoryIds`**：多个 ID 用 **分号或逗号** 分隔，例如 `1;2;3`。
- 若只填 **`categoryId`**，行为与以前一致（单分类）。

## 小程序

- 商品列表/详情会返回 **`categoryIds`**、**`categories`**（完整列表），并保留 **`category`** 为主分类展示。

## 迁移

- 服务启动时在 `db.js` 的 `init()` 中自动建表，并把现有 `Products.categoryId` **回填**到 `product_categories`。
