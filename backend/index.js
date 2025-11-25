// backend/index.js

const express = require('express');
const cors = require('cors');
const { getCandlesCached } = require('./candlesService');

const app = express();
const PORT = 4000;

// Разрешаем запросы с фронтенда
app.use(cors());
app.use(express.json());

// Тестовый эндпоинт
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// Эндпоинт для получения свечей
app.get('/api/candles', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    const intervalNum = Number(interval) || 1;   // таймфрейм
    const limitNum = Number(limit) || 500;       // сколько свечей

    const candles = await getCandlesCached(symbol, intervalNum, limitNum);

    res.json({
      symbol,
      interval: intervalNum,
      limit: limitNum,
      candles,
    });
  } catch (err) {
    console.error('Error in /api/candles:', err);
    res.status(500).json({ error: 'failed to fetch candles' });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
