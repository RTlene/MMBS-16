const express = require('express');
const { Op } = require('sequelize');
const { ReferralReward, Member, Coupon, PointRecord } = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 推荐奖励配置存储（实际项目中应该存储在数据库中）
let rewardConfig = {
    type: 'points',
    referrerPoints: 100,
    refereePoints: 50,
    expireDays: 30,
    isEnabled: true
};

// 获取推荐奖励统计
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const total = await ReferralReward.count();
        const pending = await ReferralReward.count({ where: { status: 'pending' } });
        const paid = await ReferralReward.count({ where: { status: 'paid' } });
        const totalAmount = await ReferralReward.sum('rewardValue', {
            where: { status: 'paid' }
        }) || 0;

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                total,
                pending,
                paid,
                totalAmount
            }
        });
    } catch (error) {
        console.error('获取推荐奖励统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取推荐奖励统计失败'
        });
    }
});

// 获取推荐奖励列表
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            type = '',
            status = '',
            sortBy = 'createdAt',
            sortOrder = 'DESC'
        } = req.query;

        const offset = (page - 1) * limit;
        const where = {};

        // 搜索条件
        if (search) {
            where[Op.or] = [
                { referrerId: { [Op.like]: `%${search}%` } },
                { refereeId: { [Op.like]: `%${search}%` } }
            ];
        }

        if (type) {
            where.rewardType = type;
        }

        if (status) {
            where.status = status;
        }

        const { count, rows } = await ReferralReward.findAndCountAll({
            where,
            include: [
                {
                    model: Member,
                    as: 'referrer',
                    attributes: ['id', 'nickname', 'realName']
                },
                {
                    model: Member,
                    as: 'referee',
                    attributes: ['id', 'nickname', 'realName']
                }
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sortBy, sortOrder.toUpperCase()]]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                rewards: rows,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page)
            }
        });
    } catch (error) {
        console.error('获取推荐奖励列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取推荐奖励列表失败'
        });
    }
});

// 获取推荐奖励配置
router.get('/config', authenticateToken, async (req, res) => {
    try {
        res.json({
            code: 0,
            message: '获取成功',
            data: rewardConfig
        });
    } catch (error) {
        console.error('获取推荐奖励配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取推荐奖励配置失败'
        });
    }
});

// 更新推荐奖励配置
router.put('/config', authenticateToken, async (req, res) => {
    try {
        const configData = req.body;

        // 验证配置数据
        if (!configData.type || !['points', 'cash', 'coupon'].includes(configData.type)) {
            return res.status(400).json({
                code: 1,
                message: '奖励类型必须是points、cash或coupon之一'
            });
        }

        if (!configData.expireDays || configData.expireDays <= 0) {
            return res.status(400).json({
                code: 1,
                message: '有效期必须大于0天'
            });
        }

        // 根据奖励类型验证具体配置
        if (configData.type === 'points') {
            if (!configData.referrerPoints || configData.referrerPoints <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人积分奖励必须大于0'
                });
            }
            if (!configData.refereePoints || configData.refereePoints <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '被推荐人积分奖励必须大于0'
                });
            }
        } else if (configData.type === 'cash') {
            if (!configData.referrerAmount || configData.referrerAmount <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人现金奖励必须大于0'
                });
            }
            if (!configData.refereeAmount || configData.refereeAmount <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '被推荐人现金奖励必须大于0'
                });
            }
        } else if (configData.type === 'coupon') {
            if (!configData.referrerCouponId || configData.referrerCouponId <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人优惠券ID必须大于0'
                });
            }
            if (!configData.refereeCouponId || configData.refereeCouponId <= 0) {
                return res.status(400).json({
                    code: 1,
                    message: '被推荐人优惠券ID必须大于0'
                });
            }

            // 验证优惠券是否存在
            const referrerCoupon = await Coupon.findByPk(configData.referrerCouponId);
            const refereeCoupon = await Coupon.findByPk(configData.refereeCouponId);
            
            if (!referrerCoupon) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人优惠券不存在'
                });
            }
            if (!refereeCoupon) {
                return res.status(400).json({
                    code: 1,
                    message: '被推荐人优惠券不存在'
                });
            }
        }

        // 更新配置
        rewardConfig = {
            ...rewardConfig,
            ...configData
        };

        res.json({
            code: 0,
            message: '配置更新成功',
            data: rewardConfig
        });
    } catch (error) {
        console.error('更新推荐奖励配置失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新推荐奖励配置失败'
        });
    }
});

