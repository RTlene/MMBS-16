/**
 * 将 tabBar 用到的 SVG 转为 81x81 PNG（微信仅支持 png/jpg/jpeg）
 * 运行：node scripts/convert-tabbar-icons-to-png.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const ICONS_DIR = path.join(__dirname, '../miniprogram-new/images/icons');
const SIZE = 81;

const tabbarIcons = [
  'home-outline.svg',
  'home.svg',
  'article.svg',
  'article-outline.svg',
  'category.svg',
  'category-outline.svg',
  'cart-outline.svg',
  'cart.svg',
  'me.svg',
  'me-outline.svg'
];

async function convert() {
  for (const name of tabbarIcons) {
    const svgPath = path.join(ICONS_DIR, name);
    const pngName = name.replace(/\.svg$/i, '.png');
    const pngPath = path.join(ICONS_DIR, pngName);
    if (!fs.existsSync(svgPath)) {
      console.warn('[SKIP] Not found:', svgPath);
      continue;
    }
    try {
      await sharp(svgPath)
        .resize(SIZE, SIZE)
        .png()
        .toFile(pngPath);
      console.log('[OK]', name, '->', pngName);
    } catch (e) {
      console.error('[FAIL]', name, e.message);
    }
  }
}

convert().then(() => console.log('Done.')).catch((e) => { console.error(e); process.exit(1); });
