/**
 * 图片批量压缩路由
 * 用于压缩现有图片
 */

const express = require('express');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { batchCompressDirectory, batchCompressDirectories } = require('../utils/batchCompress');

const router = express.Router();

// 图片目录配置
const IMAGE_DIRECTORIES = {
  products: path.join(__dirname, '../public/uploads/products'),
  banners: path.join(__dirname, '../public/uploads/banners'),
  popups: path.join(__dirname, '../public/uploads/popups')
};

/**
 * 压缩指定目录的图片
 */
router.post('/compress/:directory', authenticateToken, async (req, res) => {
  try {
    const { directory } = req.params;
    const { quality = 80, maxWidth = 1920, maxHeight = 1920 } = req.body;

    if (!IMAGE_DIRECTORIES[directory]) {
      return res.status(400).json({
        code: 1,
        message: `不支持的目录: ${directory}。支持的目录: ${Object.keys(IMAGE_DIRECTORIES).join(', ')}`
      });
    }

    const dirPath = IMAGE_DIRECTORIES[directory];
    
    console.log(`[Compress] 开始压缩目录: ${directory} (${dirPath})`);

    // 异步执行压缩，立即返回
    batchCompressDirectory(dirPath, {
      quality: parseInt(quality),
      maxWidth: parseInt(maxWidth),
      maxHeight: parseInt(maxHeight),
      keepOriginal: false
    }).then(result => {
      console.log(`[Compress] 目录 ${directory} 压缩完成`);
    }).catch(error => {
      console.error(`[Compress] 目录 ${directory} 压缩失败:`, error);
    });

    res.json({
      code: 0,
      message: '压缩任务已启动，正在后台处理',
      data: {
        directory,
        path: dirPath
      }
    });
  } catch (error) {
    console.error('[Compress] 压缩失败:', error);
    res.status(500).json({
      code: 1,
      message: '压缩失败: ' + error.message
    });
  }
});

/**
 * 压缩所有目录的图片
 */
router.post('/compress-all', authenticateToken, async (req, res) => {
  try {
    const { quality = 80, maxWidth = 1920, maxHeight = 1920 } = req.body;

    const dirs = Object.values(IMAGE_DIRECTORIES);
    
    console.log(`[Compress] 开始压缩所有目录...`);

    // 异步执行压缩，立即返回
    batchCompressDirectories(dirs, {
      quality: parseInt(quality),
      maxWidth: parseInt(maxWidth),
      maxHeight: parseInt(maxHeight),
      keepOriginal: false
    }).then(result => {
      console.log(`[Compress] 所有目录压缩完成`);
      console.log(`[Compress] 总计节省: ${(result.summary.totalSaved / 1024 / 1024).toFixed(2)} MB (${result.summary.savedPercent}%)`);
    }).catch(error => {
      console.error(`[Compress] 压缩失败:`, error);
    });

    res.json({
      code: 0,
      message: '批量压缩任务已启动，正在后台处理',
      data: {
        directories: Object.keys(IMAGE_DIRECTORIES)
      }
    });
  } catch (error) {
    console.error('[Compress] 压缩失败:', error);
    res.status(500).json({
      code: 1,
      message: '压缩失败: ' + error.message
    });
  }
});

/**
 * 同步压缩指定目录（等待完成）
 */
router.post('/compress/:directory/sync', authenticateToken, async (req, res) => {
  try {
    const { directory } = req.params;
    const { quality = 80, maxWidth = 1920, maxHeight = 1920 } = req.body;

    if (!IMAGE_DIRECTORIES[directory]) {
      return res.status(400).json({
        code: 1,
        message: `不支持的目录: ${directory}。支持的目录: ${Object.keys(IMAGE_DIRECTORIES).join(', ')}`
      });
    }

    const dirPath = IMAGE_DIRECTORIES[directory];
    
    console.log(`[Compress] 开始同步压缩目录: ${directory} (${dirPath})`);

    const result = await batchCompressDirectory(dirPath, {
      quality: parseInt(quality),
      maxWidth: parseInt(maxWidth),
      maxHeight: parseInt(maxHeight),
      keepOriginal: false
    });

    res.json({
      code: 0,
      message: '压缩完成',
      data: result
    });
  } catch (error) {
    console.error('[Compress] 压缩失败:', error);
    res.status(500).json({
      code: 1,
      message: '压缩失败: ' + error.message
    });
  }
});

module.exports = router;

