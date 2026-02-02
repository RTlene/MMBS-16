/**
 * 批量图片压缩工具
 * 用于压缩现有图片
 */

const fs = require('fs');
const path = require('path');
const { compressImage } = require('./imageCompress');

/**
 * 递归获取目录下所有图片文件
 * @param {string} dir - 目录路径
 * @param {Array} fileList - 文件列表（递归使用）
 * @returns {Array} 图片文件路径数组
 */
function getAllImageFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    return fileList;
  }

  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // 递归遍历子目录
      getAllImageFiles(filePath, fileList);
    } else {
      // 检查是否为图片文件
      const ext = path.extname(file).toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
      
      if (imageExts.includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  
  return fileList;
}

/**
 * 批量压缩目录下的所有图片
 * @param {string} dir - 目录路径
 * @param {object} options - 压缩选项
 * @param {Function} onProgress - 进度回调函数 (current, total, filePath, result)
 * @returns {Promise<object>} 压缩统计信息
 */
async function batchCompressDirectory(dir, options = {}, onProgress = null) {
  const imageFiles = getAllImageFiles(dir);
  const total = imageFiles.length;
  
  if (total === 0) {
    return {
      success: true,
      total: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      totalOriginalSize: 0,
      totalCompressedSize: 0,
      totalSaved: 0,
      results: []
    };
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  const results = [];

  console.log(`[BatchCompress] 开始压缩 ${total} 个图片文件...`);

  for (let i = 0; i < imageFiles.length; i++) {
    const filePath = imageFiles[i];
    const relativePath = path.relative(dir, filePath);
    
    try {
      const result = await compressImage(filePath, null, options);
      
      if (result.success) {
        if (result.skipped) {
          skipped++;
          totalOriginalSize += result.originalSize;
          totalCompressedSize += result.compressedSize;
        } else {
          processed++;
          totalOriginalSize += result.originalSize;
          totalCompressedSize += result.compressedSize;
        }
      } else {
        failed++;
      }
      
      results.push({
        path: relativePath,
        ...result
      });

      // 调用进度回调
      if (onProgress) {
        onProgress(i + 1, total, relativePath, result);
      }

      // 每处理10个文件输出一次进度
      if ((i + 1) % 10 === 0 || i === imageFiles.length - 1) {
        console.log(`[BatchCompress] 进度: ${i + 1}/${total} (${((i + 1) / total * 100).toFixed(1)}%)`);
      }
    } catch (error) {
      console.error(`[BatchCompress] 压缩失败: ${relativePath}`, error);
      failed++;
      results.push({
        path: relativePath,
        success: false,
        error: error.message
      });
    }
  }

  const totalSaved = totalOriginalSize - totalCompressedSize;
  const savedPercent = totalOriginalSize > 0 
    ? ((totalSaved / totalOriginalSize) * 100).toFixed(2) 
    : '0.00';

  const summary = {
    success: true,
    total,
    processed,
    skipped,
    failed,
    totalOriginalSize,
    totalCompressedSize,
    totalSaved,
    savedPercent,
    results
  };

  console.log(`[BatchCompress] 压缩完成:`);
  console.log(`  总计: ${total} 个文件`);
  console.log(`  已压缩: ${processed} 个`);
  console.log(`  已跳过: ${skipped} 个`);
  console.log(`  失败: ${failed} 个`);
  console.log(`  原始大小: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  压缩后大小: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  节省: ${(totalSaved / 1024 / 1024).toFixed(2)} MB (${savedPercent}%)`);

  return summary;
}

/**
 * 压缩多个目录
 * @param {Array<string>} dirs - 目录路径数组
 * @param {object} options - 压缩选项
 * @returns {Promise<object>} 所有目录的压缩统计信息
 */
async function batchCompressDirectories(dirs, options = {}) {
  const allResults = [];
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  for (const dir of dirs) {
    console.log(`\n[BatchCompress] 处理目录: ${dir}`);
    const result = await batchCompressDirectory(dir, options);
    
    allResults.push({
      directory: dir,
      ...result
    });

    totalProcessed += result.processed;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
    totalOriginalSize += result.totalOriginalSize;
    totalCompressedSize += result.totalCompressedSize;
  }

  const totalSaved = totalOriginalSize - totalCompressedSize;
  const savedPercent = totalOriginalSize > 0 
    ? ((totalSaved / totalOriginalSize) * 100).toFixed(2) 
    : '0.00';

  return {
    success: true,
    directories: allResults,
    summary: {
      totalProcessed,
      totalSkipped,
      totalFailed,
      totalOriginalSize,
      totalCompressedSize,
      totalSaved,
      savedPercent
    }
  };
}

module.exports = {
  getAllImageFiles,
  batchCompressDirectory,
  batchCompressDirectories
};

