const express = require('express');
const { Op } = require('sequelize');
const { Member, MemberLevel, DistributorLevel, TeamExpansionLevel, CommissionCalculation } = require('../db');
const bcrypt = require('bcryptjs');
const { authenticateMiniappUser } = require('../middleware/miniapp-auth');
const router = express.Router();


// 创建会员（小程序端注册）
router.post('/members', async (req, res) => {
    try {
        const {
            openid,
            unionid,
            nickname,
            avatar,
            phone,
            realName,
            idCard,
            gender = 'unknown',
            birthday,
            address,
            referrerId = null,
            referrerCode = null
        } = req.body;

        // 验证必填字段
        if (!openid || !nickname) {
            return res.status(400).json({
                code: 1,
                message: '缺少必填信息'
            });
        }

        // 检查用户是否已存在
        const existingMember = await Member.findOne({ 
            where: { openid } 
        });

        if (existingMember) {
            return res.status(400).json({
                code: 1,
                message: '用户已存在',
                data: { memberId: existingMember.id }
            });
        }

        // 处理推荐人
        let referrer = null;
        if (referrerId) {
            referrer = await Member.findByPk(referrerId);
            if (!referrer) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐人不存在'
                });
            }
        } else if (referrerCode) {
            referrer = await Member.findOne({ 
                where: { memberCode: referrerCode } 
            });
            if (!referrer) {
                return res.status(400).json({
                    code: 1,
                    message: '推荐码不存在'
                });
            }
        }

        // 获取默认会员等级
        const defaultLevel = await MemberLevel.findOne({ 
            where: { isDefault: true, status: 'active' },
            order: [['sortOrder', 'ASC']]
        });

        if (!defaultLevel) {
            return res.status(500).json({
                code: 1,
                message: '系统配置错误，请联系管理员'
            });
        }

        // 生成会员编号（作为推荐码使用）
        const memberCode = generateReferralCode();

        // 创建会员
        const member = await Member.create({
            openid,
            unionid,
            nickname,
            avatar,
            phone,
            realName,
            idCard,
            gender,
            birthday: birthday ? new Date(birthday) : null,
            address,
            memberCode,
            referrerId: referrer ? referrer.id : null,
            memberLevelId: defaultLevel.id,
            status: 'active',
            personalDirectCommissionRate: defaultLevel.directCommissionRate || 0,
            personalIndirectCommissionRate: defaultLevel.indirectCommissionRate || 0,
            personalCostRate: 0,
            totalCommission: 0,
            availableCommission: 0,
            totalSales: 0,
            directSales: 0,
            indirectSales: 0,
            distributorSales: 0,
            lastActiveAt: new Date()
        });

        // 返回会员信息（不包含敏感信息）
        const memberInfo = {
            id: member.id,
            openid: member.openid,
            nickname: member.nickname,
            avatar: member.avatar,
            phone: member.phone,
            realName: member.realName,
            gender: member.gender,
            birthday: member.birthday,
            address: member.address,
            memberCode: member.memberCode,
            referrerId: member.referrerId,
            memberLevelId: member.memberLevelId,
            status: member.status,
            totalCommission: member.totalCommission,
            availableCommission: member.availableCommission,
            totalSales: member.totalSales,
            distributorSales: member.distributorSales || 0,
            lastActiveAt: member.lastActiveAt,
            createdAt: member.createdAt,
            createdAt: member.createdAt
        };

        res.json({
            code: 0,
            message: '注册成功',
            data: { member: memberInfo }
        });
    } catch (error) {
        console.error('创建会员失败:', error);
        res.status(500).json({
            code: 1,
            message: '创建会员失败',
            error: error.message
        });
    }
});

