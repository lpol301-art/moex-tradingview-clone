// frontend/src/App.jsx
import { useEffect, useMemo, useState } from "react";
import ChartCanvas from "./ChartCanvas";

const API_BASE = "http://localhost:4000";

function App() {
  const [instruments, setInstruments] = useState([]);
  const [selectedInstrument, setSelectedInstrument] = useState("");
  const [interval, setInterval] = useState(10); // 10 минут по умолчанию
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState("candles");

  const [profileMode, setProfileMode] = useState("visible");

  // UI-настройки профиля
  const [profileDensityPreset, setProfileDensityPreset] =
    useState("medium"); // low | medium | high
  const [valueAreaPercentStr, setValueAreaPercentStr] =
    useState("0.7"); // "0.6" | "0.7" | "0.8"

  // ---- Профиль: вычисляем реальные настройки через useMemo ----
  const profileSettings = useMemo(() => {
    let targetBins;
    let minBins;
    let maxBins;

    if (profileDensityPreset === "low") {
      targetBins = 25;
      minBins = 10;
      maxBins = 120;
    } else if (profileDensityPreset === "high") {
      targetBins = 80;
      minBins = 40;
      maxBins = 300;
    } else {
      // medium
      targetBins = 40;
      minBins = 20;
      maxBins = 200;
    }

    const va = parseFloat(valueAreaPercentStr);
    const valueAreaPercent =
      !isNaN(va) && va > 0 && va < 1 ? va : 0.7;

    return {
      targetBins,
      minBins,
      maxBins,
      valueAreaPercent,
    };
  }, [profileDensityPreset, valueAreaPercentStr]);

  // ---- Загружаем список инструментов один раз ----
  useEffect(() => {
    async function loadInstruments() {
      try {
        const res = await fetch(`${API_BASE}/api/instruments`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setInstruments(data);
      } catch (err) {
        console.error("Ошибка загрузки инструментов:", err);
      }
    }

    loadInstruments();
  }, []);

  // ---- Выбираем первый инструмент после загрузки ----
  useEffect(() => {
    if (!selectedInstrument && instruments.length > 0) {
      setSelectedInstrument(instruments[0].symbol);
    }
  }, [instruments, selectedInstrument]);

  // ---- Загружаем свечи при смене инструмента/таймфрейма ----
  useEffect(() => {
    if (!selectedInstrument) return;

    async function loadCandles() {
      try {
        setLoading(true);

        const url = `${API_BASE}/api/candles?symbol=${encodeURIComponent(
          selectedInstrument
        )}&interval=${interval}`;
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const raw = await res.json();

        // Нормализуем формат ответа
        let data;
        if (Array.isArray(raw)) {
          data = raw;
        } else if (Array.isArray(raw.candles)) {
          data = raw.candles;
        } else if (Array.isArray(raw.rows)) {
          data = raw.rows;
        } else {
          console.error(
            "Неожиданный формат ответа /api/candles:",
            raw
          );
          data = [];
        }

        const normalized = data
          .map((c) => {
            const t = new Date(c.time);
            const timeMs = t.getTime();
            if (!isFinite(timeMs)) {
              // если время битое — выкидываем свечу
              return null;
            }

            const open = Number(c.open);
            const high = Number(c.high);
            const low = Number(c.low);
            const close = Number(c.close);
            const volume = Number(c.volume);

            if (
              !isFinite(open) ||
              !isFinite(high) ||
              !isFinite(low) ||
              !isFinite(close) ||
              !isFinite(volume)
            ) {
              return null;
            }

            return {
              time: t,
              open,
              high,
              low,
              close,
              volume,
            };
          })
          .filter(Boolean); // убираем null

        if (normalized.length === 0) {
          console.warn(
            "После нормализации нет валидных свечей",
            { symbol: selectedInstrument, interval, rawCount: data.length }
          );
        }

        setCandles(normalized);
      } catch (err) {
        console.error("Ошибка загрузки свечей:", err);
        setCandles([]);
      } finally {
        setLoading(false);
      }
    }

    loadCandles();
  }, [selectedInstrument, interval]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: "#020617",
        color: "#e5e7eb",
      }}
    >
      {/* Верхняя панель управления */}
      <header
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid #111827",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          backgroundColor: "#020617",
        }}
      >
        {/* Инструмент */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>
            Инструмент
          </label>
          <select
            value={selectedInstrument}
            onChange={(e) => setSelectedInstrument(e.target.value)}
            style={{
              padding: "4px 8px",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              border: "1px solid #4b5563",
              borderRadius: 4,
              minWidth: 140,
            }}
          >
            {instruments.map((inst) => (
              <option key={inst.symbol} value={inst.symbol}>
                {inst.symbol}
              </option>
            ))}
          </select>
        </div>

        {/* Таймфрейм */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>
            Таймфрейм
          </label>
          <select
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
            style={{
              padding: "4px 8px",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              border: "1px solid #4b5563",
              borderRadius: 4,
              minWidth: 110,
            }}
          >
            <option value={1}>1 мин</option>
            <option value={10}>10 мин</option>
            <option value={60}>1 час</option>
            <option value={1440}>1 день</option>
          </select>
        </div>

        {/* Тип графика */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>
            Тип графика
          </label>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            style={{
              padding: "4px 8px",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              border: "1px solid #4b5563",
              borderRadius: 4,
              minWidth: 120,
            }}
          >
            <option value="candles">Свечи</option>
            <option value="bars">Бары</option>
            <option value="line">Линия (close)</option>
          </select>
        </div>

        {/* Режим профиля */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 12, color: "#9ca3af" }}>
            Профиль объёма
          </label>
          <select
            value={profileMode}
            onChange={(e) => setProfileMode(e.target.value)}
            style={{
              padding: "4px 8px",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              border: "1px solid #4b5563",
              borderRadius: 4,
              minWidth: 210,
            }}
          >
            <option value="visible">По видимому диапазону</option>
            <option value="all">По всей истории</option>
            <option value="lastN">По последним N свечам (N=100)</option>
            <option value="selection">
              По выделенному диапазону (ПКМ)
            </option>
          </select>
        </div>

        {/* Настройки профиля справа */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #1f2937",
            marginLeft: "auto",
            backgroundColor: "#020617",
          }}
        >
          <span
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "#9ca3af",
            }}
          >
            Настройки профиля
          </span>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            {/* Плотность профиля */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth: 150,
              }}
            >
              <label style={{ fontSize: 11, color: "#9ca3af" }}>
                Плотность профиля
              </label>
              <select
                value={profileDensityPreset}
                onChange={(e) =>
                  setProfileDensityPreset(e.target.value)
                }
                style={{
                  padding: "4px 8px",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  border: "1px solid #4b5563",
                  borderRadius: 4,
                }}
              >
                <option value="low">Низкая (толстые уровни)</option>
                <option value="medium">Средняя</option>
                <option value="high">Высокая (тонкие уровни)</option>
              </select>
            </div>

            {/* Value Area */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth: 130,
              }}
            >
              <label style={{ fontSize: 11, color: "#9ca3af" }}>
                Value Area
              </label>
              <select
                value={valueAreaPercentStr}
                onChange={(e) =>
                  setValueAreaPercentStr(e.target.value)
                }
                style={{
                  padding: "4px 8px",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  border: "1px solid #4b5563",
                  borderRadius: 4,
                }}
              >
                <option value="0.6">60%</option>
                <option value="0.7">70%</option>
                <option value="0.8">80%</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Область графика */}
      <main style={{ flex: 1, minHeight: 0 }}>
        {loading && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 12,
              padding: "4px 8px",
              backgroundColor: "rgba(15,23,42,0.9)",
              borderRadius: 4,
              fontSize: 12,
              border: "1px solid #4b5563",
              zIndex: 10,
            }}
          >
            Загрузка данных...
          </div>
        )}
        <div style={{ width: "100%", height: "100%" }}>
          <ChartCanvas
            candles={candles}
            chartType={chartType}
            interval={interval}
            profileMode={profileMode}
            profileSettings={profileSettings}
          />
        </div>
      </main>
    </div>
  );
}

export default App;
