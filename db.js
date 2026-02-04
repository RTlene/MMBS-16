require('dotenv').config();
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require('bcryptjs');

/**
 * 数据库设计规范（避免 MySQL 单表 64 索引上限）：
 * - 不在模型字段上使用 unique: true / index: true，业务唯一性在应用层保证。
 * - 仅保留主键与关联产生的 FK 索引；需唯一约束的业务字段（如 orderNo、核销码、提现单号）
 *   在创建时由业务代码校验或重试，不建唯一索引。
 */

// Read database configuration from environment variables
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "", MYSQL_DATABASE = "mall_admin" } = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize(MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
  timezone: '+08:00',
  // 连接池配置：避免冷启动时频繁建连导致更慢
  pool: {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: Number(process.env.DB_POOL_MIN || 0),
    acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 20000),
    idle: Number(process.env.DB_POOL_IDLE_MS || 10000),
  },
  dialectOptions: {
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  },
  logging: process.env.DB_LOG_SQL === 'true' ? console.log : false
});

// User Model
const User = sequelize.define("User", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  role: {
    type: DataTypes.ENUM('admin', 'user'),
    defaultValue: 'user',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'banned'),
    defaultValue: 'active',
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'Users',
  timestamps: true
});

// Category Model
const Category = sequelize.define('Category', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '分类名称'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '分类描述'
    },
    parentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '父分类ID'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序顺序'
    },
    icon: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '分类图标'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'Categories',
    timestamps: true
});

// Product Model - 商品基本信息
const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品简介'
    },
    // 商品主图组（用于列表展示）
    images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品主图URLs数组'
    },
    // 商品详情图组（用于详情页展示）
    detailImages: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品详情图URLs数组'
    },
    // 商品视频组
    videos: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品视频URLs数组'
    },
    // 商品详情富文本内容
    detailContent: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '商品详情富文本内容'
    },
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分类ID'
    },
    brand: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '品牌'
    },
    isHot: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否热门商品'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
        defaultValue: 'active',
        comment: '状态'
    },
    isFeatured: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否推荐'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序顺序'
    },
    productType: {
        type: DataTypes.ENUM('physical', 'service'),
        defaultValue: 'physical',
        comment: '商品类型：physical-实物商品，service-服务商品'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'Products',
    timestamps: true
});

// ProductSKU Model - 商品规格
const ProductSKU = sequelize.define('ProductSKU', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    sku: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: 'SKU编码'
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: 'SKU名称（如：红色-L码）'
    },
    price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '价格'
    },
    costPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '成本价格'
    },
    stock: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '库存数量'
    },
    barcode: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '条形码'
    },
    weight: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true,
        comment: '重量(kg)'
    },
    dimensions: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '尺寸(长x宽x高)'
    },
    // SKU属性（JSON格式存储规格信息）
    attributes: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'SKU属性，如：{"颜色":"红色","尺寸":"L","材质":"棉"}'
    },
    // SKU图片
    images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'SKU图片URLs数组'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序顺序'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'ProductSKUs',
    timestamps: true
});

// ProductAttribute Model - 商品属性模板
const ProductAttribute = sequelize.define('ProductAttribute', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '属性名称（如：颜色、尺寸、材质）'
    },
    type: {
        type: DataTypes.ENUM('text', 'select', 'color', 'image'),
        defaultValue: 'text',
        comment: '属性类型'
    },
    options: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '属性选项（用于select类型）'
    },
    isRequired: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: '是否必填'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序顺序'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'ProductAttributes',
    timestamps: true
});

const MemberLevel = sequelize.define("MemberLevel", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
        autoIncrement: true
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '等级'
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: '等级名称'
  },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '等级描述'
  },
  minPoints: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '最低积分要求'
  },
  maxPoints: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: '最高积分限制'
  },
    benefits: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '等级权益（JSON格式）'
    },
    isSharingEarner: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为分享赚钱类型会员'
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否默认等级'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序'
    },
    directCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
        defaultValue: 0,
        comment: '直接佣金比例（%）'
  },
    indirectCommissionRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
        defaultValue: 0,
        comment: '间接佣金比例（%）'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
    defaultValue: 'active',
    comment: '状态'
  },
    createdAt: {
        type: DataTypes.DATE,
    allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'member_levels',
    timestamps: true
});

const DistributorLevel = sequelize.define('DistributorLevel', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '等级'
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '等级名称'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '等级描述'
    },
    minSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '最低销售额要求'
    },
    maxSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最高销售额限制'
    },
    benefits: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '等级权益（JSON格式）'
    },
    costRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '提货成本比例（%）'
    },
    directCommissionRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '直接佣金比例（%）'
    },
    indirectCommissionRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '间接佣金比例（%）'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序顺序'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'distributor_levels',
    timestamps: true
  });

// 团队拓展激励等级模型
const TeamExpansionLevel = sequelize.define('TeamExpansionLevel', {
  id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
  },
  name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '等级名称'
  },
  level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '等级数值'
  },
  minTeamSize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '最低团队规模要求'
  },
  maxTeamSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '最高团队规模要求'
  },
  incentiveRate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.01,
      comment: '激励比例'
  },
  // 激励计算基数设置
  minIncentiveBase: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '激励计算基数下限（元）'
  },
  maxIncentiveBase: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '激励计算基数上限（元）'
  },
  privileges: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '特权配置'
  },
  color: {
      type: DataTypes.STRING(7),
      allowNull: true,
      defaultValue: '#faad14',
      comment: '等级颜色'
  },
  icon: {
      type: DataTypes.STRING(10),
      allowNull: true,
      comment: '等级图标'
  },
  description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: '等级描述'
  },
  status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
      comment: '状态'
  },
  sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序'
  }
}, {
  tableName: 'team_expansion_levels',
  comment: '团队拓展激励等级表',
  timestamps: true
});

