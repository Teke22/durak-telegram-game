const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

/* -------------------- Константы игры -------------------- */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
const HAND_LIMIT = 6;

/* -------------------- Вспомогательные -------------------- */
const getAppUrl = () => process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
const token = process.env.BOT_TOKEN;
const appUrl = getAppUrl();

console.log('🔧 NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('🌐 App URL:', appUrl);
console.log('🤖 BOT_TOKEN set:', token ? 'yes' : 'no');

/* -------------------- Хранилище игр -------------------- */
const gameSessions = new Map(); // gameId -> session

/* -------------------- Express -------------------- */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* -------------------- Telegram Bot (опционально) -------------------- */
let bot = null;
async function setupWebhook() {
  const webhookPath = `/bot${token}`;
  const webhookUrl = `${appUrl}${webhookPath}`;
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
  if (!usePolling) setupWebhook().catch(console.error);
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
      reply_markup: { inline_keyboard: [[{ text: '✅ Присоединиться', web_app: { url: joinUrl } }]] },
    });
  });

  bot.on('error', (err) => console.error('🤖 Bot error:', err?.message || err));
  bot.on('polling_error', (err) => console.error('🤖 Polling error:', err?.message || err));
}

if (token) {
  app.post(`/bot${token}`, (req, res) => {
    try { bot.processUpdate(req.body); res.sendStatus(200); }
    catch (e) { console.error('⚠️  processUpdate error:', e?.message || e); res.sendStatus(500); }
  });
}

/* -------------------- Игровая логика (сервер) -------------------- */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s, value: RANK_VALUES[r] });
  shuffle(d);
  return d;
}
function sortHand(hand, trumpSuit) {
  hand.sort((a, b) => {
    const aT = a.suit === trumpSuit, bT = b.suit === trumpSuit;
    if (aT !== bT) return aT ? 1 : -1;
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.value - b.value;
  });
}
function drawToSixFirstAttackerThenDefender(session, attackerId, defenderId) {
  const { deck, hands } = session;
  const drawOne = (id) => { if (deck.length > 0) hands[id].push(deck.pop()); };
  while (deck.length > 0 && (hands[attackerId].length < HAND_LIMIT || hands[defenderId].length < HAND_LIMIT)) {
    if (hands[attackerId].length < HAND_LIMIT) drawOne(attackerId);
    if (hands[defenderId].length < HAND_LIMIT) drawOne(defenderId);
  }
  sortHand(hands[attackerId], session.trumpSuit);
  sortHand(hands[defenderId], session.trumpSuit);
}
function canDefend(session, defendCard, attackCard) {
  if (!defendCard || !attackCard) return false;
  if (defendCard.suit === attackCard.suit && defendCard.value > attackCard.value) return true;
  if (defendCard.suit === session.trumpSuit && attackCard.suit !== session.trumpSuit) return true;
  return false;
}
function ranksOnTable(table) {
  const s = new Set();
  for (const p of table) {
    s.add(p.attack.rank);
    if (p.defend) s.add(p.defend.rank);
  }
  return s;
}
function currentDefenderHandLen(session) {
  return session.hands[session.defender].length;
}
function checkGameOver(session) {
  const deckEmpty = session.deck.length === 0;
  const aEmpty = session.hands[session.attacker].length === 0;
  const dEmpty = session.hands[session.defender].length === 0;

  if (!deckEmpty) return null;

  // Если оба пустые — ничья (редко в классике, но ок)
  if (aEmpty && dEmpty) return { winner: 'draw' };
  if (aEmpty) return { winnerId: session.attacker };
  if (dEmpty) return { winnerId: session.defender };
  return null;
}
function startGame(session) {
  session.deck = makeDeck();
  session.trumpCard = session.deck[session.deck.length - 1];
  session.trumpSuit = session.trumpCard.suit;

  const [p1, p2] = session.players;
  session.hands = { [p1]: [], [p2]: [] };
  for (let i = 0; i < HAND_LIMIT; i++) session.hands[p1].push(session.deck.pop());
  for (let i = 0; i < HAND_LIMIT; i++) session.hands[p2].push(session.deck.pop());
  sortHand(session.hands[p1], session.trumpSuit);
  sortHand(session.hands[p2], session.trumpSuit);

  // Кто атакует первым — простое правило: случайно
  const attacker = Math.random() < 0.5 ? p1 : p2;
  const defender = attacker === p1 ? p2 : p1;

  session.attacker = attacker;
  session.defender = defender;
  session.currentPlayer = attacker;
  session.phase = 'attacking'; // 'attacking' | 'defending'
  session.table = [];
  session.status = 'playing';
  session.updated = Date.now();
  session.winnerId = null;
  session.winner = null;
}