// 获取会员信息（小程序端）
router.get('/members/profile', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;

        // 获取会员等级信息
        let memberLevel = null;
        if (member.memberLevelId) {
            memberLevel = await MemberLevel.findByPk(member.memberLevelId);
        }
        
        // 获取分销等级信息
        let distributorLevel = null;
        if (member.distributorLevelId) {
            distributorLevel = await DistributorLevel.findByPk(member.distributorLevelId);
        }

        // 获取团队扩展等级信息
        let teamExpansionLevel = null;
        if (member.teamExpansionLevelId) {
            teamExpansionLevel = await TeamExpansionLevel.findByPk(member.teamExpansionLevelId);
        }

        // 获取推荐人信息
        let referrer = null;
        if (member.referrerId) {
            referrer = await Member.findByPk(member.referrerId, {
                attributes: ['id', 'nickname', 'avatar', 'memberCode']
            });
        }

        // 获取下级会员数量
        const directMembers = await Member.count({
            where: { referrerId: member.id }
        });

        // 获取本月佣金统计
        let monthlyCommission = 0;
        try {
            const currentMonth = new Date();
            currentMonth.setDate(1);
            currentMonth.setHours(0, 0, 0, 0);

            const result = await CommissionCalculation.sum('commissionAmount', {
                where: {
                    recipientId: member.id,
                    status: 'confirmed',
                    createdAt: {
                        [Op.gte]: currentMonth
                    }
                }
            });
            monthlyCommission = result || 0;
        } catch (err) {
            console.error('获取本月佣金统计失败:', err);
            monthlyCommission = 0;
        }

        // 处理会员信息
        const memberInfo = {
            id: member.id,
            openid: member.openid || null,
            nickname: member.nickname || '会员',
            avatar: member.avatar || null,
            phone: member.phone || null,
            realName: member.realName || null,
            idCard: member.idCard ? maskIdCard(member.idCard) : null,
            gender: member.gender || 'unknown',
            genderText: getGenderText(member.gender || 'unknown'),
            birthday: member.birthday || null,
            address: member.address || null,
            memberCode: member.memberCode || null,
            status: member.status || 'active',
            statusText: getStatusText(member.status || 'active'),
            isSharingEarner: memberLevel ? memberLevel.isSharingEarner || false : false,
            isDistributor: member.distributorLevelId ? true : false,
            isNetworkDistributor: member.teamExpansionLevelId ? true : false,
            // 等级信息
            levelName: memberLevel ? (memberLevel.name || '普通会员') : '普通会员',
            memberLevel: memberLevel ? {
                id: memberLevel.id,
                name: memberLevel.name,
                level: memberLevel.level,
                directCommissionRate: memberLevel.directCommissionRate,
                indirectCommissionRate: memberLevel.indirectCommissionRate,
                isSharingEarner: memberLevel.isSharingEarner
            } : null,
            distributorLevel: distributorLevel ? {
                id: distributorLevel.id,
                name: distributorLevel.name,
                level: distributorLevel.level,
                costRate: distributorLevel.costRate,
                directCommissionRate: distributorLevel.directCommissionRate,
                indirectCommissionRate: distributorLevel.indirectCommissionRate
            } : null,
            teamExpansionLevel: teamExpansionLevel ? {
                id: teamExpansionLevel.id,
                name: teamExpansionLevel.name,
                level: teamExpansionLevel.level,
                monthlyIncentiveRate: teamExpansionLevel.monthlyIncentiveRate
            } : null,
            // 推荐人信息
            referrer: referrer ? {
                id: referrer.id,
                nickname: referrer.nickname,
                avatar: referrer.avatar,
                memberCode: referrer.memberCode
            } : null,
            // 佣金信息
            personalDirectCommissionRate: member.personalDirectCommissionRate || 0,
            personalIndirectCommissionRate: member.personalIndirectCommissionRate || 0,
            personalCostRate: member.personalCostRate || 0,
            totalCommission: member.totalCommission || 0,
            availableCommission: member.availableCommission || 0,
            monthlyCommission: monthlyCommission,
            // 订单统计
            totalOrders: member.totalOrders || 0,
            totalAmount: member.totalAmount || 0,
            // 团队统计
            directMembers: directMembers,
            // 时间信息
            lastLoginAt: member.lastLoginAt,
            registeredAt: member.registeredAt,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt
        };

        res.json({
            code: 0,
            message: '获取成功',
            data: { member: memberInfo }
        });
    } catch (error) {
        console.error('获取会员信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取会员信息失败',
            error: error.message
        });
    }
});