// 修改会员模型
const Member = sequelize.define('Member', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    
    // 必要字段
    nickname: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '昵称'
    },
    
    // 小程序相关字段
    openid: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '微信小程序openid'
    },
    unionid: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '微信unionid'
    },
    sessionKey: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '微信session_key'
    },
    
    // 等级相关字段（默认为空）
    memberLevelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '会员等级ID'
    },
    distributorLevelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '分销等级ID'
    },
    teamExpansionLevelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '团队拓展激励等级ID'
    },
    
    // 会员基础信息（可选）
    memberCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '会员编号'
    },
    realName: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '真实姓名'
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '手机号'
    },
    avatar: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '头像URL'
    },
    gender: {
        type: DataTypes.ENUM('male', 'female', 'other'),
        allowNull: true,
        comment: '性别'
    },
    birthday: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: '生日'
    },
    
    // 地址信息（可选）
    province: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '省份'
    },
    city: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '城市'
    },
    district: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '区县'
    },
    address: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '详细地址'
    },
    
    // 会员状态
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
        comment: '会员状态'
    },
    
    // 积分相关（默认为0）
    totalPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总积分'
    },
    availablePoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '可用积分'
    },
    frozenPoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '冻结积分'
    },
    
    // 分销相关（默认为0）
    totalSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '总销售额'
    },
    directSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '直接销售额'
    },
    indirectSales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '间接销售额'
    },
    totalCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '总佣金'
    },
    availableCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '可用佣金'
    },
    frozenCommission: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '冻结佣金'
    },
    
    // 团队拓展激励相关（默认为0）
    totalTeamIncentive: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '总团队拓展激励'
    },
    availableTeamIncentive: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '可用团队拓展激励'
    },
    frozenTeamIncentive: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '冻结团队拓展激励'
    },
    
    // 团队信息（默认为0）
    directFans: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '直接粉丝数'
    },
    totalFans: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总粉丝数'
    },
    directDistributors: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '直接分销商数'
    },
    totalDistributors: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总分销商数'
    },
    
    // 推荐关系
    referrerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '推荐人ID'
    },
    referrerPath: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '推荐路径（存储推荐链）'
    },

    // 新增：粉丝和分销商ID列表
    fanIds: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '粉丝ID列表'
    },
    distributorIds: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '分销商ID列表'
    },

    // 新增：团队层级信息
    teamLevel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '团队层级（0为顶级）'
    },
    teamPath: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '团队路径（存储完整团队层级）'
    },

        // 佣金计算相关字段
    // 注意：会员类型通过等级ID来判断
    // distributorLevelId 为 null = customer（顾客）
    // distributorLevelId 不为 null = distributor（分销商）
    // memberLevelId 对应等级中 isSharingEarner = true = sharing_earner（分享赚钱）
    monthlySales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: '当月销售额'
    },
    lastCommissionCalculation: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后佣金计算时间'
    },
    // 个人佣金统计（从等级设置中继承，但可以单独调整）
    personalDirectCommissionRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '个人直接佣金比例（%），为空时使用等级设置'
    },
    personalIndirectCommissionRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '个人间接佣金比例（%），为空时使用等级设置'
    },
    personalCostRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '个人提货成本比例（%），为空时使用等级设置'
    },

    // 新增：推荐统计
    totalReferrals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '总推荐人数'
    },
    directReferrals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '直接推荐人数'
    },
    indirectReferrals: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '间接推荐人数'
    },
    
    // 等级变更记录
    levelHistory: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '等级变更历史'
    },
    
    // 其他信息
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注'
    },
    lastActiveAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '最后活跃时间'
    }
}, {
    tableName: 'members',
    comment: '会员表',
    timestamps: true
});

// 会员收货地址
const MemberAddress = sequelize.define('MemberAddress', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '收货人姓名'
    },
    phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: '收货人手机号'
    },
    region: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '省市区'
    },
    detail: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '详细地址'
    },
    latitude: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: '纬度'
    },
    longitude: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        comment: '经度'
    },
    locationName: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '地图位置名称'
    },
    isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否默认地址'
    }
}, {
    tableName: 'member_addresses',
    comment: '会员收货地址表',
    timestamps: true
});

// 会员积分记录模型
const MemberPointsRecord = sequelize.define('MemberPointsRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    type: {
        type: DataTypes.ENUM('earn', 'consume', 'expire', 'adjust', 'refund', 'admin_adjust'),
        allowNull: false,
        comment: '积分类型'
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分数量'
    },
    balance: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分余额'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '积分来源'
    },
    sourceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来源ID'
    },
    description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '描述'
    },
    expireAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间'
    },
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'completed',
        comment: '状态'
    }
}, {
    tableName: 'member_points_records',
    comment: '会员积分记录表',
    timestamps: true
});

