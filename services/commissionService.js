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

            // 2. 计算间接佣金（有间接推荐人即可；比例优先用间接推荐人自己的，若无则用直接推荐人等级的 sharerIndirectRate）
            const indirectReferrer = await this.getReferrerWithLevels(referrer.referrerId);
            const indirectMl = indirectReferrer && indirectReferrer.memberLevel;
            const indirectDl = indirectReferrer && indirectReferrer.distributorLevel;
            const indirectSharerInd = indirectDl ? parseFloat(indirectDl.sharerIndirectCommissionRate) : 0;
            const directHasIndirectRate = dl && sharerIndirect > 0;
            const canIndirect = indirectReferrer &&
                ((indirectMl && indirectMl.isSharingEarner) || (indirectDl && indirectSharerInd > 0) || directHasIndirectRate);
            console.log(`[佣金] 间接佣金 有间接推荐人=${!!indirectReferrer} 条件满足=${canIndirect} (间接方分享/间接率 或 直接方sharerIndirect=${sharerIndirect})`);
            if (canIndirect) {
                const indirectCommission = await this.calculateIndirectCommission(
                    orderId, member.id, indirectReferrer.id, orderAmount, indirectReferrer, referrer
                );
                if (indirectCommission) {
                    calculations.push(indirectCommission);
                    console.log(`[佣金] 间接佣金 已生成 比例=${indirectCommission.commissionRate}% 金额=${indirectCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 间接佣金 未生成（比例<=0或计算为0）`);
                }
            }

            // 直接/间接佣金金额（用于第一级分销商“毛利佣金”中扣减）
            const directAmount = calculations.find(c => c.commissionType === 'direct')?.commissionAmount ?? 0;
            const indirectAmount = calculations.find(c => c.commissionType === 'indirect')?.commissionAmount ?? 0;
            console.log(`[佣金] 直接/间接金额 订单=${orderAmount} 直接=${directAmount} 间接=${indirectAmount}`);

            // 3. 计算分销商佣金（同一订单基数：分销毛利佣金 - 直接 - 间接）
            const hasDistributorLevel = !!referrer.distributorLevel;
            console.log(`[佣金] 分销商佣金 有分销等级=${hasDistributorLevel}`);
            if (hasDistributorLevel) {
                const distributorCommission = await this.calculateDistributorCommission(
                    orderId, member.id, referrer.id, orderAmount, referrer, directAmount, indirectAmount
                );
                if (distributorCommission) {
                    calculations.push(distributorCommission);
                    console.log(`[佣金] 分销商佣金 已生成 costRate=${distributorCommission.costRate}% 金额=${distributorCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 分销商佣金 未生成（costRate<=0）`);
                }
            }

            // 4. 网络分销商 / 上级分销商级差
            const referrerCostRate = referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0;
            if (!referrer.distributorLevel) {
                const networkDistributorCommission = await this.calculateNetworkDistributorCommission(
                    orderId, member.id, referrer.id, orderAmount, referrer, directAmount, indirectAmount
                );
                if (networkDistributorCommission) {
                    calculations.push(networkDistributorCommission);
                    console.log(`[佣金] 网络分销商佣金 已生成 金额=${networkDistributorCommission.commissionAmount}`);
                } else {
                    console.log(`[佣金] 网络分销商佣金 未生成`);
                }
            } else if (referrerCostRate > 0) {
                console.log(`[佣金] 网络分销商佣金 跳过（推荐人已是成本分销商，已计分销商佣金，避免重复）`);
                // 4b. 推荐人本人有成本率：为上级链上的分销商计算级差
                const uplineDistributors = await this.findOtherDistributorsInNetwork(referrer.id, referrer.id);
                let downstreamCostRate = referrerCostRate;
                for (const upline of uplineDistributors) {
                    const uplineCostRate = this.getDistributorCostRate(upline.distributorLevel);
                    const diffRate = downstreamCostRate - uplineCostRate;
                    if (diffRate > 0) {
                        const commissionAmount = (orderAmount * diffRate / 100).toFixed(2);
                        calculations.push({
                            orderId,
                            memberId: member.id,
                            referrerId: referrer.id,
                            commissionType: 'network_distributor',
                            recipientId: upline.id,
                            orderAmount,
                            commissionRate: diffRate,
                            commissionAmount: parseFloat(commissionAmount),
                            status: 'pending',
                            description: `级差分销佣金：${upline.nickname} 级差 ${diffRate}%（下游${downstreamCostRate}% - 本等级${uplineCostRate}%）`
                        });
                        console.log(`[佣金] 级差分销佣金 已生成 recipientId=${upline.id} 级差=${diffRate}% 金额=${commissionAmount}`);
                    }
                    downstreamCostRate = uplineCostRate;
                }
            } else {
                // 4c. 推荐人有分销等级但成本率为 0（分享模式）：从推荐人上家链找第一个有成本率的分销商，给其「分销佣金」+ 再往上算级差
                console.log(`[佣金] 推荐人为分享模式(costRate=0)，向上查找有成本率的分销商`);
                const nearestCost = await this.findNearestCostDistributorInNetwork(referrer.id);
                if (nearestCost) {
                    const costRate = this.getDistributorCostRate(nearestCost.distributorLevel);
                    const costAmount = (orderAmount * costRate / 100).toFixed(2);
                    const grossCommissionAmount = (orderAmount - parseFloat(costAmount)).toFixed(2);
                    const commissionAmount = Math.max(
                        0,
                        parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
                    ).toFixed(2);
                    calculations.push({
                        orderId,
                        memberId: member.id,
                        referrerId: referrer.id,
                        commissionType: 'distributor',
                        recipientId: nearestCost.id,
                        orderAmount,
                        commissionRate: costRate,
                        commissionAmount: parseFloat(commissionAmount),
                        costRate,
                        costAmount: parseFloat(costAmount),
                        status: 'pending',
                        description: `分销佣金（同一订单基数按差额：毛利佣金-直接-间接）：${nearestCost.nickname} 按 ${costRate}% 成本计算`
                    });
                    console.log(`[佣金] 分销佣金 已生成(上家首个成本分销商，毛利-直-间) recipientId=${nearestCost.id} costRate=${costRate}% 金额=${commissionAmount}`);
                    const uplineDistributors = await this.findOtherDistributorsInNetwork(nearestCost.id, nearestCost.id);
                    let downstreamCostRate = costRate;
                    for (const upline of uplineDistributors) {
                        const uplineCostRate = this.getDistributorCostRate(upline.distributorLevel);
                        const diffRate = downstreamCostRate - uplineCostRate;
                        if (diffRate > 0) {
                            const diffAmount = (orderAmount * diffRate / 100).toFixed(2);
                            calculations.push({
                                orderId,
                                memberId: member.id,
                                referrerId: referrer.id,
                                commissionType: 'network_distributor',
                                recipientId: upline.id,
                                orderAmount,
                                commissionRate: diffRate,
                                commissionAmount: parseFloat(diffAmount),
                                status: 'pending',
                                description: `级差分销佣金：${upline.nickname} 级差 ${diffRate}%（下游${downstreamCostRate}% - 本等级${uplineCostRate}%）`
                            });
                            console.log(`[佣金] 级差分销佣金 已生成 recipientId=${upline.id} 级差=${diffRate}% 金额=${diffAmount}`);
                        }
                        downstreamCostRate = uplineCostRate;
                    }
                } else {
                    console.log(`[佣金] 推荐人上家链中无有成本率的分销商`);
                }
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
     * 计算间接佣金（比例 0-100。来源：间接推荐人个人/等级 > 直接推荐人等级的 sharerIndirectCommissionRate*100）
     * @param {object} [directReferrer] - 直接推荐人，当其等级有间接率而间接推荐人无比例时使用
     */
    static async calculateIndirectCommission(orderId, memberId, indirectReferrerId, orderAmount, indirectReferrer, directReferrer) {
        let commissionRate = indirectReferrer.personalIndirectCommissionRate;
        let rateSource = 'personal';
        if (commissionRate == null || commissionRate <= 0) {
            if (indirectReferrer.memberLevel && indirectReferrer.memberLevel.isSharingEarner) {
                commissionRate = indirectReferrer.memberLevel.indirectCommissionRate;
                rateSource = 'memberLevel';
            } else if (indirectReferrer.distributorLevel && indirectReferrer.distributorLevel.sharerIndirectCommissionRate != null) {
                commissionRate = parseFloat(indirectReferrer.distributorLevel.sharerIndirectCommissionRate) * 100;
                rateSource = 'distributorLevel.sharerIndirect';
            } else if (directReferrer && directReferrer.distributorLevel && directReferrer.distributorLevel.sharerIndirectCommissionRate != null) {
                const r = parseFloat(directReferrer.distributorLevel.sharerIndirectCommissionRate);
                if (r > 0) {
                    commissionRate = r * 100;
                    rateSource = 'directReferrer.sharerIndirect';
                }
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
     * 计算分销商佣金（同一订单基数按差额：分销毛利佣金 - 直接 - 间接）
     * @param {number} orderAmount - 原始订单金额
     * @param {number} directAmount - 直接佣金金额（不存在则为 0）
     * @param {number} indirectAmount - 间接佣金金额（不存在则为 0）
     */
    static async calculateDistributorCommission(orderId, memberId, referrerId, orderAmount, referrer, directAmount = 0, indirectAmount = 0) {
        const costRate = referrer.personalCostRate ||
                        (referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0);

        if (costRate <= 0) return null;
        const dl = referrer.distributorLevel;
        if (dl && (dl.costRate == null || parseFloat(dl.costRate) <= 0) && dl.procurementCost > 0) {
            console.log(`[佣金] 分销商佣金 使用 procurementCost 回退 等级=${dl.name} procurementCost=${dl.procurementCost} => costRate=${costRate}%`);
        }

        const costAmount = (orderAmount * costRate / 100).toFixed(2);
        const grossCommissionAmount = (orderAmount - parseFloat(costAmount)).toFixed(2);
        const commissionAmount = Math.max(
            0,
            parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
        ).toFixed(2);

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
            description: `分销佣金（同一订单基数按差额：毛利佣金-直接-间接）：${referrer.nickname} 按 ${costRate}% 成本计算`
        };
    }

    /**
     * 计算网络分销商佣金（同一订单基数按差额：分销毛利佣金 - 直接 - 间接）
     */
    static async calculateNetworkDistributorCommission(orderId, memberId, referrerId, orderAmount, referrer, directAmount = 0, indirectAmount = 0) {
        const networkDistributor = await this.findNearestDistributorInNetwork(referrerId);
        
        if (!networkDistributor) return null;

        const otherDistributors = await this.findOtherDistributorsInNetwork(referrerId, networkDistributor.id);
        
        if (otherDistributors.length === 0) {
            const costRate = networkDistributor.personalCostRate ||
                           (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            if (costRate <= 0) return null;

            const costAmount = (orderAmount * costRate / 100).toFixed(2);
            const grossCommissionAmount = (orderAmount - parseFloat(costAmount)).toFixed(2);
            const commissionAmount = Math.max(
                0,
                parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
            ).toFixed(2);

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
                description: `网络分销商佣金（同一订单基数按差额：毛利佣金-直接-间接）：${networkDistributor.nickname} 按 ${costRate}% 成本计算`
            };
        } else {
            const nearestCostRate = networkDistributor.personalCostRate ||
                                  (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            let maxCostRate = 0;
            for (const distributor of otherDistributors) {
                const cr = distributor.personalCostRate ||
                               (distributor.distributorLevel ? this.getDistributorCostRate(distributor.distributorLevel) : 0);
                if (cr > maxCostRate) maxCostRate = cr;
            }

            const costDifference = nearestCostRate - maxCostRate;
            if (costDifference <= 0) return null;

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
     * 查找推荐人网络中最近的分销商（任意有分销等级的）
     */
    static async findNearestDistributorInNetwork(referrerId) {
        let currentId = referrerId;
        while (currentId) {
            const member = await Member.findByPk(currentId, {
                include: [{ model: DistributorLevel, as: 'distributorLevel' }]
            });
            if (member && member.distributorLevel) return member;
            currentId = member ? member.referrerId : null;
        }
        return null;
    }

    /**
     * 从 referrerId 开始向上找第一个「有成本率」的分销商（用于推荐人本人是分享模式、成本率为 0 时）
     */
    static async findNearestCostDistributorInNetwork(referrerId) {
        let currentId = referrerId;
        while (currentId) {
            const member = await Member.findByPk(currentId, {
                include: [{ model: DistributorLevel, as: 'distributorLevel' }]
            });
            if (member && member.distributorLevel) {
                const costRate = this.getDistributorCostRate(member.distributorLevel);
                if (costRate > 0) return member;
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
     * 订单支付成功后，将订单金额累加到「关联且非本人」的推荐人销售额（不累加到下单会员本人）
     * - 直接推荐人：若是分销商则 + distributorSales，否则 + directSales；均 + totalSales
     * - 间接推荐人：若是分销商则 + distributorSales，否则 + indirectSales；均 + totalSales
     * - 推荐链上更上层的分销商：该订单计入其推荐网络下消费，+ distributorSales，+ totalSales
     * 用 order.salesUpdatedAt 防重复累加。
     */
    static async updateSalesOnOrderPaid(orderId) {
        const order = await Order.findByPk(orderId, {
            include: [{ model: Member, as: 'member', attributes: ['id', 'referrerId'] }]
        });
        if (!order || order.status !== 'paid') return;
        if (order.salesUpdatedAt) return; // 已累加过，防重复
        const orderAmount = parseFloat(order.totalAmount) || 0;
        if (orderAmount <= 0) return;
        const buyer = order.member;
        if (!buyer) return;
        const directReferrerId = buyer.referrerId ? parseInt(buyer.referrerId, 10) : null;
        if (!directReferrerId) {
            await order.update({ salesUpdatedAt: new Date() });
            return;
        }
        const directReferrer = await Member.findByPk(directReferrerId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
        const memberIdsToUpgrade = [];
        if (directReferrer) {
            const isDistributor = directReferrer.distributorLevelId != null;
            if (isDistributor) {
                await directReferrer.increment('distributorSales', { by: orderAmount });
                await directReferrer.increment('directSales', { by: orderAmount }); // 直接推荐订单同时计入直接销售额，供等级判定用
                console.log(`[销售额] 订单 ${orderId} 直接推荐人(分销商) ${directReferrerId} +${orderAmount} distributorSales + directSales`);
            } else {
                await directReferrer.increment('directSales', { by: orderAmount });
                console.log(`[销售额] 订单 ${orderId} 直接推荐人 ${directReferrerId} +${orderAmount} directSales`);
            }
            await directReferrer.increment('totalSales', { by: orderAmount });
            memberIdsToUpgrade.push(directReferrerId);

            const indirectReferrerId = directReferrer.referrerId ? parseInt(directReferrer.referrerId, 10) : null;
            if (indirectReferrerId) {
                const indirectReferrer = await Member.findByPk(indirectReferrerId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
                if (indirectReferrer) {
                    const isIndirectDistributor = indirectReferrer.distributorLevelId != null;
                    if (isIndirectDistributor) {
                        await indirectReferrer.increment('distributorSales', { by: orderAmount });
                        await indirectReferrer.increment('indirectSales', { by: orderAmount }); // 间接推荐订单同时计入间接销售额，供等级判定用
                        console.log(`[销售额] 订单 ${orderId} 间接推荐人(分销商) ${indirectReferrerId} +${orderAmount} distributorSales + indirectSales`);
                    } else {
                        await indirectReferrer.increment('indirectSales', { by: orderAmount });
                        console.log(`[销售额] 订单 ${orderId} 间接推荐人 ${indirectReferrerId} +${orderAmount} indirectSales`);
                    }
                    await indirectReferrer.increment('totalSales', { by: orderAmount });
                    memberIdsToUpgrade.push(indirectReferrerId);
                }
                // 推荐链上更上层的分销商：网络下非直接/间接的消费也计入其分销销售额（从间接推荐人的上家起）
                let currentId = indirectReferrer.referrerId ? parseInt(indirectReferrer.referrerId, 10) : null;
                while (currentId) {
                    const upline = await Member.findByPk(currentId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
                    if (!upline) break;
                    if (upline.distributorLevelId != null) {
                        await upline.increment('distributorSales', { by: orderAmount });
                        await upline.increment('totalSales', { by: orderAmount });
                        console.log(`[销售额] 订单 ${orderId} 上层分销商 ${upline.id} +${orderAmount} distributorSales`);
                        memberIdsToUpgrade.push(upline.id);
                    }
                    currentId = upline.referrerId ? parseInt(upline.referrerId, 10) : null;
                }
            }
        }
        await order.update({ salesUpdatedAt: new Date() });

        // 销售额变更后触发等级检查（按直接+间接销售额判定的等级）
        const LevelUpgradeService = require('./levelUpgradeService');
        for (const mid of memberIdsToUpgrade) {
            try {
                await LevelUpgradeService.tryUpgradeMember(mid);
            } catch (e) {
                console.error('[销售额] 订单', orderId, '推荐人', mid, '等级检查失败:', e.message);
            }
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