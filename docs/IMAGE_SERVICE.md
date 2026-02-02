# 图片自动压缩服务说明

## 功能概述

系统现在支持在请求图片时自动压缩和优化，无需预先压缩所有图片。当小程序请求图片时，服务器会自动返回压缩后的版本。

## 工作原理

1. **请求拦截**：图片服务中间件拦截所有 `/uploads/**` 的图片请求
2. **参数解析**：解析URL查询参数（宽度、高度、质量、格式）
3. **缓存检查**：检查是否有压缩缓存
4. **实时压缩**：如果没有缓存，实时压缩并缓存
5. **返回优化图片**：返回压缩后的图片

## URL 参数

### 支持的参数

- `w` - 目标宽度（像素）
- `h` - 目标高度（像素）
- `q` - 图片质量 (1-100)，默认 80
- `f` - 输出格式 (webp, jpeg, png)

### 示例

```
/uploads/products/1/image.jpg?w=400&q=80&f=webp
/uploads/banners/banner-123.png?w=750&h=300&q=85
```

## 前端使用

### 方式一：使用工具函数（推荐）

```javascript
const { buildOptimizedImageUrl } = require('../../utils/util.js');

// 使用预设类型
const url1 = buildOptimizedImageUrl('/uploads/products/1/image.jpg', { type: 'list' });
// 结果: /uploads/products/1/image.jpg?w=400&q=80&f=webp

// 自定义参数
const url2 = buildOptimizedImageUrl('/uploads/products/1/image.jpg', { 
  width: 800, 
  quality: 85 
});
// 结果: /uploads/products/1/image.jpg?w=800&q=85&f=webp
```

### 预设类型

- `thumbnail` - 缩略图 (200x200, quality: 75)
- `list` - 列表图 (400px, quality: 80)
- `detail` - 详情图 (800px, quality: 85)
- `banner` - 横幅 (750x300, quality: 85)

### 方式二：手动添加参数

```javascript
const imageUrl = '/uploads/products/1/image.jpg?w=400&q=80&f=webp';
```

## 已优化的页面

以下页面已自动使用优化后的图片URL：

- ✅ 首页热门商品
- ✅ 商品详情页
- ✅ 商品列表页（分类页）
- ✅ 搜索页面
- ✅ 订单列表
- ✅ 订单详情

## 缓存机制

- **缓存位置**：`public/.cache/images/`
- **缓存策略**：基于URL和参数的MD5哈希
- **缓存时间**：HTTP缓存1年
- **自动清理**：压缩后的图片会永久缓存，需要手动清理

## 性能优化

- **首次请求**：实时压缩，可能稍慢
- **后续请求**：直接返回缓存，速度很快
- **并发处理**：支持多个请求同时处理
- **智能跳过**：小于100KB的图片不压缩

## 注意事项

1. **首次访问**：第一次请求某个尺寸的图片时会进行压缩，可能稍慢
2. **磁盘空间**：压缩缓存会占用额外磁盘空间
3. **格式转换**：可以自动转换为WebP格式，进一步减小文件大小
4. **向后兼容**：不带参数的URL仍然返回原图

## 清理缓存

如果需要清理压缩缓存：

```bash
rm -rf public/.cache/images/*
```

## 监控

响应头中包含缓存状态：
- `X-Image-Cache: hit` - 命中缓存
- `X-Image-Cache: miss` - 未命中缓存（首次压缩）

