const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

// Раздаем статические файлы из папки 'public'
app.use(express.static('public'));

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const gameUrl = `https://your-app-name.onrender.com`; // Будем менять позже

  bot.sendMessage(chatId, 'Добро пожаловать в игру "Подкидной дурак"!', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Играть',
            web_app: { url: gameUrl }
          }
        ]
      ]
    }
  });
});

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Запускаем Express-сервер
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});