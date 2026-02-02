# 图片批量压缩功能说明

## 功能概述

系统现在支持对现有图片进行自动压缩，以减少图片文件大小，提升加载速度。

## 压缩方式

### 1. 自动压缩（新上传图片）

新上传的图片会自动压缩：
- **商品图片**：质量 80%，最大尺寸 1920x1920
- **横幅图片**：质量 85%，最大尺寸 1920x1080

### 2. 批量压缩（现有图片）

#### 方式一：通过 API 接口（推荐）

**压缩单个目录：**
```bash
POST /api/compress/compress/products
POST /api/compress/compress/banners
POST /api/compress/compress/popups
```

**压缩所有目录：**
```bash
POST /api/compress/compress-all
```

**同步压缩（等待完成）：**
```bash
POST /api/compress/compress/products/sync
```

**请求参数（可选）：**
```json
{
  "quality": 80,      // 图片质量 (1-100)
  "maxWidth": 1920,   // 最大宽度
  "maxHeight": 1920   // 最大高度
}
```

**注意：** 需要管理员权限（Bearer Token）

#### 方式二：通过命令行脚本

**压缩单个目录：**
```bash
node scripts/compress-images.js products
node scripts/compress-images.js banners
node scripts/compress-images.js popups
```

**压缩所有目录：**
```bash
node scripts/compress-images.js all
```

**自定义参数：**
```bash
node scripts/compress-images.js products --quality=75 --maxWidth=1600 --maxHeight=1600
```

## 压缩策略

- **自动跳过**：小于 100KB 的图片不压缩
- **智能判断**：如果压缩后文件更大，保留原文件
- **保持格式**：保持原图片格式（JPEG、PNG、WebP等）
- **保持比例**：自动保持图片宽高比

## 压缩效果

- **商品图片**：通常可节省 30-70% 的存储空间
- **横幅图片**：通常可节省 40-60% 的存储空间
- **质量保证**：压缩后图片质量仍然保持良好

## 使用建议

1. **首次使用**：建议先压缩一个目录测试效果
2. **批量压缩**：可以在服务器空闲时执行批量压缩
3. **定期维护**：建议定期检查并压缩新上传的图片

## 注意事项

- 压缩过程会覆盖原文件，建议先备份
- 压缩大目录可能需要较长时间，建议使用异步接口
- 确保服务器有足够的磁盘空间
- 压缩过程中不要中断，否则可能导致文件损坏

