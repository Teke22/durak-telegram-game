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
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

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
        [{ text: '⚡ Быстрая игра с ботами', web_app: { url: `${appUrl}?mode=quickbots` } }],
        [{ text: '👥 Создать комнату', web_app: { url: `${appUrl}?mode=create` } }],
        [{ text: '🔗 Присоединиться по коду', web_app: { url: `${appUrl}?mode=join` } }],
        [{ text: '🎮 Играть с одним ботом (классика)', web_app: { url: `${appUrl}?mode=bot` } }],
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

/* -------------------- Утилиты игры -------------------- */
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
function ranksOnTable(table) {
  const s = new Set();
  for (const p of table) {
    s.add(p.attack.rank);
    if (p.defend) s.add(p.defend.rank);
  }
  return s;
}
function canDefend(session, defendCard, attackCard) {
  if (!defendCard || !attackCard) return false;
  if (defendCard.suit === attackCard.suit && defendCard.value > attackCard.value) return true;
  if (defendCard.suit === session.trumpSuit && attackCard.suit !== session.trumpSuit) return true;
  return false;
}
function drawToSixFirstAttackerThenDefender(session) {
  const { deck, hands, attacker, defender, trumpSuit } = session;
  const drawOne = (id) => { if (deck.length > 0) hands[id].push(deck.pop()); };
  while (deck.length > 0 && (hands[attacker].length < HAND_LIMIT || hands[defender].length < HAND_LIMIT)) {
    if (hands[attacker].length < HAND_LIMIT) drawOne(attacker);
    if (hands[defender].length < HAND_LIMIT) drawOne(defender);
  }
  sortHand(hands[attacker], trumpSuit);
  sortHand(hands[defender], trumpSuit);
}
function nextIdx(session, idx) {
  return (idx + 1) % session.seats.length;
}
function ensureActivePlayersHaveCards(session) {
  // если у атакующего 0 карт — передаём право атаки дальше; защитник = следующий
  let safety = session.seats.length * 2;
  while (safety-- > 0) {
    const aLen = session.hands[session.attacker]?.length || 0;
    const dLen = session.hands[session.defender]?.length || 0;
    if (aLen === 0) {
      const aIdx = session.seats.findIndex(s => s.id === session.attacker);
      const na = session.seats[nextIdx(session, aIdx)].id;
      session.attacker = na;
      const nIdx = session.seats.findIndex(s => s.id === session.attacker);
      session.defender = session.seats[nextIdx(session, nIdx)].id;
      session.currentPlayer = session.attacker;
      session.phase = 'attacking';
      continue;
    }
    if (dLen === 0) {
      const aIdx = session.seats.findIndex(s => s.id === session.attacker);
      const nd = session.seats[nextIdx(session, aIdx)].id;
      session.defender = nd;
      if (session.currentPlayer === session.defender) {
        session.currentPlayer = session.attacker;
        session.phase = 'attacking';
      }
      continue;
    }
    break;
  }
}
function checkGameOverMulti(session) {
  const alive = session.seats.filter(s => (session.hands[s.id]?.length || 0) > 0);
  if (session.deck.length === 0 && alive.length <= 1) {
    const loserId = alive[0]?.id || null; // единственный с картами — дурак
    const winners = session.seats.map(s => s.id).filter(id => id !== loserId);
    return { loserId, winners };
  }
  return null;
}
function botChooseAttackCard(session, botId) {
  const hand = session.hands[botId];
  if (!hand || hand.length === 0) return -1;
  if (session.table.length === 0) {
    // минимальная по ценности (некозыри приоритетнее)
    let best = -1, bestVal = Infinity;
    for (let i = 0; i < hand.length; i++) {
      const c = hand[i];
      const val = c.suit === session.trumpSuit ? c.value + 100 : c.value;
      if (val < bestVal) { bestVal = val; best = i; }
    }
    return best;
  } else {
    // можно подкинуть только по рангу
    const rset = ranksOnTable(session.table);
    for (let i = 0; i < hand.length; i++) if (rset.has(hand[i].rank)) return i;
    return -1;
  }
}
function botChooseDefendCard(session, botId, attackCard) {
  const hand = session.hands[botId];
  let best = -1, bestVal = Infinity;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.suit === attackCard.suit && c.value > attackCard.value) {
      if (c.value < bestVal) { bestVal = c.value; best = i; }
    } else if (c.suit === session.trumpSuit && attackCard.suit !== session.trumpSuit) {
      const val = c.value + 100; if (val < bestVal) { bestVal = val; best = i; }
    }
  }
  return best;
}
function processBots(session) {
  // Выполняем действия ботов до тех пор, пока ход не станет за человеком или партия не сменит фазу/раунд.
  let guard = 50;
  while (guard-- > 0 && session.status === 'playing') {
    const current = session.currentPlayer;
    const seat = session.seats.find(s => s.id === current);
    if (!seat || seat.type !== 'bot') break;

    if (session.phase === 'attacking') {
      // бот-атакующий
      if (session.table.length === 0) {
        const idx = botChooseAttackCard(session, current);
        if (idx === -1) {
          // нечем атаковать — бито
          session.table = [];
          // добор и смена ролей
          const oldA = session.attacker, oldD = session.defender;
          drawToSixFirstAttackerThenDefender(session);
          session.attacker = oldD;
          const aIdx = session.seats.findIndex(s => s.id === session.attacker);
          session.defender = session.seats[nextIdx(session, aIdx)].id;
          session.currentPlayer = session.attacker;
          session.phase = 'attacking';
          ensureActivePlayersHaveCards(session);
        } else {
          const card = session.hands[current].splice(idx, 1)[0];
          session.table.push({ attack: card, defend: null });
          session.phase = 'defending';
          session.currentPlayer = session.defender;
        }
      } else {
        // все пары закрыты? можно подкинуть
        const allDefended = session.table.every(p => p.defend);
        const canAddMore = session.table.length < (session.hands[session.defender]?.length || 0);
        if (allDefended && canAddMore) {
          const idx = botChooseAttackCard(session, current);
          if (idx !== -1) {
            const card = session.hands[current].splice(idx, 1)[0];
            session.table.push({ attack: card, defend: null });
            session.phase = 'defending';
            session.currentPlayer = session.defender;
          } else {
            // сказать бито
            session.table = [];
            const oldA = session.attacker, oldD = session.defender;
            drawToSixFirstAttackerThenDefender(session);
            session.attacker = oldD;
            const aIdx = session.seats.findIndex(s => s.id === session.attacker);
            session.defender = session.seats[nextIdx(session, aIdx)].id;
            session.currentPlayer = session.attacker;
            session.phase = 'attacking';
            ensureActivePlayersHaveCards(session);
          }
        } else {
          // ждём защитника
          break;
        }
      }
    } else if (session.phase === 'defending') {
      // бот-защитник
      const lastPair = session.table[session.table.length - 1];
      if (!lastPair || lastPair.defend) {
        session.phase = 'attacking';
        session.currentPlayer = session.attacker;
        continue;
      }
      const idx = botChooseDefendCard(session, current, lastPair.attack);
      if (idx === -1) {
        // берём
        const defHand = session.hands[current];
        for (const p of session.table) {
          defHand.push(p.attack);
          if (p.defend) defHand.push(p.defend);
        }
        session.table = [];
        sortHand(defHand, session.trumpSuit);
        drawToSixFirstAttackerThenDefender(session);
        session.currentPlayer = session.attacker; // атакующий не меняется
        session.phase = 'attacking';
        ensureActivePlayersHaveCards(session);
      } else {
        const card = session.hands[current].splice(idx, 1)[0];
        lastPair.defend = card;
        const allDefended = session.table.every(p => p.defend);
        if (allDefended) {
          session.phase = 'attacking';
          session.currentPlayer = session.attacker;
        }
      }
    }

    // Проверка завершения
    const over = checkGameOverMulti(session);
    if (over) {
      session.status = 'finished';
      session.loserId = over.loserId || null;
      session.winners = over.winners || [];
      break;
    }
  }

  session.updated = Date.now();
}

