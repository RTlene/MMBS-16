/**
 * 图片压缩工具
 * 使用 sharp 库进行图片压缩和优化
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * 压缩图片
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径（可选，默认覆盖原文件）
 * @param {object} options - 压缩选项
 * @param {number} options.quality - 图片质量 (1-100)，默认 80
 * @param {number} options.maxWidth - 最大宽度，默认 1920
 * @param {number} options.maxHeight - 最大高度，默认 1920
 * @param {boolean} options.keepOriginal - 是否保留原文件，默认 false
 * @returns {Promise<object>} 压缩结果 { success, originalSize, compressedSize, saved }
 */
async function compressImage(inputPath, outputPath = null, options = {}) {
  try {
    const {
      quality = 80,
      maxWidth = 1920,
      maxHeight = 1920,
      keepOriginal = false
    } = options;

    // 检查文件是否存在
    if (!fs.existsSync(inputPath)) {
      throw new Error('文件不存在: ' + inputPath);
    }

    // 获取文件信息
    const stats = fs.statSync(inputPath);
    const originalSize = stats.size;

    // 如果文件小于 100KB，不压缩
    if (originalSize < 100 * 1024) {
      return {
        success: true,
        originalSize,
        compressedSize: originalSize,
        saved: 0,
        skipped: true
      };
    }

    // 确定目标输出路径
    // keepOriginal=true 且未指定 outputPath 时，目标是 inputPath + '.compressed'
    // 否则目标是 outputPath 或 inputPath（覆盖）
    const targetOutputPath = keepOriginal && !outputPath
      ? `${inputPath}.compressed`
      : (outputPath || inputPath);

    const outputDir = path.dirname(targetOutputPath);
    
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 始终写入一个临时文件，避免 input/output 同路径导致 sharp 报错
    const tempPath = path.join(
      outputDir,
      `${path.basename(targetOutputPath)}.tmp-${Date.now()}`
    );

    // 读取图片元数据
    const metadata = await sharp(inputPath).metadata();
    
    // 计算目标尺寸（保持宽高比）
    let targetWidth = metadata.width;
    let targetHeight = metadata.height;
    
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      const ratio = Math.min(maxWidth / metadata.width, maxHeight / metadata.height);
      targetWidth = Math.round(metadata.width * ratio);
      targetHeight = Math.round(metadata.height * ratio);
    }

    // 根据文件类型选择压缩格式
    const ext = path.extname(inputPath).toLowerCase();
    let sharpInstance = sharp(inputPath)
      .resize(targetWidth, targetHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });

    // 根据文件扩展名选择输出格式
    if (ext === '.png') {
      sharpInstance = sharpInstance.png({
        quality: Math.round(quality * 0.9), // PNG质量范围不同
        compressionLevel: 9,
        adaptiveFiltering: true
      });
    } else if (ext === '.webp') {
      sharpInstance = sharpInstance.webp({
        quality,
        effort: 6
      });
    } else {
      // 默认使用 JPEG（包括 .jpg, .jpeg）
      sharpInstance = sharpInstance.jpeg({ 
        quality,
        progressive: true,
        mozjpeg: true
      });
    }

    await sharpInstance.toFile(tempPath);

    // 获取压缩后文件大小
    const compressedStats = fs.statSync(tempPath);
    const compressedSize = compressedStats.size;

    // 如果压缩后文件更大，保留原文件
    if (compressedSize >= originalSize) {
      fs.unlinkSync(tempPath);
      return {
        success: true,
        originalSize,
        compressedSize: originalSize,
        saved: 0,
        skipped: true
      };
    }

    // 将临时文件移动到目标输出
    if (fs.existsSync(targetOutputPath)) {
      fs.unlinkSync(targetOutputPath);
    }
    fs.renameSync(tempPath, targetOutputPath);

    const saved = originalSize - compressedSize;
    const savedPercent = ((saved / originalSize) * 100).toFixed(2);

    return {
      success: true,
      originalSize,
      compressedSize,
      saved,
      savedPercent,
      skipped: false
    };
  } catch (error) {
    console.error('[ImageCompress] 压缩失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 批量压缩图片
 * @param {Array<string>} inputPaths - 输入文件路径数组
 * @param {object} options - 压缩选项
 * @returns {Promise<Array>} 压缩结果数组
 */
async function compressImages(inputPaths, options = {}) {
  const results = [];
  
  for (const inputPath of inputPaths) {
    const result = await compressImage(inputPath, null, options);
    results.push({
      path: inputPath,
      ...result
    });
  }
  
  return results;
}

module.exports = {
  compressImage,
  compressImages
};

