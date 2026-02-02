# 图片资源说明

## 目录结构

```
images/
├── tab/                    # 底部导航栏图标
│   ├── home.png           # 首页（未选中）
│   ├── home-active.png    # 首页（选中）
│   ├── category.png       # 分类（未选中）
│   ├── category-active.png # 分类（选中）
│   ├── cart.png           # 购物车（未选中）
│   ├── cart-active.png    # 购物车（选中）
│   ├── profile.png        # 我的（未选中）
│   └── profile-active.png # 我的（选中）
├── banner/                 # 轮播图
│   ├── banner1.jpg
│   ├── banner2.jpg
│   └── banner3.jpg
├── category-default.png    # 默认分类图标
├── empty-cart.png          # 空购物车
├── empty-order.png         # 空订单
└── avatar-default.png      # 默认头像
```

## 图片规格要求

### 1. 底部导航栏图标
- 尺寸：81px × 81px
- 格式：PNG
- 背景：透明

### 2. 轮播图
- 尺寸：750px × 400px（宽高比约 1.875:1）
- 格式：JPG 或 PNG
- 大小：< 200KB

### 3. 分类图标
- 尺寸：96px × 96px
- 格式：PNG
- 背景：可以有背景色

### 4. 商品图片
- 尺寸：建议 800px × 800px（正方形）
- 格式：JPG 或 PNG
- 大小：< 500KB

## 临时占位图

在正式图片未准备好之前，可以使用以下方式：

### 方法1：使用占位图服务
```
https://via.placeholder.com/300x300
```

### 方法2：使用 base64 纯色图片
```javascript
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==
```

## 注意事项

1. 所有图片资源需要在小程序审核前准备完毕
2. 图片大小尽量压缩，提高加载速度
3. 建议使用 CDN 或云存储，不要直接放在小程序包内
4. 图片命名使用小写字母和连字符，避免中文