// 订单模型
const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    orderNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '订单号'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '购买数量'
    },
    unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '单价'
    },
    totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '订单总金额'
    },
    status: {
        type: DataTypes.ENUM('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded', 'returned', 'completed'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '订单状态'
    },
    paymentMethod: {
        type: DataTypes.ENUM('wechat', 'alipay', 'bank', 'points', 'commission', 'test'),
        allowNull: true,
        comment: '支付方式'
    },
    paymentTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '支付时间'
    },
    transactionId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '微信支付交易号'
    },
    // 收货地址信息
    shippingAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '收货地址'
    },
    receiverName: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '收货人姓名'
    },
    receiverPhone: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: '收货人电话'
    },
    // 发货信息
    shippingMethod: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '配送方式'
    },
    shippingCompany: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '物流公司'
    },
    trackingNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '物流单号'
    },
    shippedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发货时间'
    },
    deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '收货时间'
    },
    // 退货退款信息
    returnStatus: {
        type: DataTypes.ENUM('none', 'requested', 'approved', 'rejected', 'returned', 'refunded'),
        allowNull: false,
        defaultValue: 'none',
        comment: '退货状态'
    },
    returnReason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '退货原因'
    },
    returnAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '退货金额'
    },
    refundStatus: {
        type: DataTypes.ENUM('none', 'requested', 'processing', 'completed', 'failed'),
        allowNull: false,
        defaultValue: 'none',
        comment: '退款状态'
    },
    refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '退款金额'
    },
    refundMethod: {
        type: DataTypes.ENUM('original', 'points', 'commission'),
        allowNull: true,
        comment: '退款方式'
    },
    refundedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '退款时间'
    },
    // 订单备注和状态
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '订单备注'
    },
    adminRemark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '管理员备注'
    },
    isTest: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否为测试订单'
    },
    // 操作记录
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '创建人ID'
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最后更新人ID'
    }
}, {
    tableName: 'orders',
    comment: '订单表',
    timestamps: true
});

// 订单商品明细
const OrderItem = sequelize.define('OrderItem', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '商品ID'
    },
    skuId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'SKU ID'
    },
    productName: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '商品名称快照'
    },
    skuName: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: 'SKU名称快照'
    },
    productImage: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '商品图片'
    },
    productSnapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '商品快照'
    },
    skuSnapshot: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'SKU快照'
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '购买数量'
    },
    unitPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '成交单价'
    },
    totalAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '小计金额'
    },
    appliedCoupons: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '使用的优惠券'
    },
    appliedPromotions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '参与的促销活动'
    },
    discounts: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '优惠明细'
    }
}, {
    tableName: 'order_items',
    comment: '订单商品明细表',
    timestamps: true
});

// 订单操作记录模型
const OrderOperationLog = sequelize.define('OrderOperationLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    operation: {
        type: DataTypes.ENUM('create', 'pay', 'ship', 'deliver', 'cancel', 'return', 'refund', 'modify', 'change_type', 'verify'),
        allowNull: false,
        comment: '操作类型'
    },
    operatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作人ID'
    },
    operatorType: {
        type: DataTypes.ENUM('member', 'admin', 'system'),
        allowNull: false,
        comment: '操作人类型'
    },
    oldStatus: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '原状态'
    },
    newStatus: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '新状态'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '操作描述'
    },
    data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '操作数据'
    }
}, {
    tableName: 'order_operation_logs',
    comment: '订单操作记录表',
    timestamps: true
});

// 会员佣金记录模型
const MemberCommissionRecord = sequelize.define('MemberCommissionRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    type: {
        type: DataTypes.ENUM('direct', 'indirect', 'differential', 'team_expansion', 'admin_adjust'),
        allowNull: false,
        comment: '佣金类型'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '佣金金额'
    },
    balance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '佣金余额'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '佣金来源'
    },
    sourceId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '来源ID'
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联订单ID'
    },
    description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '描述'
    },
    status: {
        type: DataTypes.ENUM('pending', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态'
    },
    settledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结算时间'
    }
}, {
    tableName: 'member_commission_records',
    comment: '会员佣金记录表',
    timestamps: true
});

// 佣金提现申请表
const CommissionWithdrawal = sequelize.define('CommissionWithdrawal', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    withdrawalNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '提现单号（业务层保证唯一，不建唯一索引以免超出 MySQL 单表 64 键限制）'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '提现金额'
    },
    accountType: {
        type: DataTypes.ENUM('wechat', 'alipay', 'bank'),
        allowNull: false,
        comment: '账户类型：wechat-微信，alipay-支付宝，bank-银行卡'
    },
    accountName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '账户姓名'
    },
    accountNumber: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '账户号码'
    },
    bankName: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '银行名称（银行卡类型时必填）'
    },
    bankBranch: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '开户行（银行卡类型时可选）'
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '提现状态：pending-待审核，approved-已通过，rejected-已拒绝，processing-处理中，completed-已完成，cancelled-已取消'
    },
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注'
    },
    adminRemark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '管理员备注'
    },
    processedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理人ID'
    },
    processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理时间'
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    }
}, {
    tableName: 'commission_withdrawals',
    comment: '佣金提现申请表',
    timestamps: true
});

// 会员等级变更记录模型
const MemberLevelChangeRecord = sequelize.define('MemberLevelChangeRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    levelType: {
        type: DataTypes.ENUM('member', 'distributor', 'team_expansion'),
        allowNull: false,
        comment: '等级类型'
    },
    oldLevelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '原等级ID'
    },
    newLevelId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '新等级ID'
    },
    reason: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '变更原因'
    },
    description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '变更描述'
    },
    operatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '操作人ID'
    }
}, {
    tableName: 'member_level_change_records',
    comment: '会员等级变更记录表',
    timestamps: true
});

