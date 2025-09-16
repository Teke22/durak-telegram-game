const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

// Конфигурация
const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

// Для Render важно использовать '0.0.0.0'
const host = '0.0.0.0';

// Проверяем наличие токена
if (!token) {
  console.warn('⚠️  BOT_TOKEN not found! Please set it in environment variables');
}

// Инициализация бота (только если есть токен)
let bot;
if (token) {
  if (process.env.NODE_ENV === 'production') {
    bot = new TelegramBot(token);
    console.log('🤖 Bot running in production mode');
  } else {
    bot = new TelegramBot(token, { polling: true });
    console.log('🤖 Bot running in development mode');
  }

  // Обработчик команды /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const gameUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    
    bot.sendMessage(chatId, '🎴 Добро пожаловать в игру "Подкидной дурак"!', {
      reply_markup: {
        inline_keyboard: [
          [{
            text: '🎮 Играть',
            web_app: { url: gameUrl }
          }]
        ]
      }
    });
  });
} else {
  console.log('🤖 Bot disabled - no BOT_TOKEN provided');
}

// Middleware
app.use(express.static('public'));

// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check для Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Запуск сервера
app.listen(port, host, () => {
  console.log(`🚀 Server running on http://${host}:${port}`);
  console.log(`📁 Static files from: ${path.join(__dirname, 'public')}`);
  if (!token) {
    console.log('⚠️  Warning: BOT_TOKEN not set. Bot functionality disabled.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});