const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;
const host = '0.0.0.0';

// Проверка токена
if (!token) {
    console.warn('⚠️ BOT_TOKEN not found!');
}

// Инициализация бота
let bot;
if (token) {
    bot = new TelegramBot(token, { polling: false });
    console.log('🤖 Bot initialized');
} else {
    console.log('🤖 Bot disabled - no BOT_TOKEN');
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Обработчик для бота
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const gameUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
        
        bot.sendMessage(chatId, '🎴 Добро пожаловать в "Подкидного дурака"!', {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: '🎮 Играть с ботом',
                        web_app: { url: `${gameUrl}?mode=bot` }
                    }],
                    [{
                        text: '👥 Играть с другом',
                        web_app: { url: `${gameUrl}?mode=multiplayer` }
                    }]
                ]
            }
        });
    });
}

// Запуск сервера
app.listen(port, host, () => {
    console.log(`🚀 Server running on http://${host}:${port}`);
});