// 更新会员信息（小程序端）
router.put('/members/profile', authenticateMiniappUser, async (req, res) => {
    try {
        const {
            nickname,
            avatar,
            phone,
            realName,
            idCard,
            gender,
            birthday,
            address
        } = req.body;

        const member = req.member;
        const updateData = {};

        // 验证和更新字段
        if (nickname !== undefined) {
            if (!nickname || nickname.trim().length === 0) {
                return res.status(400).json({
                    code: 1,
                    message: '昵称不能为空'
                });
            }
            updateData.nickname = nickname.trim();
        }

        if (avatar !== undefined) {
            updateData.avatar = avatar;
        }

        if (phone !== undefined) {
            if (phone && !isValidPhone(phone)) {
                return res.status(400).json({
                    code: 1,
                    message: '手机号格式不正确'
                });
            }
            updateData.phone = phone;
        }

        if (realName !== undefined) {
            updateData.realName = realName;
        }

        if (idCard !== undefined) {
            if (idCard && !isValidIdCard(idCard)) {
                return res.status(400).json({
                    code: 1,
                    message: '身份证号格式不正确'
                });
            }
            updateData.idCard = idCard;
        }

        if (gender !== undefined) {
            if (!['male', 'female', 'unknown'].includes(gender)) {
                return res.status(400).json({
                    code: 1,
                    message: '性别参数不正确'
                });
            }
            updateData.gender = gender;
        }

        if (birthday !== undefined) {
            updateData.birthday = birthday ? new Date(birthday) : null;
        }

        if (address !== undefined) {
            updateData.address = address;
        }

        // 检查手机号是否已被其他用户使用
        if (updateData.phone && updateData.phone !== member.phone) {
            const existingMember = await Member.findOne({
                where: {
                    phone: updateData.phone,
                    id: { [Op.ne]: member.id }
                }
            });

            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '手机号已被其他用户使用'
                });
            }
        }

        // 检查身份证号是否已被其他用户使用
        if (updateData.idCard && updateData.idCard !== member.idCard) {
            const existingMember = await Member.findOne({
                where: {
                    idCard: updateData.idCard,
                    id: { [Op.ne]: member.id }
                }
            });

            if (existingMember) {
                return res.status(400).json({
                    code: 1,
                    message: '身份证号已被其他用户使用'
                });
            }
        }

        // 更新会员信息
        await member.update(updateData);

        // 返回更新后的会员信息
        const updatedMember = await Member.findByPk(member.id, {
            attributes: [
                'id', 'openid', 'nickname', 'avatar', 'phone', 'realName',
                'idCard', 'gender', 'birthday', 'address', 'memberCode',
                'status', 'totalCommission', 'availableCommission',
                'totalSales', 'directSales', 'indirectSales', 'distributorSales', 'lastActiveAt',
                'createdAt', 'updatedAt'
            ]
        });

        res.json({
            code: 0,
            message: '更新成功',
            data: { member: updatedMember }
        });
    } catch (error) {
        console.error('更新会员信息失败:', error);
        res.status(500).json({
            code: 1,
            message: '更新会员信息失败',
            error: error.message
        });
    }
});

// 获取下级会员列表（小程序端）
router.get('/members/team', authenticateMiniappUser, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            level = 'direct', // direct: 直接下级, all: 所有下级
            startDate = '',
            endDate = ''
        } = req.query;

        const member = req.member;
        const offset = (page - 1) * limit;

        let where = { referrerId: member.id };

        // 日期筛选
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)]
            };
        }

        // 如果查询所有下级，需要递归查找
        if (level === 'all') {
            const allSubMemberIds = await getAllSubMemberIds(member.id);
            where = {
                id: { [Op.in]: allSubMemberIds },
                ...(startDate && endDate ? {
                    createdAt: {
                        [Op.between]: [new Date(startDate), new Date(endDate)]
                    }
                } : {})
            };
        }

        const { count, rows } = await Member.findAndCountAll({
            where,
            include: [
                { 
                    model: MemberLevel, 
                    as: 'memberLevel',
                    attributes: ['id', 'name', 'level', 'directCommissionRate', 'indirectCommissionRate', 'isSharingEarner']
                }
            ],
            attributes: [
                'id', 'nickname', 'avatar', 'phone', 'realName', 'gender',
                'memberCode', 'status', 'totalCommission',
                'totalSales', 'createdAt', 'lastActiveAt', 'distributorLevelId'
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // 处理会员数据
        const members = rows.map(member => ({
            id: member.id,
            nickname: member.nickname,
            avatar: member.avatar,
            phone: member.phone ? maskPhone(member.phone) : null,
            realName: member.realName,
            gender: member.gender,
            genderText: getGenderText(member.gender),
            memberCode: member.memberCode,
            status: member.status,
            statusText: getStatusText(member.status),
            isSharingEarner: member.memberLevel ? member.memberLevel.isSharingEarner : false,
            memberLevel: member.memberLevel ? {
                id: member.memberLevel.id,
                name: member.memberLevel.name,
                level: member.memberLevel.level
            } : null,
            distributorLevelId: member.distributorLevelId,
            totalCommission: member.totalCommission,
            totalSales: member.totalSales,
            distributorSales: member.distributorSales || 0,
            createdAt: member.createdAt,
            lastActiveAt: member.lastActiveAt
        }));

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                members,
                total: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                hasMore: parseInt(page) < Math.ceil(count / limit)
            }
        });
    } catch (error) {
        console.error('获取下级会员列表失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取下级会员列表失败',
            error: error.message
        });
    }
});

