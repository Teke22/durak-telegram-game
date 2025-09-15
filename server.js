const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

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
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const gameUrl = process.env.RENDER_EXTERNAL_URL;
  
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

// Запуск сервера
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Webhook set to: ${process.env.RENDER_EXTERNAL_URL}/bot${token}`);
});