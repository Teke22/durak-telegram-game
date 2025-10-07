// server.js
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Telegram config
const TOKEN = process.env.BOT_TOKEN || '';
const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.PUBLIC_URL || null;
const USE_POLLING_FALLBACK = true;

let bot = null;
let usingWebhook = false;
function safeLog(...args){ console.log(new Date().toISOString(), ...args); }

// Game engine (2 players)
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
function makeDeck(){ const d=[]; for (const s of SUITS) for (const r of RANKS) d.push({ rank:r, suit:s, value: RANK_VALUES[r] }); shuffle(d); return d; }

const gameSessions = new Map();

function genId(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

// make deterministic unique id for joining duplicates: base, base_2, base_3...
function makeUniquePlayerId(session, baseId){
  if (!session || !session.players) return baseId;
  // count how many existing players start exactly with baseId or baseId_#
  let maxSuffix = 0;
  for (const p of session.players){
    if (p === baseId) maxSuffix = Math.max(maxSuffix, 1);
    const m = p.match(new RegExp(`^${baseId}_(\\d+)$`));
    if (m) maxSuffix = Math.max(maxSuffix, parseInt(m[1],10));
  }
  if (maxSuffix === 0) return baseId; //not present -> use baseId
  // if baseId is present => we must return baseId_(maxSuffix+1)
  return `${baseId}_${maxSuffix + 1}`;
}

function startGame(session){
  if (session.status === 'playing') return;
  session.deck = makeDeck();
  session.trumpCard = session.deck[session.deck.length - 1];
  session.trumpSuit = session.trumpCard.suit;
  session.hands = {};
  for (const p of session.players) session.hands[p] = [];
  for (let i=0;i<6;i++){
    for (const p of session.players){
      if (session.deck.length) session.hands[p].push(session.deck.pop());
    }
  }
  session.attacker = session.players[0];
  session.defender = session.players[1];
  session.currentPlayer = session.attacker;
  session.phase = 'attacking';
  session.table = [];
  session.status = 'playing';
  session.roundMax = null;
  session.updated = Date.now();
}

function drawToSix(session){
  const limit = 6;
  const order = [session.attacker, session.defender];
  for (const id of order){
    while (session.hands[id].length < limit && session.deck.length > 0){
      session.hands[id].push(session.deck.pop());
    }
  }
  session.updated = Date.now();
}

function ranksOnTable(table){
  const s = new Set();
  for (const p of table){ s.add(p.attack.rank); if (p.defend) s.add(p.defend.rank); }
  return s;
}

function canDefendWith(session, defendCard, attackCard){
  if (!defendCard || !attackCard) return false;
  if (defendCard.suit === attackCard.suit && defendCard.value > attackCard.value) return true;
  if (defendCard.suit === session.trumpSuit && attackCard.suit !== session.trumpSuit) return true;
  return false;
}

function checkGameOver(session){
  if (session.deck.length === 0){
    const playersWithCards = session.players.filter(p => session.hands[p].length > 0);
    if (playersWithCards.length <= 1){
      session.status = 'finished';
      session.loser = playersWithCards.length === 1 ? playersWithCards[0] : null;
      session.updated = Date.now();
      return true;
    }
  }
  return false;
}

// API
app.post('/api/create-game', (req, res) => {
  try {
    const baseId = String(req.body.playerId || `player_${Date.now()}`);
    const gameId = genId();
    const session = {
      id: gameId,
      created: Date.now(),
      players: [],
      maxPlayers: 2,
      status: 'waiting',
      deck: [],
      trumpCard: null,
      trumpSuit: null,
      hands: {},
      table: [],
      attacker: null,
      defender: null,
      currentPlayer: null,
      phase: null,
      roundMax: null,
      updated: Date.now()
    };
    // add creator (no duplicates in empty session)
    const playerId = makeUniquePlayerId(session, baseId);
    session.players.push(playerId);
    gameSessions.set(gameId, session);
    return res.json({ gameId, playerId, status: session.status });
  } catch (e) {
    safeLog('create-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/join-game/:gameId', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const baseId = String(req.body.playerId || `player_${Date.now()}`);
    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });

    // make unique id (deterministic suffix)
    const playerId = makeUniquePlayerId(session, baseId);
    if (session.players.length >= session.maxPlayers) return res.status(400).json({ error: 'Game is full' });

    session.players.push(playerId);
    session.updated = Date.now();

    if (session.players.length === 2) startGame(session);

    return res.json({ gameId, playerId, status: session.status });
  } catch (e) {
    safeLog('join-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/game/:gameId', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const playerId = req.query.playerId ? String(req.query.playerId) : null;
    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });

    const seats = session.players.map(id => ({ id, handCount: (session.hands[id] ? session.hands[id].length : 0), type: id.startsWith('bot_') ? 'bot' : 'player' }));

    const base = {
      id: session.id,
      status: session.status,
      seats,
      deckCount: session.deck.length,
      trumpSuit: session.trumpSuit,
      trumpCard: session.trumpCard,
      table: session.table,
      attacker: session.attacker,
      defender: session.defender,
      currentPlayer: session.currentPlayer,
      phase: session.phase,
      updated: session.updated,
      roundMax: session.roundMax
    };

    if (playerId && session.players.includes(playerId)){
      const hand = session.hands[playerId] || [];
      return res.json({ ...base, you: playerId, hand });
    }

    return res.json(base);
  } catch (e) {
    safeLog('get-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/game/:gameId/move', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const { playerId, action, card } = req.body || {};
    if (!playerId || !action) return res.status(400).json({ error: 'playerId and action required' });

    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });
    if (!session.players.includes(playerId)) return res.status(403).json({ error: 'Not a participant' });
    if (session.status !== 'playing') return res.status(400).json({ error: 'Game not in playing state' });

    const attacker = session.attacker;
    const defender = session.defender;
    const hand = session.hands[playerId];
    if (!hand) return res.status(500).json({ error: 'Hand not available' });

    if (action === 'attack') {
      if (session.phase !== 'attacking' || session.currentPlayer !== playerId || playerId !== attacker) {
        return res.status(400).json({ error: 'Not your attack phase' });
      }
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      // roundMax fixed to 6 as requested
      if (session.table.length === 0) {
        session.roundMax = 6;
      }

      const limit = (typeof session.roundMax === 'number' && session.roundMax > 0) ? session.roundMax : session.hands[defender].length;
      if (session.table.length >= limit) return res.status(400).json({ error: 'Limit reached for defender' });

      if (session.table.length > 0) {
        const rset = ranksOnTable(session.table);
        if (!rset.has(hand[idx].rank)) return res.status(400).json({ error: 'Rank not allowed to attack' });
      }

      const played = hand.splice(idx,1)[0];
      session.table.push({ attack: played, defend: null });
      session.phase = 'defending';
      session.currentPlayer = defender;
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'defend') {
      if (session.phase !== 'defending' || session.currentPlayer !== playerId || playerId !== defender) {
        return res.status(400).json({ error: 'Not your defend phase' });
      }
      const lastPair = session.table[session.table.length - 1];
      if (!lastPair || lastPair.defend) return res.status(400).json({ error: 'Nothing to defend' });
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      const chosen = hand[idx];
      if (!canDefendWith(session, chosen, lastPair.attack)) return res.status(400).json({ error: 'Card cannot beat attack' });

      lastPair.defend = hand.splice(idx,1)[0];

      const allDefended = session.table.every(p => p.defend);
      if (allDefended) {
        session.phase = 'attacking';
        session.currentPlayer = attacker;
      } else {
        session.currentPlayer = defender;
      }
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'add') {
      if (session.phase !== 'defending') return res.status(400).json({ error: 'Cannot add now' });
      if (playerId !== attacker) return res.status(400).json({ error: 'Only attacker can add in 2p mode' });

      const limit = (typeof session.roundMax === 'number' && session.roundMax > 0) ? session.roundMax : session.hands[defender].length;
      if (session.table.length >= limit) return res.status(400).json({ error: 'Limit reached' });

      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      const rset = ranksOnTable(session.table);
      if (!rset.has(hand[idx].rank)) return res.status(400).json({ error: 'Rank not on table' });

      const played = hand.splice(idx,1)[0];
      session.table.push({ attack: played, defend: null });
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'take') {
      if (session.phase !== 'defending' || playerId !== defender || session.currentPlayer !== defender) {
        return res.status(400).json({ error: 'Only defender can take now' });
      }
      for (const p of session.table) {
        session.hands[defender].push(p.attack);
        if (p.defend) session.hands[defender].push(p.defend);
      }
      session.table = [];
      session.roundMax = null;
      drawToSix(session);
      session.phase = 'attacking';
      session.currentPlayer = session.attacker;
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'pass') {
      if (session.phase !== 'attacking' || playerId !== attacker || session.currentPlayer !== attacker) {
        return res.status(400).json({ error: 'Only attacker can pass' });
      }
      if (!(session.table.length > 0 && session.table.every(p => p.defend))) {
        return res.status(400).json({ error: 'Not all pairs defended' });
      }
      session.table = [];
      session.roundMax = null;
      drawToSix(session);
      const prevAtt = session.attacker;
      session.attacker = session.defender;
      session.defender = prevAtt;
      session.currentPlayer = session.attacker;
      session.phase = 'attacking';
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    safeLog('move error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// root + health
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (req, res) => res.json({ status:'OK', bot: !!bot, usingWebhook, appUrl: APP_URL || null, timestamp: new Date().toISOString() }));

// Telegram init & handlers (webhook -> polling fallback)
function registerHandlers(b){
  if (!b) return;
  b.onText(/\/start/, (msg) => {
    try {
      const chatId = msg.chat.id;
      safeLog('Received /start from', chatId, msg.from && msg.from.username);
      const appUrl = APP_URL || `https://t.me`;
      const keyboard = {
        inline_keyboard: [
          [{ text: '🎮 Играть с ботом', web_app: { url: `${appUrl}?mode=bot` } }],
          [{ text: '👥 Создать комнату', web_app: { url: `${appUrl}?mode=create` } }],
          [{ text: '🔗 Присоединиться по коду', web_app: { url: `${appUrl}?mode=join` } }]
        ]
      };
      b.sendMessage(chatId, '🎴 Добро пожаловать! Открой мини-приложение из кнопок ниже.', { reply_markup: keyboard })
        .catch(err => safeLog('sendMessage error', err && err.message ? err.message : err));
    } catch (e) {
      safeLog('Error in /start handler', e);
    }
  });
  b.on('message', (msg) => safeLog('Message', msg.chat && msg.chat.id, msg.text || '(no text)'));
  b.on('error', (err) => safeLog('Bot error', err && err.message ? err.message : err));
}

async function initBot(){
  if (!TOKEN){
    safeLog('⚠️ BOT_TOKEN not provided — bot disabled.');
    return;
  }

  if (APP_URL){
    try {
      safeLog('Trying webhook mode. APP_URL:', APP_URL);
      bot = new TelegramBot(TOKEN, { polling: false });
      const webhookPath = `/bot${TOKEN}`;
      const webhookUrl = `${APP_URL.replace(/\/+$/, '')}${webhookPath}`;
      app.post(webhookPath, (req, res) => {
        try {
          if (bot && req.body) {
            bot.processUpdate(req.body);
            res.sendStatus(200);
          } else res.sendStatus(400);
        } catch (e) {
          safeLog('Webhook processing error', e);
          res.sendStatus(500);
        }
      });
      await bot.setWebHook(webhookUrl);
      usingWebhook = true;
      safeLog('✅ Webhook set:', webhookUrl);
      registerHandlers(bot);
      return;
    } catch (err) {
      safeLog('❌ Webhook setup failed:', err && err.message ? err.message : err);
      if (!USE_POLLING_FALLBACK) return;
      safeLog('Falling back to polling mode.');
    }
  }

  try {
    bot = new TelegramBot(TOKEN, { polling: true });
    usingWebhook = false;
    safeLog('✅ Bot started in polling mode');
    registerHandlers(bot);
  } catch (err) {
    safeLog('❌ Failed to start bot in polling mode:', err && err.message ? err.message : err);
  }
}

app.listen(port, async () => {
  safeLog('Server started on port', port);
  safeLog('APP_URL/RENDER_EXTERNAL_URL:', APP_URL || '(none)');
  await initBot();
});

// cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id,s] of gameSessions.entries()){
    if (now - (s.updated || s.created || now) > 30 * 60 * 1000) gameSessions.delete(id);
  }
}, 5 * 60 * 1000);
