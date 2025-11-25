// backend/index.js

const express = require('express');
const app = express();

// фиксирован порт нашего сервера
const PORT = 4000;

// простой тестовый эндпоинт
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// запуск сервера
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