/* -------------------- Инициализация/старт игры -------------------- */
function fillBots(session) {
  const currentBots = session.seats.filter(s => s.type === 'bot').length;
  const want = Math.max(0, Math.min(session.botCountWanted || 0, session.maxPlayers - session.seats.length + currentBots));
  const toAdd = Math.min(want - currentBots, session.maxPlayers - session.seats.length);
  for (let i = 0; i < toAdd; i++) {
    const id = `bot_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    session.seats.push({ id, type: 'bot' });
  }
}
function startGame(session) {
  if (session.status === 'playing') return;
  // раздать всем по 6
  session.deck = makeDeck();
  session.trumpCard = session.deck[session.deck.length - 1];
  session.trumpSuit = session.trumpCard.suit;
  session.hands = {};
  for (const seat of session.seats) session.hands[seat.id] = [];
  // открытую раздачу по кругу (по 6 каждому)
  for (let k = 0; k < HAND_LIMIT; k++) {
    for (const seat of session.seats) {
      if (session.deck.length > 0) session.hands[seat.id].push(session.deck.pop());
    }
  }
  for (const seat of session.seats) sortHand(session.hands[seat.id], session.trumpSuit);

  // выбираем случайного атакующего
  const startIdx = Math.floor(Math.random() * session.seats.length);
  session.attacker = session.seats[startIdx].id;
  session.defender = session.seats[nextIdx(session, startIdx)].id;
  session.currentPlayer = session.attacker;
  session.phase = 'attacking';
  session.table = [];
  session.status = 'playing';
  session.updated = Date.now();
  session.winners = [];
  session.loserId = null;

  ensureActivePlayersHaveCards(session);
  processBots(session);
}
function maybeAutoStart(session) {
  if (session.status === 'playing' || session.status === 'finished') return;
  const seatsCount = session.seats.length;
  const totalWithBots = seatsCount + Math.max(0, Math.min(session.botCountWanted || 0, session.maxPlayers - seatsCount));
  const canStart = totalWithBots >= MIN_PLAYERS &&
                   (!session.startWhenFull || totalWithBots === session.maxPlayers);
  if (canStart) {
    fillBots(session);
    startGame(session);
  }
}

/* -------------------- API -------------------- */

// Создать игру
app.post('/api/create-game', (req, res) => {
  const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const playerId = String(req.body.playerId || `player_${Date.now()}`);
  const maxPlayers = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, Number(req.body.maxPlayers) || 2));
  let botCountWanted = Math.max(0, Math.min(Number(req.body.botCount) || 0, maxPlayers - 1));
  const autostart = req.body.autostart !== false; // по умолчанию true
  const startWhenFull = !!req.body.startWhenFull; // ждать, пока заполнится вся комната

  console.log(`📦 create-game ${gameId} by ${playerId} | seats=${maxPlayers} bots=${botCountWanted} autostart=${autostart} full=${startWhenFull}`);

  gameSessions.set(gameId, {
    id: gameId,
    created: Date.now(),
    updated: Date.now(),

    // конфигурация
    maxPlayers,
    botCountWanted,
    autostart,
    startWhenFull,

    // места
    seats: [{ id: playerId, type: 'human' }],

    // состояние
    status: 'waiting',
    deck: [],
    trumpSuit: '',
    trumpCard: null,
    hands: {},
    table: [],
    attacker: null,
    defender: null,
    currentPlayer: null,
    phase: null,
    winners: [],
    loserId: null,
  });

  const session = gameSessions.get(gameId);
  if (autostart) maybeAutoStart(session);

  res.json({ gameId, playerId, status: session.status });
});

// Присоединиться
app.post('/api/join-game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const rawId = String(req.body.playerId || `player_${Date.now()}`);
  const session = gameSessions.get(gameId);
  if (!session) return res.status(404).json({ error: 'Game not found' });

  if (session.status === 'finished') return res.status(400).json({ error: 'Game finished' });
  // считаем текущие хуманов
  const seatIds = session.seats.map(s => s.id);
  if (seatIds.includes(rawId)) {
    // дублирующий id — добавим суффикс
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    console.log(`⚠️  join ${gameId}: duplicate id "${rawId}", using "${rawId}_${suffix}"`);
  }
  let playerId = rawId;
  if (seatIds.includes(playerId)) playerId = `${playerId}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  // нельзя превысить максимум мест (с учётом уже занятых ботами)
  const occupied = session.seats.length;
  if (occupied >= session.maxPlayers) return res.status(400).json({ error: 'Game is full' });

  session.seats.push({ id: playerId, type: 'human' });
  session.updated = Date.now();

  if (session.autostart) maybeAutoStart(session);

  console.log(`👥 join ${gameId}: seats ${session.seats.map(s=>s.type[0]).join('')}/${session.maxPlayers} status=${session.status}`);
  res.json({ gameId, playerId, status: 'joined' });
});