// 发放推荐奖励
router.put('/:id/pay', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const reward = await ReferralReward.findByPk(id, {
            include: [
                {
                    model: Member,
                    as: 'referrer',
                    attributes: ['id', 'nickname', 'points']
                },
                {
                    model: Member,
                    as: 'referee',
                    attributes: ['id', 'nickname', 'points']
                }
            ]
        });

        if (!reward) {
            return res.status(404).json({
                code: 1,
                message: '推荐奖励不存在'
            });
        }

        if (reward.status !== 'pending') {
            return res.status(400).json({
                code: 1,
                message: '该奖励已经处理过了'
            });
        }

        // 开始事务
        const transaction = await sequelize.transaction();

        try {
            // 根据奖励类型发放奖励
            if (reward.rewardType === 'points') {
                // 发放积分奖励
                await reward.referrer.update({
                    points: reward.referrer.points + reward.rewardValue
                }, { transaction });

                // 记录积分变化
                await PointRecord.create({
                    memberId: reward.referrerId,
                    points: reward.rewardValue,
                    type: 'earn',
                    source: 'referral_reward',
                    description: `推荐奖励：${reward.referee.nickname}`
                }, { transaction });
            } else if (reward.rewardType === 'cash') {
                // 现金奖励需要额外的支付处理逻辑
                // 这里只是更新状态，实际支付需要集成支付系统
                console.log(`发放现金奖励 ${reward.rewardValue} 给 ${reward.referrer.nickname}`);
            } else if (reward.rewardType === 'coupon') {
                // 优惠券奖励需要检查优惠券是否可用
                const coupon = await Coupon.findByPk(reward.rewardValue);
                if (!coupon || coupon.status !== 'active') {
                    throw new Error('优惠券不可用');
                }
                // 这里需要实现优惠券发放逻辑
                console.log(`发放优惠券 ${coupon.name} 给 ${reward.referrer.nickname}`);
            }

            // 更新奖励状态
            await reward.update({
                status: 'paid',
                paidAt: new Date()
            }, { transaction });

            await transaction.commit();

            res.json({
                code: 0,
                message: '奖励发放成功',
                data: reward
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('发放推荐奖励失败:', error);
        res.status(500).json({
            code: 1,
            message: '发放推荐奖励失败: ' + error.message
        });
    }
});

// 创建推荐奖励（内部接口，由会员注册时调用）
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { referrerId, refereeId } = req.body;

        // 检查配置是否启用
        if (!rewardConfig.isEnabled) {
            return res.status(400).json({
                code: 1,
                message: '推荐奖励功能已禁用'
            });
        }

        // 检查推荐人和被推荐人是否存在
        const referrer = await Member.findByPk(referrerId);
        const referee = await Member.findByPk(refereeId);

        if (!referrer) {
            return res.status(404).json({
                code: 1,
                message: '推荐人不存在'
            });
        }

        if (!referee) {
            return res.status(404).json({
                code: 1,
                message: '被推荐人不存在'
            });
        }

        // 检查是否已经存在推荐关系
        const existingReward = await ReferralReward.findOne({
            where: {
                referrerId: referrerId,
                refereeId: refereeId
            }
        });

        if (existingReward) {
            return res.status(400).json({
                code: 1,
                message: '推荐关系已存在'
            });
        }

        // 根据配置创建奖励记录
        let rewardValue;
        if (rewardConfig.type === 'points') {
            rewardValue = rewardConfig.referrerPoints;
        } else if (rewardConfig.type === 'cash') {
            rewardValue = rewardConfig.referrerAmount;
        } else if (rewardConfig.type === 'coupon') {
            rewardValue = rewardConfig.referrerCouponId;
        }

        const reward = await ReferralReward.create({
            referrerId: referrerId,
            refereeId: refereeId,
            rewardType: rewardConfig.type,
            rewardValue: rewardValue,
            status: 'pending'
        });

        res.json({
            code: 0,
            message: '推荐奖励创建成功',
            data: reward
        });
    } catch (error) {
        console.error('创建推荐奖励失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建推荐奖励失败'
        });
    }
});

// 获取单个推荐奖励
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const reward = await ReferralReward.findByPk(id, {
            include: [
                {
                    model: Member,
                    as: 'referrer',
                    attributes: ['id', 'nickname', 'realName']
                },
                {
                    model: Member,
                    as: 'referee',
                    attributes: ['id', 'nickname', 'realName']
                }
            ]
        });

        if (!reward) {
            return res.status(404).json({
                code: 1,
                message: '推荐奖励不存在'
            });
        }

        res.json({
            code: 0,
            message: '获取成功',
            data: reward
        });
    } catch (error) {
        console.error('获取推荐奖励失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取推荐奖励失败'
        });
    }
});

module.exports = router;