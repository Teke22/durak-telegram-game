// server.js
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* --- Карты --- */
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6','7','8','9','10','J','Q','K','A'];
const RANK_VALUES = { '6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };

function makeDeck(){
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s, value: RANK_VALUES[r] });
  shuffle(d);
  return d;
}
function shuffle(a){
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
}

/* --- Хранилище сессий --- */
const gameSessions = new Map(); // gameId -> session

function genId(){
  return Math.random().toString(36).substring(2,8).toUpperCase();
}

/* --- Вспомогательные --- */
function startGame(session){
  if (session.status === 'playing') return;
  session.deck = makeDeck();
  session.trumpCard = session.deck[session.deck.length - 1];
  session.trumpSuit = session.trumpCard.suit;

  session.hands = {};
  for (const p of session.players) session.hands[p] = [];

  // Раздаём по 6 карт по кругу
  for (let i = 0; i < 6; i++){
    for (const p of session.players){
      if (session.deck.length > 0) session.hands[p].push(session.deck.pop());
    }
  }

  // Инициализируем роли: первый игрок — атакующий
  session.attacker = session.players[0];
  session.defender = session.players[1];
  session.currentPlayer = session.attacker;
  session.phase = 'attacking'; // attacking | defending
  session.table = []; // { attack, defend? }
  session.status = 'playing';
  session.updated = Date.now();
}

function drawToSix(session){
  // после хода: добираем руки — сначала атакующий, затем защитник
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
  for (const p of table){
    s.add(p.attack.rank);
    if (p.defend) s.add(p.defend.rank);
  }
  return s;
}

function canDefendWith(session, defendCard, attackCard){
  if (!defendCard || !attackCard) return false;
  if (defendCard.suit === attackCard.suit && defendCard.value > attackCard.value) return true;
  if (defendCard.suit === session.trumpSuit && attackCard.suit !== session.trumpSuit) return true;
  return false;
}

function checkGameOver(session){
  // когда колоды нет и у кого-то рука пустая -> игра закончена
  const counts = session.players.map(p => session.hands[p].length);
  if (session.deck.length === 0){
    const playersWithCards = session.players.filter((p, idx) => session.hands[p].length > 0);
    if (playersWithCards.length <= 1){
      session.status = 'finished';
      session.loser = playersWithCards.length === 1 ? playersWithCards[0] : null;
      session.updated = Date.now();
      return true;
    }
  }
  return false;
}

/* --- API --- */

