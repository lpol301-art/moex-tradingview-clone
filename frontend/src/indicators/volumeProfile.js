// frontend/src/indicators/volumeProfile.js

/**
 * РЕЖИМЫ ПРОФИЛЯ:
 *  - visible: по видимым свечам (в окне графика)
 *  - all: по всем свечам, но в пределах текущего ценового диапазона
 *  - lastN: по последним N свечам
 *  - selection: по свечам из выделенного диапазона (ChartCanvas передаёт selectionCandles)
 */
export const PROFILE_MODE_VISIBLE = "visible";
export const PROFILE_MODE_ALL = "all";
export const PROFILE_MODE_LAST_N = "lastN";
export const PROFILE_MODE_SELECTION = "selection";

/**
 * БАЗОВЫЕ НАСТРОЙКИ ПРОФИЛЯ.
 *
 * Их потом можно будет менять из UI (например, «плотность профиля», «VA 70%/80%»).
 */
export const defaultProfileSettings = {
  // целевое число бинов (если нельзя вычислить по "тику")
  targetBins: 40,
  // минимальное и максимальное количество бинов
  minBins: 20,
  maxBins: 200,
  // доля объёма для Value Area (0.7 = 70%)
  valueAreaPercent: 0.7,
};

/**
 * Основной профиль справа от графика.
 *
 * ctx — контекст canvas
 * options:
 *  - width, paddingLeft, paddingRight
 *  - priceTop, priceBottom
 *  - candlesAll: все свечи (массив)
 *  - candlesVisible: видимые свечи (массив)
 *  - selectionCandles: свечи в выделенном диапазоне (если режим selection)
 *  - minPrice, maxPrice: диапазон цен (по видимым свечам)
 *  - profileMode: visible | all | lastN | selection
 *  - lastN: число свечей для режима lastN
 *  - profileSettings: объект с настройками (можно не передавать, тогда берётся defaultProfileSettings)
 */
export function renderVolumeProfile(ctx, options) {
  const {
    width,
    paddingLeft,
    paddingRight,
    priceTop,
    priceBottom,
    candlesAll,
    candlesVisible,
    selectionCandles,
    minPrice,
    maxPrice,
    profileMode = PROFILE_MODE_VISIBLE,
    lastN = 100,
    profileSettings = defaultProfileSettings,
  } = options;

  const all = Array.isArray(candlesAll) ? candlesAll : [];
  const visible = Array.isArray(candlesVisible) ? candlesVisible : all;
  const selected = Array.isArray(selectionCandles)
    ? selectionCandles
    : [];

  if (!visible.length && !all.length) return;
  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice === maxPrice) {
    return;
  }

  // --- выбираем источник данных по режиму ---
  let sourceCandles;

  switch (profileMode) {
    case PROFILE_MODE_ALL:
      sourceCandles = all;
      break;

    case PROFILE_MODE_LAST_N: {
      const cnt = Math.max(1, lastN | 0);
      sourceCandles = all.slice(-cnt);
      break;
    }

    case PROFILE_MODE_SELECTION:
      if (selected.length === 0) return;
      sourceCandles = selected;
      break;

    case PROFILE_MODE_VISIBLE:
    default:
      sourceCandles = visible;
      break;
  }

  if (!sourceCandles || !sourceCandles.length) return;

  // --- считаем профиль ---
  const profile = computeVolumeProfile(
    sourceCandles,
    minPrice,
    maxPrice,
    profileSettings
  );

  if (!profile || !profile.bins || !profile.bins.length) return;

  const { bins, pocIndex, valueAreaLow, valueAreaHigh } = profile;

  // --- рисуем профиль справа + POC / VA ---
  drawVolumeProfileRightSide(
    ctx,
    bins,
    pocIndex,
    valueAreaLow,
    valueAreaHigh,
    width,
    paddingLeft,
    paddingRight,
    priceTop,
    priceBottom,
    minPrice,
    maxPrice
  );
}

/**
 * Профиль внутри прямоугольника pinned-зоны.
 *
 * ВАЖНО: теперь бары "прижаты" к ПРАВОМУ краю прямоугольника (rectX2)
 * и растут ВЛЕВО — как session profile в профессиональных платформах.
 *
 * options:
 *  - candles: массив свечей для этой pinned-зоны
 *  - minPrice, maxPrice
 *  - rectX1, rectX2 — границы прямоугольника по X
 *  - priceTop, priceBottom — границы ценовой области по Y
 *  - profileSettings: настройки профиля (можно не передавать)
 */
export function renderVolumeProfileInRect(ctx, options) {
  const {
    candles,
    minPrice,
    maxPrice,
    rectX1,
    rectX2,
    priceTop,
    priceBottom,
    profileSettings = defaultProfileSettings,
  } = options;

  const src = Array.isArray(candles) ? candles : [];
  if (!src.length) return;
  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice === maxPrice) {
    return;
  }

  const profile = computeVolumeProfile(
    src,
    minPrice,
    maxPrice,
    profileSettings
  );
  if (!profile || !profile.bins || !profile.bins.length) return;

  const { bins } = profile;

  drawVolumeProfileInRectInternal(
    ctx,
    bins,
    rectX1,
    rectX2,
    priceTop,
    priceBottom,
    minPrice,
    maxPrice
  );
}