// 获取会员统计（小程序端）
router.get('/members/stats', authenticateMiniappUser, async (req, res) => {
    try {
        const member = req.member;

        // 获取直接下级数量
        const directMembers = await Member.count({
            where: { referrerId: member.id }
        });

        // 获取所有下级数量
        const allSubMemberIds = await getAllSubMemberIds(member.id);
        const totalMembers = allSubMemberIds.length;

        // 获取本月新增下级数量
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);

        const monthlyNewMembers = await Member.count({
            where: {
                referrerId: member.id,
                createdAt: {
                    [Op.gte]: currentMonth
                }
            }
        });

        // 获取本月佣金统计
        const monthlyCommission = await CommissionCalculation.sum('commissionAmount', {
            where: {
                recipientId: member.id,
                status: 'confirmed',
                createdAt: {
                    [Op.gte]: currentMonth
                }
            }
        }) || 0;

        // 获取团队总销售额
        const teamTotalSales = await Member.sum('totalSales', {
            where: {
                id: { [Op.in]: allSubMemberIds }
            }
        }) || 0;

        // 获取会员等级信息
        const memberWithLevels = await Member.findByPk(member.id, {
            include: [
                { model: MemberLevel, as: 'memberLevel', attributes: ['id', 'name', 'level'] },
                { model: DistributorLevel, as: 'distributorLevel', attributes: ['id', 'name', 'level'] }
            ]
        });

        res.json({
            code: 0,
            message: '获取成功',
            data: {
                directMembers,
                totalMembers,
                monthlyNewMembers,
                monthlyCommission,
                teamTotalSales,
                totalCommission: member.totalCommission || 0,
                availableCommission: member.availableCommission || 0,
                totalSales: member.totalSales || 0,
                directSales: member.directSales || 0,
                indirectSales: member.indirectSales || 0,
                distributorSales: member.distributorSales || 0,
                memberLevel: memberWithLevels && memberWithLevels.memberLevel ? {
                    id: memberWithLevels.memberLevel.id,
                    name: memberWithLevels.memberLevel.name,
                    level: memberWithLevels.memberLevel.level
                } : null,
                distributorLevel: memberWithLevels && memberWithLevels.distributorLevel ? {
                    id: memberWithLevels.distributorLevel.id,
                    name: memberWithLevels.distributorLevel.name,
                    level: memberWithLevels.distributorLevel.level
                } : null
            }
        });
    } catch (error) {
        console.error('获取会员统计失败:', error);
        res.status(500).json({
            code: 1,
            message: '获取会员统计失败',
            error: error.message
        });
    }
});

// 验证推荐码（小程序端）
router.get('/members/verify-referral', async (req, res) => {
    try {
        const { referralCode } = req.query;

        if (!referralCode) {
            return res.status(400).json({
                code: 1,
                message: '请提供推荐码'
            });
        }

        const referrer = await Member.findOne({
            where: { 
                memberCode: referralCode,
                status: 'active'
            },
            attributes: ['id', 'nickname', 'avatar', 'memberCode']
        });

        if (!referrer) {
            return res.status(404).json({
                code: 1,
                message: '推荐码不存在或已失效'
            });
        }

        res.json({
            code: 0,
            message: '推荐码有效',
            data: {
                referrer: {
                    id: referrer.id,
                    nickname: referrer.nickname,
                    avatar: referrer.avatar,
                    memberCode: referrer.memberCode
                }
            }
        });
    } catch (error) {
        console.error('验证推荐码失败:', error);
        res.status(500).json({
            code: 1,
            message: '验证推荐码失败',
            error: error.message
        });
    }
});

// 辅助函数
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function isValidPhone(phone) {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
}

function isValidIdCard(idCard) {
    const idCardRegex = /^[1-9]\d{5}(18|19|20)\d{2}((0[1-9])|(1[0-2]))(([0-2][1-9])|10|20|30|31)\d{3}[0-9Xx]$/;
    return idCardRegex.test(idCard);
}

function maskPhone(phone) {
    if (!phone) return null;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function maskIdCard(idCard) {
    if (!idCard) return null;
    return idCard.replace(/(\d{6})\d{8}(\d{4})/, '$1********$2');
}

function getGenderText(gender) {
    const genderMap = {
        'male': '男',
        'female': '女',
        'unknown': '未知'
    };
    return genderMap[gender] || '未知';
}

function getStatusText(status) {
    const statusMap = {
        'active': '正常',
        'inactive': '禁用',
        'pending': '待审核'
    };
    return statusMap[status] || status;
}

async function getAllSubMemberIds(memberId) {
    const subMemberIds = [];
    const directMembers = await Member.findAll({
        where: { referrerId: memberId },
        attributes: ['id']
    });

    for (const member of directMembers) {
        subMemberIds.push(member.id);
        const subSubMemberIds = await getAllSubMemberIds(member.id);
        subMemberIds.push(...subSubMemberIds);
    }

    return subMemberIds;
}

module.exports = router;