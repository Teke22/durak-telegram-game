const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN || '8460056031:AAG4pm2sDmB6moYNjEZKdEBA6471mv1SaMo';
const bot = new TelegramBot(token, { polling: true });
const app = express();
const port = process.env.PORT || 3000;

// Раздаем статические файлы из папки 'public'
app.use(express.static('public'));

// Хранилище игровых сессий (в продакшене лучше использовать БД)
const gameSessions = new Map();

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const gameUrl = `https://your-app-name.onrender.com`; // Замените на ваш URL

  bot.sendMessage(chatId, '🎴 Добро пожаловать в игру "Подкидной дурак"!', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🎮 Играть с ботом',
            web_app: { url: `${gameUrl}?mode=bot` }
          }
        ],
        [
          {
            text: '👥 Создать игру для двоих',
            web_app: { url: `${gameUrl}?mode=create` }
          }
        ]
      ]
    }
  });
});

// Обработчик callback queries (для кнопок)
bot.on('callback_query', (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  
  if (data === 'create_game') {
    const gameId = Math.random().toString(36).substring(7);
    gameSessions.set(gameId, {
      players: [msg.chat.id],
      status: 'waiting'
    });
    
    bot.sendMessage(msg.chat.id, `Игра создана! ID: ${gameId}\nОтправьте этот код другу: /join_${gameId}`);
  }
});

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint для получения информации об игре
app.get('/api/game/:id', (req, res) => {
  const gameId = req.params.id;
  const game = gameSessions.get(gameId);
  
  if (game) {
    res.json(game);
  } else {
    res.status(404).json({ error: 'Game not found' });
  }
});

// Запускаем Express-сервер
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});