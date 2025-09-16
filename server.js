const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const token = process.env.BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

// Получаем URL приложения
const getAppUrl = () => {
    return process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
};

const appUrl = getAppUrl();
console.log('🌐 App URL:', appUrl);

// Инициализация бота с Webhook
let bot;
if (token) {
    bot = new TelegramBot(token);
    
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

// Webhook endpoint (ОБЯЗАТЕЛЬНО ДО других маршрутов!)
if (bot) {
    app.post(`/bot${token}`, (req, res) => {
        console.log('📨 Received webhook update');
        bot.processUpdate(req.body);
        res.sendStatus(200);
    });
}

// Основные маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        appUrl: appUrl,
        hasBotToken: !!token,
        time: new Date().toISOString()
    });
});

// Обработчики команд бота
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        console.log('👋 Received /start from:', chatId);
        
        const gameUrl = `${appUrl}?mode=bot`;
        const keyboard = {
            inline_keyboard: [[
                {
                    text: '🎮 Играть с ботом',
                    web_app: { url: gameUrl }
                }
            ]]
        };
        
        bot.sendMessage(chatId, '🎴 Добро пожаловать в "Подкидного дурака"!', {
            reply_markup: keyboard
        }).catch(error => {
            console.error('❌ Send message error:', error);
        });
    });

    // Обработчик ошибок
    bot.on('error', (error) => {
        console.error('🤖 Bot error:', error);
    });
}

// Запуск сервера
app.listen(port, () => {
    console.log('🚀 Server started on port:', port);
    console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
    console.log('🎮 App URL:', appUrl);
    
    if (!token) {
        console.log('❌ BOT_TOKEN not set - bot disabled');
    }
});