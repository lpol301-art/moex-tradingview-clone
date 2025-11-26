// frontend/src/ChartCanvas.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * props:
 *  - candles: [{ time: Date, open, high, low, close, volume }]
 *  - chartType: "candles" | "bars" | "line"
 *  - interval: number (минуты; 1440 = день)
 *  - profileMode: "visible" | "all" | "lastN" | "selection"
 *  - profileSettings: { targetBins, minBins, maxBins, valueAreaPercent }
 */

const BACKGROUND = "#0b1120";
const GRID_COLOR = "#1e293b";
const AXIS_COLOR = "#94a3b8";
const TEXT_FONT = "11px system-ui";
const CANDLE_UP = "#22c55e";
const CANDLE_DOWN = "#ef4444";
const LINE_COLOR = "#38bdf8";
const VOLUME_COLOR = "#60a5fa";
const PROFILE_FILL = "rgba(168, 85, 247, 0.55)";
const PROFILE_BORDER = "rgba(168, 85, 247, 0.8)";
const PROFILE_BAR = "#e879f9";

const MAIN_PROFILE_COLOR = "rgba(96, 165, 250, 0.35)";
const MAIN_PROFILE_BAR = "#60a5fa";

const VOLUME_HEIGHT_RATIO = 0.22;
const RIGHT_AXIS_WIDTH = 60;
const BOTTOM_AXIS_HEIGHT = 24;
const PROFILE_RIGHT_MARGIN = 14;
const PROFILE_WIDTH = 120;
const PINNED_MIN_WIDTH_PX = 20;

