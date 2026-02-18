const { Op } = require('sequelize');
const {
    sequelize,
    Member,
    Order,
    MemberLevel,
    DistributorLevel,
    TeamExpansionLevel,
    CommissionCalculation,
    TeamIncentiveCalculation
} = require('../db');

class CommissionService {
    /**
     * 计算订单佣金
     * @param {number} orderId - 订单ID
     */
    static async calculateOrderCommission(orderId) {
        try {
            // 获取订单信息
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: Member, as: 'member', include: [
                        { model: MemberLevel, as: 'memberLevel' },
                        { model: DistributorLevel, as: 'distributorLevel' }
                    ]}
                ]
            });

            if (!order) {
                throw new Error('订单不存在');
            }

            const member = order.member;
            const orderAmount = parseFloat(order.totalAmount);

            console.log(`[佣金] 订单 orderId=${orderId} 下单会员 memberId=${member.id} referrerId=${member.referrerId} 订单金额=${orderAmount}`);

            // 未设置推荐人
            if (member.referrerId == null || member.referrerId === '') {
                console.log(`[佣金] 跳过：会员 ${member.id} 未设置推荐人`);
                return { calculations: [], noReferrer: true };
            }

            // 获取推荐人信息
            const referrer = await this.getReferrerWithLevels(member.referrerId);
            if (!referrer) {
                console.log(`[佣金] 跳过：推荐人 ID ${member.referrerId} 不存在或已删除`);
                return { calculations: [], referrerNotFound: true };
            }

            const ml = referrer.memberLevel;
            const dl = referrer.distributorLevel;
            const sharerDirect = dl ? parseFloat(dl.sharerDirectCommissionRate) : 0;
            const sharerIndirect = dl ? parseFloat(dl.sharerIndirectCommissionRate) : 0;
            console.log(`[佣金] 推荐人 referrerId=${referrer.id} 会员等级=${ml ? ml.name : '无'} isSharingEarner=${!!(ml && ml.isSharingEarner)} 分销等级=${dl ? dl.name : '无'} sharerDirectRate=${sharerDirect} sharerIndirectRate=${sharerIndirect}`);

            const calculations = [];

            // 1. 计算直接佣金（会员等级「分享赚钱」或 分销等级 的分享直接佣金率 > 0 均可）
            const canDirect = (ml && ml.isSharingEarner) || (dl && sharerDirect > 0);
            console.log(`[佣金] 直接佣金 条件满足=${canDirect} (会员等级分享赚钱=${!!(ml && ml.isSharingEarner)} 或 分销分享直接率>0=${sharerDirect > 0})`);
            if (canDirect) {
                const directCommission = await this.calculateDirectCommission(
                    orderId, member.id, referrer.id, orderAmount, referrer
                );
                if (directCommission) {
                    calculations.push(directCommission);
                    console.log(`[佣金] 直接佣金 已生成 比例=${directCommission.commissionRate}% 金额=${directCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 直接佣金 未生成（比例<=0或计算为0）`);
                }
            }

            // 2. 计算间接佣金（同上：会员等级分享赚钱或分销等级分享间接佣金率 > 0）
            const indirectReferrer = await this.getReferrerWithLevels(referrer.referrerId);
            const indirectMl = indirectReferrer && indirectReferrer.memberLevel;
            const indirectDl = indirectReferrer && indirectReferrer.distributorLevel;
            const indirectSharerInd = indirectDl ? parseFloat(indirectDl.sharerIndirectCommissionRate) : 0;
            const canIndirect = indirectReferrer &&
                ((indirectMl && indirectMl.isSharingEarner) || (indirectDl && indirectSharerInd > 0));
            console.log(`[佣金] 间接佣金 有间接推荐人=${!!indirectReferrer} 条件满足=${canIndirect} (分享赚钱=${!!(indirectMl && indirectMl.isSharingEarner)} 或 分销分享间接率>0=${indirectSharerInd > 0})`);
            if (canIndirect) {
                const indirectCommission = await this.calculateIndirectCommission(
                    orderId, member.id, indirectReferrer.id, orderAmount, indirectReferrer
                );
                if (indirectCommission) {
                    calculations.push(indirectCommission);
                    console.log(`[佣金] 间接佣金 已生成 比例=${indirectCommission.commissionRate}% 金额=${indirectCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 间接佣金 未生成（比例<=0或计算为0）`);
                }
            }

            // 3. 计算分销商佣金
            const hasDistributorLevel = !!referrer.distributorLevel;
            console.log(`[佣金] 分销商佣金 有分销等级=${hasDistributorLevel}`);
            if (hasDistributorLevel) {
                const distributorCommission = await this.calculateDistributorCommission(
                    orderId, member.id, referrer.id, orderAmount, referrer
                );
                if (distributorCommission) {
                    calculations.push(distributorCommission);
                    console.log(`[佣金] 分销商佣金 已生成 costRate=${distributorCommission.costRate}% 金额=${distributorCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 分销商佣金 未生成（costRate<=0）`);
                }
            }

            // 4. 计算网络分销商佣金（仅当推荐人本人不是分销商时：推荐人网络中的最近分销商才与「分销商佣金」不同，否则会与第3步重复）
            if (!referrer.distributorLevel) {
                const networkDistributorCommission = await this.calculateNetworkDistributorCommission(
                    orderId, member.id, referrer.id, orderAmount, referrer
                );
                if (networkDistributorCommission) {
                    calculations.push(networkDistributorCommission);
                    console.log(`[佣金] 网络分销商佣金 已生成 金额=${networkDistributorCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 网络分销商佣金 未生成`);
                }
            } else {
                console.log(`[佣金] 网络分销商佣金 跳过（推荐人已是分销商，已计分销商佣金，避免重复）`);
            }

            // 保存所有佣金记录
            if (calculations.length > 0) {
                await CommissionCalculation.bulkCreate(calculations);
                console.log(`[佣金] 订单 ${orderId} 完成 共 ${calculations.length} 条记录`);
            } else {
                console.log(`[佣金] 订单 ${orderId} 无任何佣金记录生成（推荐人存在但各类型均未满足或比例为0）`);
            }
            return { calculations, noReferrer: false, referrerNotFound: false };

        } catch (error) {
            console.error('计算订单佣金失败:', error);
            throw error;
        }
    }

    /**
     * 获取推荐人及其等级信息
     */
    static async getReferrerWithLevels(referrerId) {
        if (!referrerId) return null;

        return await Member.findByPk(referrerId, {
            include: [
                { model: MemberLevel, as: 'memberLevel' },
                { model: DistributorLevel, as: 'distributorLevel' }
            ]
        });
    }

    /**
     * 计算直接佣金（比例 0-100。来源：个人 > 会员等级直接佣金 > 分销等级分享直接佣金率*100）
     */
    static async calculateDirectCommission(orderId, memberId, referrerId, orderAmount, referrer) {
        let commissionRate = referrer.personalDirectCommissionRate;
        let rateSource = 'personal';
        if (commissionRate == null || commissionRate <= 0) {
            if (referrer.memberLevel && referrer.memberLevel.isSharingEarner) {
                commissionRate = referrer.memberLevel.directCommissionRate;
                rateSource = 'memberLevel';
            } else if (referrer.distributorLevel && referrer.distributorLevel.sharerDirectCommissionRate != null) {
                commissionRate = parseFloat(referrer.distributorLevel.sharerDirectCommissionRate) * 100;
                rateSource = 'distributorLevel.sharerDirect';
            }
        }
        if (commissionRate == null || commissionRate <= 0) {
            console.log(`[佣金] 直接佣金 比例无效 rate=${commissionRate} source=${rateSource}`);
            return null;
        }
        console.log(`[佣金] 直接佣金 使用比例 source=${rateSource} rate=${commissionRate}%`);

        const commissionAmount = (orderAmount * commissionRate / 100).toFixed(2);

        return {
            orderId,
            memberId,
            referrerId,
            commissionType: 'direct',
            recipientId: referrerId,
            orderAmount,
            commissionRate,
            commissionAmount: parseFloat(commissionAmount),
            status: 'pending',
            description: `直接佣金：推荐人 ${referrer.nickname} 获得 ${commissionRate}% 佣金`
        };
    }

    /**
     * 计算间接佣金（比例 0-100。来源：个人 > 会员等级间接佣金 > 分销等级分享间接佣金率*100）
     */
    static async calculateIndirectCommission(orderId, memberId, indirectReferrerId, orderAmount, indirectReferrer) {
        let commissionRate = indirectReferrer.personalIndirectCommissionRate;
        let rateSource = 'personal';
        if (commissionRate == null || commissionRate <= 0) {
            if (indirectReferrer.memberLevel && indirectReferrer.memberLevel.isSharingEarner) {
                commissionRate = indirectReferrer.memberLevel.indirectCommissionRate;
                rateSource = 'memberLevel';
            } else if (indirectReferrer.distributorLevel && indirectReferrer.distributorLevel.sharerIndirectCommissionRate != null) {
                commissionRate = parseFloat(indirectReferrer.distributorLevel.sharerIndirectCommissionRate) * 100;
                rateSource = 'distributorLevel.sharerIndirect';
            }
        }
        if (commissionRate == null || commissionRate <= 0) {
            console.log(`[佣金] 间接佣金 比例无效 rate=${commissionRate} source=${rateSource}`);
            return null;
        }
        console.log(`[佣金] 间接佣金 使用比例 source=${rateSource} rate=${commissionRate}%`);

        const commissionAmount = (orderAmount * commissionRate / 100).toFixed(2);

        return {
            orderId,
            memberId,
            referrerId: indirectReferrerId,
            commissionType: 'indirect',
            recipientId: indirectReferrerId,
            orderAmount,
            commissionRate,
            commissionAmount: parseFloat(commissionAmount),
            status: 'pending',
            description: `间接佣金：推荐人的推荐人 ${indirectReferrer.nickname} 获得 ${commissionRate}% 佣金`
        };
    }

    /**
     * 从分销等级取成本率（0-100）。优先 costRate，若为 0 或未设则用 procurementCost（0-1）* 100
     */
    static getDistributorCostRate(distributorLevel) {
        if (!distributorLevel) return 0;
        const cr = distributorLevel.costRate;
        if (cr != null && parseFloat(cr) > 0) return parseFloat(cr);
        const pc = distributorLevel.procurementCost;
        if (pc != null && parseFloat(pc) > 0) return parseFloat(pc) * 100;
        return 0;
    }

    /**
     * 计算分销商佣金
     */
    static async calculateDistributorCommission(orderId, memberId, referrerId, orderAmount, referrer) {
        const costRate = referrer.personalCostRate ||
                        (referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0);

        if (costRate <= 0) return null;
        const dl = referrer.distributorLevel;
        if (dl && (dl.costRate == null || parseFloat(dl.costRate) <= 0) && dl.procurementCost > 0) {
            console.log(`[佣金] 分销商佣金 使用 procurementCost 回退 等级=${dl.name} procurementCost=${dl.procurementCost} => costRate=${costRate}%`);
        }

        const costAmount = (orderAmount * costRate / 100).toFixed(2);
        const commissionAmount = (orderAmount - parseFloat(costAmount)).toFixed(2);

        return {
            orderId,
            memberId,
            referrerId,
            commissionType: 'distributor',
            recipientId: referrerId,
            orderAmount,
            commissionRate: costRate,
            commissionAmount: parseFloat(commissionAmount),
            costRate,
            costAmount: parseFloat(costAmount),
            status: 'pending',
            description: `分销商佣金：分销商 ${referrer.nickname} 按 ${costRate}% 成本计算`
        };
    }

    /**
     * 计算网络分销商佣金
     */
    static async calculateNetworkDistributorCommission(orderId, memberId, referrerId, orderAmount, referrer) {
        // 查找推荐人网络中最近的分销商
        const networkDistributor = await this.findNearestDistributorInNetwork(referrerId);
        
        if (!networkDistributor) return null;

        // 查找网络中的其他分销商
        const otherDistributors = await this.findOtherDistributorsInNetwork(referrerId, networkDistributor.id);
        
        if (otherDistributors.length === 0) {
            // 只有一个分销商，按提货成本计算
            const costRate = networkDistributor.personalCostRate ||
                           (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            if (costRate <= 0) return null;

            const costAmount = (orderAmount * costRate / 100).toFixed(2);
            const commissionAmount = (orderAmount - parseFloat(costAmount)).toFixed(2);

            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount,
                commissionRate: costRate,
                commissionAmount: parseFloat(commissionAmount),
                costRate,
                costAmount: parseFloat(costAmount),
                status: 'pending',
                description: `网络分销商佣金：分销商 ${networkDistributor.nickname} 按 ${costRate}% 成本计算`
            };
        } else {
            // 多个分销商，按成本差计算
            const nearestCostRate = networkDistributor.personalCostRate ||
                                  (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            let maxCostRate = 0;
            for (const distributor of otherDistributors) {
                const costRate = distributor.personalCostRate ||
                               (distributor.distributorLevel ? this.getDistributorCostRate(distributor.distributorLevel) : 0);
                if (costRate > maxCostRate) {
                    maxCostRate = costRate;
                }
            }

            const costDifference = nearestCostRate - maxCostRate;
            if (costDifference <= 0) return null; // 差值为负数，无佣金

            const commissionAmount = (orderAmount * costDifference / 100).toFixed(2);

            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount,
                commissionRate: costDifference,
                commissionAmount: parseFloat(commissionAmount),
                status: 'pending',
                description: `网络分销商佣金：按成本差 ${costDifference}% 计算`
            };
        }
    }

    /**
     * 查找推荐人网络中最近的分销商
     */
    static async findNearestDistributorInNetwork(referrerId) {
        let currentId = referrerId;
        
        while (currentId) {
            const member = await Member.findByPk(currentId, {
                include: [{ model: DistributorLevel, as: 'distributorLevel' }]
            });
            
            if (member && member.distributorLevel) {
                return member;
            }
            
            currentId = member ? member.referrerId : null;
        }
        
        return null;
    }

    /**
     * 查找网络中的其他分销商
     */
    static async findOtherDistributorsInNetwork(referrerId, excludeId) {
        // 这里需要实现网络遍历逻辑，查找所有分销商
        // 简化实现：查找推荐人路径中的所有分销商
        const distributors = [];
        let currentId = referrerId;
        
        while (currentId) {
            if (currentId !== excludeId) {
                const member = await Member.findByPk(currentId, {
                    include: [{ model: DistributorLevel, as: 'distributorLevel' }]
                });
                
                if (member && member.distributorLevel) {
                    distributors.push(member);
                }
            }
            
            const member = await Member.findByPk(currentId);
            currentId = member ? member.referrerId : null;
        }
        
        return distributors;
    }

    /**
     * 计算团队拓展激励佣金（按月计算）
     */
    static async calculateTeamIncentiveCommission(month) {
        try {
            const startDate = new Date(month + '-01');
            const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
            
            // 获取所有分销商
            const distributors = await Member.findAll({
                where: {
                    distributorLevelId: { [Op.ne]: null }
                },
                include: [
                    { model: DistributorLevel, as: 'distributorLevel' },
                    { model: TeamExpansionLevel, as: 'teamExpansionLevel' }
                ]
            });

            const calculations = [];

            for (const distributor of distributors) {
                // 计算当月销售额
                const monthlySales = await this.calculateMonthlySales(distributor.id, startDate, endDate);
                
                if (monthlySales <= 0) continue;

                // 获取推荐人
                const referrer = await this.getReferrerWithLevels(distributor.referrerId);
                if (!referrer) continue;

                // 获取团队拓展激励等级设置
                const teamLevel = referrer.teamExpansionLevel;
                if (!teamLevel) continue;

                // 检查销售额是否在激励基数范围内
                if (monthlySales < teamLevel.minIncentiveBase || 
                    (teamLevel.maxIncentiveBase && monthlySales > teamLevel.maxIncentiveBase)) {
                    continue;
                }

                const incentiveAmount = (monthlySales * teamLevel.incentiveRate / 100).toFixed(2);

                calculations.push({
                    distributorId: distributor.id,
                    referrerId: referrer.id,
                    calculationMonth: month,
                    monthlySales,
                    incentiveBase: teamLevel.minIncentiveBase,
                    incentiveRate: teamLevel.incentiveRate,
                    incentiveAmount: parseFloat(incentiveAmount),
                    status: 'pending',
                    description: `团队拓展激励：${month} 月销售额 ${monthlySales} 元，激励比例 ${teamLevel.incentiveRate}%`
                });
            }

            // 保存团队拓展激励计算记录
            if (calculations.length > 0) {
                await TeamIncentiveCalculation.bulkCreate(calculations);
                console.log(`${month} 月团队拓展激励计算完成，共 ${calculations.length} 条记录`);
            }

            return calculations;

        } catch (error) {
            console.error('计算团队拓展激励失败:', error);
            throw error;
        }
    }

    /**
     * 计算会员当月销售额
     */
    static async calculateMonthlySales(memberId, startDate, endDate) {
        const result = await Order.findOne({
            where: {
                memberId,
                status: 'paid',
                createdAt: {
                    [Op.between]: [startDate, endDate]
                }
            },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales']
            ],
            raw: true
        });

        return parseFloat(result.totalSales) || 0;
    }

    /**
     * 确认佣金计算
     */
    static async confirmCommission(calculationId) {
        const calculation = await CommissionCalculation.findByPk(calculationId);
        if (!calculation) {
            throw new Error('佣金计算记录不存在');
        }

        await calculation.update({ status: 'confirmed' });

        // 更新会员佣金余额
        const member = await Member.findByPk(calculation.recipientId);
        if (member) {
            await member.increment('availableCommission', { by: calculation.commissionAmount });
            await member.increment('totalCommission', { by: calculation.commissionAmount });
        }

        return calculation;
    }

    /**
     * 取消佣金计算
     */
    static async cancelCommission(calculationId) {
        const calculation = await CommissionCalculation.findByPk(calculationId);
        if (!calculation) {
            throw new Error('佣金计算记录不存在');
        }

        await calculation.update({ status: 'cancelled' });
        return calculation;
    }
}

module.exports = CommissionService;