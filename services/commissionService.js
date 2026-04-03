const { Op } = require('sequelize');
const {
    sequelize,
    Member,
    Order,
    OrderItem,
    ProductSKU,
    MemberLevel,
    DistributorLevel,
    TeamExpansionLevel,
    CommissionCalculation,
    CommissionExcludedProduct,
    TeamIncentiveCalculation
} = require('../db');

class CommissionService {
    static _rateToDecimal(rawRate) {
        const n = parseFloat(rawRate);
        if (!Number.isFinite(n) || n <= 0) return 0;
        return n <= 1 ? n : (n / 100);
    }

    static _isSpecialPartnerLevel(level) {
        if (!level) return false;
        const name = String(level.name || '').toLowerCase();
        if (name.includes('合伙人') || name.includes('特级')) return true;
        return false;
    }

    /**
     * 计算订单佣金（仅订单完成时产生：状态为 delivered 或 completed 才写入，否则仅可预览）
     * @param {number} orderId - 订单ID
     * @param {Object} [opts] - { preview: true } 仅预览，不写入
     */
    static async calculateOrderCommission(orderId, opts = {}) {
        const preview = !!opts.preview;
        try {
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

            const status = order.status || '';
            if (!preview && status !== 'delivered' && status !== 'completed') {
                console.log(`[佣金] 订单未完成，不生成佣金 orderId=${orderId} status=${status}`);
                return { calculations: [], orderNotCompleted: true };
            }

            if (!preview) {
                const existingCount = await CommissionCalculation.count({ where: { orderId } });
                if (existingCount > 0) {
                    console.log(`[佣金] 订单已计算过佣金，跳过 orderId=${orderId}`);
                    return { calculations: [], alreadyCalculated: true };
                }
            }

            const result = await this._computeOrderCommissionCalculations(order);
            if (!preview && result.calculations.length > 0) {
                await CommissionCalculation.bulkCreate(result.calculations);
                console.log(`[佣金] 订单 ${orderId} 完成 共 ${result.calculations.length} 条记录`);
            }
            return result;
        } catch (error) {
            console.error('计算订单佣金失败:', error);
            throw error;
        }
    }

    /**
     * 订单佣金预览（不写入库，仅返回预计佣金明细）
     * @param {number} orderId - 订单ID
     */
    static async previewOrderCommission(orderId) {
        try {
            const order = await Order.findByPk(orderId, {
                include: [
                    { model: Member, as: 'member', include: [
                        { model: MemberLevel, as: 'memberLevel' },
                        { model: DistributorLevel, as: 'distributorLevel' }
                    ]}
                ]
            });
            if (!order) return { calculations: [], message: '订单不存在' };
            return await this._computeOrderCommissionCalculations(order);
        } catch (error) {
            console.error('订单佣金预览失败:', error);
            throw error;
        }
    }