/* =============================== */
/* ===== МАТЕМАТИКА ПРОФИЛЯ ====== */
/* =============================== */

/**
 * Профессиональный профиль объёма по диапазону цен.
 *
 * candles: массив свечей [{high, low, close, volume, ...}]
 * minPrice, maxPrice: диапазон цены, в котором строим профиль
 * profileSettings: настройки (bins, valueAreaPercent и т.п.)
 */
function computeVolumeProfile(candles, minPrice, maxPrice, profileSettings) {
  const cfg = profileSettings || defaultProfileSettings;

  if (!candles || candles.length === 0) {
    return {
      bins: [],
      pocIndex: -1,
      valueAreaLow: null,
      valueAreaHigh: null,
    };
  }

  if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice === maxPrice) {
    return {
      bins: [],
      pocIndex: -1,
      valueAreaLow: null,
      valueAreaHigh: null,
    };
  }

  const priceRange = maxPrice - minPrice;

  // Оценка "тика" по закрытиям свечей
  let tickSize = null;
  try {
    const prices = Array.from(
      new Set(
        candles
          .map((c) => Number(c.close))
          .filter((v) => isFinite(v))
      )
    ).sort((a, b) => a - b);

    let minDiff = Infinity;
    for (let i = 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      if (d > 0 && d < minDiff) {
        minDiff = d;
      }
    }

    if (isFinite(minDiff) && minDiff > 0) {
      tickSize = minDiff;
    }
  } catch (e) {
    tickSize = null;
  }

  // Кол-во бинов: либо по тику, либо около targetBins
  let binsCount;
  if (tickSize && tickSize > 0) {
    binsCount = Math.round(priceRange / tickSize);
  } else {
    binsCount = cfg.targetBins;
  }

  binsCount = Math.max(
    cfg.minBins ?? 20,
    Math.min(cfg.maxBins ?? 200, binsCount)
  );
  if (!isFinite(binsCount) || binsCount <= 0) {
    binsCount = cfg.targetBins ?? 40;
  }

  const step = priceRange / binsCount;

  // создаём бины
  const bins = [];
  for (let i = 0; i < binsCount; i++) {
    const p1 = minPrice + i * step;
    const p2 = p1 + step;
    bins.push({
      index: i,
      priceLow: p1,
      priceHigh: p2,
      volume: 0,
    });
  }

  // распределяем объём свечей по бинам
  for (const c of candles) {
    const low = Math.max(c.low, minPrice);
    const high = Math.min(c.high, maxPrice);
    const vol = c.volume || 0;

    if (!isFinite(low) || !isFinite(high) || high < low || vol <= 0) {
      continue;
    }

    const startBin = Math.max(
      0,
      Math.floor(((low - minPrice) / priceRange) * binsCount)
    );
    const endBin = Math.min(
      binsCount - 1,
      Math.floor(((high - minPrice) / priceRange) * binsCount)
    );

    const binsCovered = Math.max(1, endBin - startBin + 1);
    const volPerBin = vol / binsCovered;

    for (let i = startBin; i <= endBin; i++) {
      bins[i].volume += volPerBin;
    }
  }

  // суммарный объём
  let totalVol = 0;
  for (const b of bins) {
    totalVol += b.volume;
  }
  if (totalVol <= 0) {
    return {
      bins,
      pocIndex: -1,
      valueAreaLow: null,
      valueAreaHigh: null,
    };
  }

  // POC
  let pocIndex = 0;
  let maxBinVol = bins[0].volume;
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].volume > maxBinVol) {
      maxBinVol = bins[i].volume;
      pocIndex = i;
    }
  }

  // Value Area (по cfg.valueAreaPercent, обычно 0.7 = 70%)
  const vaPercent =
    typeof cfg.valueAreaPercent === "number" ? cfg.valueAreaPercent : 0.7;
  const targetVol = totalVol * vaPercent;
  let accumulated = bins[pocIndex].volume;
  let left = pocIndex;
  let right = pocIndex;

  while (accumulated < targetVol) {
    const volLeft = left > 0 ? bins[left - 1].volume : -Infinity;
    const volRight =
      right < bins.length - 1 ? bins[right + 1].volume : -Infinity;

    if (volLeft === -Infinity && volRight === -Infinity) {
      break;
    }

    if (volRight > volLeft) {
      right++;
      accumulated += bins[right].volume;
    } else {
      left--;
      accumulated += bins[left].volume;
    }
  }

  const valueAreaLow = bins[left].priceLow;
  const valueAreaHigh = bins[right].priceHigh;

  return {
    bins,
    pocIndex,
    valueAreaLow,
    valueAreaHigh,
  };
}

/* =============================== */
/* ===== ОТРИСОВКА ПРОФИЛЯ ======= */
/* =============================== */

/**
 * Профиль справа (основной).
 * Гистограмма + линии POC / VAH / VAL.
 */