/* -------------------- API -------------------- */

// Создать игру
app.post('/api/create-game', (req, res) => {
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const playerId = String(req.body.playerId || `player_${Date.now()}`);

  gameSessions.set(gameId, {
    id: gameId,
    players: [playerId],
    status: 'waiting',
    created: Date.now(),
    updated: Date.now(),

    // Инициализация будущего состояния
    deck: [],
    trumpSuit: '',
    trumpCard: null,
    hands: {},
    table: [],
    attacker: null,
    defender: null,
    currentPlayer: null,
    phase: null,
  });

  res.json({ gameId, playerId, status: 'waiting' });
});

// Присоединиться ко второй слот
app.post('/api/join-game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const playerId = String(req.body.playerId || `player_${Date.now()}`);
  const session = gameSessions.get(gameId);

  if (!session) return res.status(404).json({ error: 'Game not found' });
  if (session.players.length >= 2) return res.status(400).json({ error: 'Game is full' });

  // запрет повторного входа тем же игроком
  if (!session.players.includes(playerId)) session.players.push(playerId);
  session.status = 'ready';
  session.updated = Date.now();

  // Как только 2 игрока — стартуем
  if (session.players.length === 2) {
    startGame(session);
  }

  res.json({ gameId, playerId, status: 'joined' });
});

// Отдать состояние игры (с обезличиванием чужой руки)
app.get('/api/game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const playerId = String(req.query.playerId || '');
  const session = gameSessions.get(gameId);
  if (!session) return res.status(404).json({ error: 'Game not found' });

  const you = playerId && session.players.includes(playerId) ? playerId : null;
  const opp = you ? session.players.find((p) => p !== you) : null;

  const base = {
    id: session.id,
    status: session.status,
    players: session.players,
    deckCount: session.deck.length,
    trumpSuit: session.trumpSuit,
    trumpCard: session.trumpCard,
    table: session.table,
    attacker: session.attacker,
    defender: session.defender,
    currentPlayer: session.currentPlayer,
    phase: session.phase,
    updated: session.updated,
    winnerId: session.winnerId || null,
    winner: session.winner || null,
  };

  if (!you) {
    // Не знаем кто запрашивает — отдаём минимум
    return res.json({ ...base, note: 'anonymous viewer' });
  }

  const yourHand = session.hands[you] || [];
  const oppCount = opp ? (session.hands[opp]?.length || 0) : 0;

  res.json({
    ...base,
    you,
    opponentId: opp,
    hand: yourHand,
    opponentCount: oppCount,
  });
});