// Состояние игры
app.get('/api/game/:gameId', (req, res) => {
  const gameId = req.params.gameId;
  const playerId = String(req.query.playerId || '');
  const session = gameSessions.get(gameId);
  if (!session) return res.status(404).json({ error: 'Game not found' });

  if (session.autostart) maybeAutoStart(session);

  const you = playerId && session.seats.find(s => s.id === playerId) ? playerId : null;

  const base = {
    id: session.id,
    status: session.status,
    seats: session.seats.map(s => ({ id: s.id, type: s.type, handCount: (session.hands[s.id]?.length || 0) })),
    maxPlayers: session.maxPlayers,
    deckCount: session.deck.length,
    trumpSuit: session.trumpSuit,
    trumpCard: session.trumpCard,
    table: session.table,
    attacker: session.attacker,
    defender: session.defender,
    currentPlayer: session.currentPlayer,
    phase: session.phase,
    updated: session.updated,
    winners: session.winners,
    loserId: session.loserId,
    config: { botCountWanted: session.botCountWanted, autostart: session.autostart, startWhenFull: session.startWhenFull },
  };

  if (!you) return res.json({ ...base, note: 'viewer' });

  const hand = session.hands[you] || [];
  res.json({ ...base, you, hand });
});

// Сделать ход
app.post('/api/game/:gameId/move', (req, res) => {
  const gameId = req.params.gameId;
  const { playerId, action, card } = req.body || {};
  const session = gameSessions.get(gameId);
  if (!session) return res.status(404).json({ error: 'Game not found' });
  if (!playerId || !session.seats.find(s => s.id === String(playerId))) return res.status(403).json({ error: 'Not a participant' });

  if (session.status !== 'playing') return res.status(400).json({ error: 'Game is not playing' });
  if (session.currentPlayer !== String(playerId)) return res.status(400).json({ error: 'Not your turn' });

  try {
    if (action === 'attack') {
      if (session.phase !== 'attacking' || session.attacker !== String(playerId)) {
        return res.status(400).json({ error: 'Not your attacking phase' });
      }
      const defenderId = session.defender;
      const hand = session.hands[playerId];
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });
      if (session.table.length >= (session.hands[defenderId]?.length || 0)) {
        return res.status(400).json({ error: 'Limit reached: defender has fewer cards' });
      }
      if (session.table.length > 0) {
        const rset = ranksOnTable(session.table);
        if (!rset.has(hand[idx].rank)) return res.status(400).json({ error: 'Rank doesn\'t match cards on table' });
      }
      const play = hand.splice(idx, 1)[0];
      session.table.push({ attack: play, defend: null });
      session.phase = 'defending';
      session.currentPlayer = session.defender;
    }
    else if (action === 'defend') {
      if (session.phase !== 'defending' || session.defender !== String(playerId)) {
        return res.status(400).json({ error: 'Not your defending phase' });
      }
      const lastPair = session.table[session.table.length - 1];
      if (!lastPair || lastPair.defend) return res.status(400).json({ error: 'Nothing to defend' });
      const hand = session.hands[playerId];
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });
      const chosen = hand[idx];
      if (!canDefend(session, chosen, lastPair.attack)) {
        return res.status(400).json({ error: 'Card cannot beat attack' });
      }
      lastPair.defend = hand.splice(idx, 1)[0];
      const allDefended = session.table.every(p => p.defend);
      if (allDefended) {
        session.phase = 'attacking';
        session.currentPlayer = session.attacker;
      }
    }
    else if (action === 'take') {
      if (session.phase !== 'defending' || session.defender !== String(playerId)) {
        return res.status(400).json({ error: 'Only defender can take cards' });
      }
      const defHand = session.hands[playerId];
      for (const p of session.table) {
        defHand.push(p.attack);
        if (p.defend) defHand.push(p.defend);
      }
      session.table = [];
      sortHand(defHand, session.trumpSuit);
      drawToSixFirstAttackerThenDefender(session);
      session.currentPlayer = session.attacker; // атакующий сохраняется
      session.phase = 'attacking';
      ensureActivePlayersHaveCards(session);
    }
    else if (action === 'pass') { // Бито — только атакующий
      if (session.phase !== 'attacking' || session.attacker !== String(playerId)) {
        return res.status(400).json({ error: 'Only attacker can pass (bito)' });
      }
      if (!(session.table.length > 0 && session.table.every(p => p.defend))) {
        return res.status(400).json({ error: 'Cannot pass: not all pairs defended' });
      }
      session.table = [];
      const oldA = session.attacker, oldD = session.defender;
      drawToSixFirstAttackerThenDefender(session);
      session.attacker = oldD;
      const aIdx = session.seats.findIndex(s => s.id === session.attacker);
      session.defender = session.seats[nextIdx(session, aIdx)].id;
      session.currentPlayer = session.attacker;
      session.phase = 'attacking';
      ensureActivePlayersHaveCards(session);
    }
    else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    // Завершаем/продолжаем ботами
    const over = checkGameOverMulti(session);
    if (over) {
      session.status = 'finished';
      session.loserId = over.loserId || null;
      session.winners = over.winners || [];
    } else {
      processBots(session);
    }
    session.updated = Date.now();
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
    if (now - (s.updated || s.created || now) > 30 * 60 * 1000) {
      console.log(`🧹 deleting stale game ${id}`);
      gameSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

/* -------------------- Старт -------------------- */
app.listen(port, () => {
  console.log('🚀 Server started on port:', port);
  initBot();
});
process.on('unhandledRejection', (r) => console.error('🧯 UnhandledRejection:', r));
process.on('uncaughtException', (e) => console.error('🧯 UncaughtException:', e));
