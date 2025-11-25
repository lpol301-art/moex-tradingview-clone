// backend/candlesService.js

const db = require('./db');
const { getCandles } = require('./moexClient');

// выбираем свечи из БД
function loadFromDB(symbol, interval, limit) {
  const stmt = db.prepare(`
    SELECT *
    FROM candles
    WHERE symbol = ? AND interval = ?
    ORDER BY datetime DESC
    LIMIT ?
  `);
  return stmt.all(symbol, interval, limit).reverse();
}

// сохраняем свечи в БД (вставка или игнор если свеча уже есть)
function saveToDB(symbol, interval, candles) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO candles
    (symbol, interval, datetime, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((items) => {
    for (const c of items) {
      stmt.run(
        symbol, interval, c.datetime, c.open, c.high, c.low, c.close, c.volume
      );
    }
  });

  transaction(candles);
}

// главная функция получения свечей
async function getCandlesCached(symbol, interval, limit) {
  let local = loadFromDB(symbol, interval, limit);

  if (local.length >= limit) {
    return local;
  }

  const remote = await getCandles(symbol, interval, limit);
  saveToDB(symbol, interval, remote);
  return loadFromDB(symbol, interval, limit);
}

module.exports = { getCandlesCached };
