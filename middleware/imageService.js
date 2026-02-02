/**
 * 图片服务中间件
 * 自动压缩和缓存图片，根据请求参数返回优化后的图片
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');

// 压缩缓存目录
const CACHE_DIR = path.join(__dirname, '../public/.cache/images');

// 确保缓存目录存在
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * 生成缓存文件名
 */
function getCacheKey(originalPath, width, height, quality, format) {
  const hash = crypto.createHash('md5')
    .update(`${originalPath}-${width}-${height}-${quality}-${format || 'original'}`)
    .digest('hex');
  // 如果指定了格式，使用新格式的扩展名，否则保持原格式
  const ext = format ? `.${format}` : path.extname(originalPath);
  return `${hash}${ext}`;
}

/**
 * 获取缓存文件路径
 */
function getCachePath(cacheKey) {
  return path.join(CACHE_DIR, cacheKey);
}

/**
 * 图片服务中间件
 */
async function imageService(req, res, next) {
  // 只处理图片请求
  const url = req.path;
  if (!url.startsWith('/uploads/')) {
    return next();
  }

  // 检查是否为图片文件
  const ext = path.extname(url).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  if (!imageExts.includes(ext)) {
    return next();
  }

  try {
    // 获取原始文件路径
    const originalPath = path.join(__dirname, '../public', url);
    
    // 检查原文件是否存在
    if (!fs.existsSync(originalPath)) {
      return next();
    }

    // 解析查询参数
    const width = req.query.w ? parseInt(req.query.w) : null;
    const height = req.query.h ? parseInt(req.query.h) : null;
    const quality = req.query.q ? parseInt(req.query.q) : 80;
    const format = req.query.f || null; // 格式转换 (webp, jpeg, png)

    // 如果没有指定压缩参数，检查是否应该默认压缩
    // 对于小程序，默认使用列表图尺寸压缩
    const shouldCompress = width || height || format || req.query.compress === 'true';
    
    if (!shouldCompress) {
      return next();
    }

    // 生成缓存键
    const cacheKey = getCacheKey(originalPath, width || 0, height || 0, quality, format);
    const cachePath = getCachePath(cacheKey);

    // 检查缓存是否存在
    if (fs.existsSync(cachePath)) {
      // 返回缓存文件
      const stats = fs.statSync(cachePath);
      const mimeType = getMimeType(cachePath);
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 缓存1年
      res.setHeader('X-Image-Cache', 'hit');
      
      return fs.createReadStream(cachePath).pipe(res);
    }

    // 读取原图并压缩
    const metadata = await sharp(originalPath).metadata();
    
    // 计算目标尺寸
    let targetWidth = width || metadata.width;
    let targetHeight = height || metadata.height;
    
    // 如果只指定了宽度或高度，保持宽高比
    if (width && !height) {
      targetHeight = Math.round(metadata.height * (width / metadata.width));
    } else if (height && !width) {
      targetWidth = Math.round(metadata.width * (height / metadata.height));
    }

    // 限制最大尺寸（轮播图等大图不限制高度，只限制宽度）
    const maxWidth = 1920;
    const maxHeight = height ? 1920 : null; // 如果没有指定高度，不限制高度
    
    if (targetWidth > maxWidth) {
      const ratio = maxWidth / targetWidth;
      targetWidth = maxWidth;
      if (maxHeight) {
        targetHeight = Math.round(targetHeight * ratio);
      } else {
        targetHeight = Math.round(metadata.height * ratio);
      }
    } else if (maxHeight && targetHeight > maxHeight) {
      const ratio = maxHeight / targetHeight;
      targetHeight = maxHeight;
      targetWidth = Math.round(targetWidth * ratio);
    }

    // 创建压缩实例
    let sharpInstance = sharp(originalPath)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });

    // 确定输出格式（如果format为null，保持原格式）
    let outputFormat = format || ext.replace('.', '');
    let mimeType = format ? getMimeTypeByFormat(outputFormat) : getMimeType(originalPath);

    // 根据格式设置压缩选项
    if (format === 'webp') {
      sharpInstance = sharpInstance.webp({ quality, effort: 6 });
    } else if (format === 'jpeg' || format === 'jpg') {
      sharpInstance = sharpInstance.jpeg({ 
        quality, 
        progressive: true, 
        mozjpeg: true 
      });
    } else if (format === 'png') {
      sharpInstance = sharpInstance.png({ 
        quality: Math.round(quality * 0.9),
        compressionLevel: 9,
        adaptiveFiltering: true
      });
    } else {
      // 保持原格式，根据原文件扩展名选择压缩方式
      if (ext === '.png') {
        sharpInstance = sharpInstance.png({ 
          quality: Math.round(quality * 0.9),
          compressionLevel: 9,
          adaptiveFiltering: true
        });
      } else if (ext === '.webp') {
        sharpInstance = sharpInstance.webp({ quality, effort: 6 });
      } else {
        // 默认使用JPEG（包括.jpg, .jpeg）
        sharpInstance = sharpInstance.jpeg({ 
          quality, 
          progressive: true, 
          mozjpeg: true 
        });
      }
    }

    // 压缩并保存到缓存
    await sharpInstance.toFile(cachePath);

    // 返回压缩后的图片
    const stats = fs.statSync(cachePath);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('X-Image-Cache', 'miss');
    
    return fs.createReadStream(cachePath).pipe(res);

  } catch (error) {
    console.error('[ImageService] 处理图片失败:', url, error);
    // 出错时返回原图（通过next()传递给静态文件服务）
    return next();
  }
}

/**
 * 清理旧缓存（可选，定期清理）
 */
function cleanOldCache(maxAge = 30 * 24 * 60 * 60 * 1000) { // 默认30天
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    
    const files = fs.readdirSync(CACHE_DIR);
    const now = Date.now();
    let cleaned = 0;
    
    files.forEach(file => {
      const filePath = path.join(CACHE_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (e) {
        // 忽略删除失败的文件
      }
    });
    
    if (cleaned > 0) {
      console.log(`[ImageService] 清理了 ${cleaned} 个过期缓存文件`);
    }
  } catch (error) {
    console.error('[ImageService] 清理缓存失败:', error);
  }
}

// 每小时清理一次旧缓存
setInterval(() => {
  cleanOldCache();
}, 60 * 60 * 1000);

/**
 * 根据文件路径获取 MIME 类型
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

/**
 * 根据格式获取 MIME 类型
 */
function getMimeTypeByFormat(format) {
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
  };
  return mimeTypes[format] || 'image/jpeg';
}

module.exports = imageService;