// Принять ход
app.post('/api/game/:gameId/move', (req, res) => {
  const gameId = req.params.gameId;
  const { playerId, action, card } = req.body || {};
  const session = gameSessions.get(gameId);
  if (!session) return res.status(404).json({ error: 'Game not found' });

  if (session.status !== 'playing') return res.status(400).json({ error: 'Game is not playing' });
  if (!session.players.includes(String(playerId))) return res.status(403).json({ error: 'Not a participant' });
  if (session.winnerId || session.winner) return res.status(400).json({ error: 'Game finished' });

  try {
    const pid = String(playerId);

    if (action === 'attack') {
      if (session.currentPlayer !== pid || session.phase !== 'attacking') {
        return res.status(400).json({ error: 'Not your attacking turn' });
      }
      const defenderId = session.defender;
      const hand = session.hands[pid];
      // найти карту в руке
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      // лимит по кол-ву пар — не больше карт у защитника
      if (session.table.length >= (session.hands[defenderId].length)) {
        return res.status(400).json({ error: 'Limit reached: defender has fewer cards' });
      }

      // проверка по рангу: либо первая карта, либо подкидываем по рангам на столе
      if (session.table.length > 0) {
        const rset = ranksOnTable(session.table);
        if (!rset.has(hand[idx].rank)) {
          return res.status(400).json({ error: 'Rank doesn\'t match cards on table' });
        }
      }

      const play = hand.splice(idx, 1)[0];
      session.table.push({ attack: play, defend: null });

      session.phase = 'defending';
      session.currentPlayer = session.defender;
      session.updated = Date.now();
    }

    else if (action === 'defend') {
      if (session.currentPlayer !== pid || session.phase !== 'defending') {
        return res.status(400).json({ error: 'Not your defending turn' });
      }
      const lastPair = session.table[session.table.length - 1];
      if (!lastPair || lastPair.defend) {
        return res.status(400).json({ error: 'Nothing to defend' });
      }
      const hand = session.hands[pid];
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });
      const chosen = hand[idx];
      if (!canDefend(session, chosen, lastPair.attack)) {
        return res.status(400).json({ error: 'Card cannot beat attack' });
      }

      lastPair.defend = hand.splice(idx, 1)[0];

      // если все пары закрыты — снова ход атакующего (он может подкинуть или сказать «бито»)
      const allDefended = session.table.every(p => p.defend);
      if (allDefended) {
        session.phase = 'attacking';
        session.currentPlayer = session.attacker;
      }
      session.updated = Date.now();
    }

    else if (action === 'take') {
      if (session.currentPlayer !== pid || session.phase !== 'defending' || pid !== session.defender) {
        return res.status(400).json({ error: 'Only defender can take cards' });
      }
      // защитник забирает всё со стола
      const defHand = session.hands[session.defender];
      for (const p of session.table) {
        defHand.push(p.attack);
        if (p.defend) defHand.push(p.defend);
      }
      session.table = [];
      sortHand(defHand, session.trumpSuit);

      // добор: сначала атакующий, потом защитник; атакующий НЕ меняется
      drawToSixFirstAttackerThenDefender(session, session.attacker, session.defender);

      session.phase = 'attacking';
      session.currentPlayer = session.attacker;
      session.updated = Date.now();

      const over = checkGameOver(session);
      if (over) {
        session.status = 'finished';
        session.winnerId = over.winnerId || null;
        session.winner = over.winner || null;
      }
    }

    else if (action === 'pass') {
      if (session.currentPlayer !== pid || session.phase !== 'attacking' || pid !== session.attacker) {
        return res.status(400).json({ error: 'Only attacker can pass (bito)' });
      }
      // «Бито» возможно только если все пары закрыты
      if (!(session.table.length > 0 && session.table.every(p => p.defend))) {
        return res.status(400).json({ error: 'Cannot pass: not all pairs defended' });
      }
      // очистка стола
      session.table = [];

      // добор: сначала атакующий, потом защитник
      const oldAttacker = session.attacker;
      const oldDefender = session.defender;
      drawToSixFirstAttackerThenDefender(session, oldAttacker, oldDefender);

      // смена ролей
      session.attacker = oldDefender;
      session.defender = oldAttacker;
      session.currentPlayer = session.attacker;
      session.phase = 'attacking';
      session.updated = Date.now();

      const over = checkGameOver(session);
      if (over) {
        session.status = 'finished';
        session.winnerId = over.winnerId || null;
        session.winner = over.winner || null;
      }
    }

    else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.json({ ok: true, updated: session.updated });
  } catch (e) {
    console.error('move error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* -------------------- Основные маршруты -------------------- */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    appUrl,
    hasToken: Boolean(token),
    mode: token ? 'webhook' : 'web-only',
    timestamp: new Date().toISOString(),
  });
});
app.get('/set-webhook', async (_req, res) => {
  if (!bot) return res.status(400).json({ ok: false, error: 'Bot disabled (no BOT_TOKEN)' });
  try { await setupWebhook(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e?.message || String(e) }); }
});

/* -------------------- Очистка старых игр -------------------- */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of gameSessions.entries()) {
    if (now - (s.updated || s.created || now) > 30 * 60 * 1000) gameSessions.delete(id);
  }
}, 5 * 60 * 1000);

/* -------------------- Старт -------------------- */
app.listen(port, () => {
  console.log('🚀 Server started on port:', port);
  initBot();
});
process.on('unhandledRejection', (r) => console.error('🧯 UnhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('🧯 UncaughtException:', e));
