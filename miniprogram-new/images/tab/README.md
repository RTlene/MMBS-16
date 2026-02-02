# TabBar 图标说明

## 当前状态
由于小程序包大小限制，建议使用在线图标或简化设计。

## 临时解决方案
当前使用纯色文字 TabBar（已在 app.json 中配置）。

## 正式图标规格
如果需要添加图标，请准备以下文件：

### 文件列表
- home.png (81x81px, 未选中状态)
- home-active.png (81x81px, 选中状态)
- category.png (81x81px, 未选中状态)
- category-active.png (81x81px, 选中状态)
- cart.png (81x81px, 未选中状态)
- cart-active.png (81x81px, 选中状态)
- profile.png (81x81px, 未选中状态)
- profile-active.png (81x81px, 选中状态)

### 图标要求
- 尺寸：81x81 像素
- 格式：PNG（支持透明背景）
- 大小：每个图标 < 40KB
- 颜色：未选中使用灰色(#999999)，选中使用主题色(#3481B8)

## 图标设计建议

### 方案1：使用 Emoji（最简单）
直接使用系统 Emoji，无需图标文件：
- 首页：🏠
- 分类：📁
- 购物车：🛒
- 我的：👤

### 方案2：使用 IconFont
从阿里图标库下载：https://www.iconfont.cn/

### 方案3：使用设计工具
- Figma
- Sketch
- Adobe Illustrator

## 快速获取图标资源

1. **IconFont 阿里图标库**
   - 网址：https://www.iconfont.cn/
   - 搜索：首页、分类、购物车、我的
   - 下载 PNG 格式，调整为 81x81

2. **IconPark**
   - 网址：https://iconpark.oceanengine.com/
   - 免费可商用

3. **Flaticon**
   - 网址：https://www.flaticon.com/
   - 需注册，免费版需标注出处

