const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

// Хранилище игровых сессий
const gameSessions = new Map();

// Получаем URL приложения
const getAppUrl = () => {
    return process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
};

const appUrl = getAppUrl();
console.log('🌐 App URL:', appUrl);

// Инициализация бота
let bot;
if (token) {
    bot = new TelegramBot(token, { polling: false });
    
    // Настраиваем webhook
    const webhookPath = `/bot${token}`;
    const webhookUrl = `${appUrl}${webhookPath}`;
    
    bot.setWebHook(webhookUrl)
        .then(() => console.log('✅ Webhook set:', webhookUrl))
        .catch(error => console.error('❌ Webhook error:', error));
    
} else {
    console.log('⚠️ Bot disabled - no BOT_TOKEN');
}

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Webhook endpoint
if (bot) {
    app.post(`/bot${token}`, (req, res) => {
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
}

// API для multiplayer
app.post('/api/create-game', (req, res) => {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const playerId = req.body.playerId || `player_${Date.now()}`;
    
    gameSessions.set(gameId, {
        id: gameId,
        players: [playerId],
        status: 'waiting',
        created: Date.now(),
        gameState: null
    });
    
    res.json({ gameId, playerId });
});

app.post('/api/join-game/:gameId', (req, res) => {
    const gameId = req.params.gameId;
    const playerId = req.body.playerId || `player_${Date.now()}`;
    const game = gameSessions.get(gameId);
    
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.players.length >= 2) {
        return res.status(400).json({ error: 'Game is full' });
    }
    
    game.players.push(playerId);
    game.status = 'ready';
    
    res.json({ gameId, playerId, status: 'joined' });
});

app.get('/api/game/:gameId', (req, res) => {
    const game = gameSessions.get(req.params.gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
});

// Основные маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', appUrl, timestamp: new Date().toISOString() });
});

// Обработчики команд бота
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        
        const keyboard = {
            inline_keyboard: [
                [{
                    text: '🎮 Играть с ботом',
                    web_app: { url: `${appUrl}?mode=bot` }
                }],
                [{
                    text: '👥 Создать комнату',
                    web_app: { url: `${appUrl}?mode=create` }
                }],
                [{
                    text: '🔗 Присоединиться по коду',
                    web_app: { url: `${appUrl}?mode=join` }
                }]
            ]
        };
        
        bot.sendMessage(chatId, '🎴 Добро пожаловать в "Подкидного дурака"!', {
            reply_markup: keyboard
        });
    });

    // Обработчик команды /join
    bot.onText(/\/join (.+)/, (msg, match) => {
        const chatId = msg.chat.id;
        const gameId = match[1].toUpperCase();
        
        const joinUrl = `${appUrl}?mode=join&gameId=${gameId}`;
        
        bot.sendMessage(chatId, `🎮 Присоединиться к игре ${gameId}`, {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '✅ Присоединиться',
                        web_app: { url: joinUrl }
                    }
                ]]
            }
        });
    });

    bot.on('error', (error) => {
        console.error('🤖 Bot error:', error);
    });
}

// Очистка старых игр каждые 5 минут
setInterval(() => {
    const now = Date.now();
    for (const [gameId, game] of gameSessions.entries()) {
        if (now - game.created > 30 * 60 * 1000) { // 30 минут
            gameSessions.delete(gameId);
        }
    }
}, 5 * 60 * 1000);

// Запуск сервера
app.listen(port, () => {
    console.log('🚀 Server started on port:', port);
    console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
    console.log('🎮 App URL:', appUrl);
});