// 退货申请表
const ReturnRequest = sequelize.define('ReturnRequest', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    returnNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '退货单号'
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '关联订单ID'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '退货数量'
    },
    reason: {
        type: DataTypes.ENUM('quality', 'damage', 'wrong_item', 'not_satisfied', 'other'),
        allowNull: false,
        comment: '退货原因'
    },
    reasonDetail: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '退货原因详情'
    },
    images: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '退货图片凭证'
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'processing', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '退货状态'
    },
    refundAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '退款金额'
    },
    refundMethod: {
        type: DataTypes.ENUM('original', 'points', 'commission'),
        allowNull: true,
        comment: '退款方式'
    },
    adminRemark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '管理员备注'
    },
    processedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理人ID'
    },
    processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理时间'
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    }
}, {
    tableName: 'return_requests',
    comment: '退货申请表',
    timestamps: true
});

// 退款记录表
const RefundRecord = sequelize.define('RefundRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    refundNo: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '退款单号'
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联订单ID'
    },
    returnRequestId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联退货申请ID'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '退款金额'
    },
    method: {
        type: DataTypes.ENUM('original', 'points', 'commission'),
        allowNull: false,
        comment: '退款方式'
    },
    status: {
        type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '退款状态'
    },
    reason: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '退款原因'
    },
    thirdPartyRefundNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '第三方退款单号'
    },
    processedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '处理人ID'
    },
    processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '处理时间'
    },
    completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '完成时间'
    },
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注'
    }
}, {
    tableName: 'refund_records',
    comment: '退款记录表',
    timestamps: true
});

// 优惠券模型
const Coupon = sequelize.define('Coupon', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '优惠券名称'
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '优惠券代码'
    },
    type: {
        type: DataTypes.ENUM('discount', 'cash', 'gift'),
        allowNull: false,
        comment: '优惠券类型：discount-折扣券，cash-代金券，gift-礼品券'
    },
    discountType: {
        type: DataTypes.ENUM('percentage', 'fixed', 'full_reduction', 'full_gift', 'full_discount'),
        allowNull: false,
        defaultValue: 'percentage',
        comment: '折扣类型：percentage-百分比折扣，fixed-固定金额，full_reduction-满减，full_gift-满送，full_discount-满折'
    },
    value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '优惠券面值'
    },
    discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '折扣值（百分比或固定金额）'
    },
    minAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最低消费金额'
    },
    minOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最低订单金额要求'
    },
    maxDiscount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最大优惠金额'
    },
    maxDiscountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最大优惠金额限制'
    },
    totalCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '发放总数'
    },
    usedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '已使用数量'
    },
    usageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '使用次数限制'
    },
    memberUsageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '每会员使用次数限制'
    },
    productIds: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '适用商品ID数组'
    },
    skuIds: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '适用SKU ID数组'
    },
    validFrom: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '有效期开始时间'
    },
    validTo: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '有效期结束时间'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'expired'),
        allowNull: false,
        defaultValue: 'active',
        comment: '状态：active-启用，inactive-禁用，expired-已过期'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '优惠券描述'
    },
    // 满减满送满折规则字段
    fullReductionRules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '满减规则配置，支持金额和数量条件，如：[{"conditionType": "amount", "minAmount": 100, "discountAmount": 10}, {"conditionType": "quantity", "minQuantity": 3, "discountAmount": 20}]'
    },
    fullGiftRules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '满送规则配置，支持金额和数量条件，如：[{"conditionType": "amount", "minAmount": 100, "giftProductId": 1, "giftQuantity": 1}, {"conditionType": "quantity", "minQuantity": 5, "giftProductId": 2, "giftQuantity": 2}]'
    },
    fullDiscountRules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '满折规则配置，支持金额和数量条件，如：[{"conditionType": "amount", "minAmount": 100, "discountRate": 0.9}, {"conditionType": "quantity", "minQuantity": 3, "discountRate": 0.8}]'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID'
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '更新人ID'
    }
}, {
    tableName: 'coupons',
    timestamps: true,
    comment: '优惠券表'
});

// 促销活动模型
const Promotion = sequelize.define('Promotion', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '促销活动名称'
    },
    type: {
        type: DataTypes.ENUM('flash_sale', 'group_buy', 'bundle', 'free_shipping', 'full_reduction', 'full_gift', 'full_discount'),
        allowNull: false,
        comment: '促销类型：flash_sale-限时抢购，group_buy-团购，bundle-捆绑销售，free_shipping-包邮，full_reduction-满减，full_gift-满送，full_discount-满折'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '活动描述'
    },
    startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '开始时间'
    },
    endTime: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '结束时间'
    },
    status: {
        type: DataTypes.ENUM('draft', 'active', 'paused', 'ended'),
        defaultValue: 'draft',
        comment: '状态'
    },
    rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '促销规则配置'
    }
}, {
    tableName: 'promotions',
    timestamps: true
});

// 积分记录模型
const PointRecord = sequelize.define('PointRecord', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '积分变化数量'
    },
    type: {
        type: DataTypes.ENUM('earn', 'spend', 'expire', 'adjust'),
        allowNull: false,
        comment: '积分类型'
    },
    source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '积分来源'
    },
    description: {
        type: DataTypes.STRING(200),
        allowNull: true,
        comment: '积分描述'
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联订单ID'
    }
}, {
    tableName: 'point_records',
    timestamps: true
});

