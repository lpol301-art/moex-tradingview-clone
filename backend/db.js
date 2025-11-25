// backend/db.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

// создаём таблицу свечей, если её нет
db.exec(`
  CREATE TABLE IF NOT EXISTS candles (
    symbol TEXT NOT NULL,
    interval INTEGER NOT NULL,
    datetime TEXT NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume REAL,
    PRIMARY KEY (symbol, interval, datetime)
  );
`);

module.exports = db;
