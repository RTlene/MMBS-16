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
    CommissionSettings,
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
     * 级差链在层数 cap 之外仍须包含的会员（与团队激励最后一档兜底一致）：
     * 链上首个特级/合伙人，若无则用分销等级 level 数值最高者。
     */
    static _tierDiffAnchorMemberIds(distributorMemberChain) {
        const ids = new Set();
        if (!Array.isArray(distributorMemberChain) || distributorMemberChain.length === 0) return ids;
        let anchor = distributorMemberChain.find((m) => this._isSpecialPartnerLevel(m.distributorLevel));
        if (!anchor) {
            const maxLevelVal = distributorMemberChain.reduce(
                (mx, m) => Math.max(mx, parseInt(m.distributorLevel?.level, 10) || 0),
                0
            );
            if (maxLevelVal > 0) {
                anchor = distributorMemberChain.find(
                    (m) => (parseInt(m.distributorLevel?.level, 10) || 0) === maxLevelVal
                );
            }
        }
        if (anchor) ids.add(parseInt(anchor.id, 10));
        return ids;
    }

    /** 佣金管理 → 佣金设置；失败时回退 TEAM_INCENTIVE_MAX_DEPTH 或 5 */
    static async getDistributorChainMaxDepth() {
        const envFallback = Math.max(1, parseInt(process.env.TEAM_INCENTIVE_MAX_DEPTH || '5', 10) || 5);
        try {
            let row = await CommissionSettings.findByPk(1);
            if (!row) {
                row = await CommissionSettings.create({ id: 1, distributorChainMaxDepth: envFallback });
            }
            const n = parseInt(row.distributorChainMaxDepth, 10);
            return Math.max(1, Number.isFinite(n) ? n : envFallback);
        } catch (e) {
            console.warn('[佣金] 读取 commission_settings 失败，使用环境变量层数:', e && e.message ? e.message : e);
            return envFallback;
        }
    }

    /** 自 referrer 起沿推荐链向上，仅包含有分销等级的会员（含团队拓展等级用于激励比例） */
    static async buildDistributorMemberChainFromReferrer(referrerId) {
        const chain = [];
        let currentId = referrerId != null ? parseInt(referrerId, 10) : null;
        const visited = new Set();
        while (currentId) {
            if (visited.has(currentId)) {
                console.warn(`[佣金] 分销链检测到推荐关系环，已中断 currentId=${currentId}`);
                break;
            }
            visited.add(currentId);
            const m = await Member.findByPk(currentId, {
                include: [
                    { model: DistributorLevel, as: 'distributorLevel' },
                    { model: TeamExpansionLevel, as: 'teamExpansionLevel' }
                ]
            });
            if (!m) break;
            if (m.distributorLevel) chain.push(m);
            currentId = m.referrerId ? parseInt(m.referrerId, 10) : null;
        }
        return this._dedupeDistributorChainByMemberId(chain);
    }

    /** 分销链去重：同一会员只保留首次出现（更靠近下游的一次） */
    static _dedupeDistributorChainByMemberId(chain) {
        if (!Array.isArray(chain) || chain.length <= 1) return Array.isArray(chain) ? chain : [];
        const seen = new Set();
        const deduped = [];
        let dupCount = 0;
        for (const m of chain) {
            const id = parseInt(m && m.id, 10);
            if (!Number.isFinite(id)) continue;
            if (seen.has(id)) {
                dupCount += 1;
                continue;
            }
            seen.add(id);
            deduped.push(m);
        }
        if (dupCount > 0) {
            console.warn(`[佣金] 分销链发现重复会员并已去重 count=${dupCount}`);
        }
        return deduped;
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
     * 删除本单全部佣金计提记录后按当前规则重算（仅写入新的 pending 记录，不自动确认）
     */
    static async recalculateOrderCommission(orderId) {
        const order = await Order.findByPk(orderId);
        if (!order) {
            return { ok: false, code: 'ORDER_NOT_FOUND', message: '订单不存在' };
        }
        const status = order.status || '';
        if (status !== 'delivered' && status !== 'completed') {
            return {
                ok: false,
                code: 'ORDER_NOT_COMPLETED',
                message: '仅已收货或已完成订单可重新计算佣金'
            };
        }
        const confirmedCount = await CommissionCalculation.count({
            where: { orderId, status: 'confirmed' }
        });
        if (confirmedCount > 0) {
            return {
                ok: false,
                code: 'COMMISSION_CONFIRMED',
                message: '本单存在已确认的佣金计提记录，请先在佣金管理中处理后再重算'
            };
        }
        let deletedCount = 0;
        await sequelize.transaction(async (t) => {
            deletedCount = await CommissionCalculation.destroy({ where: { orderId }, transaction: t });
        });
        console.log(`[佣金] 订单 ${orderId} 重算：已删除 ${deletedCount} 条旧计提记录`);
        const calcResult = await this.calculateOrderCommission(orderId);
        return { ok: true, deletedCount, ...calcResult };
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

        const promotionCommissionMeta = this._evaluatePromotionCommissionMeta(orderWithItems.items);
        if (promotionCommissionMeta.hasPromotion && !promotionCommissionMeta.commissionEnabled) {
            console.log(`[佣金] 订单含促销活动且未开启促销佣金，不计提佣金 orderId=${orderId}`);
            return { calculations: [], promotionOrderExcluded: true, noReferrer: false, referrerNotFound: false };
        }

        const bases = await this.getOrderCommerceBases(orderWithItems, {
            promotionCommissionCost: promotionCommissionMeta.totalCost
        });
        const paidOrderAmount = bases.paidAmount != null ? bases.paidAmount : bases.retailAmount;
        const retailRefAmount = bases.retailAmount;

        if (paidOrderAmount <= 0 && retailRefAmount <= 0) {
            console.log(`[佣金] 可计佣金实付与参考零售均为 0 orderId=${orderId}`);
            return { calculations: [], commissionBaseZero: true, noReferrer: false, referrerNotFound: false };
        }

        if (!member) {
            return { calculations: [], noReferrer: false, referrerNotFound: false };
        }

            console.log(`[佣金] 订单 orderId=${orderId} 下单会员 memberId=${member.id} referrerId=${member.referrerId} 可计佣金实付额=${paidOrderAmount} 参考零售价(仅用于按等级计提货成本)=${retailRefAmount} SKU成本合计(可计佣)=${bases.skuCostTotal} 促销佣金成本扣减=${bases.promotionCommissionCost || 0}`);

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

            const distributorChainMaxDepth = await this.getDistributorChainMaxDepth();
            const distributorMemberChain = await this.buildDistributorMemberChainFromReferrer(referrer.id);
            const chainCap = distributorMemberChain.slice(0, distributorChainMaxDepth);
            console.log(
                `[佣金] 分销链层数(佣金设置)=${distributorChainMaxDepth} 链上总人数=${distributorMemberChain.length} 本单参与=${chainCap.length}`
            );

            // 1. 计算直接佣金（会员等级「分享赚钱」或 分销等级 的分享直接佣金率 > 0 均可）
            const canDirect = (ml && ml.isSharingEarner) || (dl && sharerDirect > 0);
            console.log(`[佣金] 直接佣金 条件满足=${canDirect} (会员等级分享赚钱=${!!(ml && ml.isSharingEarner)} 或 分销分享直接率>0=${sharerDirect > 0})`);
            if (canDirect) {
                const directCommission = await this.calculateDirectCommission(
                    orderId, member.id, referrer.id, paidOrderAmount, referrer
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
                    orderId, member.id, indirectReferrer.id, paidOrderAmount, indirectReferrer, referrer
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
            console.log(`[佣金] 直接/间接金额 实付基数=${paidOrderAmount} 直接=${directAmount} 间接=${indirectAmount}`);

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
                    console.log(`[佣金] 分销商佣金 未生成（costRate<=0 或毛利扣直间后为0）`);
                }
            }

            // 4. 网络分销商 / 上级分销商级差
            const referrerCostRate = referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0;
            if (!referrer.distributorLevel) {
                const networkDistributorCommission = await this.calculateNetworkDistributorCommission(
                    orderId, member.id, referrer.id, bases, referrer, directAmount, indirectAmount, chainCap
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
                const lastInCap = chainCap[chainCap.length - 1];
                const lastCapIdxInFull = distributorMemberChain.findIndex(
                    (m) => parseInt(m.id, 10) === parseInt(lastInCap.id, 10)
                );
                const anchorSet4b = this._tierDiffAnchorMemberIds(distributorMemberChain);
                let anchorIdx4b = -1;
                if (anchorSet4b.size > 0) {
                    anchorIdx4b = distributorMemberChain.findIndex(
                        (m) => parseInt(m.id, 10) === [...anchorSet4b][0]
                    );
                }
                const topIdx4b =
                    anchorIdx4b >= 0 && lastCapIdxInFull >= 0
                        ? Math.max(lastCapIdxInFull, anchorIdx4b)
                        : anchorIdx4b >= 0
                          ? anchorIdx4b
                          : lastCapIdxInFull;
                const allowedUplineIds4b = new Set(
                    topIdx4b >= 1
                        ? distributorMemberChain.slice(1, topIdx4b + 1).map((m) => parseInt(m.id, 10))
                        : []
                );
                let uplineDistributors = distributorMemberChain.filter((u, idx) => idx >= 1 && allowedUplineIds4b.has(parseInt(u.id, 10)));
                console.log(`[佣金] 级差链 从推荐人上级起分销商数=${uplineDistributors.length}（同成本率不产生级差）`);
                console.log(`[佣金] 级差链(4b) 改为逐级结算模式：在团队链循环中按“有级差算级差、无级差算团队激励”处理`);
            } else {
                // 4c. 推荐人有分销等级但成本率为 0（分享模式）：在链路层数 cap 内找首个有成本率的分销商，给其「分销佣金」+ 再往上算级差
                console.log(
                    `[佣金] 推荐人为分享模式(costRate=0)，在链路前 ${distributorChainMaxDepth} 层内查找首个有成本率的分销商`
                );
                let nearestCost = null;
                for (const m of chainCap) {
                    const cr = this.getDistributorCostRate(m.distributorLevel);
                    if (cr > 0) {
                        nearestCost = m;
                        break;
                    }
                }
                if (nearestCost) {
                    const costRate = this.getDistributorCostRate(nearestCost.distributorLevel);
                    const costAmount = this.computeProcurementCostAmount(bases, nearestCost.distributorLevel, costRate).toFixed(2);
                    const grossCommissionAmount = (paidOrderAmount - parseFloat(costAmount)).toFixed(2);
                    const commissionAmount = Math.max(
                        0,
                        parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
                    ).toFixed(2);
                    const distAmt = parseFloat(commissionAmount);
                    if (distAmt > 0) {
                        calculations.push({
                            orderId,
                            memberId: member.id,
                            referrerId: referrer.id,
                            commissionType: 'distributor',
                            recipientId: nearestCost.id,
                            orderAmount: paidOrderAmount,
                            commissionRate: costRate,
                            commissionAmount: distAmt,
                            costRate,
                            costAmount: parseFloat(costAmount),
                            status: 'pending',
                            description: `分销佣金（实付毛利-直接-间接）：${nearestCost.nickname} 按 ${costRate}%×等级成本基数 计提货成本`
                        });
                        console.log(
                            `[佣金] 分销佣金 已生成(上家首个成本分销商，毛利-直-间) recipientId=${nearestCost.id} costRate=${costRate}% 金额=${commissionAmount}`
                        );
                    } else {
                        console.log(
                            `[佣金] 分销佣金 金额为0，不生成记录 recipientId=${nearestCost.id} costRate=${costRate}%`
                        );
                    }
                    const idxNearestFull = distributorMemberChain.findIndex(
                        (m) => parseInt(m.id, 10) === parseInt(nearestCost.id, 10)
                    );
                    const lastInCap4c = chainCap[chainCap.length - 1];
                    const lastCapIdxInFull4c = distributorMemberChain.findIndex(
                        (m) => parseInt(m.id, 10) === parseInt(lastInCap4c.id, 10)
                    );
                    const anchorSet4c = this._tierDiffAnchorMemberIds(distributorMemberChain);
                    let anchorIdx4c = -1;
                    if (anchorSet4c.size > 0) {
                        anchorIdx4c = distributorMemberChain.findIndex(
                            (m) => parseInt(m.id, 10) === [...anchorSet4c][0]
                        );
                    }
                    const topIdx4c =
                        anchorIdx4c >= 0 && lastCapIdxInFull4c >= 0
                            ? Math.max(lastCapIdxInFull4c, anchorIdx4c)
                            : anchorIdx4c >= 0
                              ? anchorIdx4c
                              : lastCapIdxInFull4c;
                    const uplineAllowed4c = new Set(
                        idxNearestFull >= 0 && topIdx4c > idxNearestFull
                            ? distributorMemberChain
                                  .slice(idxNearestFull + 1, topIdx4c + 1)
                                  .map((m) => parseInt(m.id, 10))
                            : []
                    );
                    const uplineDistributors = distributorMemberChain.filter((u, idx) =>
                        idx > idxNearestFull && uplineAllowed4c.has(parseInt(u.id, 10))
                    );
                    console.log(`[佣金] 级差链(4c) 上级分销商数=${uplineDistributors.length}（已按链路层数上限）`);
                    console.log(`[佣金] 级差链(4c) 改为逐级结算模式：在团队链循环中按“有级差算级差、无级差算团队激励”处理`);
                } else {
                    console.log(`[佣金] 推荐人上家链中无有成本率的分销商`);
                }
            }

            // 5. 团队拓展激励（按单）：链上各级「有级差算级差、无级差算团队激励」——已获 network_distributor>0 者不再占团队激励份额。
            const skipTeamIncentiveRecipientIds = new Set(
                calculations
                    .filter(
                        (c) =>
                            c.commissionType === 'network_distributor' &&
                            parseFloat(c.commissionAmount || 0) > 0
                    )
                    .map((c) => parseInt(c.recipientId, 10))
                    .filter((id) => Number.isFinite(id))
            );
            await this.appendPerOrderTeamIncentiveCalculations({
                orderId,
                member,
                referrer,
                orderAmount: paidOrderAmount,
                calculations,
                skipRecipientIds: skipTeamIncentiveRecipientIds,
                maxDepth: distributorChainMaxDepth,
                distributorMemberChain,
                bases
            });

            if (calculations.length === 0) {
                console.log(`[佣金] 订单 ${orderId} 无任何佣金记录生成（推荐人存在但各类型均未满足或比例为0）`);
            }
            return { calculations, noReferrer: false, referrerNotFound: false };
    }

    /**
     * @param {Set<number>} [skipRecipientIds] - 本单已获 network_distributor（级差）且金额>0 的会员，不参与团队激励分配
     * @param {number} maxDepth - 佣金设置「分销链最多经手层数」
     * @param {object[]} [distributorMemberChain] - 自推荐人起的完整分销链（未截断）；用于最后一档特级/合伙人兜底时在深层查找
     * @param {object} [bases] - getOrderCommerceBases 结果；用于特级/兜底档在团队链上补计级差
     */
    static async appendPerOrderTeamIncentiveCalculations({
        orderId,
        member,
        referrer,
        orderAmount,
        calculations,
        skipRecipientIds = null,
        maxDepth,
        distributorMemberChain = null,
        bases = null
    }) {
        const allocatedBefore = calculations.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
        let remainingBase = parseFloat((orderAmount - allocatedBefore).toFixed(2));
        if (remainingBase <= 0) return;
        const nonTeamPayoutRecipientIds = new Set(
            (calculations || [])
                .filter((c) => c && (c.commissionType === 'distributor' || c.commissionType === 'network_distributor'))
                .map((c) => parseInt(c.recipientId, 10))
                .filter((id) => Number.isFinite(id))
        );

        const envDepth = Math.max(1, parseInt(process.env.TEAM_INCENTIVE_MAX_DEPTH || '5', 10) || 5);
        const depthCap = Math.max(
            1,
            Number.isFinite(parseInt(maxDepth, 10)) && parseInt(maxDepth, 10) > 0 ? parseInt(maxDepth, 10) : envDepth
        );

        let fullChain;
        if (Array.isArray(distributorMemberChain)) {
            fullChain = distributorMemberChain;
        } else {
            fullChain = [];
            let currentId = referrer && referrer.id ? referrer.id : null;
            const visited = new Set();
            while (currentId) {
                if (visited.has(currentId)) {
                    console.warn(`[佣金] 团队链检测到推荐关系环，已中断 currentId=${currentId}`);
                    break;
                }
                visited.add(currentId);
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
        }
        fullChain = this._dedupeDistributorChainByMemberId(fullChain);
        if (fullChain.length === 0) return;

        let payoutChain = fullChain.slice(0, depthCap);
        // 最后一级强制对齐为「最近的特级/合伙人」；链上无特级时用最「高」分销等级兜底（在全链上查找，不受 depthCap 截断限制）
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
            const rid = parseInt(recipient.id, 10);
            if (skipRecipientIds && skipRecipientIds.size > 0 && Number.isFinite(rid) && skipRecipientIds.has(rid)) {
                console.log(
                    `[佣金] 团队拓展激励 跳过 recipientId=${rid}（本单已享级差 network_distributor，不参与团队激励）`
                );
                continue;
            }

            // 逐级结算：当前级若与紧邻下游存在正向级差金额，则先计 network_distributor；否则计 team_incentive
            if (bases) {
                const idx = fullChain.findIndex((m) => parseInt(m.id, 10) === rid);
                if (idx > 0) {
                    const downstream = fullChain[idx - 1];
                    if (downstream && downstream.distributorLevel && recipient.distributorLevel) {
                        const downRate = this.effectiveDistributorCostRate(downstream);
                        const upRate = this.effectiveDistributorCostRate(recipient);
                        const diffAmtFullBase = this.tierDiffAmountByLevels(
                            bases,
                            downstream.distributorLevel,
                            downRate,
                            recipient.distributorLevel,
                            upRate
                        );
                        if (diffAmtFullBase > 0) {
                            const downMoney = this.computeProcurementCostAmount(
                                bases,
                                downstream.distributorLevel,
                                downRate
                            );
                            const upMoney = this.computeProcurementCostAmount(
                                bases,
                                recipient.distributorLevel,
                                upRate
                            );
                            // 逐级金额法：当前剩余基数 - 本级成本额（而非“全单级差比例 × 剩余基数”）
                            const tierAmount = parseFloat((remainingBase - upMoney).toFixed(2));
                            if (tierAmount > 0) {
                                const effectiveRate = remainingBase > 0 ? parseFloat((tierAmount / remainingBase * 100).toFixed(2)) : 0;
                                calculations.push({
                                    orderId,
                                    memberId: member.id,
                                    referrerId: referrer.id,
                                    commissionType: 'network_distributor',
                                    recipientId: recipient.id,
                                    orderAmount: remainingBase,
                                    commissionRate: effectiveRate,
                                    commissionAmount: tierAmount,
                                    status: 'pending',
                                    description: `级差分销佣金（逐级结算）：当前剩余基数 ¥${remainingBase.toFixed(2)} − 本级成本额 ¥${upMoney.toFixed(2)}(${upRate}%) = ¥${tierAmount.toFixed(2)}；下游成本参考 ¥${downMoney.toFixed(2)}(${downRate}%)`
                                });
                                console.log(
                                    `[佣金] 逐级级差 已生成 recipientId=${rid} 有效比例=${effectiveRate}% 剩余基数=${remainingBase.toFixed(2)} 本级成本额=${upMoney.toFixed(2)} 金额=${tierAmount.toFixed(2)}`
                                );
                                nonTeamPayoutRecipientIds.add(rid);
                                remainingBase = parseFloat((remainingBase - tierAmount).toFixed(2));
                                continue;
                            }
                        }
                    }
                }
            }

            // 同一接收人在同一订单中，若已拿到分销/级差佣金，则不再发团队激励，避免重复入账。
            if (Number.isFinite(rid) && nonTeamPayoutRecipientIds.has(rid)) {
                console.log(
                    `[佣金] 团队拓展激励 跳过 recipientId=${rid}（本单已享分销或级差佣金，不重复发团队激励）`
                );
                continue;
            }

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

    /** 会员个人成本率优先，否则取分销等级默认成本率（与毛利佣金一致） */
    static effectiveDistributorCostRate(member) {
        if (!member || !member.distributorLevel) return 0;
        const p = member.personalCostRate;
        if (p != null && parseFloat(p) > 0) return parseFloat(p);
        return this.getDistributorCostRate(member.distributorLevel);
    }

    /** 提货成本比例基数：retail=订单零售价；cost=订单 SKU 成本合计 */
    static getCostRateBase(distributorLevel) {
        if (!distributorLevel) return 'retail';
        return distributorLevel.costRateBase === 'cost' ? 'cost' : 'retail';
    }

    static _normalizeAppliedPromotions(item) {
        const aps = item ? item.appliedPromotions : null;
        if (Array.isArray(aps)) return aps;
        if (typeof aps === 'string' && aps.trim()) {
            try {
                const parsed = JSON.parse(aps);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        }
        return [];
    }

    static _promotionCommissionConfig(promo) {
        const cfg = promo && promo.commissionConfig && typeof promo.commissionConfig === 'object'
            ? promo.commissionConfig
            : (promo && promo.rules && promo.rules.commissionConfig && typeof promo.rules.commissionConfig === 'object'
                ? promo.rules.commissionConfig
                : {});
        const enabled = !!(cfg.enabled === true || cfg.allowCommission === true);
        const costType = cfg.costType === 'fixed' ? 'fixed' : 'percent';
        const n = parseFloat(cfg.costValue);
        const costValue = Number.isFinite(n) && n > 0 ? n : 0;
        return { enabled, costType, costValue };
    }

    static _evaluatePromotionCommissionMeta(items) {
        if (!Array.isArray(items) || items.length === 0) {
            return { hasPromotion: false, commissionEnabled: false, totalCost: 0 };
        }
        let hasPromotion = false;
        let commissionEnabled = false;
        let totalCost = 0;
        for (const it of items) {
            const linePaid = this._orderItemPaidSubtotal(it);
            const qty = parseInt(it && it.quantity, 10) || 0;
            const promotions = this._normalizeAppliedPromotions(it);
            if (promotions.length) {
                hasPromotion = true;
                for (const promo of promotions) {
                    const cfg = this._promotionCommissionConfig(promo);
                    if (!cfg.enabled) continue;
                    commissionEnabled = true;
                    if (cfg.costType === 'fixed') {
                        totalCost += (cfg.costValue * Math.max(qty, 0));
                    } else {
                        totalCost += (linePaid * cfg.costValue / 100);
                    }
                }
                continue;
            }
            // 兼容历史订单：仅有 discounts(type=promotion)，但没有 appliedPromotions 详情
            let discounts = it ? it.discounts : null;
            if (typeof discounts === 'string' && discounts.trim()) {
                try { discounts = JSON.parse(discounts); } catch (_) { discounts = null; }
            }
            if (Array.isArray(discounts) && discounts.some((d) => d && d.type === 'promotion')) {
                hasPromotion = true;
            }
        }
        return {
            hasPromotion,
            commissionEnabled,
            totalCost: parseFloat((totalCost || 0).toFixed(2))
        };
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

    /** 行实付小计（用于分享/毛利佣金基数） */
    static _orderItemPaidSubtotal(it) {
        const t = parseFloat(it.totalAmount);
        return Number.isFinite(t) && t >= 0 ? t : 0;
    }

    /**
     * 佣金计算基数：
     * - retailAmount：参考零售价合计，仅用于按等级 costRateBase=retail 时的「采购成本」计算
     * - paidAmount：行实付合计，用于直接/间接/分销毛利（实付−成本−直间）及 orderAmount 落库展示
     * - skuCostTotal：SKU 成本合计，用于 costRateBase=cost 时的采购成本
     * 若配置了佣金除外商品且本订单行命中，则剔除对应行。
     * @returns {{ retailAmount: number, paidAmount: number, skuCostTotal: number }}
     */
    static async getOrderCommerceBases(order, options = {}) {
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
        let paidAmount = 0;
        let skuCostTotal = 0;
        const promotionCommissionCostRaw = parseFloat(options.promotionCommissionCost || 0);
        const promotionCommissionCost = Number.isFinite(promotionCommissionCostRaw) && promotionCommissionCostRaw > 0
            ? promotionCommissionCostRaw
            : 0;

        if (excludedSet.size === 0) {
            for (const it of items) {
                retailAmount += this._orderItemRetailSubtotal(it);
                paidAmount += this._orderItemPaidSubtotal(it);
                skuCostTotal += this._orderItemSkuCost(it);
            }
            retailAmount = parseFloat(retailAmount.toFixed(2));
            paidAmount = parseFloat(paidAmount.toFixed(2));
            skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
            if (items.length === 0) {
                paidAmount = parseFloat(parseFloat(order.totalAmount || 0).toFixed(2));
            }
            if (promotionCommissionCost > 0) {
                paidAmount = Math.max(0, parseFloat((paidAmount - promotionCommissionCost).toFixed(2)));
            }
            return { retailAmount, paidAmount, skuCostTotal, promotionCommissionCost };
        }

        const hasExcludedLine = items.some((it) => {
            const pid = this._resolveOrderItemProductId(it);
            return pid && excludedSet.has(pid);
        });

        if (!hasExcludedLine) {
            for (const it of items) {
                retailAmount += this._orderItemRetailSubtotal(it);
                paidAmount += this._orderItemPaidSubtotal(it);
                skuCostTotal += this._orderItemSkuCost(it);
            }
            retailAmount = parseFloat(retailAmount.toFixed(2));
            paidAmount = parseFloat(paidAmount.toFixed(2));
            skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
            if (items.length === 0) {
                paidAmount = parseFloat(parseFloat(order.totalAmount || 0).toFixed(2));
            }
            if (promotionCommissionCost > 0) {
                paidAmount = Math.max(0, parseFloat((paidAmount - promotionCommissionCost).toFixed(2)));
            }
            return { retailAmount, paidAmount, skuCostTotal, promotionCommissionCost };
        }

        let commissionableRetail = 0;
        let commissionablePaid = 0;
        let excludedRetailSum = 0;
        let excludedPaidSum = 0;
        for (const it of items) {
            const pid = this._resolveOrderItemProductId(it);
            const lineRetail = this._orderItemRetailSubtotal(it);
            const linePaid = this._orderItemPaidSubtotal(it);
            const lineCost = this._orderItemSkuCost(it);
            if (pid && excludedSet.has(pid)) {
                excludedRetailSum += lineRetail;
                excludedPaidSum += linePaid;
                continue;
            }
            commissionableRetail += lineRetail;
            commissionablePaid += linePaid;
            skuCostTotal += lineCost;
        }
        retailAmount = parseFloat(commissionableRetail.toFixed(2));
        paidAmount = parseFloat(commissionablePaid.toFixed(2));
        skuCostTotal = parseFloat(skuCostTotal.toFixed(2));
        console.log(`[佣金] 订单行含佣金除外商品，除外参考零售约 ¥${excludedRetailSum.toFixed(2)}、除外实付约 ¥${excludedPaidSum.toFixed(2)}；可计佣金参考零售 ¥${retailAmount.toFixed(2)}、实付 ¥${paidAmount.toFixed(2)}`);
        if (promotionCommissionCost > 0) {
            paidAmount = Math.max(0, parseFloat((paidAmount - promotionCommissionCost).toFixed(2)));
        }
        return { retailAmount, paidAmount, skuCostTotal, promotionCommissionCost };
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
        const paidAmount = bases.paidAmount != null ? bases.paidAmount : bases.retailAmount;
        const costRate = referrer.personalCostRate ||
                        (referrer.distributorLevel ? this.getDistributorCostRate(referrer.distributorLevel) : 0);

        if (costRate <= 0) return null;
        const dl = referrer.distributorLevel;
        if (dl && (dl.costRate == null || parseFloat(dl.costRate) <= 0) && dl.procurementCost > 0) {
            console.log(`[佣金] 分销商佣金 使用 procurementCost 回退 等级=${dl.name} procurementCost=${dl.procurementCost} => costRate=${costRate}%`);
        }

        const costAmount = this.computeProcurementCostAmount(bases, dl, costRate).toFixed(2);
        const grossCommissionAmount = (paidAmount - parseFloat(costAmount)).toFixed(2);
        const commissionAmount = Math.max(
            0,
            parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
        ).toFixed(2);
        const amt = parseFloat(commissionAmount);
        if (amt <= 0) {
            console.log(`[佣金] 分销商佣金 毛利扣直间后为0，不生成记录 referrerId=${referrerId} costRate=${costRate}%`);
            return null;
        }

        const baseLabel = dl && this.getCostRateBase(dl) === 'cost' ? '成本价合计' : '参考零售价';
        return {
            orderId,
            memberId,
            referrerId,
            commissionType: 'distributor',
            recipientId: referrerId,
            orderAmount: paidAmount,
            commissionRate: costRate,
            commissionAmount: amt,
            costRate,
            costAmount: parseFloat(costAmount),
            status: 'pending',
            description: `分销佣金（实付毛利-直接-间接）：${referrer.nickname} 提货成本按 ${costRate}%×${baseLabel}，毛利按订单实付`
        };
    }

    /**
     * 计算网络分销商佣金（同一订单基数按差额：分销毛利佣金 - 直接 - 间接）
     * @param {object[]|null} chainCap - 已按佣金设置截断的分销链；与级差/团队激励共用层数上限
     */
    static async calculateNetworkDistributorCommission(
        orderId,
        memberId,
        referrerId,
        bases,
        referrer,
        directAmount = 0,
        indirectAmount = 0,
        chainCap = null
    ) {
        const paidAmount = bases.paidAmount != null ? bases.paidAmount : bases.retailAmount;
        let networkDistributor;
        if (Array.isArray(chainCap) && chainCap.length > 0) {
            networkDistributor = chainCap[0];
        } else {
            networkDistributor = await this.findNearestDistributorInNetwork(referrerId);
        }

        if (!networkDistributor) return null;

        const capIdSet =
            Array.isArray(chainCap) && chainCap.length > 0
                ? new Set(chainCap.map((m) => parseInt(m.id, 10)))
                : null;

        let otherDistributors = await this.findOtherDistributorsInNetwork(
            networkDistributor.referrerId,
            networkDistributor.id
        );
        if (capIdSet) {
            otherDistributors = otherDistributors.filter((d) => capIdSet.has(parseInt(d.id, 10)));
        }

        if (otherDistributors.length === 0) {
            const costRate = networkDistributor.personalCostRate ||
                           (networkDistributor.distributorLevel ? this.getDistributorCostRate(networkDistributor.distributorLevel) : 0);

            if (costRate <= 0) return null;

            const costAmount = this.computeProcurementCostAmount(bases, networkDistributor.distributorLevel, costRate).toFixed(2);
            const grossCommissionAmount = (paidAmount - parseFloat(costAmount)).toFixed(2);
            const commissionAmount = Math.max(
                0,
                parseFloat((parseFloat(grossCommissionAmount) - directAmount - indirectAmount).toFixed(2))
            ).toFixed(2);

            const ndl = networkDistributor.distributorLevel;
            const baseLabel = ndl && this.getCostRateBase(ndl) === 'cost' ? '成本价合计' : '参考零售价';
            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount: paidAmount,
                commissionRate: costRate,
                commissionAmount: parseFloat(commissionAmount),
                costRate,
                costAmount: parseFloat(costAmount),
                status: 'pending',
                description: `网络分销商佣金（实付毛利-直接-间接）：${networkDistributor.nickname} 提货成本按 ${costRate}%×${baseLabel}，毛利按订单实付`
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

            if (!maxDistributor) return null;

            const amtNearest = this.computeProcurementCostAmount(bases, networkDistributor.distributorLevel, nearestCostRate);
            const amtMax = this.computeProcurementCostAmount(bases, maxDistributor.distributorLevel, maxCostRate);
            const diffCommission = parseFloat((amtNearest - amtMax).toFixed(2));
            if (diffCommission <= 0) return null;

            const commissionAmount = diffCommission.toFixed(2);
            const effectiveRate = paidAmount > 0 ? parseFloat((diffCommission / paidAmount * 100).toFixed(2)) : 0;

            return {
                orderId,
                memberId,
                referrerId,
                commissionType: 'network_distributor',
                recipientId: networkDistributor.id,
                orderAmount: paidAmount,
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

    /**
     * 订单退款完成后撤销佣金：
     * - pending -> cancelled
     * - confirmed -> 先冲减会员余额，再置为 cancelled
     */
    static async cancelOrderCommissionsForRefund(orderId, opts = {}) {
        if (!orderId) {
            throw new Error('orderId 不能为空');
        }
        const operatorId = opts.operatorId || null;
        const reason = (opts.reason && String(opts.reason).trim()) || '订单退款完成自动冲正';

        return sequelize.transaction(async (t) => {
            const rows = await CommissionCalculation.findAll({
                where: {
                    orderId,
                    status: { [Op.in]: ['pending', 'confirmed'] }
                },
                transaction: t,
                lock: t.LOCK.UPDATE
            });

            if (!rows || rows.length === 0) {
                return { cancelledCount: 0, reversedCount: 0, totalAmount: 0 };
            }

            let cancelledCount = 0;
            let reversedCount = 0;
            let totalAmount = 0;

            for (const row of rows) {
                const amount = parseFloat(row.commissionAmount || 0);
                if (amount > 0) {
                    totalAmount += amount;
                }

                if (row.status === 'confirmed') {
                    const recipient = await Member.findByPk(row.recipientId, {
                        transaction: t,
                        lock: t.LOCK.UPDATE
                    });
                    if (recipient && amount > 0) {
                        if (row.commissionType === 'team_incentive') {
                            await recipient.increment('availableTeamIncentive', { by: -amount, transaction: t });
                            await recipient.increment('totalTeamIncentive', { by: -amount, transaction: t });
                        } else {
                            await recipient.increment('availableCommission', { by: -amount, transaction: t });
                            await recipient.increment('totalCommission', { by: -amount, transaction: t });
                        }
                    }
                    reversedCount += 1;
                }

                const nextDesc = row.description
                    ? `${row.description}\n[退款冲正] ${reason}${operatorId ? `（操作人:${operatorId}）` : ''}`
                    : `[退款冲正] ${reason}${operatorId ? `（操作人:${operatorId}）` : ''}`;

                await row.update({
                    status: 'cancelled',
                    description: nextDesc
                }, { transaction: t });
                cancelledCount += 1;
            }

            return { cancelledCount, reversedCount, totalAmount: Number(totalAmount.toFixed(2)) };
        });
    }
}

module.exports = CommissionService;