// frontend/src/App.jsx
import { useEffect, useRef, useState } from "react";
import { createChart } from "lightweight-charts";
import { calculateVolumeProfile } from "./volumeProfile";

export default function App() {
  const chartContainerRef = useRef(null);
  const profileBoxesRef = useRef([]);
  const candlesRef = useRef([]);

  const [symbol, setSymbol] = useState("SBER");
  const [interval, setInterval] = useState(1);
  const [chartType, setChartType] = useState("candles"); // candles | bars | line
  const [showProfile, setShowProfile] = useState(true);
  const [profileMode, setProfileMode] = useState("full"); // UI, пока не влияет на расчёт

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const clearProfileBoxes = () => {
      profileBoxesRef.current.forEach((el) => el.remove());
      profileBoxesRef.current = [];
    };

    clearProfileBoxes();

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: { background: { color: "#ffffff" }, textColor: "#000000" },
      grid: {
        vertLines: { color: "#e0e0e0" },
        horzLines: { color: "#e0e0e0" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    let priceSeries;
    if (chartType === "candles") {
      priceSeries = chart.addCandlestickSeries();
    } else if (chartType === "bars") {
      priceSeries = chart.addBarSeries();
    } else {
      priceSeries = chart.addLineSeries({ lineWidth: 2 });
    }

    const volumeSeries = chart.addHistogramSeries({
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    const drawVolumeProfile = () => {
      clearProfileBoxes();

      if (!showProfile) return;
      if (!chartContainerRef.current) return;

      const allCandles = candlesRef.current;
      if (!allCandles || allCandles.length === 0) return;

      // пока ВСЕГДА строим профиль по всему диапазону свечей
      const sourceCandles = allCandles;

      const profile = calculateVolumeProfile(sourceCandles, 24);
      if (!profile || profile.length === 0) return;

      const maxVolume = Math.max(...profile.map((b) => b.volume)) || 1;

      const container = chartContainerRef.current;
      const containerHeight = container.clientHeight;
      const binCount = profile.length;
      const binHeight = containerHeight / binCount;
      const maxWidth = 120;

      profile.forEach((bin, index) => {
        if (bin.volume <= 0) return;

        const ratio = bin.volume / maxVolume;
        const widthPx = Math.max(4, ratio * maxWidth);
        const top = index * binHeight;
        const height = Math.max(2, binHeight - 1);

        const box = document.createElement("div");
        box.style.position = "absolute";
        box.style.right = "50px";
        box.style.top = `${top}px`;
        box.style.width = `${widthPx}px`;
        box.style.height = `${height}px`;
        box.style.background =
          bin.volume === maxVolume
            ? "rgba(0, 128, 255, 0.9)" // POC
            : "rgba(100, 149, 237, 0.55)";
        box.style.pointerEvents = "none";

        container.appendChild(box);
        profileBoxesRef.current.push(box);
      });
    };

    const fetchData = async () => {
      try {
        setLoading(true);
        setErrorText("");

        const url = `http://localhost:4000/api/candles?symbol=${symbol}&interval=${interval}&limit=600`;
        console.log("Запрашиваем:", url, "chartType:", chartType);

        const res = await fetch(url);
        const data = await res.json();

        if (!data.candles || !Array.isArray(data.candles)) {
          setErrorText("Ошибка: сервер не вернул свечи");
          return;
        }

        const candles = data.candles.map((c) => ({
          time: Math.floor(new Date(c.datetime).getTime() / 1000),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume),
        }));

        candlesRef.current = candles;

        if (chartType === "line") {
          priceSeries.setData(
            candles.map((c) => ({ time: c.time, value: c.close }))
          );
        } else {
          priceSeries.setData(
            candles.map((c) => ({
              time: c.time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            }))
          );
        }

        volumeSeries.setData(
          candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? "#4caf50" : "#e53935",
          }))
        );

        chart.timeScale().fitContent();
        drawVolumeProfile();
      } catch (err) {
        console.error("Ошибка загрузки данных:", err);
        setErrorText("Ошибка загрузки данных (подробности в консоли)");
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
        drawVolumeProfile();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearProfileBoxes();
      chart.remove();
    };
  }, [symbol, interval, chartType, showProfile, profileMode]);

  return (
    <div style={{ padding: "10px", fontFamily: "sans-serif" }}>
      <h2>MOEX TradingView Clone</h2>

      <div style={{ marginBottom: "10px" }}>
        <label>Инструмент:&nbsp;</label>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
          <option value="SBER">SBER</option>
          <option value="GAZP">GAZP</option>
          <option value="VTBR">VTBR</option>
          <option value="YNDX">YNDX</option>
        </select>

        <label style={{ marginLeft: "10px" }}>Таймфрейм:&nbsp;</label>
        <select
          value={interval}
          onChange={(e) => setInterval(Number(e.target.value))}
        >
          <option value={1}>1m</option>
          <option value={10}>10m</option>
          <option value={60}>1h</option>
          <option value={24}>1d</option>
        </select>

        <label style={{ marginLeft: "10px" }}>Тип графика:&nbsp;</label>
        <select
          value={chartType}
          onChange={(e) => setChartType(e.target.value)}
        >
          <option value="candles">Свечи</option>
          <option value="bars">Бары</option>
          <option value="line">Линия</option>
        </select>

        <label style={{ marginLeft: "10px" }}>
          <input
            type="checkbox"
            checked={showProfile}
            onChange={(e) => setShowProfile(e.target.checked)}
          />{" "}
          Профиль объёма
        </label>

        <label style={{ marginLeft: "10px" }}>Режим профиля:&nbsp;</label>
        <select
          value={profileMode}
          onChange={(e) => setProfileMode(e.target.value)}
        >
          <option value="full">Весь диапазон (пока)</option>
          <option value="visible">Видимый диапазон (будет позже)</option>
        </select>

        {loading && (
          <span style={{ marginLeft: "10px" }}>Загрузка...</span>
        )}
      </div>

      {errorText && (
        <div style={{ color: "red", marginBottom: "10px" }}>{errorText}</div>
      )}

      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height: "600px",
          border: "1px solid #ccc",
          position: "relative",
        }}
      />
    </div>
  );
}
