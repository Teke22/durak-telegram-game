const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;
const host = '0.0.0.0';

// Получаем правильный URL для Render
const getGameUrl = () => {
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL;
    }
    if (process.env.RENDER_EXTERNAL_HOSTNAME) {
        return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
    }
    return `http://localhost:${port}`;
};

const gameUrl = getGameUrl();
console.log('🎮 Game URL:', gameUrl);

// Инициализация бота
let bot;
if (token) {
    bot = new TelegramBot(token, { polling: false });
    console.log('🤖 Bot initialized');
} else {
    console.log('⚠️ Bot disabled - no BOT_TOKEN');
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Основной маршрут
app.get('/', (req, res) => {
    console.log('📄 Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Маршрут для здоровья
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        gameUrl: gameUrl,
        timestamp: new Date().toISOString() 
    });
});

// Маршрут для отладки
app.get('/debug', (req, res) => {
    res.json({
        environment: process.env.NODE_ENV,
        renderUrl: process.env.RENDER_EXTERNAL_URL,
        renderHostname: process.env.RENDER_EXTERNAL_HOSTNAME,
        gameUrl: gameUrl,
        port: port
    });
});

// Обработчик для бота
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        console.log('🔄 Received /start from chat:', chatId);
        
        const keyboard = {
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
        };
        
        bot.sendMessage(chatId, '🎴 Добро пожаловать в "Подкидного дурака"!', {
            reply_markup: keyboard
        }).then(() => {
            console.log('✅ Menu sent to chat:', chatId);
        }).catch(error => {
            console.error('❌ Error sending menu:', error);
        });
    });
}

// Обработка всех остальных маршрутов
app.get('*', (req, res) => {
    console.log('🔍 Route not found:', req.path);
    res.redirect('/');
});

// Запуск сервера
app.listen(port, host, () => {
    console.log('🚀 Server started successfully!');
    console.log('📍 Port:', port);
    console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
    console.log('🎮 Game URL:', gameUrl);
    
    if (!token) {
        console.log('⚠️ Warning: BOT_TOKEN not set');
    }
});