// 积分商城商品模型
const PointProduct = sequelize.define('PointProduct', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联商品ID'
    },
    skuId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '关联SKU ID'
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '商品名称'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '商品描述'
    },
    imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '商品图片URL'
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '所需积分'
    },
    stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '库存数量'
    },
    sold: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '已售数量'
    },
    category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: '商品分类'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive', 'sold_out'),
        defaultValue: 'active',
        comment: '状态'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序权重'
    }
}, {
    tableName: 'point_products',
    timestamps: true
});

// 积分兑换记录模型
const PointExchange = sequelize.define('PointExchange', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID'
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '消耗积分'
    },
    quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '兑换数量'
    },
    status: {
        type: DataTypes.ENUM('pending', 'shipped', 'delivered', 'cancelled'),
        defaultValue: 'pending',
        comment: '兑换状态'
    },
    shippingAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '收货地址'
    },
    trackingNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: '物流单号'
    },
    shippedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发货时间'
    },
    deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '收货时间'
    }
}, {
    tableName: 'point_exchanges',
    timestamps: true
});

// 推荐奖励模型
const ReferralReward = sequelize.define('ReferralReward', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    referrerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '推荐人ID'
    },
    refereeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '被推荐人ID'
    },
    rewardType: {
        type: DataTypes.ENUM('points', 'cash', 'coupon'),
        allowNull: false,
        comment: '奖励类型'
    },
    rewardValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '奖励值'
    },
    status: {
        type: DataTypes.ENUM('pending', 'paid', 'expired'),
        defaultValue: 'pending',
        comment: '状态'
    },
    paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发放时间'
    }
}, {
    tableName: 'referral_rewards',
    timestamps: true
});

// 抽奖活动模型
const LuckyDraw = sequelize.define('LuckyDraw', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '抽奖活动名称'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '活动描述'
    },
    startTime: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '开始时间'
    },
    endTime: {
        type: DataTypes.DATE,
        allowNull: false,
        comment: '结束时间'
    },
    status: {
        type: DataTypes.ENUM('draft', 'active', 'ended'),
        defaultValue: 'draft',
        comment: '状态'
    },
    rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '抽奖规则配置'
    },
    prizes: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '奖品配置'
    }
}, {
    tableName: 'lucky_draws',
    timestamps: true
});

// 短信模板模型
const SmsTemplate = sequelize.define('SmsTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板名称'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '短信内容'
    },
    type: {
        type: DataTypes.ENUM('verification', 'notification', 'marketing'),
        allowNull: false,
        comment: '短信类型'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    }
}, {
    tableName: 'sms_templates',
    timestamps: true
});

// 邮件模板模型
const EmailTemplate = sequelize.define('EmailTemplate', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '模板名称'
    },
    subject: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '邮件主题'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '邮件内容'
    },
    type: {
        type: DataTypes.ENUM('welcome', 'order', 'promotion', 'newsletter'),
        allowNull: false,
        comment: '邮件类型'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    }
}, {
    tableName: 'email_templates',
    timestamps: true
});

// 轮播图模型
const Banner = sequelize.define('Banner', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '轮播图标题'
    },
    imageUrl: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: '图片URL'
    },
    linkUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '跳转链接'
    },
    linkType: {
        type: DataTypes.ENUM('external', 'product', 'custom'),
        allowNull: false,
        defaultValue: 'external',
        comment: '链接类型：external-外部链接，product-商品详情，custom-自定义路径'
    },
    linkTarget: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '链接目标：外链URL、商品ID或自定义路径'
    },
    sort: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '排序值（越小越靠前）'
    },
    position: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '显示位置'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    },
    startTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始时间'
    },
    endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结束时间'
    }
}, {
    tableName: 'banners',
    timestamps: true
});

// Article Model - 文章模型
const Article = sequelize.define('Article', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '文章标题'
    },
    summary: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '文章摘要'
    },
    content: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        comment: '文章内容（HTML格式）'
    },
    coverImage: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '封面图片URL'
    },
    author: {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: 'MMBS商城',
        comment: '作者'
    },
    publishTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '发布时间'
    },
    readCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '阅读数'
    },
    likeCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '点赞数'
    },
    externalUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: '外部链接（如公众号文章链接）'
    },
    status: {
        type: DataTypes.ENUM('draft', 'published', 'archived'),
        defaultValue: 'draft',
        comment: '状态：草稿、已发布、已归档'
    },
    sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: '排序顺序'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'Articles',
    timestamps: true
});

// 弹窗模型
const Popup = sequelize.define('Popup', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '弹窗名称'
    },
    title: {
        type: DataTypes.STRING(200),
        allowNull: false,
        comment: '弹窗标题'
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: '弹窗内容'
    },
    type: {
        type: DataTypes.ENUM('modal', 'toast', 'banner'),
        allowNull: false,
        comment: '弹窗类型'
    },
    position: {
        type: DataTypes.ENUM('top', 'center', 'bottom'),
        allowNull: false,
        comment: '显示位置'
    },
    status: {
        type: DataTypes.ENUM('active', 'inactive'),
        defaultValue: 'active',
        comment: '状态'
    },
    startTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '开始时间'
    },
    endTime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '结束时间'
    }
}, {
    tableName: 'popups',
    timestamps: true
});

// VerificationCode Model - 核销码模型
const VerificationCode = sequelize.define('VerificationCode', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    orderItemId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '订单项ID'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '会员ID（购买者）'
    },
    productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '商品ID'
    },
    skuId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'SKU ID'
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '核销码（唯一性由业务层保证，避免单表索引超 64）'
    },
    status: {
        type: DataTypes.ENUM('unused', 'used', 'expired', 'cancelled'),
        defaultValue: 'unused',
        comment: '状态：unused-未使用，used-已使用，expired-已过期，cancelled-已取消'
    },
    usedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '使用时间'
    },
    usedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '核销人员ID（管理员）'
    },
    expiredAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '过期时间'
    },
    remark: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '备注'
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'VerificationCodes',
    timestamps: true
});

