// backend/moexClient.js
const axios = require('axios');

/**
 * Получает исторические свечи с MOEX ISS API
 * @param {string} symbol - тикер (например SBER)
 * @param {number} interval - таймфрейм (1, 10, 60, 24)
 * @param {number} limit - количество свечей
 * @returns {Promise<Array>}
 */
async function getCandles(symbol, interval = 1, limit = 1000) {
  const url = `https://iss.moex.com/iss/engines/stock/markets/shares/securities/${symbol}/candles.json?interval=${interval}&limit=${limit}`;

  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }, // MOEX иногда не любит запросы без UA
  });

  const columns = response.data.candles.columns;
  const data = response.data.candles.data;

  const colIndex = (name) => columns.indexOf(name);

  return data.map((row) => ({
    datetime: row[colIndex('begin')],
    open: row[colIndex('open')],
    high: row[colIndex('high')],
    low: row[colIndex('low')],
    close: row[colIndex('close')],
    volume: row[colIndex('volume')],
  }));
}

module.exports = { getCandles };
