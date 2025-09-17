const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// =====================
//  Вспомогательные штуки
// =====================

const getAppUrl = () => {
  // Render прокидывает https URL в RENDER_EXTERNAL_URL
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return `http://localhost:${port}`;
};

const token = process.env.BOT_TOKEN;
const appUrl = getAppUrl();

console.log('🔧 NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('🌐 App URL:', appUrl);
console.log('🤖 BOT_TOKEN set:', token ? 'yes' : 'no');

// =====================
//  Хранилище сессий (in-memory)
// =====================
const gameSessions = new Map();

// =====================
//  Express middleware
// =====================
app.use(express.json()); // нужно для Telegram webhook JSON
app.use(express.static(path.join(__dirname, 'public')));

// =====================
//  Telegram Bot
// =====================
let bot = null;
let webhookPath = null;
let webhookUrl = null;

async function setupWebhook() {
  if (!bot) return;

  webhookPath = `/bot${token}`;
  webhookUrl = `${appUrl}${webhookPath}`;

  try {
    await bot.setWebHook(webhookUrl);
    console.log('✅ Webhook set:', webhookUrl);
  } catch (err) {
    console.error('❌ setWebHook failed:', err?.response?.body || err?.message || err);
  }
}

function initBot() {
  if (!token) {
    console.warn('⚠️  BOT_TOKEN not provided — bot disabled. Web UI will still work.');
    return;
  }

  const usePolling = process.env.NODE_ENV === 'development' && !process.env.RENDER_EXTERNAL_URL;
  bot = new TelegramBot(token, { polling: usePolling });

  if (!usePolling) {
    setupWebhook().catch((e) => console.error('Webhook setup error:', e));
  } else {
    console.log('🟡 Bot started in polling mode (development)');
  }

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎮 Играть с ботом', web_app: { url: `${appUrl}?mode=bot` } }],
        [{ text: '👥 Создать комнату', web_app: { url: `${appUrl}?mode=create` } }],
        [{ text: '🔗 Присоединиться по коду', web_app: { url: `${appUrl}?mode=join` } }],
      ],
    };
    bot.sendMessage(chatId, '🎴 Добро пожаловать в "Подкидного дурака"!', { reply_markup: keyboard });
  });

  bot.onText(/\/join (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const gameId = (match?.[1] || '').toUpperCase();
    const joinUrl = `${appUrl}?mode=join&gameId=${gameId}`;

    bot.sendMessage(chatId, `🎮 Присоединиться к игре ${gameId}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '✅ Присоединиться', web_app: { url: joinUrl } }]],
      },
    });
  });

  bot.on('error', (err) => console.error('🤖 Bot error:', err?.message || err));
  bot.on('polling_error', (err) => console.error('🤖 Polling error:', err?.message || err));
}

// =====================
//  Webhook endpoint (если бот включён)
// =====================
if (token) {
  app.post(`/bot${token}`, (req, res) => {
    try {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    } catch (e) {
      console.error('⚠️  processUpdate error:', e?.message || e);
      res.sendStatus(500);
    }
  });
}

// =====================
//  API для multiplayer (заглушки)
// =====================
app.post('/api/create-game', (req, res) => {
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const playerId = req.body.playerId || `player_${Date.now()}`;

  gameSessions.set(gameId, {
    id: gameId,
    players: [playerId],
    status: 'waiting',
    created: Date.now(),
    gameState: null,
  });

  res.json({ gameId, playerId });
});

app.post('/api/join-game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const playerId = req.body.playerId || `player_${Date.now()}`;
  const game = gameSessions.get(gameId);

  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.players.length >= 2) return res.status(400).json({ error: 'Game is full' });

  game.players.push(playerId);
  game.status = 'ready';

  res.json({ gameId, playerId, status: 'joined' });
});

app.get('/api/game/:gameId', (req, res) => {
  const game = gameSessions.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// =====================
//  Основные маршруты
// =====================
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    appUrl,
    hasToken: Boolean(token),
    webhookUrl: webhookUrl || null,
    mode: token ? 'webhook' : 'web-only',
    timestamp: new Date().toISOString(),
  });
});

// Ручная установка вебхука (на случай, если надо принудительно)
app.get('/set-webhook', async (_req, res) => {
  if (!bot) return res.status(400).json({ ok: false, error: 'Bot disabled (no BOT_TOKEN)' });

  try {
    await setupWebhook();
    res.json({ ok: true, webhookUrl });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// =====================
//  Очистка старых игр
// =====================
setInterval(() => {
  const now = Date.now();
  for (const [gameId, game] of gameSessions.entries()) {
    if (now - game.created > 30 * 60 * 1000) gameSessions.delete(gameId); // 30 мин
  }
}, 5 * 60 * 1000);

// =====================
//  Запуск сервера
// =====================
app.listen(port, () => {
  console.log('🚀 Server started on port:', port);
  initBot();
});

// Глобальные ловушки, чтобы не падать процессом
process.on('unhandledRejection', (reason) => {
  console.error('🧯 UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('🧯 UncaughtException:', err);
});