// 佣金计算记录模型
const CommissionCalculation = sequelize.define('CommissionCalculation', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '订单ID'
    },
    memberId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '下单会员ID'
    },
    referrerId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '推荐人ID'
    },
    commissionType: {
        type: DataTypes.ENUM('direct', 'indirect', 'distributor', 'network_distributor', 'team_incentive'),
        allowNull: false,
        comment: '佣金类型：direct-直接佣金，indirect-间接佣金，distributor-分销商佣金，network_distributor-网络分销商佣金，team_incentive-团队拓展激励'
    },
    recipientId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '佣金接收人ID'
    },
    orderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '订单金额'
    },
    commissionRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: '佣金比例（%）'
    },
    commissionAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '佣金金额'
    },
    costRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        comment: '成本比例（%）'
    },
    costAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '成本金额'
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态：pending-待确认，confirmed-已确认，cancelled-已取消'
    },
    calculationDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '计算日期'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '计算说明'
    }
}, {
    tableName: 'commission_calculations',
    timestamps: true
});

// 团队拓展激励计算记录模型
const TeamIncentiveCalculation = sequelize.define('TeamIncentiveCalculation', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    distributorId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '分销商ID'
    },
    referrerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '推荐人ID'
    },
    calculationMonth: {
        type: DataTypes.STRING(7),
        allowNull: false,
        comment: '计算月份（YYYY-MM）'
    },
    monthlySales: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '当月销售额'
    },
    incentiveBase: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '激励基数'
    },
    incentiveRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: '激励比例（%）'
    },
    incentiveAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        comment: '激励金额'
    },
    status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '状态'
    },
    calculationDate: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: '计算日期'
    }
}, {
    tableName: 'team_incentive_calculations',
    timestamps: true
});

// 积分设置模型
const PointSettings = sequelize.define('PointSettings', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '设置名称'
    },
    type: {
        type: DataTypes.ENUM('source', 'rate', 'rule'),
        allowNull: false,
        comment: '设置类型：source-积分来源，rate-倍率设置，rule-规则设置'
    },
    source: {
        type: DataTypes.ENUM('register', 'order', 'share', 'invite', 'review', 'signin', 'activity', 'admin'),
        allowNull: false,
        comment: '积分来源'
    },
    basePoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '基础积分'
    },
    multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.00,
        comment: '倍率'
    },
    maxPoints: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '最大积分限制'
    },
    minOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最低订单金额'
    },
    maxOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: '最高订单金额'
    },
    conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '额外条件配置'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
    },
    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级，数字越大优先级越高'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '描述'
    },
    validFrom: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间'
    },
    validTo: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID'
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '更新人ID'
    }
}, {
    tableName: 'point_settings',
    timestamps: true,
    comment: '积分设置表'
});

// 积分来源配置模型
const PointSourceConfig = sequelize.define('PointSourceConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    source: {
        type: DataTypes.ENUM('register', 'order', 'share', 'invite', 'review', 'signin', 'activity', 'admin'),
        allowNull: false,
        comment: '积分来源'
    },
    sourceName: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: '来源名称'
    },
    isEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
    },
    basePoints: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '基础积分'
    },
    multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 1.00,
        comment: '基础倍率'
    },
    maxDailyPoints: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '每日最大积分限制'
    },
    maxTotalPoints: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: '总最大积分限制'
    },
    rules: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '规则配置'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '描述'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID'
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '更新人ID'
    }
}, {
    tableName: 'point_source_config',
    timestamps: true,
    comment: '积分来源配置表'
});

// 积分倍率设置模型
const PointMultiplierConfig = sequelize.define('PointMultiplierConfig', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '倍率名称'
    },
    multiplier: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        comment: '倍率值'
    },
    conditions: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: '适用条件'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用'
    },
    priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '优先级'
    },
    validFrom: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效开始时间'
    },
    validTo: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '生效结束时间'
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '描述'
    },
    createdBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '创建人ID'
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: '更新人ID'
    }
}, {
    tableName: 'point_multiplier_config',
    timestamps: true,
    comment: '积分倍率设置表'
});

// 定义关联关系
// 商品和分类的关联
Product.belongsTo(Category, { 
    foreignKey: 'categoryId', 
    as: 'category',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});

Category.hasMany(Product, { 
    foreignKey: 'categoryId', 
    as: 'products',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
});

