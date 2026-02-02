#!/usr/bin/env node

/**
 * 命令行图片批量压缩脚本
 * 用法: node scripts/compress-images.js [目录名] [选项]
 * 
 * 示例:
 *   node scripts/compress-images.js products
 *   node scripts/compress-images.js all
 *   node scripts/compress-images.js products --quality=75 --maxWidth=1600
 */

const path = require('path');
const { batchCompressDirectory, batchCompressDirectories } = require('../utils/batchCompress');

// 图片目录配置
const IMAGE_DIRECTORIES = {
  products: path.join(__dirname, '../public/uploads/products'),
  banners: path.join(__dirname, '../public/uploads/banners'),
  popups: path.join(__dirname, '../public/uploads/popups')
};

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    directory: null,
    quality: 80,
    maxWidth: 1920,
    maxHeight: 1920
  };

  args.forEach(arg => {
    if (arg === 'all') {
      options.directory = 'all';
    } else if (IMAGE_DIRECTORIES[arg]) {
      options.directory = arg;
    } else if (arg.startsWith('--quality=')) {
      options.quality = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--maxWidth=')) {
      options.maxWidth = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--maxHeight=')) {
      options.maxHeight = parseInt(arg.split('=')[1]);
    }
  });

  return options;
}

// 主函数
async function main() {
  const options = parseArgs();

  if (!options.directory) {
    console.log('用法: node scripts/compress-images.js [目录名|all] [选项]');
    console.log('');
    console.log('目录名:');
    Object.keys(IMAGE_DIRECTORIES).forEach(dir => {
      console.log(`  ${dir} - ${IMAGE_DIRECTORIES[dir]}`);
    });
    console.log('  all - 压缩所有目录');
    console.log('');
    console.log('选项:');
    console.log('  --quality=80     图片质量 (1-100)');
    console.log('  --maxWidth=1920  最大宽度');
    console.log('  --maxHeight=1920 最大高度');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/compress-images.js products');
    console.log('  node scripts/compress-images.js all --quality=75 --maxWidth=1600');
    process.exit(1);
  }

  const compressOptions = {
    quality: options.quality,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    keepOriginal: false
  };

  try {
    if (options.directory === 'all') {
      console.log('开始压缩所有目录...\n');
      const dirs = Object.values(IMAGE_DIRECTORIES);
      const result = await batchCompressDirectories(dirs, compressOptions);
      
      console.log('\n=== 压缩完成 ===');
      console.log(`总计节省: ${(result.summary.totalSaved / 1024 / 1024).toFixed(2)} MB (${result.summary.savedPercent}%)`);
    } else {
      const dirPath = IMAGE_DIRECTORIES[options.directory];
      console.log(`开始压缩目录: ${options.directory} (${dirPath})\n`);
      const result = await batchCompressDirectory(dirPath, compressOptions);
      
      console.log('\n=== 压缩完成 ===');
      console.log(`节省: ${(result.totalSaved / 1024 / 1024).toFixed(2)} MB (${result.savedPercent}%)`);
    }
  } catch (error) {
    console.error('压缩失败:', error);
    process.exit(1);
  }
}

// 运行
main();