    /**
     * 内部：根据订单计算佣金明细（不写库）
     * @param {Object} order - 已包含 member 的订单
     */
    static async _computeOrderCommissionCalculations(order) {
        const orderId = order.id;
        const member = order.member;

        const orderWithItems = await Order.findByPk(orderId, {
            include: [{
                model: OrderItem,
                as: 'items',
                include: [{ model: ProductSKU, as: 'sku', attributes: ['id', 'costPrice', 'productId'] }]
            }]
        });
        if (!orderWithItems) {
            return { calculations: [], noReferrer: false, referrerNotFound: false };
        }
        orderWithItems.member = order.member;

        if (this._orderItemsHasPromotion(orderWithItems.items)) {
            console.log(`[佣金] 订单含促销活动，不计提佣金 orderId=${orderId}`);
            return { calculations: [], promotionOrderExcluded: true, noReferrer: false, referrerNotFound: false };
        }

        const bases = await this.getOrderCommerceBases(orderWithItems);
        const orderAmount = bases.retailAmount;

        if (orderAmount <= 0) {
            console.log(`[佣金] 可计佣金金额为 0（可能全部为佣金除外商品或无有效明细） orderId=${orderId}`);
            return { calculations: [], commissionBaseZero: true, noReferrer: false, referrerNotFound: false };
        }

        if (!member) {
            return { calculations: [], noReferrer: false, referrerNotFound: false };
        }

            console.log(`[佣金] 订单 orderId=${orderId} 下单会员 memberId=${member.id} referrerId=${member.referrerId} 可计佣金零售额=${orderAmount} SKU成本合计(可计佣)=${bases.skuCostTotal}`);

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
                    orderId, member.id, referrer.id, bases, referrer, directAmount, indirectAmount
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
                    orderId, member.id, referrer.id, bases, referrer, directAmount, indirectAmount
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
                const uplineDistributors = await this.findOtherDistributorsInNetwork(referrer.referrerId, referrer.id);
                let downstreamCostRate = referrerCostRate;
                let downstreamLevel = referrer.distributorLevel;
                for (const upline of uplineDistributors) {
                    const uplineCostRate = this.getDistributorCostRate(upline.distributorLevel);
                    const diffRate = downstreamCostRate - uplineCostRate;
                    if (diffRate > 0) {
                        const diffAmt = this.tierDiffAmountByLevels(bases, downstreamLevel, downstreamCostRate, upline.distributorLevel, uplineCostRate);
                        if (diffAmt > 0) {
                            const downMoney = this.computeProcurementCostAmount(bases, downstreamLevel, downstreamCostRate);
                            const upMoney = this.computeProcurementCostAmount(bases, upline.distributorLevel, uplineCostRate);
                            const commissionAmount = diffAmt.toFixed(2);
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
                                description: `级差分销佣金：${upline.nickname} 成本额差额 ¥${downMoney.toFixed(2)}(下游${downstreamCostRate}%) − ¥${upMoney.toFixed(2)}(本等级${uplineCostRate}%) = ¥${commissionAmount}`
                            });
                            console.log(`[佣金] 级差分销佣金 已生成 recipientId=${upline.id} 级差百分点=${diffRate}% 金额=${commissionAmount}`);
                        }
                    }
                    downstreamCostRate = uplineCostRate;
                    downstreamLevel = upline.distributorLevel;
                }
            } else {
                // 4c. 推荐人有分销等级但成本率为 0（分享模式）：从推荐人上家链找第一个有成本率的分销商，给其「分销佣金」+ 再往上算级差
                console.log(`[佣金] 推荐人为分享模式(costRate=0)，向上查找有成本率的分销商`);
                const nearestCost = await this.findNearestCostDistributorInNetwork(referrer.id);
                if (nearestCost) {
                    const costRate = this.getDistributorCostRate(nearestCost.distributorLevel);
                    const costAmount = this.computeProcurementCostAmount(bases, nearestCost.distributorLevel, costRate).toFixed(2);
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
                    const uplineDistributors = await this.findOtherDistributorsInNetwork(nearestCost.referrerId, nearestCost.id);
                    let downstreamCostRate = costRate;
                    let downstreamLevel = nearestCost.distributorLevel;
                    for (const upline of uplineDistributors) {
                        const uplineCostRate = this.getDistributorCostRate(upline.distributorLevel);
                        const diffRate = downstreamCostRate - uplineCostRate;
                        if (diffRate > 0) {
                            const diffAmt = this.tierDiffAmountByLevels(bases, downstreamLevel, downstreamCostRate, upline.distributorLevel, uplineCostRate);
                            if (diffAmt > 0) {
                                const downMoney = this.computeProcurementCostAmount(bases, downstreamLevel, downstreamCostRate);
                                const upMoney = this.computeProcurementCostAmount(bases, upline.distributorLevel, uplineCostRate);
                                const diffAmount = diffAmt.toFixed(2);
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
                                    description: `级差分销佣金：${upline.nickname} 成本额差额 ¥${downMoney.toFixed(2)}(下游${downstreamCostRate}%) − ¥${upMoney.toFixed(2)}(本等级${uplineCostRate}%) = ¥${diffAmount}`
                                });
                                console.log(`[佣金] 级差分销佣金 已生成 recipientId=${upline.id} 级差=${diffRate}% 金额=${diffAmount}`);
                            }
                        }
                        downstreamCostRate = uplineCostRate;
                        downstreamLevel = upline.distributorLevel;
                    }
                } else {
                    console.log(`[佣金] 推荐人上家链中无有成本率的分销商`);
                }
            }

            // 5. 团队拓展激励（按单）：仅当分销/级差都没有产出时，按剩余基数逐级分配激励
            const hasDistributorDiff = calculations.some((c) =>
                (c.commissionType === 'distributor' || c.commissionType === 'network_distributor') &&
                parseFloat(c.commissionAmount || 0) > 0
            );
            if (!hasDistributorDiff) {
                await this.appendPerOrderTeamIncentiveCalculations({
                    orderId,
                    member,
                    referrer,
                    orderAmount,
                    calculations
                });
            }

            if (calculations.length === 0) {
                console.log(`[佣金] 订单 ${orderId} 无任何佣金记录生成（推荐人存在但各类型均未满足或比例为0）`);
            }
            return { calculations, noReferrer: false, referrerNotFound: false };
    }

    static async appendPerOrderTeamIncentiveCalculations({ orderId, member, referrer, orderAmount, calculations }) {
        const allocatedBefore = calculations.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
        let remainingBase = parseFloat((orderAmount - allocatedBefore).toFixed(2));
        if (remainingBase <= 0) return;

        const levelDepth = parseInt(referrer && referrer.teamExpansionLevel && referrer.teamExpansionLevel.maxDepth, 10);
        const envDepth = parseInt(process.env.TEAM_INCENTIVE_MAX_DEPTH || '5', 10);
        const maxDepth = Math.max(1, Number.isFinite(levelDepth) && levelDepth > 0 ? levelDepth : (envDepth || 5));
        const fullChain = [];
        let currentId = referrer && referrer.id ? referrer.id : null;
        while (currentId) {
            const m = await Member.findByPk(currentId, {
                include: [
                    { model: DistributorLevel, as: 'distributorLevel' },
                    { model: TeamExpansionLevel, as: 'teamExpansionLevel' }
                ]
            });
            if (!m) break;
            if (m.distributorLevel) fullChain.push(m);
            currentId = m.referrerId ? parseInt(m.referrerId, 10) : null;
        }
        if (fullChain.length === 0) return;

        let payoutChain = fullChain.slice(0, maxDepth);
        // 最后一级强制对齐为“最近的特级/合伙人”
        if (payoutChain.length > 0 && !this._isSpecialPartnerLevel(payoutChain[payoutChain.length - 1].distributorLevel)) {
            let special = fullChain.find((m) => this._isSpecialPartnerLevel(m.distributorLevel));
            if (!special) {
                const maxLevelVal = fullChain.reduce((mx, m) => Math.max(mx, parseInt(m.distributorLevel?.level, 10) || 0), 0);
                special = fullChain.find((m) => (parseInt(m.distributorLevel?.level, 10) || 0) === maxLevelVal);
            }
            if (special) {
                payoutChain[payoutChain.length - 1] = special;
                payoutChain = payoutChain.filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx);
            }
        }

        for (let i = 0; i < payoutChain.length; i++) {
            if (remainingBase <= 0) break;
            const recipient = payoutChain[i];
            const rateDecimal = this._rateToDecimal(
                recipient.teamExpansionLevel ? recipient.teamExpansionLevel.incentiveRate : 0
            );
            if (rateDecimal <= 0) continue;

            const incentiveAmount = parseFloat((remainingBase * rateDecimal).toFixed(2));
            if (incentiveAmount <= 0) continue;

            const ratePercent = parseFloat((rateDecimal * 100).toFixed(2));
            calculations.push({
                orderId,
                memberId: member.id,
                referrerId: referrer.id,
                commissionType: 'team_incentive',
                recipientId: recipient.id,
                orderAmount: remainingBase,
                commissionRate: ratePercent,
                commissionAmount: incentiveAmount,
                status: 'pending',
                description: `团队拓展激励（按单逐级）：第${i + 1}级 ${recipient.nickname} 按剩余基数 ¥${remainingBase.toFixed(2)} × ${ratePercent}%`
            });

            // 下一层基数需扣除上一层已分配佣金/激励
            remainingBase = parseFloat((remainingBase - incentiveAmount).toFixed(2));
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
                { model: DistributorLevel, as: 'distributorLevel' },
                { model: TeamExpansionLevel, as: 'teamExpansionLevel' }
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

    /** 提货成本比例基数：retail=订单零售价；cost=订单 SKU 成本合计 */
    static getCostRateBase(distributorLevel) {
        if (!distributorLevel) return 'retail';
        return distributorLevel.costRateBase === 'cost' ? 'cost' : 'retail';
    }

    /**
     * 是否使用了「促销活动」（Promotion），不含：优惠券、会员价、会员等级折扣、积分抵扣等。
     * 依据：行上 appliedPromotions 非空，或 discounts 中存在 type==='promotion'。
     */
    static _orderItemsHasPromotion(items) {
        if (!items || !Array.isArray(items)) return false;
        for (const it of items) {
            const aps = it.appliedPromotions;
            if (Array.isArray(aps) && aps.length > 0) return true;
            if (typeof aps === 'string' && aps.trim()) {
                try {
                    const parsed = JSON.parse(aps);
                    if (Array.isArray(parsed) && parsed.length > 0) return true;
                } catch (_) { /* ignore */ }
            }
            let discounts = it.discounts;
            if (typeof discounts === 'string' && discounts.trim()) {
                try {
                    discounts = JSON.parse(discounts);
                } catch (_) {
                    discounts = null;
                }
            }
            if (Array.isArray(discounts) && discounts.some(d => d && d.type === 'promotion')) return true;
        }
        return false;
    }

    /** 后台配置的「佣金除外」商品 ID 集合 */
    static async getCommissionExcludedProductIdsSet() {
        const rows = await CommissionExcludedProduct.findAll({ attributes: ['productId'], raw: true });
        return new Set((rows || []).map((r) => r.productId).filter((id) => id != null && id > 0));
    }

    static _resolveOrderItemProductId(it) {
        if (it.productId != null && it.productId !== '') {
            const n = parseInt(it.productId, 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
        if (it.sku && it.sku.productId != null) {
            const n = parseInt(it.sku.productId, 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
        if (it.skuSnapshot && typeof it.skuSnapshot === 'object' && it.skuSnapshot.productId != null) {
            const n = parseInt(it.skuSnapshot.productId, 10);
            if (Number.isFinite(n) && n > 0) return n;
        }
        return null;
    }

    static _orderItemSkuCost(it) {
        const qty = parseInt(it.quantity, 10) || 0;
        let unitCost = null;
        if (it.sku && it.sku.costPrice != null && parseFloat(it.sku.costPrice) > 0) {
            unitCost = parseFloat(it.sku.costPrice);
        } else if (it.skuSnapshot && typeof it.skuSnapshot === 'object' && it.skuSnapshot.costPrice != null) {
            unitCost = parseFloat(it.skuSnapshot.costPrice);
        }
        if (unitCost == null || Number.isNaN(unitCost)) return 0;
        return unitCost * qty;
    }

    static _parseMaybeJson(v) {
        if (!v) return null;
        if (typeof v === 'object') return v;
        if (typeof v !== 'string') return null;
        try {
            return JSON.parse(v);
        } catch (_) {
            return null;
        }
    }

    /**
     * 行零售价小计：优先 SKU 快照零售价 × 数量；否则回退行单价 × 数量
     */
    static _orderItemRetailSubtotal(it) {
        const qty = parseInt(it.quantity, 10) || 0;
        const skuSnap = this._parseMaybeJson(it.skuSnapshot);
        const snapPrice = skuSnap && skuSnap.price != null ? parseFloat(skuSnap.price) : NaN;
        if (Number.isFinite(snapPrice) && snapPrice >= 0) {
            return snapPrice * qty;
        }
        const unit = parseFloat(it.unitPrice);
        if (Number.isFinite(unit) && unit >= 0) {
            return unit * qty;
        }
        return parseFloat(it.totalAmount) || 0;
    }

    /**
     * 佣金计算基数：零售额（按 SKU 零售价）、SKU 成本合计（成本基数时分销商用）。
     * 若配置了佣金除外商品且本订单行命中，则剔除对应行的零售额与成本。
     * @returns {{ retailAmount: number, skuCostTotal: number }}
     */
    static async getOrderCommerceBases(order) {
        let items = order.items;
        if (!items || !Array.isArray(items)) {
            const o2 = await Order.findByPk(order.id, {
                include: [{
                    model: OrderItem,
                    as: 'items',
                    include: [{ model: ProductSKU, as: 'sku', attributes: ['id', 'costPrice', 'productId'] }]
                }]
            });
            items = o2 && o2.items ? o2.items : [];
        }

        const excludedSet = await this.getCommissionExcludedProductIdsSet();
        let retailAmount = 0;
        let skuCostTotal = 0;

        if (excludedSet.size === 0) {
            for (const it of items) {
                retailAmount += this._orderItemRetailSubtotal(it);
                skuCostTotal += this._orderItemSkuCost(it);
            }
            retailAmount = parseFloat(retailAmount.toFixed(2));
            skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
            return { retailAmount, skuCostTotal };
        }

        const hasExcludedLine = items.some((it) => {
            const pid = this._resolveOrderItemProductId(it);
            return pid && excludedSet.has(pid);
        });

        if (!hasExcludedLine) {
            for (const it of items) {
                retailAmount += this._orderItemRetailSubtotal(it);
                skuCostTotal += this._orderItemSkuCost(it);
            }
            retailAmount = parseFloat(retailAmount.toFixed(2));
            skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
            return { retailAmount, skuCostTotal };
        }

        let commissionableRetail = 0;
        let excludedRetailSum = 0;
        for (const it of items) {
            const pid = this._resolveOrderItemProductId(it);
            const lineRetail = this._orderItemRetailSubtotal(it);
            const lineCost = this._orderItemSkuCost(it);
            if (pid && excludedSet.has(pid)) {
                excludedRetailSum += lineRetail;
                continue;
            }
            commissionableRetail += lineRetail;
            skuCostTotal += lineCost;
        }
        retailAmount = parseFloat(commissionableRetail.toFixed(2));
        skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
        console.log(`[佣金] 订单行含佣金除外商品，除外零售价约 ¥${excludedRetailSum.toFixed(2)}，可计佣金零售价 ¥${retailAmount.toFixed(2)}`);
        return { retailAmount, skuCostTotal };
    }

    /**
     * 按等级设定的基数计算「应付成本金额」= 基数 × 成本率%
     */
    static computeProcurementCostAmount(bases, distributorLevel, costRate) {
        if (costRate <= 0) return 0;
        const base = this.getCostRateBase(distributorLevel) === 'cost' ? bases.skuCostTotal : bases.retailAmount;
        return parseFloat((base * costRate / 100).toFixed(2));
    }

    /** 级差：先分别算上下游「成本金额」，再取差额（元） */
    static tierDiffAmountByLevels(bases, downstreamLevel, downstreamRate, uplineLevel, uplineRate) {
        const downAmt = this.computeProcurementCostAmount(bases, downstreamLevel, downstreamRate);
        const upAmt = this.computeProcurementCostAmount(bases, uplineLevel, uplineRate);
        return parseFloat((downAmt - upAmt).toFixed(2));
    }

    /**
     * 计算分销商佣金（同一订单基数按差额：分销毛利佣金 - 直接 - 间接）
     * @param {{ retailAmount: number, skuCostTotal: number }} bases - 零售价与成本合计
     * @param {number} directAmount - 直接佣金金额（不存在则为 0）
     * @param {number} indirectAmount - 间接佣金金额（不存在则为 0）
     */
    static async calculateDistributorCommission(orderId, memberId, referrerId, bases, referrer, directAmount = 0, indirectAmount = 0) {
        const retailAmount = bases.retailAmount;
        const costRate = referrer.personalCostRate ||
                        (referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0);

        if (costRate <= 0) return null;
        const dl = referrer.distributorLevel;
        if (dl && (dl.costRate == null || parseFloat(dl.costRate) <= 0) && dl.procurementCost > 0) {
            console.log(`[佣金] 分销商佣金 使用 procurementCost 回退 等级=${dl.name} procurementCost=${dl.procurementCost} => costRate=${costRate}%`);
        }

        const costAmount = this.computeProcurementCostAmount(bases, dl, costRate).toFixed(2);
        const grossCommissionAmount = (retailAmount - parseFloat(costAmount)).toFixed(2);
        const commissionAmount = Math.max(
            0,
            parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
        ).toFixed(2);

        const baseLabel = dl && this.getCostRateBase(dl) === 'cost' ? '成本价合计' : '零售价';
        return {
            orderId,
            memberId,
            referrerId,
            commissionType: 'distributor',
            recipientId: referrerId,
            orderAmount: retailAmount,
            commissionRate: costRate,
            commissionAmount: parseFloat(commissionAmount),
            costRate,
            costAmount: parseFloat(costAmount),
            status: 'pending',
            description: `分销佣金（毛利-直接-间接）：${referrer.nickname} 按 ${costRate}%×${baseLabel} 计提货成本`
        };
    }

    /**
     * 计算网络分销商佣金（同一订单基数按差额：分销毛利佣金 - 直接 - 间接）
     */
    static async calculateNetworkDistributorCommission(orderId, memberId, referrerId, bases, referrer, directAmount = 0, indirectAmount = 0) {
        const retailAmount = bases.retailAmount;
        const networkDistributor = await this.findNearestDistributorInNetwork(referrerId);
        
        if (!networkDistributor) return null;

        const otherDistributors = await this.findOtherDistributorsInNetwork(referrerId, networkDistributor.id);
        
        if (otherDistributors.length === 0) {
            const costRate = networkDistributor.personalCostRate ||
                           (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            if (costRate <= 0) return null;

            const costAmount = this.computeProcurementCostAmount(bases, networkDistributor.distributorLevel, costRate).toFixed(2);
            const grossCommissionAmount = (retailAmount - parseFloat(costAmount)).toFixed(2);
            const commissionAmount = Math.max(
                0,
                parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
            ).toFixed(2);

            const ndl = networkDistributor.distributorLevel;
            const baseLabel = ndl && this.getCostRateBase(ndl) === 'cost' ? '成本价合计' : '零售价';
            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount: retailAmount,
                commissionRate: costRate,
                commissionAmount: parseFloat(commissionAmount),
                costRate,
                costAmount: parseFloat(costAmount),
                status: 'pending',
                description: `网络分销商佣金（毛利-直接-间接）：${networkDistributor.nickname} 按 ${costRate}%×${baseLabel} 计提货成本`
            };
        } else {
            const nearestCostRate = networkDistributor.personalCostRate ||
                                  (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            let maxCostRate = 0;
            let maxDistributor = null;
            for (const distributor of otherDistributors) {
                const cr = distributor.personalCostRate ||
                               (distributor.distributorLevel ? this.getDistributorCostRate(distributor.distributorLevel) : 0);
                if (cr > maxCostRate) {
                    maxCostRate = cr;
                    maxDistributor = distributor;
                }
            }

            const costDifference = nearestCostRate - maxCostRate;
            if (costDifference <= 0 || !maxDistributor) return null;

            const amtNearest = this.computeProcurementCostAmount(bases, networkDistributor.distributorLevel, nearestCostRate);
            const amtMax = this.computeProcurementCostAmount(bases, maxDistributor.distributorLevel, maxCostRate);
            const diffCommission = parseFloat((amtNearest - amtMax).toFixed(2));
            if (diffCommission <= 0) return null;

            const commissionAmount = diffCommission.toFixed(2);
            const effectiveRate = retailAmount > 0 ? parseFloat((diffCommission / retailAmount * 100).toFixed(2)) : 0;

            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount: retailAmount,
                commissionRate: effectiveRate,
                commissionAmount: parseFloat(commissionAmount),
                status: 'pending',
                description: `网络分销商佣金：成本额差额 ¥${amtNearest.toFixed(2)}(近端${nearestCostRate}%) − ¥${amtMax.toFixed(2)}(他档${maxCostRate}%) = ¥${commissionAmount}`
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
        const distributors = [];
        const visited = new Set();
        let currentId = referrerId ? parseInt(referrerId, 10) : null;

        while (currentId) {
            if (visited.has(currentId)) break;
            visited.add(currentId);

            const member = await Member.findByPk(currentId, {
                include: [{ model: DistributorLevel, as: 'distributorLevel' }]
            });
            if (!member) break;

            const memberId = parseInt(member.id, 10);
            if (memberId !== parseInt(excludeId, 10) && member.distributorLevel) {
                distributors.push(member);
            }

            currentId = member.referrerId ? parseInt(member.referrerId, 10) : null;
        }

        return distributors;
    }

    /**
     * 计算团队拓展激励佣金（按月计算）
     */
    static async calculateTeamIncentiveCommission(month) {
        try {
            if (!/^\d{4}-\d{2}$/.test(String(month || ''))) {
                throw new Error('月份格式错误，需为 YYYY-MM');
            }
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

                // 兼容历史配置：<=1 视为小数比例（0.01=1%），>1 视为百分比（1=1%）
                const rawRate = parseFloat(teamLevel.incentiveRate) || 0;
                const rateDecimal = rawRate <= 1 ? rawRate : (rawRate / 100);
                if (rateDecimal <= 0) continue;
                const incentiveAmount = (monthlySales * rateDecimal).toFixed(2);
                const incentiveRatePercent = parseFloat((rateDecimal * 100).toFixed(2));

                // 防重复：同月、同分销商、同推荐人仅保留一条（pending/confirmed 都视为已生成）
                const existing = await TeamIncentiveCalculation.count({
                    where: {
                        calculationMonth: month,
                        distributorId: distributor.id,
                        referrerId: referrer.id,
                        status: { [Op.ne]: 'cancelled' }
                    }
                });
                if (existing > 0) {
                    continue;
                }

                calculations.push({
                    distributorId: distributor.id,
                    referrerId: referrer.id,
                    calculationMonth: month,
                    monthlySales,
                    incentiveBase: monthlySales,
                    incentiveRate: incentiveRatePercent,
                    incentiveAmount: parseFloat(incentiveAmount),
                    status: 'pending',
                    description: `团队拓展激励：${month} 月销售额 ${monthlySales} 元，激励比例 ${incentiveRatePercent}%`
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
     * - 直接推荐人：无分销等级时 + directSales、+ totalSales（仅无等级会员的直接粉丝订单记直接销售额）；有分销等级时 + distributorSales、+ totalSales（照旧）
     * - 间接推荐人：照旧，+ indirectSales、+ totalSales
     * - 推荐链上更上层的分销商：+ distributorSales，+ totalSales
     * 用 order.salesUpdatedAt 防重复累加。使用 COALESCE 防止字段为 NULL 时累加失效。
     */
    static async updateSalesOnOrderPaid(orderId) {
        const order = await Order.findByPk(orderId, {
            include: [{ model: Member, as: 'member', attributes: ['id', 'referrerId'] }]
        });
        // 已支付或已完成的订单才累加销售额（paid/delivered/completed 均视为已支付）
        if (!order || !['paid', 'delivered', 'completed'].includes(order.status || '')) return;
        if (order.salesUpdatedAt) return; // 已累加过，防重复
        const orderAmount = parseFloat(order.totalAmount) || 0;
        if (orderAmount <= 0) return;
        const buyer = order.member;
        if (!buyer) return;
        const activeMemberCheckService = require('./activeMemberCheckService');
        activeMemberCheckService.setMemberActive(buyer.id).catch(() => {});
        const directReferrerId = buyer.referrerId ? parseInt(buyer.referrerId, 10) : null;
        if (!directReferrerId) {
            await order.update({ salesUpdatedAt: new Date() });
            return;
        }
        const directReferrer = await Member.findByPk(directReferrerId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
        const memberIdsToUpgrade = [];
        const safeAdd = (model, field, amount) => {
            return model.update({
                [field]: sequelize.literal(`COALESCE(${field}, 0) + ${Number(amount)}`)
            });
        };
        if (directReferrer) {
            const isDistributor = directReferrer.distributorLevelId != null;
            if (isDistributor) {
                await safeAdd(directReferrer, 'distributorSales', orderAmount);
                console.log(`[销售额] 订单 ${orderId} 直接推荐人(分销商) ${directReferrerId} +${orderAmount} distributorSales`);
            } else {
                await safeAdd(directReferrer, 'directSales', orderAmount);
                console.log(`[销售额] 订单 ${orderId} 直接推荐人(无等级) ${directReferrerId} +${orderAmount} directSales`);
            }
            await safeAdd(directReferrer, 'totalSales', orderAmount);
            memberIdsToUpgrade.push(directReferrerId);

            const indirectReferrerId = directReferrer.referrerId ? parseInt(directReferrer.referrerId, 10) : null;
            if (indirectReferrerId) {
                const indirectReferrer = await Member.findByPk(indirectReferrerId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
                if (indirectReferrer) {
                    await safeAdd(indirectReferrer, 'indirectSales', orderAmount);
                    await safeAdd(indirectReferrer, 'totalSales', orderAmount);
                    console.log(`[销售额] 订单 ${orderId} 间接推荐人 ${indirectReferrerId} +${orderAmount} indirectSales`);
                    memberIdsToUpgrade.push(indirectReferrerId);
                }
                let currentId = indirectReferrer && indirectReferrer.referrerId ? parseInt(indirectReferrer.referrerId, 10) : null;
                while (currentId) {
                    const upline = await Member.findByPk(currentId, { attributes: ['id', 'referrerId', 'distributorLevelId'] });
                    if (!upline) break;
                    if (upline.distributorLevelId != null) {
                        await safeAdd(upline, 'distributorSales', orderAmount);
                        await safeAdd(upline, 'totalSales', orderAmount);
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
                status: { [Op.in]: ['paid', 'delivered', 'completed'] },
                [Op.or]: [
                    {
                        paymentTime: {
                            [Op.between]: [startDate, endDate]
                        }
                    },
                    {
                        paymentTime: null,
                        createdAt: {
                            [Op.between]: [startDate, endDate]
                        }
                    }
                ]
            },
            attributes: [
                [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalSales']
            ],
            raw: true
        });

        return parseFloat(result.totalSales) || 0;
    }

    /**
     * 确认团队拓展激励（入账团队激励余额）
     */
    static async confirmTeamIncentive(calculationId) {
        const calculation = await TeamIncentiveCalculation.findByPk(calculationId);
        if (!calculation) {
            throw new Error('团队拓展激励记录不存在');
        }
        if (calculation.status === 'confirmed') {
            return calculation;
        }
        await calculation.update({ status: 'confirmed' });
        const member = await Member.findByPk(calculation.referrerId);
        if (member) {
            await member.increment('availableTeamIncentive', { by: calculation.incentiveAmount });
            await member.increment('totalTeamIncentive', { by: calculation.incentiveAmount });
        }
        return calculation;
    }

    /**
     * 取消团队拓展激励
     */
    static async cancelTeamIncentive(calculationId) {
        const calculation = await TeamIncentiveCalculation.findByPk(calculationId);
        if (!calculation) {
            throw new Error('团队拓展激励记录不存在');
        }
        await calculation.update({ status: 'cancelled' });
        return calculation;
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
            if (calculation.commissionType === 'team_incentive') {
                await member.increment('availableTeamIncentive', { by: calculation.commissionAmount });
                await member.increment('totalTeamIncentive', { by: calculation.commissionAmount });
            } else {
                await member.increment('availableCommission', { by: calculation.commissionAmount });
                await member.increment('totalCommission', { by: calculation.commissionAmount });
            }
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