function drawVolumeProfileRightSide(
  ctx,
  bins,
  pocIndex,
  valueAreaLow,
  valueAreaHigh,
  width,
  paddingLeft,
  paddingRight,
  priceTop,
  priceBottom,
  minPrice,
  maxPrice
) {
  if (!bins || !bins.length) return;

  const profileWidth = 50;
  const xRight = width - paddingRight - 2;
  const xLeft = xRight - profileWidth;

  // max volume
  let maxBinVol = 0;
  for (const b of bins) {
    if (b.volume > maxBinVol) maxBinVol = b.volume;
  }
  if (maxBinVol <= 0) return;

  const priceRange = maxPrice - minPrice;
  const priceToY = (price) => {
    const t = (price - minPrice) / (priceRange || 1);
    return priceBottom - t * (priceBottom - priceTop);
  };

  ctx.save();

  // палочки профиля
  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    const volRatio = b.volume / maxBinVol;
    const barWidth = volRatio * profileWidth;

    const yTop = priceToY(b.priceHigh);
    const yBottom = priceToY(b.priceLow);
    const h = Math.max(1, yBottom - yTop);

    let fill = "rgba(100, 149, 237, 0.35)";

    if (
      valueAreaLow != null &&
      valueAreaHigh != null &&
      b.priceLow >= valueAreaLow &&
      b.priceHigh <= valueAreaHigh
    ) {
      fill = "rgba(100, 149, 237, 0.6)";
    }

    if (i === pocIndex) {
      fill = "rgba(255, 140, 0, 0.9)";
    }

    ctx.fillStyle = fill;
    ctx.fillRect(xRight - barWidth, yTop, barWidth, h);
  }

  // линии POC / VA
  ctx.setLineDash([6, 4]);

  // POC
  if (pocIndex >= 0 && pocIndex < bins.length) {
    const pocBin = bins[pocIndex];
    const pocPrice = (pocBin.priceLow + pocBin.priceHigh) / 2;
    const yPoc = priceToY(pocPrice);

    ctx.strokeStyle = "rgba(255, 140, 0, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yPoc);
    ctx.lineTo(xRight, yPoc);
    ctx.stroke();

    const label = "POC";
    ctx.font = "10px sans-serif";
    const textWidth = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255, 140, 0, 0.9)";
    ctx.fillText(label, xLeft - textWidth - 4, yPoc + 3);
  }

  // VAH / VAL
  if (valueAreaLow != null && valueAreaHigh != null) {
    const yVAL = priceToY(valueAreaLow);
    const yVAH = priceToY(valueAreaHigh);

    ctx.strokeStyle = "rgba(100, 149, 237, 0.8)";
    ctx.lineWidth = 1;

    // VAL
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yVAL);
    ctx.lineTo(xRight, yVAL);
    ctx.stroke();

    // VAH
    ctx.beginPath();
    ctx.moveTo(paddingLeft, yVAH);
    ctx.lineTo(xRight, yVAH);
    ctx.stroke();

    ctx.font = "10px sans-serif";
    ctx.fillStyle = "rgba(100, 149, 237, 0.9)";

    const valLabel = "VAL";
    const vahLabel = "VAH";

    const valWidth = ctx.measureText(valLabel).width;
    const vahWidth = ctx.measureText(vahLabel).width;

    ctx.fillText(valLabel, xLeft - valWidth - 4, yVAL + 3);
    ctx.fillText(vahLabel, xLeft - vahWidth - 4, yVAH + 3);
  }

  ctx.restore();
}

/**
 * Горизонтальный профиль внутри прямоугольника pinned-зоны.
 *
 * БАРЫ ПРИЖАТЫ К ПРАВОЙ ГРАНИЦЕ (rectX2) и растут ВЛЕВО:
 *   xRight = rectX2
 *   xLeft  = xRight - barWidth
 */
function drawVolumeProfileInRectInternal(
  ctx,
  bins,
  rectX1,
  rectX2,
  priceTop,
  priceBottom,
  minPrice,
  maxPrice
) {
  if (!bins || !bins.length) return;
  if (rectX2 <= rectX1) return;

  const profileWidth = rectX2 - rectX1; // ширина зоны, куда можно рисовать

  // max volume
  let maxBinVol = 0;
  for (const b of bins) {
    if (b.volume > maxBinVol) maxBinVol = b.volume;
  }
  if (maxBinVol <= 0) return;

  const priceRange = maxPrice - minPrice;
  const priceToY = (price) => {
    const t = (price - minPrice) / (priceRange || 1);
    return priceBottom - t * (priceBottom - priceTop);
  };

  const xRight = rectX2;

  ctx.save();

  for (let i = 0; i < bins.length; i++) {
    const b = bins[i];
    const volRatio = b.volume / maxBinVol;
    const barWidth = volRatio * profileWidth;

    const yTop = priceToY(b.priceHigh);
    const yBottom = priceToY(b.priceLow);
    const h = Math.max(1, yBottom - yTop);

    // профиль внутри pinned-зоны — фиолетовый, полупрозрачный
    ctx.fillStyle = "rgba(156, 39, 176, 0.45)";
    const xLeft = xRight - barWidth;
    ctx.fillRect(xLeft, yTop, barWidth, h);
  }

  ctx.restore();
}
