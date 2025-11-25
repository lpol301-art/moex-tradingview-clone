// backend/index.js

const express = require('express');
const cors = require('cors');
const { getCandles } = require('./moexClient');

const app = express();
const PORT = 4000;

app.use(cors()); // чтобы фронт мог обращаться к бэку

// тестовый ping
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// новый эндпоинт получения свечей
app.get('/api/candles', async (req, res) => {
  try {
    const { symbol, interval, limit } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: "symbol is required" });
    }

    const intervalNum = Number(interval) || 1;
    const limitNum = Number(limit) || 500;

    const candles = await getCandles(symbol, intervalNum, limitNum);

    res.json({ symbol, interval: intervalNum, candles });
  } catch (err) {
    console.error("Error fetching candles:", err.message);
    res.status(500).json({ error: "failed to fetch candles" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