function ChartCanvas({
  candles,
  chartType,
  interval,
  profileMode,
  profileSettings,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [size, setSize] = useState({ width: 300, height: 200 });

  // видимый диапазон (индексы свечей)
  const [view, setView] = useState({ from: 0, to: 100 });

  // кроссхайр
  const [crosshair, setCrosshair] = useState({
    active: false,
    x: 0,
    y: 0,
    candleIndex: null,
  });

  // панорамирование
  const panState = useRef({
    isPanning: false,
    startX: 0,
    startFrom: 0,
    startTo: 0,
  });

  // выделение профиля (selection mode)
  const [selection, setSelection] = useState(null); // { startX, endX }
  const [pinnedProfiles, setPinnedProfiles] = useState([]); // { from, to }

  // ========================
  //   Resize обработчик
  // ========================
  useEffect(() => {
    function handleResize() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      setSize({ width: canvas.width, height: canvas.height });
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Инициализируем видимый диапазон при изменении свечей
  useEffect(() => {
    if (!candles || candles.length === 0) {
      setView({ from: 0, to: 100 });
      return;
    }
    const count = candles.length;
    const windowSize = Math.min(200, count);
    const from = Math.max(0, count - windowSize);
    const to = count;
    setView({ from, to });
  }, [candles]);

  // ========================
  //   Маппинг индекса -> X
  // ========================
  function xForIndex(index, from, to, plotWidth, offsetX) {
    const visibleCount = Math.max(1, to - from);
    const frac = (index - from) / visibleCount;
    return offsetX + frac * plotWidth;
  }

  function indexForX(x, from, to, plotWidth, offsetX) {
    const visibleCount = Math.max(1, to - from);
    const frac = (x - offsetX) / plotWidth;
    const idx = from + frac * visibleCount;
    return Math.floor(idx);
  }

  // ========================
  //       Формат времени
  // ========================
  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }

  // формат на оси X
  function formatAxisTime(date) {
    if (!(date instanceof Date)) return "";
    const d = date;
    if (interval >= 1440) {
      // дневка и больше -> месяцы
      const monthNames = [
        "Янв",
        "Фев",
        "Мар",
        "Апр",
        "Май",
        "Июн",
        "Июл",
        "Авг",
        "Сен",
        "Окт",
        "Ноя",
        "Дек",
      ];
      return `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    } else {
      // ниже дневки -> дни
      return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
    }
  }

  // формат для хинта кроссхайра
  function formatFullDateTime(date) {
    if (!(date instanceof Date)) return "";
    const d = date;
    return `${pad2(d.getDate())}.${pad2(
      d.getMonth() + 1
    )}.${String(d.getFullYear()).slice(2)} ${pad2(d.getHours())}:${pad2(
      d.getMinutes()
    )}`;
  }

  // ========================
  //       Расчёт профиля
  // ========================
  function computeVolumeProfile(candlesSlice, settings, priceMin, priceMax) {
    const { targetBins, minBins, maxBins, valueAreaPercent } =
      settings || {};

    if (!candlesSlice || candlesSlice.length === 0) {
      return { bins: [], valueArea: null };
    }

    const pMin = Math.min(
      priceMin ?? Math.min(...candlesSlice.map((c) => c.low)),
      Math.min(...candlesSlice.map((c) => c.low))
    );
    const pMax = Math.max(
      priceMax ?? Math.max(...candlesSlice.map((c) => c.high)),
      Math.max(...candlesSlice.map((c) => c.high))
    );
    if (!isFinite(pMin) || !isFinite(pMax) || pMax <= pMin) {
      return { bins: [], valueArea: null };
    }

    const idealBins = targetBins || 40;
    const range = pMax - pMin;
    let binsCount = idealBins;
    if (minBins) binsCount = Math.max(minBins, binsCount);
    if (maxBins) binsCount = Math.min(maxBins, binsCount);

    const binSize = range / binsCount;
    const volumes = new Array(binsCount).fill(0);

    for (const c of candlesSlice) {
      const price = (c.high + c.low) / 2;
      const v = c.volume || 0;
      if (!isFinite(price) || !isFinite(v) || v <= 0) continue;
      let idx = Math.floor((price - pMin) / binSize);
      if (idx < 0) idx = 0;
      if (idx >= binsCount) idx = binsCount - 1;
      volumes[idx] += v;
    }

    const bins = [];
    for (let i = 0; i < binsCount; i++) {
      const binPriceLow = pMin + binSize * i;
      const binPriceHigh = binPriceLow + binSize;
      bins.push({
        priceLow: binPriceLow,
        priceHigh: binPriceHigh,
        volume: volumes[i],
      });
    }

    // Value Area (простое 1D)
    const totalVolume = volumes.reduce((a, b) => a + b, 0);
    if (!isFinite(totalVolume) || totalVolume <= 0) {
      return { bins, valueArea: null };
    }
    const target = totalVolume * (valueAreaPercent || 0.7);
    const sorted = bins
      .map((b, idx) => ({ idx, volume: b.volume }))
      .sort((a, b) => b.volume - a.volume);

    let acc = 0;
    let used = new Set();
    for (const s of sorted) {
      acc += s.volume;
      used.add(s.idx);
      if (acc >= target) break;
    }

    const inVA = bins.filter((_, idx) => used.has(idx));
    const vaLow = Math.min(...inVA.map((b) => b.priceLow));
    const vaHigh = Math.max(...inVA.map((b) => b.priceHigh));
    const pocBin = bins.reduce(
      (best, b) => (b.volume > best.volume ? b : best),
      { volume: -Infinity }
    );

    return {
      bins,
      valueArea: {
        vaLow,
        vaHigh,
        poc: (pocBin.priceLow + pocBin.priceHigh) / 2,
      },
    };
  }

  // ========================
  //          Рисовка
  // ========================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = size.width;
    const height = size.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    if (!candles || candles.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = TEXT_FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Нет данных для отображения", 12, 8);
      return;
    }

    const chartHeight = Math.floor(height * (1 - VOLUME_HEIGHT_RATIO));
    const volumeHeight = height - chartHeight - BOTTOM_AXIS_HEIGHT;

    const plotLeft = 0;
    const plotRight = width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
    const plotWidth = Math.max(10, plotRight - plotLeft);
    const priceAxisLeft = plotRight;
    const priceAxisRight = width;
    const priceAxisWidth = RIGHT_AXIS_WIDTH;

    const volumeTop = chartHeight;
    const volumeBottom = chartHeight + volumeHeight;
    const volumePlotHeight = Math.max(10, volumeHeight);

    const from = Math.max(0, view.from);
    const to = Math.min(candles.length, view.to);
    const visibleCandles = candles.slice(from, to);
    if (visibleCandles.length === 0) return;

    // диапазон цен по видимой части
    let minPrice = Math.min(...visibleCandles.map((c) => c.low));
    let maxPrice = Math.max(...visibleCandles.map((c) => c.high));
    if (!isFinite(minPrice) || !isFinite(maxPrice) || maxPrice <= minPrice) {
      minPrice = 0;
      maxPrice = 1;
    }
    const priceRange = maxPrice - minPrice;

    function yForPrice(price) {
      const frac = (price - minPrice) / priceRange;
      return chartHeight - frac * (chartHeight - 10) - 5;
    }

    function priceForY(y) {
      const frac = (chartHeight - y - 5) / (chartHeight - 10);
      return minPrice + frac * priceRange;
    }

    // диапазон объёмов по видимой части
    const maxVolume = Math.max(...visibleCandles.map((c) => c.volume || 0), 1);

    // ======= Сетка по цене =======
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const gridLines = 8;
    ctx.beginPath();
    for (let i = 0; i <= gridLines; i++) {
      const frac = i / gridLines;
      const y = chartHeight - frac * (chartHeight - 10) - 5;
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
    }
    ctx.stroke();

    // ======= Сетка по времени =======
    const timeGridLines = 8;
    ctx.beginPath();
    for (let i = 0; i <= timeGridLines; i++) {
      const frac = i / timeGridLines;
      const idx = from + frac * (to - from);
      const x = xForIndex(idx, from, to, plotWidth, plotLeft);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
    }
    ctx.stroke();

    // ======= График цены =======
    const candleWidth = Math.max(2, (plotWidth / (to - from)) * 0.7);
    const halfCandle = candleWidth / 2;

    if (chartType === "line") {
      ctx.beginPath();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = LINE_COLOR;
      visibleCandles.forEach((c, i) => {
        const idx = from + i;
        const x = xForIndex(idx, from, to, plotWidth, plotLeft);
        const y = yForPrice(c.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else {
      for (let i = 0; i < visibleCandles.length; i++) {
        const c = visibleCandles[i];
        const idx = from + i;
        const xCenter = xForIndex(idx, from, to, plotWidth, plotLeft);
        const x = xCenter - halfCandle;
        const openY = yForPrice(c.open);
        const closeY = yForPrice(c.close);
        const highY = yForPrice(c.high);
        const lowY = yForPrice(c.low);

        const isUp = c.close >= c.open;
        const color = isUp ? CANDLE_UP : CANDLE_DOWN;
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        // high-low
        ctx.beginPath();
        ctx.moveTo(xCenter, highY);
        ctx.lineTo(xCenter, lowY);
        ctx.stroke();

        // тело
        if (chartType === "candles") {
          const top = Math.min(openY, closeY);
          const bottom = Math.max(openY, closeY);
          const h = Math.max(1, bottom - top);
          if (h < 1.5) {
            ctx.beginPath();
            ctx.moveTo(x, top);
            ctx.lineTo(x + candleWidth, bottom);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.rect(x, top, candleWidth, h);
            ctx.fill();
          }
        } else if (chartType === "bars") {
          // bar-style (open/close тики)
          ctx.beginPath();
          ctx.moveTo(xCenter, highY);
          ctx.lineTo(xCenter, lowY);
          ctx.moveTo(xCenter - halfCandle, openY);
          ctx.lineTo(xCenter, openY);
          ctx.moveTo(xCenter, closeY);
          ctx.lineTo(xCenter + halfCandle, closeY);
          ctx.stroke();
        }
      }
    }

    // ======= Объёмы =======
    ctx.fillStyle = VOLUME_COLOR;
    for (let i = 0; i < visibleCandles.length; i++) {
      const c = visibleCandles[i];
      const idx = from + i;
      const xCenter = xForIndex(idx, from, to, plotWidth, plotLeft);
      const x = xCenter - halfCandle;
      const v = c.volume || 0;
      if (!isFinite(v) || v <= 0) continue;
      const frac = v / maxVolume;
      const h = frac * volumePlotHeight;
      const top = volumeBottom - h;
      ctx.beginPath();
      ctx.rect(x, top, candleWidth, h);
      ctx.fill();
    }

    // ======= Профиль объёма (основной) =======
    let mainProfileCandles = [];
    if (profileMode === "visible") {
      mainProfileCandles = visibleCandles;
    } else if (profileMode === "all") {
      mainProfileCandles = candles;
    } else if (profileMode === "lastN") {
      const N = 100;
      mainProfileCandles = candles.slice(-N);
    }

    if (
      mainProfileCandles.length > 0 &&
      profileMode !== "selection"
    ) {
      const { bins } = computeVolumeProfile(
        mainProfileCandles,
        profileSettings,
        minPrice,
        maxPrice
      );
      if (bins.length > 0) {
        const maxVol = Math.max(...bins.map((b) => b.volume), 1);
        const pxWidth = PROFILE_WIDTH - 8;
        const xRight = width - PROFILE_RIGHT_MARGIN;
        const xLeft = xRight - pxWidth;

        for (const b of bins) {
          if (b.volume <= 0) continue;
          const frac = b.volume / maxVol;
          const barW = frac * pxWidth;
          const yTop = yForPrice(b.priceHigh);
          const yBottom = yForPrice(b.priceLow);
          const h = Math.max(1, yBottom - yTop);
          ctx.fillStyle = MAIN_PROFILE_COLOR;
          ctx.beginPath();
          ctx.rect(xRight - barW, yTop, barW, h);
          ctx.fill();
        }
      }
    }

    // ======= Pinned profiles (selection mode) =======
    function drawPinnedProfile(fromIdx, toIdx) {
      if (toIdx <= fromIdx) return;
      const idxA = Math.max(fromIdx, from);
      const idxB = Math.min(toIdx, to);
      if (idxB <= idxA) return;
      const slice = candles.slice(fromIdx, toIdx);

      const xA = xForIndex(fromIdx, from, to, plotWidth, plotLeft);
      const xB = xForIndex(toIdx, from, to, plotWidth, plotLeft);
      const left = Math.min(xA, xB);
      const right = Math.max(xA, xB);
      if (right - left < PINNED_MIN_WIDTH_PX) return;

      // прямоугольник
      ctx.fillStyle = "rgba(216, 180, 254, 0.25)";
      ctx.strokeStyle = PROFILE_BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(left, 0, right - left, chartHeight);
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // профиль внутри прямоугольника (справа)
      const { bins } = computeVolumeProfile(
        slice,
        profileSettings,
        minPrice,
        maxPrice
      );
      if (bins.length === 0) return;

      const maxVol = Math.max(...bins.map((b) => b.volume), 1);
      const pxWidth = Math.min(100, right - left - 8);
      const xRight = right - 4;
      const xLeft = xRight - pxWidth;

      for (const b of bins) {
        if (b.volume <= 0) continue;
        const frac = b.volume / maxVol;
        const barW = frac * pxWidth;
        const yTop = yForPrice(b.priceHigh);
        const yBottom = yForPrice(b.priceLow);
        const h = Math.max(1, yBottom - yTop);
        ctx.fillStyle = PROFILE_FILL;
        ctx.beginPath();
        ctx.rect(xRight - barW, yTop, barW, h);
        ctx.fill();

        ctx.fillStyle = PROFILE_BAR;
        ctx.fillRect(xRight - barW, yTop, barW, h);
      }
    }

    // нарисовать все закреплённые профили
    if (pinnedProfiles.length > 0) {
      for (const p of pinnedProfiles) {
        drawPinnedProfile(p.from, p.to);
      }
    }

    // текущий selection (если есть и режим selection)
    if (profileMode === "selection" && selection && selection.endX) {
      const startIdx = indexForX(
        selection.startX,
        from,
        to,
        plotWidth,
        plotLeft
      );
      const endIdx = indexForX(
        selection.endX,
        from,
        to,
        plotWidth,
        plotLeft
      );
      drawPinnedProfile(startIdx, endIdx);
    }

    // ======= Ось цены (справа) =======
    ctx.fillStyle = AXIS_COLOR;
    ctx.font = TEXT_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= gridLines; i++) {
      const frac = i / gridLines;
      const price = minPrice + (1 - frac) * priceRange;
      const y = chartHeight - frac * (chartHeight - 10) - 5;
      const label = isFinite(price) ? price.toFixed(2) : "";
      ctx.fillText(label, priceAxisLeft + 4, y);
    }

    // ======= Ось времени (снизу) =======
    ctx.fillStyle = AXIS_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let i = 0; i <= timeGridLines; i++) {
      const frac = i / timeGridLines;
      const idx = Math.round(from + frac * (to - from - 1));
      if (idx < from || idx >= to) continue;
      const x = xForIndex(idx, from, to, plotWidth, plotLeft);
      const c = candles[idx];
      const label = formatAxisTime(c.time);
      ctx.fillText(label, x, height - BOTTOM_AXIS_HEIGHT + 4);
    }

    // подпись максимального объёма справа от volume
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const volLabel =
      maxVolume >= 1e6
        ? (maxVolume / 1e6).toFixed(1) + "M"
        : maxVolume >= 1e3
        ? (maxVolume / 1e3).toFixed(1) + "K"
        : String(Math.round(maxVolume));
    ctx.fillText(volLabel, plotRight - 4, volumeBottom - 2);

    // ======= Кроссхайр =======
    if (crosshair.active && crosshair.candleIndex != null) {
      const ci = crosshair.candleIndex;
      if (ci >= from && ci < to) {
        const c = candles[ci];
        const x = xForIndex(ci, from, to, plotWidth, plotLeft);
        const priceAtY = priceForY(crosshair.y);

        ctx.strokeStyle = "rgba(148, 163, 184, 0.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // вертикальная (через весь график + объёмы)
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, volumeBottom);
        ctx.stroke();

        // горизонтальная только на графике
        const y = yForPrice(priceAtY);
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();

        ctx.setLineDash([]);

        // хинт цены справа
        const priceLabel = priceAtY.toFixed(2);
        const labelWidth = ctx.measureText(priceLabel).width + 8;
        const labelX = priceAxisLeft + 2;
        const labelY = y - 8;
        ctx.fillStyle = "#020617";
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(labelX, labelY, labelWidth, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(priceLabel, labelX + 4, labelY + 8);

        // хинт времени снизу
        const timeLabel = formatFullDateTime(c.time);
        const tWidth = ctx.measureText(timeLabel).width + 8;
        const tX = Math.min(
          Math.max(plotLeft + 2, x - tWidth / 2),
          plotRight - tWidth - 2
        );
        const tY = height - BOTTOM_AXIS_HEIGHT - 18;
        ctx.fillStyle = "#020617";
        ctx.strokeStyle = "#64748b";
        ctx.beginPath();
        ctx.rect(tX, tY, tWidth, 16);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#e5e7eb";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(timeLabel, tX + tWidth / 2, tY + 8);
      }
    }
  }, [
    candles,
    chartType,
    interval,
    profileMode,
    profileSettings,
    view,
    size,
    crosshair,
    selection,
    pinnedProfiles,
  ]);

  // ========================
  //   Обработчики мыши
  // ========================
  function getRelativePos(evt) {
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (evt.clientX - rect.left) * dpr,
      y: (evt.clientY - rect.top) * dpr,
    };
  }

  // Zoom колёсиком
  function handleWheel(evt) {
    evt.preventDefault();
    if (!candles || candles.length === 0) return;

    const { x } = getRelativePos(evt);
    const chartHeight = Math.floor(size.height * (1 - VOLUME_HEIGHT_RATIO));
    const plotLeft = 0;
    const plotRight = size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
    const plotWidth = Math.max(10, plotRight - plotLeft);

    const from = view.from;
    const to = view.to;
    const count = candles.length;

    const cursorIndex = indexForX(
      x,
      from,
      to,
      plotWidth,
      plotLeft
    );

    const delta = evt.deltaY;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const newWindow = Math.max(
      10,
      Math.min(count, (to - from) * zoomFactor)
    );

    let newFrom = Math.round(
      cursorIndex - ((cursorIndex - from) / (to - from)) * newWindow
    );
    if (newFrom < 0) newFrom = 0;
    let newTo = newFrom + newWindow;
    if (newTo > count) {
      newTo = count;
      newFrom = Math.max(0, count - newWindow);
    }
    setView({ from: newFrom, to: newTo });
  }

  // Панорамирование левой кнопкой
  function handleMouseDown(evt) {
    const button = evt.button;
    const pos = getRelativePos(evt);

    const chartHeight = Math.floor(size.height * (1 - VOLUME_HEIGHT_RATIO));

    // средняя кнопка — кроссхайр
    if (button === 1) {
      const from = view.from;
      const to = view.to;
      const plotLeft = 0;
      const plotRight = size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
      const plotWidth = Math.max(10, plotRight - plotLeft);
      const idx = indexForX(
        pos.x,
        from,
        to,
        plotWidth,
        plotLeft
      );
      setCrosshair({
        active: true,
        x: pos.x,
        y: pos.y,
        candleIndex: Math.min(Math.max(idx, 0), candles.length - 1),
      });
      return;
    }

    // правая кнопка — начало выделения профиля
    if (button === 2 && profileMode === "selection") {
      const from = view.from;
      const to = view.to;
      const plotLeft = 0;
      const plotRight = size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
      const plotWidth = Math.max(10, plotRight - plotLeft);

      const idx = indexForX(
        pos.x,
        from,
        to,
        plotWidth,
        plotLeft
      );

      setSelection({ startX: pos.x, endX: pos.x });

      // Проверка — попали ли в существующий pinned профиль (для удаления)
      const hitIdx = idx;
      if (pinnedProfiles.length > 0) {
        let hit = -1;
        for (let i = 0; i < pinnedProfiles.length; i++) {
          const p = pinnedProfiles[i];
          if (hitIdx >= p.from && hitIdx <= p.to) {
            hit = i;
            break;
          }
        }
        if (hit >= 0) {
          // удаляем по ПКМ
          setPinnedProfiles((old) =>
            old.filter((_, i) => i !== hit)
          );
        }
      }

      return;
    }

    // левая кнопка — панорамирование
    if (button === 0) {
      panState.current = {
        isPanning: true,
        startX: pos.x,
        startFrom: view.from,
        startTo: view.to,
      };
    }
  }

  function handleMouseMove(evt) {
    const pos = getRelativePos(evt);

    // панорамирование
    if (panState.current.isPanning && candles && candles.length > 0) {
      const { startX, startFrom, startTo } = panState.current;
      const plotLeft = 0;
      const plotRight =
        size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
      const plotWidth = Math.max(10, plotRight - plotLeft);

      const deltaPx = pos.x - startX;
      const candlesPerPx = (startTo - startFrom) / plotWidth;
      const deltaCandles = Math.round(deltaPx * candlesPerPx);

      let newFrom = startFrom - deltaCandles;
      let newTo = startTo - deltaCandles;
      const count = candles.length;
      const window = newTo - newFrom;

      if (newFrom < 0) {
        newFrom = 0;
        newTo = window;
      }
      if (newTo > count) {
        newTo = count;
        newFrom = count - window;
      }
      setView({ from: newFrom, to: newTo });
    }

    // кроссхайр (средняя кнопка зажата)
    if (crosshair.active) {
      const from = view.from;
      const to = view.to;
      const plotLeft = 0;
      const plotRight =
        size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
      const plotWidth = Math.max(10, plotRight - plotLeft);

      const idx = indexForX(
        pos.x,
        from,
        to,
        plotWidth,
        plotLeft
      );
      setCrosshair((prev) => ({
        ...prev,
        x: pos.x,
        y: pos.y,
        candleIndex: Math.min(Math.max(idx, 0), candles.length - 1),
      }));
    }

    // selection (ПКМ)
    if (selection && profileMode === "selection") {
      setSelection((prev) => ({ ...prev, endX: pos.x }));
    }
  }

  function handleMouseUp(evt) {
    const button = evt.button;

    if (button === 1) {
      // средняя кнопка отпущена — выключаем кроссхайр
      setCrosshair((prev) => ({ ...prev, active: false }));
    }

    if (button === 0) {
      panState.current.isPanning = false;
    }

    if (button === 2 && selection && profileMode === "selection") {
      // завершили выделение -> закрепляем профиль
      const chartHeight = Math.floor(size.height * (1 - VOLUME_HEIGHT_RATIO));
      const from = view.from;
      const to = view.to;
      const plotLeft = 0;
      const plotRight =
        size.width - RIGHT_AXIS_WIDTH - PROFILE_WIDTH - PROFILE_RIGHT_MARGIN;
      const plotWidth = Math.max(10, plotRight - plotLeft);

      const startIdx = indexForX(
        selection.startX,
        from,
        to,
        plotWidth,
        plotLeft
      );
      const endIdx = indexForX(
        selection.endX,
        from,
        to,
        plotWidth,
        plotLeft
      );

      const s = Math.min(startIdx, endIdx);
      const e = Math.max(startIdx, endIdx);

      if (e - s >= 2) {
        setPinnedProfiles((old) => [...old, { from: s, to: e }]);
      }

      setSelection(null);
    }
  }

  function handleContextMenu(evt) {
    // чтобы браузерное меню не мешало ПКМ
    evt.preventDefault();
  }

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{ display: "block", cursor: "default" }}
      />
    </div>
  );
}

export default ChartCanvas;
