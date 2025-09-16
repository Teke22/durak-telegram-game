const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

<<<<<<< HEAD
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
=======
const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

// Используем webhook вместо polling
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${token}`);

// Мидлварь для статических файлов
app.use(express.static('public'));
app.use(express.json());

// Webhook endpoint
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Базовый маршрут
>>>>>>> 236014c0c39d0ef05012c2f6f1b66137bd9ce5d2
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
<<<<<<< HEAD
  const gameUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
=======
  const gameUrl = process.env.RENDER_EXTERNAL_URL;
>>>>>>> 236014c0c39d0ef05012c2f6f1b66137bd9ce5d2
  
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

<<<<<<< HEAD
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
=======
// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Webhook set to: ${process.env.RENDER_EXTERNAL_URL}/bot${token}`);
>>>>>>> 236014c0c39d0ef05012c2f6f1b66137bd9ce5d2
});