// 商品和SKU的关联
Product.hasMany(ProductSKU, { 
    foreignKey: 'productId', 
    as: 'skus',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

ProductSKU.belongsTo(Product, { 
    foreignKey: 'productId', 
    as: 'product',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

// 商品和属性的关联
Product.hasMany(ProductAttribute, { 
    foreignKey: 'productId', 
    as: 'attributes',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

ProductAttribute.belongsTo(Product, { 
    foreignKey: 'productId', 
    as: 'product',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
});

// 定义关联关系
Order.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Order.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Member.hasMany(Order, { foreignKey: 'memberId', as: 'orders' });
Product.hasMany(Order, { foreignKey: 'productId', as: 'orders' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order', onDelete: 'CASCADE' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product', onDelete: 'SET NULL' });
OrderItem.belongsTo(ProductSKU, { foreignKey: 'skuId', as: 'sku', onDelete: 'SET NULL' });

// 佣金记录与订单的关联
MemberCommissionRecord.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Order.hasMany(MemberCommissionRecord, { foreignKey: 'orderId', as: 'commissionRecords' });

// 会员与等级的关系
Member.belongsTo(MemberLevel, { foreignKey: 'memberLevelId', as: 'memberLevel' });
Member.belongsTo(DistributorLevel, { foreignKey: 'distributorLevelId', as: 'distributorLevel' });
Member.belongsTo(TeamExpansionLevel, { foreignKey: 'teamExpansionLevelId', as: 'teamExpansionLevel' });

// 会员与推荐人的关系
Member.belongsTo(Member, { foreignKey: 'referrerId', as: 'referrer' });
Member.hasMany(Member, { foreignKey: 'referrerId', as: 'referrals' });

// 会员地址
Member.hasMany(MemberAddress, { foreignKey: 'memberId', as: 'addresses', onDelete: 'CASCADE' });
MemberAddress.belongsTo(Member, { foreignKey: 'memberId', as: 'member', onDelete: 'CASCADE' });

// 会员积分记录
MemberPointsRecord.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(MemberPointsRecord, { foreignKey: 'memberId', as: 'pointsRecords' });

// 会员佣金记录
MemberCommissionRecord.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(MemberCommissionRecord, { foreignKey: 'memberId', as: 'commissionRecords' });

// 佣金提现申请
CommissionWithdrawal.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(CommissionWithdrawal, { foreignKey: 'memberId', as: 'withdrawals' });

// 会员等级变更记录
MemberLevelChangeRecord.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(MemberLevelChangeRecord, { foreignKey: 'memberId', as: 'levelChangeRecords' });

// 退货申请关联关系
ReturnRequest.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
ReturnRequest.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
ReturnRequest.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
ReturnRequest.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });

Order.hasMany(ReturnRequest, { foreignKey: 'orderId', as: 'returnRequests' });
Member.hasMany(ReturnRequest, { foreignKey: 'memberId', as: 'returnRequests' });
Product.hasMany(ReturnRequest, { foreignKey: 'productId', as: 'returnRequests' });

// 退款记录关联关系
RefundRecord.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
RefundRecord.belongsTo(ReturnRequest, { foreignKey: 'returnRequestId', as: 'returnRequest' });
RefundRecord.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
RefundRecord.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });

Order.hasMany(RefundRecord, { foreignKey: 'orderId', as: 'refundRecords' });
ReturnRequest.hasMany(RefundRecord, { foreignKey: 'returnRequestId', as: 'refundRecords' });
Member.hasMany(RefundRecord, { foreignKey: 'memberId', as: 'refundRecords' });

// 核销码关联
Order.hasMany(VerificationCode, { foreignKey: 'orderId', as: 'verificationCodes' });
VerificationCode.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
VerificationCode.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
VerificationCode.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
VerificationCode.belongsTo(ProductSKU, { foreignKey: 'skuId', as: 'sku' });
Member.hasMany(VerificationCode, { foreignKey: 'memberId', as: 'verificationCodes' });
Product.hasMany(VerificationCode, { foreignKey: 'productId', as: 'verificationCodes' });

// 积分记录与会员关联
PointRecord.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(PointRecord, { foreignKey: 'memberId', as: 'pointRecords' });

// 积分商城商品与兑换记录关联
PointExchange.belongsTo(PointProduct, { foreignKey: 'productId', as: 'product' });
PointProduct.hasMany(PointExchange, { foreignKey: 'productId', as: 'exchanges' });

PointExchange.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
Member.hasMany(PointExchange, { foreignKey: 'memberId', as: 'pointExchanges' });

// 推荐奖励与会员关联
ReferralReward.belongsTo(Member, { foreignKey: 'referrerId', as: 'referrer' });
ReferralReward.belongsTo(Member, { foreignKey: 'refereeId', as: 'referee' });

// 佣金计算记录关联
CommissionCalculation.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
CommissionCalculation.belongsTo(Member, { foreignKey: 'memberId', as: 'member' });
CommissionCalculation.belongsTo(Member, { foreignKey: 'referrerId', as: 'referrer' });
CommissionCalculation.belongsTo(Member, { foreignKey: 'recipientId', as: 'recipient' });

Order.hasMany(CommissionCalculation, { foreignKey: 'orderId', as: 'commissionCalculations' });
Member.hasMany(CommissionCalculation, { foreignKey: 'memberId', as: 'memberCommissionCalculations' });
Member.hasMany(CommissionCalculation, { foreignKey: 'referrerId', as: 'referrerCommissionCalculations' });
Member.hasMany(CommissionCalculation, { foreignKey: 'recipientId', as: 'recipientCommissionCalculations' });

// 团队拓展激励计算记录关联
TeamIncentiveCalculation.belongsTo(Member, { foreignKey: 'distributorId', as: 'distributor' });
TeamIncentiveCalculation.belongsTo(Member, { foreignKey: 'referrerId', as: 'referrer' });

Member.hasMany(TeamIncentiveCalculation, { foreignKey: 'distributorId', as: 'distributorIncentiveCalculations' });
Member.hasMany(TeamIncentiveCalculation, { foreignKey: 'referrerId', as: 'referrerIncentiveCalculations' });

// 订单操作记录关联
OrderOperationLog.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderOperationLog.belongsTo(User, { foreignKey: 'operatorId', as: 'operator' });
Order.hasMany(OrderOperationLog, { foreignKey: 'orderId', as: 'operationLogs' });

// 积分设置关联
PointSettings.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
PointSettings.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater' });

PointSourceConfig.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
PointSourceConfig.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater' });

PointMultiplierConfig.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
PointMultiplierConfig.belongsTo(User, { foreignKey: 'updatedBy', as: 'updater' });

// 单表 sync，失败时记录表名并继续，便于定位「Too many keys」等单表问题
async function syncTable(name, model) {
  try {
    await model.sync({ alter: true });
    return null;
  } catch (err) {
    const hint = (err.original && err.original.errno === 1069) || (err.parent && err.parent.errno === 1069)
      ? ' [MySQL 单表索引上限 64：请检查该模型是否含 unique/index，去掉后由业务层保证唯一性]'
      : '';
    console.error(`[DB] 表 ${name} 同步失败:`, err.message + hint);
    return { name, error: err };
  }
}

// Database initialization method
async function init() {
  try {
    // 先快速验证连接（比 sync 快很多），让服务尽快可用
    await sequelize.authenticate();
    console.log('[DB] 连接成功');

    // 默认不在启动时做 alter 同步（云托管缩容后冷启动会非常慢）
    // 需要同步时显式设置：DB_SYNC=true（可选：DB_SYNC_ALTER=true 走 alter）
    const shouldSync = process.env.DB_SYNC === 'true';
    if (!shouldSync) {
      return;
    }

    const useAlter = process.env.DB_SYNC_ALTER === 'true';
    const tables = [
      ['Users', User],
      ['Categories', Category],
      ['Products', Product],
      ['ProductSKUs', ProductSKU],
      ['ProductAttributes', ProductAttribute],
      ['MemberLevels', MemberLevel],
      ['DistributorLevels', DistributorLevel],
      ['TeamExpansionLevels', TeamExpansionLevel],
      ['Orders', Order],
      ['Members', Member],
      ['MemberAddresses', MemberAddress],
      ['MemberPointsRecords', MemberPointsRecord],
      ['MemberCommissionRecords', MemberCommissionRecord],
      ['CommissionWithdrawals', CommissionWithdrawal],
      ['MemberLevelChangeRecords', MemberLevelChangeRecord],
      ['ReturnRequests', ReturnRequest],
      ['RefundRecords', RefundRecord],
      ['Coupons', Coupon],
      ['Promotions', Promotion],
      ['PointRecords', PointRecord],
      ['PointProducts', PointProduct],
      ['PointExchanges', PointExchange],
      ['ReferralRewards', ReferralReward],
      ['LuckyDraws', LuckyDraw],
      ['SmsTemplates', SmsTemplate],
      ['EmailTemplates', EmailTemplate],
      ['Banners', Banner],
      ['Popups', Popup],
      ['Articles', Article],
      ['VerificationCodes', VerificationCode],
      ['CommissionCalculations', CommissionCalculation],
      ['TeamIncentiveCalculations', TeamIncentiveCalculation],
      ['OrderItems', OrderItem],
      ['OrderOperationLogs', OrderOperationLog]
    ];

    const failed = [];
    for (const [name, model] of tables) {
      // sync({ alter: true }) 非常慢；默认仅 sync()，需要时再开启 alter
      const result = useAlter ? await syncTable(name, model) : await (async () => {
        try {
          await model.sync();
          return null;
        } catch (err) {
          console.error(`[DB] 表 ${name} 同步失败:`, err.message);
          return { name, error: err };
        }
      })();
      if (result) failed.push(result);
    }

    if (failed.length > 0) {
      const msg = failed.map(f => `${f.name}: ${f.error.message}`).join('; ');
      console.error('[DB] 以下表同步失败:', msg);
      throw new Error(`数据库表同步失败: ${msg}`);
    }

    console.log('[DB] 数据库同步成功');

    // Check if admin user already exists, if not, create it
    // 默认只在同步时执行；如需在生产强制播种，设置 DB_SEED_ADMIN=true
    const shouldSeedAdmin = process.env.DB_SEED_ADMIN === 'true';
    if (shouldSeedAdmin || shouldSync) {
      const adminExists = await User.findOne({ where: { username: 'admin' } });
      if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await User.create({
          username: 'admin',
          password: hashedPassword,
          email: 'admin@example.com',
          role: 'admin',
          status: 'active'
        });
        console.log('[DB] 默认管理员账户已创建: admin/admin123');
      } else {
        console.log('[DB] 管理员账户已存在');
      }
    }
  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
}

// 导出所有模型
module.exports = {
    sequelize,
  init,
  User,
  Category,
  Product,
  ProductSKU,
  ProductAttribute,
  MemberLevel,
  DistributorLevel,
  TeamExpansionLevel,
  Member,
  MemberAddress,
    Order,
    OrderItem,
    ReturnRequest,
    RefundRecord,
  MemberPointsRecord,
  MemberCommissionRecord,
  CommissionWithdrawal,
    MemberLevelChangeRecord,
    Coupon,
    Promotion,
    PointRecord,
    PointProduct,
    PointExchange,
    ReferralReward,
    LuckyDraw,
    SmsTemplate,
    EmailTemplate,
    Banner,
    Popup,
    Article,
    VerificationCode,
    PointSettings,
    PointMultiplierConfig,
    PointSourceConfig,
    CommissionCalculation,
    OrderOperationLog,
    TeamIncentiveCalculation
};