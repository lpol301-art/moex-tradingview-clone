// frontend/src/volumeProfile.js

/**
 * Расчёт профиля объёма по цене.
 * candles: [{ time, open, high, low, close, volume }]
 * binsCount – сколько корзин по цене (меньше = толще уровни).
 */
export function calculateVolumeProfile(candles, binsCount = 24) {
  if (!candles || candles.length === 0) return [];

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));

  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice === maxPrice) {
    return [];
  }

  const priceRange = maxPrice - minPrice;
  const binSize = priceRange / binsCount;

  const bins = Array.from({ length: binsCount }, (_, i) => ({
    priceFrom: minPrice + binSize * i,
    priceTo: minPrice + binSize * (i + 1),
    volume: 0,
  }));

  // Очень простое распределение: весь объём свечи идёт в корзину по средней цене
  candles.forEach((c) => {
    const centerPrice = (c.high + c.low + c.open + c.close) / 4;
    const index = Math.floor((centerPrice - minPrice) / binSize);
    if (index >= 0 && index < bins.length) {
      bins[index].volume += c.volume;
    }
  });

  return bins;
}
