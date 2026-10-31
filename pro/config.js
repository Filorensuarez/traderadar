export const DEFAULTS = Object.freeze({
  thresholdPct: 2, volumeFilter: false, minVolumeRatio: 1.5,
  maxSpreadPct: 0.45, minBuyShare: 0.55, minIndependentGroups: 2,
  targetPct: 2, horizonMinutes: 15, commissionPct: 0.1,
  slippagePct: 0.1, minimumSample: 100, staleMs: 5000,
});

const limits = {
  thresholdPct: [0.1, 50], minVolumeRatio: [0.1, 100], maxSpreadPct: [0.01, 10],
  minBuyShare: [0.5, 1], minIndependentGroups: [2, 4], targetPct: [0.1, 100],
  horizonMinutes: [1, 60], commissionPct: [0, 5], slippagePct: [0, 5],
  minimumSample: [30, 10000], staleMs: [2000, 30000],
};
export function settings(patch = {}, previous = DEFAULTS) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw Error('Ayar nesnesi gerekli');
  const result = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw Error('Bilinmeyen ayar');
    if (key === 'volumeFilter') {
      if (typeof value !== 'boolean') throw Error('Hacim filtresi boolean olmalı');
    } else {
      const [min, max] = limits[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error('Ayar aralık dışında: ' + key);
      if (['minIndependentGroups', 'horizonMinutes', 'minimumSample', 'staleMs'].includes(key) && !Number.isInteger(value)) throw Error('Tam sayı gerekli');
    }
    result[key] = value;
  }
  return result;
}
