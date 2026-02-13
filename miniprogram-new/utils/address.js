/**
 * 地址相关工具（省市区与详细地址拆分等）
 */

/**
 * 将地图选点返回的完整地址拆分为 region（省市区）和 detail（详细地址）
 * @param {string} fullAddress - 完整地址
 * @param {string} name - 选点名称（如 POI）
 * @returns {{ region: string, detail: string }}
 */
function splitRegionDetail(fullAddress, name) {
  const pattern = /(.*?(省|市|自治区|特别行政区))?(.*?(市|州|盟))?(.*?(区|县|旗))/;
  const match = (fullAddress || '').match(pattern);
  if (match && match[0]) {
    const region = match[0].trim();
    const rest = (fullAddress || '').slice(region.length).trim();
    const detailParts = [rest, name].filter(Boolean);
    return {
      region,
      detail: detailParts.join(' ').trim() || name || fullAddress || ''
    };
  }
  return {
    region: '',
    detail: [fullAddress, name].filter(Boolean).join(' ').trim()
  };
}

module.exports = {
  splitRegionDetail
};