// Создать комнату (строго 2 игрока)
app.post('/api/create-game', (req, res) => {
  try {
    const playerId = String(req.body.playerId || `player_${Date.now()}`);
    const gameId = genId();

    const session = {
      id: gameId,
      created: Date.now(),
      players: [playerId],
      maxPlayers: 2,
      status: 'waiting', // waiting | playing | finished
      deck: [],
      trumpCard: null,
      trumpSuit: null,
      hands: {},
      table: [],
      attacker: null,
      defender: null,
      currentPlayer: null,
      phase: null,
      updated: Date.now()
    };

    gameSessions.set(gameId, session);
    return res.json({ gameId, playerId, status: session.status });
  } catch (e) {
    console.error('create-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Присоединиться к комнате
app.post('/api/join-game/:gameId', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const playerId = String(req.body.playerId || `player_${Date.now()}`);
    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });
    if (session.players.includes(playerId)) {
      // уникализируем id
      const suffix = Math.random().toString(36).slice(2,6).toUpperCase();
      session.players.push(playerId + '_' + suffix);
    } else {
      if (session.players.length >= session.maxPlayers) return res.status(400).json({ error: 'Game is full' });
      session.players.push(playerId);
    }
    session.updated = Date.now();

    // если стало 2 игрока — стартуем
    if (session.players.length === 2) {
      startGame(session);
    }

    return res.json({ gameId, playerId, status: session.status });
  } catch (e) {
    console.error('join-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Получить состояние игры
app.get('/api/game/:gameId', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const playerId = req.query.playerId ? String(req.query.playerId) : null;
    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });

    // формируем список мест (id + handCount)
    const seats = session.players.map(id => ({ id, handCount: (session.hands[id] ? session.hands[id].length : 0) }));

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
    };

    if (playerId && session.players.includes(playerId)){
      // отдаем руку игрока (сервак хранит руки)
      const hand = session.hands[playerId] || [];
      return res.json({ ...base, you: playerId, hand });
    }

    return res.json(base);
  } catch (e) {
    console.error('get-game error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// Сделать ход
app.post('/api/game/:gameId/move', (req, res) => {
  try {
    const gameId = req.params.gameId.toUpperCase();
    const { playerId, action, card } = req.body || {};
    if (!playerId || !action) return res.status(400).json({ error: 'playerId and action required' });

    const session = gameSessions.get(gameId);
    if (!session) return res.status(404).json({ error: 'Game not found' });
    if (!session.players.includes(playerId)) return res.status(403).json({ error: 'Not a participant' });
    if (session.status !== 'playing') return res.status(400).json({ error: 'Game not in playing state' });

    // shortcuts
    const attacker = session.attacker;
    const defender = session.defender;
    const hand = session.hands[playerId];

    if (!hand) return res.status(500).json({ error: 'Hand not available' });

    // ACTIONS: attack, defend, add, take, pass
    if (action === 'attack') {
      if (session.phase !== 'attacking' || session.currentPlayer !== playerId || playerId !== attacker) {
        return res.status(400).json({ error: 'Not your attack phase' });
      }
      // find card in hand
      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      // limit: number of cards on table must be < defender hand size
      const defenderHandCount = session.hands[defender].length;
      if (session.table.length >= defenderHandCount) return res.status(400).json({ error: 'Limit reached for defender' });

      // if table not empty: rank must match existing ranks
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

      // play defense
      lastPair.defend = hand.splice(idx,1)[0];

      // if all pairs defended -> attacker may choose to add or pass (we switch to attacking and currentPlayer = attacker)
      const allDefended = session.table.every(p => p.defend);
      if (allDefended) {
        session.phase = 'attacking';
        session.currentPlayer = attacker;
      } else {
        // else defender stays or next pair needs defense: currentPlayer remains defender
        session.currentPlayer = defender;
      }
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'add') {
      // only attacker can add (2-player simplified)
      if (session.phase !== 'defending') return res.status(400).json({ error: 'Cannot add now' });
      if (playerId !== attacker) return res.status(400).json({ error: 'Only attacker can add in 2p mode' });

      const defenderHandCount = session.hands[defender].length;
      if (session.table.length >= defenderHandCount) return res.status(400).json({ error: 'Limit reached' });

      const idx = hand.findIndex(c => c.rank === card?.rank && c.suit === card?.suit);
      if (idx === -1) return res.status(400).json({ error: 'Card not in hand' });

      const rset = ranksOnTable(session.table);
      if (!rset.has(hand[idx].rank)) return res.status(400).json({ error: 'Rank not on table' });

      const played = hand.splice(idx,1)[0];
      session.table.push({ attack: played, defend: null });
      // defender remains currentPlayer
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'take') {
      if (session.phase !== 'defending' || playerId !== defender || session.currentPlayer !== defender) {
        return res.status(400).json({ error: 'Only defender can take now' });
      }
      // defender takes all cards on table
      for (const p of session.table){
        session.hands[defender].push(p.attack);
        if (p.defend) session.hands[defender].push(p.defend);
      }
      session.table = [];
      // sort not necessary, but keep updated
      drawToSix(session); // добираем
      // attacker remains attacker, next currentPlayer = attacker, phase = attacking
      session.phase = 'attacking';
      session.currentPlayer = session.attacker;
      session.updated = Date.now();
      checkGameOver(session);
      return res.json({ ok: true });
    }

    if (action === 'pass') {
      // attacker declares "бито" if all pairs defended
      if (session.phase !== 'attacking' || playerId !== attacker || session.currentPlayer !== attacker) {
        return res.status(400).json({ error: 'Only attacker can pass' });
      }
      if (!(session.table.length > 0 && session.table.every(p => p.defend))) {
        return res.status(400).json({ error: 'Not all pairs defended' });
      }
      // clear table, draw to 6, rotate attacker <-> defender
      session.table = [];
      drawToSix(session);
      // rotate roles: new attacker becomes previous defender
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
    console.error('move error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* --- Основные маршруты --- */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

/* --- Очистка старых сессий --- */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of gameSessions.entries()){
    if (now - (s.updated || s.created || now) > 30 * 60 * 1000) {
      gameSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

/* --- Старт --- */
app.listen(port, () => {
  console.log('Server started on port', port);
});
