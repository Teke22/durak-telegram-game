const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

// Конфигурация
const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Инициализация бота
let bot;
if (isProduction) {
  // В production используем webhook
  bot = new TelegramBot(token);
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/bot${token}`;
  bot.setWebHook(webhookUrl);
  console.log('Webhook mode enabled:', webhookUrl);
} else {
  // В development используем polling
  bot = new TelegramBot(token, { polling: true });
  console.log('Polling mode enabled');
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Webhook endpoint (только для production)
if (isProduction) {
  app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
}

// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const gameUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  
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

// Обработчики ошибок
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});