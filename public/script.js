/* eslint-disable no-console */

// ---- Безопасный Telegram.WebApp ----
const tg = window.Telegram?.WebApp ?? {
  expand() {}, enableClosingConfirmation() {},
  HapticFeedback: { impactOccurred() {} },
  showPopup({ title, message }) { try { alert(`${title ? title + "\n" : ""}${message ?? ""}`); } catch(_) {} },
  initDataUnsafe: {},
};
tg.expand?.();
tg.enableClosingConfirmation?.();

const urlParamsAll = new URLSearchParams(location.search);
const DEBUG = urlParamsAll.get('debug') === '1';

let debugLog = [];
function logDebug(...args) {
  if (!DEBUG) return;
  debugLog.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
  const el = document.getElementById('debug-overlay');
  if (el) el.textContent = debugLog.slice(-80).join('\n');
}
function mountDebugOverlay() {
  if (!DEBUG) return;
  const el = document.createElement('div');
  el.id = 'debug-overlay';
  el.textContent = 'DEBUG ON';
  document.body.appendChild(el);
  window.addEventListener('error', (e) => logDebug('window.error:', e?.message || e));
  window.addEventListener('unhandledrejection', (e) => logDebug('unhandledrejection:', e?.reason?.message || e?.reason || e));
}

// ---------------- Тосты ----------------
function showToast(text, type = 'info', timeout = 1600) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); }, timeout);
}

// ---------------- Константы игры ----------------
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = { "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const HAND_LIMIT = 6;
function suitColorClass(suit) { return (suit === "♥" || suit === "♦") ? "red" : "black"; }

// ---------------- Состояние ----------------
let gameState = {
  mode: new URLSearchParams(window.location.search).get("mode") || "bot",

  // общие
  trumpSuit: "", trumpCard: null,
  table: [],

  // bot-mode
  deck: [],
  playerHand: [],
  botHand: [],
  currentPlayer: "player",
  status: "waiting",
  attacker: "player",
  defender: "bot",
  canAddCards: false,

  // multiplayer
  isMultiplayer: false,
  deckCount: 0,
  gameId: null,
  playerId: null,
  opponentId: null,
};

const gameBoard = document.getElementById("game-board");
const startButton = document.getElementById("start-game");

function initInterface() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get("mode") || "bot";
  const gameId = urlParams.get("gameId");
  gameState.mode = mode;

  mountDebugOverlay();
  logDebug('initInterface', { mode, gameId });

  if (mode === "bot") showBotInterface();
  else if (mode === "create") showMultiplayerCreateInterface();
  else if (mode === "join") gameId ? showMultiplayerJoinInterface(gameId) : showMultiplayerJoinPrompt();
  else showBotInterface();
}

/* ==================== UI режимов ==================== */
function showBotInterface() {
  gameState.isMultiplayer = false;
  startButton.style.display = "block";
  startButton.textContent = "🎮 Начать игру с ботом";
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>🎴 Игра с ботом</h2>
      <p>Сыграйте против простого компьютерного соперника</p>
      <p>Нажмите кнопку ниже, чтобы начать!</p>
    </div>
  `;
  startButton.onclick = () => { initGameBot(); };
}

function showMultiplayerJoinPrompt() {
  gameState.isMultiplayer = true;
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>🔗 Присоединиться к игре</h2>
      <p>Введите код комнаты:</p>
      <input type="text" id="game-code-input" placeholder="ABCDEF"
             style="padding:12px; font-size:18px; text-align:center; border-radius:8px; border:2px solid #ddd; width:200px;"
             maxlength="6">
      <br><br>
      <button id="btn-join-with-code"
              style="padding:12px 24px; font-size:16px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">
        🎮 Присоединиться
      </button>
      <br><br>
      <button id="btn-back-bot"
              style="padding:10px 20px; font-size:14px; border-radius:6px; border:none; background:#6c757d; color:white; cursor:pointer;">
        ↩️ Назад
      </button>
    </div>
  `;
  startButton.style.display = "none";
  document.getElementById('btn-join-with-code').addEventListener('click', joinWithCode);
  document.getElementById('btn-back-bot').addEventListener('click', showBotInterface);
}

function showMultiplayerCreateInterface() {
  gameState.isMultiplayer = true;
  startButton.style.display = "block";
  startButton.textContent = "👥 Создать комнату";
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>👥 Создать комнату</h2>
      <p>Создайте комнату для игры с другом</p>
      <p>После создания поделитесь кодом комнаты</p>
    </div>
  `;
  startButton.onclick = createMultiplayerGame;
}

function showMultiplayerJoinInterface(gameId) {
  gameState.isMultiplayer = true;
  startButton.style.display = "block";
  startButton.textContent = "🎮 Присоединиться к игре";
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>👥 Присоединение к игре</h2>
      <p>Код комнаты: <strong style="font-size:24px;">${gameId}</strong></p>
      <p>Нажмите кнопку, чтобы присоединиться</p>
    </div>
  `;
  startButton.onclick = () => joinMultiplayerGame(gameId);
}

function joinWithCode() {
  const input = document.getElementById("game-code-input");
  const gameId = (input.value || '').toUpperCase().trim();
  if (gameId.length === 6) {
    window.location.href = `?mode=join&gameId=${gameId}${DEBUG ? '&debug=1' : ''}`;
  } else {
    tg.showPopup({ title: "Ошибка", message: "Введите корректный код комнаты (6 символов)" });
  }
}

/* ==================== BOT MODE ==================== */
function initGameBot() {
  tg.HapticFeedback?.impactOccurred?.("light");
  startButton.style.display = "none";

  gameState.deck = [];
  for (const suit of SUITS) for (const rank of RANKS) {
    gameState.deck.push({ rank, suit, value: RANK_VALUES[rank] });
  }
  shuffleDeck(gameState.deck);

  gameState.playerHand = drawMany(gameState.deck, HAND_LIMIT);
  gameState.botHand    = drawMany(gameState.deck, HAND_LIMIT);

  gameState.trumpCard = gameState.deck[gameState.deck.length - 1];
  gameState.trumpSuit = gameState.trumpCard.suit;

  sortHand(gameState.playerHand);
  sortHand(gameState.botHand);

  gameState.table = [];
  gameState.attacker = "player";
  gameState.defender = "bot";
  gameState.currentPlayer = "player";
  gameState.status = "attacking";
  gameState.canAddCards = false;

  renderGame();
}

/* ==================== MP MODE ==================== */
const mp = { gameId: null, playerId: null, pollId: null };

async function createMultiplayerGame() {
  try {
    const response = await fetch('/api/create-game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` })
    });
    const data = await response.json();

    mp.gameId = data.gameId;
    mp.playerId = data.playerId;
    gameState.gameId = data.gameId;
    gameState.playerId = data.playerId;

    gameBoard.innerHTML = `
      <div style="text-align:center; padding: 20px; color: white;">
        <h2>🎮 Комната создана!</h2>
        <p>Код комнаты:</p>
        <div style="font-size: 32px; font-weight: bold; margin: 15px 0; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 10px; color: #333;">
          ${data.gameId}
        </div>
        <p>Ожидание второго игрока...</p>
        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007aff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto 0;"></div>
      </div>
    `;
    startButton.style.display = 'none';

    const poll = setInterval(async () => {
      const r = await fetch(`/api/game/${data.gameId}?playerId=${data.playerId}`);
      if (!r.ok) return;
      const s = await r.json();
      if (s.status === 'playing') {
        clearInterval(poll);
        startMultiplayerClient(s, true);
      }
    }, 1200);
  } catch (e) {
    console.error('create error', e);
    showToast('Ошибка создания комнаты', 'warn');
  }
}

async function joinMultiplayerGame(gameId) {
  try {
    const response = await fetch(`/api/join-game/${gameId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` })
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();

    mp.gameId = gameId;
    mp.playerId = data.playerId; // важно: если сервер добавил суффикс
    gameState.gameId = gameId;
    gameState.playerId = data.playerId;

    gameBoard.innerHTML = `
      <div style="text-align:center; padding:20px; color:white;">
        <h2>✅ Присоединились!</h2>
        <p>Ожидание начала игры...</p>
        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007aff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto 0;"></div>
      </div>
    `;
    startButton.style.display = 'none';

    const poll = setInterval(async () => {
      const r = await fetch(`/api/game/${gameId}?playerId=${data.playerId}`);
      if (!r.ok) return;
      const s = await r.json();
      if (s.status === 'playing') {
        clearInterval(poll);
        startMultiplayerClient(s, true);
      }
    }, 1200);
  } catch (e) {
    console.error('join error', e);
    showToast('Не удалось присоединиться: проверьте код', 'warn');
  }
}

function startMultiplayerClient(serverState, announce = false) {
  gameState.isMultiplayer = true;
  mp.gameId = serverState.id || mp.gameId;
  mp.playerId = serverState.you || mp.playerId;
  gameState.opponentId = serverState.opponentId || null;

  applyServerState(serverState);
  renderGame();
  if (announce) showToast('Игра началась!');

  if (mp.pollId) clearInterval(mp.pollId);
  mp.pollId = setInterval(refreshGameFromServer, 1200);
}

async function refreshGameFromServer() {
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(`/api/game/${mp.gameId}?playerId=${mp.playerId}`);
    if (!r.ok) return;
    const s = await r.json();
    applyServerState(s);
    renderGame();
    if (s.status === 'finished') {
      clearInterval(mp.pollId);
    }
  } catch (_) {}
}

function applyServerState(s) {
  if (!s || !s.status) return;

  gameState.trumpSuit = s.trumpSuit || gameState.trumpSuit;
  gameState.trumpCard = s.trumpCard || gameState.trumpCard;
  gameState.table = s.table || [];

  const you = s.you;
  const attackerIsYou = s.attacker === you;
  const defenderIsYou = s.defender === you;

  gameState.attacker = attackerIsYou ? 'player' : 'bot';
  gameState.defender = defenderIsYou ? 'player' : 'bot';
  gameState.currentPlayer = (s.currentPlayer === you) ? 'player' : 'bot';
  gameState.status = s.phase || 'attacking';

  gameState.playerHand = s.hand || [];
  const oppCount = s.opponentCount ?? 0;
  gameState.botHand = Array.from({ length: oppCount }, () => null);
  gameState.deckCount = s.deckCount ?? 0;

  if (s.status === 'finished') {
    const winnerId = s.winnerId;
    if (!winnerId) endGame('draw');
    else if (winnerId === you) endGame('player');
    else endGame('bot');
  }
}

async function sendMove(action, card) {
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(`/api/game/${mp.gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: mp.playerId, action, card })
    });
    const data = await r.json();
    if (!r.ok) {
      showToast(data?.error || 'Ошибка хода', 'warn');
    }
  } catch (e) {
    showToast('Сеть недоступна', 'warn');
  }
}

/* ==================== Рендер ==================== */
function renderGame() {
  gameBoard.innerHTML = "";

  const header = document.createElement("div");
  const deckCount = gameState.isMultiplayer ? gameState.deckCount : gameState.deck.length;
  const trumpHtml = gameState.trumpCard ? renderCardInline(gameState.trumpCard, true) : '';

  header.innerHTML = `
    <h2>🎴 Подкидной дурак</h2>
    <div class="trump-info">
      <div class="trump-card">
        <span class="trump-badge">Козырь</span>
        ${trumpHtml || '<span style="font-weight:700;">—</span>'}
      </div>
      <div style="margin-top:6px;">В колоде: ${deckCount} карт</div>
    </div>
    <div class="game-status">${getStatusMessage()}</div>
  `;
  gameBoard.appendChild(header);

  renderOpponentHand();
  if (gameState.table.length > 0) renderTable();
  renderActionButtons();
  renderPlayerHand();
}

function renderOpponentHand() {
  const n = gameState.botHand?.length || 0;
  const section = document.createElement('div');
  section.className = 'opponent-section';
  const title = gameState.isMultiplayer ? 'Карты соперника' : 'Карты бота';
  section.innerHTML = `<h3>${title}: ${n}</h3>`;

  const row = document.createElement('div'); row.className = 'opponent-cards';
  const visible = Math.min(n, 12);
  for (let i = 0; i < visible; i++) {
    const back = document.createElement('div');
    back.className = 'card back';
    back.setAttribute('aria-label', 'Карта соперника (рубашка)');
    row.appendChild(back);
  }
  if (n > 12) {
    const more = document.createElement('div');
    more.className = 'card back';
    more.style.minWidth = '54px';
    more.style.background = 'rgba(0,0,0,0.1)';
    more.style.borderStyle = 'dashed';
    more.style.borderColor = '#666';
    more.style.color = '#333';
    more.style.fontWeight = '800';
    more.textContent = `+${n - 12}`;
    row.appendChild(more);
  }
  section.appendChild(row);
  gameBoard.appendChild(section);
}

function renderTable() {
  const tableSection = document.createElement("div");
  tableSection.className = "table-section";
  tableSection.innerHTML = "<h3>На столе:</h3>";

  const tableCards = document.createElement("div");
  tableCards.className = "table-cards";

  gameState.table.forEach((pair) => {
    const pairEl = document.createElement("div");
    pairEl.className = "card-pair";

    pairEl.appendChild(createCardElement(pair.attack, false));
    if (pair.defend) {
      const defendEl = createCardElement(pair.defend, false);
      defendEl.classList.add("defended");
      pairEl.appendChild(defendEl);
    }
    tableCards.appendChild(pairEl);
  });

  tableSection.appendChild(tableCards);
  gameBoard.appendChild(tableSection);
}

function renderActionButtons() {
  const actions = document.createElement("div");
  actions.className = "action-buttons";

  const allDefended = gameState.table.length > 0 && gameState.table.every((p) => p.defend);
  const playerIsAttacker = gameState.attacker === "player";

  if (gameState.status === "defending" && gameState.currentPlayer === "player") {
    const takeBtn = document.createElement("button");
    takeBtn.className = "action-btn danger";
    takeBtn.textContent = "Взять карты";
    takeBtn.addEventListener('click', () => {
      if (gameState.isMultiplayer) sendMove('take');
      else takeCardsBot();
    });
    actions.appendChild(takeBtn);
  }

  if (allDefended && playerIsAttacker && gameState.currentPlayer === "player" && gameState.status === "attacking") {
    const passBtn = document.createElement("button");
    passBtn.className = "action-btn success";
    passBtn.textContent = "Бито";
    passBtn.addEventListener('click', () => {
      if (gameState.isMultiplayer) sendMove('pass');
      else passTurnBot();
    });
    actions.appendChild(passBtn);
  }

  if (actions.children.length > 0) gameBoard.appendChild(actions);
}

function renderPlayerHand() {
  const handSection = document.createElement("div");
  handSection.className = "hand-section";
  handSection.innerHTML = "<h3>Ваши карты:</h3>";

  const playerCards = document.createElement("div");
  playerCards.className = "player-cards";

  gameState.playerHand.forEach((card, index) => {
    const canAttack = gameState.status === "attacking" && gameState.currentPlayer === "player" && canAttackWithCardLocal(card);
    const canDefend = gameState.status === "defending" && gameState.currentPlayer === "player" && canDefendWithCardLocal(card);

    const clickable = canAttack || canDefend;
    const el = createCardElement(card, clickable);

    if (clickable) {
      el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (gameState.isMultiplayer) {
          const action = canAttack ? 'attack' : 'defend';
          sendMove(action, { rank: card.rank, suit: card.suit });
        } else {
          if (canAttack) attackWithCardBot(card, index);
          else if (canDefend) defendWithCardBot(card, index);
        }
      }, { passive: true });
    }
    playerCards.appendChild(el);
  });

  handSection.appendChild(playerCards);
  gameBoard.appendChild(handSection);
}

/* --------- Локальные проверки --------- */
function ranksOnTableLocal() {
  const ranks = new Set();
  for (const p of gameState.table) {
    ranks.add(p.attack.rank);
    if (p.defend) ranks.add(p.defend.rank);
  }
  return ranks;
}
function currentDefenderHandLenLocal() {
  return gameState.defender === 'player' ? gameState.playerHand.length : gameState.botHand.length;
}
function canAttackWithCardLocal(card) {
  const limitOk = gameState.table.length < currentDefenderHandLenLocal();
  if (gameState.table.length === 0) return limitOk;
  const ranks = ranksOnTableLocal();
  return limitOk && ranks.has(card.rank);
}
function canDefendWithCardLocal(card) {
  if (gameState.table.length === 0) return false;
  const lastPair = gameState.table[gameState.table.length - 1];
  if (lastPair.defend) return false;
  const attackCard = lastPair.attack;
  if (card.suit === attackCard.suit && card.value > attackCard.value) return true;
  if (card.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) return true;
  return false;
}

/* ==================== BOT-only ==================== */
function attackWithCardBot(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");
  gameState.playerHand.splice(index, 1);
  gameState.table.push({ attack: card, defend: null });
  gameState.status = "defending";
  gameState.currentPlayer = "bot";
  gameState.attacker = "player";
  gameState.defender = "bot";
  gameState.canAddCards = true;
  renderGame();
  setTimeout(botMove, 400);
}
function defendWithCardBot(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");
  const lastPair = gameState.table[gameState.table.length - 1];
  if (!lastPair || lastPair.defend) return;
  gameState.playerHand.splice(index, 1);
  lastPair.defend = card;
  renderGame();
  const allDefended = gameState.table.every((p) => p.defend);
  if (allDefended) {
    gameState.status = "attacking";
    gameState.currentPlayer = gameState.attacker;
    showToast("🤖 Отбился");
    setTimeout(botMove, 400);
  }
}
function takeCardsBot() {
  tg.HapticFeedback?.impactOccurred?.("heavy");
  for (const pair of gameState.table) {
    gameState.playerHand.push(pair.attack);
    if (pair.defend) gameState.playerHand.push(pair.defend);
  }
  gameState.table = [];
  sortHand(gameState.playerHand);
  showToast("Вы взяли карты", "warn");
  drawPhaseAfterRoundBot({ defenderTook: true, attacker: "bot", defender: "player" });
}
function passTurnBot() {
  tg.HapticFeedback?.impactOccurred?.("light");
  gameState.table = [];
  showToast("Вы: Бито", "success");
  drawPhaseAfterRoundBot({ defenderTook: false, attacker: gameState.attacker, defender: gameState.defender });
}
function botMove() {
  if (gameOverCheckBot()) return;
  if (gameState.status === "attacking" && gameState.currentPlayer === "bot") botAttackOrAdd();
  else if (gameState.status === "defending" && gameState.currentPlayer === "bot") botDefend();
}
function botAttackOrAdd() {
  if (gameState.table.length === 0) {
    const idx = botChooseAttackCard();
    if (idx === -1) {
      gameState.table = [];
      showToast("🤖 Бито", "success");
      drawPhaseAfterRoundBot({ defenderTook: false, attacker: "bot", defender: "player" });
      return;
    }
    const card = gameState.botHand.splice(idx, 1)[0];
    gameState.table.push({ attack: card, defend: null });
    gameState.status = "defending";
    gameState.currentPlayer = "player";
    gameState.attacker = "bot";
    gameState.defender = "player";
    gameState.canAddCards = true;
    showToast("🤖 Бот атакует");
    renderGame();
    return;
  }
  const allDefended = gameState.table.every(p => p.defend);
  const canAddMore = gameState.table.length < currentDefenderHandLenLocal();
  if (allDefended && canAddMore) {
    const rset = ranksOnTableLocal();
    let addIdx = -1;
    for (let i = 0; i < gameState.botHand.length; i++) {
      if (rset.has(gameState.botHand[i].rank)) { addIdx = i; break; }
    }
    if (addIdx !== -1) {
      const addCard = gameState.botHand.splice(addIdx, 1)[0];
      gameState.table.push({ attack: addCard, defend: null });
      gameState.status = "defending";
      gameState.currentPlayer = "player";
      gameState.attacker = "bot";
      gameState.defender = "player";
      renderGame();
      return;
    }
  }
  gameState.table = [];
  showToast("🤖 Бито", "success");
  drawPhaseAfterRoundBot({ defenderTook: false, attacker: "bot", defender: "player" });
}
function botDefend() {
  const lastPair = gameState.table[gameState.table.length - 1];
  if (!lastPair || lastPair.defend) {
    gameState.status = "attacking";
    gameState.currentPlayer = gameState.attacker;
    renderGame();
    return;
  }
  const idx = botChooseDefendCard(lastPair.attack);
  if (idx === -1) {
    for (const pair of gameState.table) {
      gameState.botHand.push(pair.attack);
      if (pair.defend) gameState.botHand.push(pair.defend);
    }
    gameState.table = [];
    sortHand(gameState.botHand);
    showToast("🤖 Бот взял карты", "warn");
    drawPhaseAfterRoundBot({ defenderTook: true, attacker: "player", defender: "bot" });
    return;
  }
  const card = gameState.botHand.splice(idx, 1)[0];
  lastPair.defend = card;
  gameState.status = "attacking";
  gameState.currentPlayer = gameState.attacker;
  showToast("🤖 Отбился");
  renderGame();
}
function botChooseAttackCard() {
  if (gameState.table.length === 0) {
    let best = -1, bestVal = Infinity;
    for (let i = 0; i < gameState.botHand.length; i++) {
      const c = gameState.botHand[i];
      const val = c.suit === gameState.trumpSuit ? c.value + 100 : c.value;
      if (val < bestVal) { bestVal = val; best = i; }
    }
    return best;
  } else {
    const rset = ranksOnTableLocal();
    for (let i = 0; i < gameState.botHand.length; i++) if (rset.has(gameState.botHand[i].rank)) return i;
    return -1;
  }
}
function botChooseDefendCard(attackCard) {
  let best = -1, bestVal = Infinity;
  for (let i = 0; i < gameState.botHand.length; i++) {
    const c = gameState.botHand[i];
    if (c.suit === attackCard.suit && c.value > attackCard.value) {
      if (c.value < bestVal) { bestVal = c.value; best = i; }
    } else if (c.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) {
      const val = c.value + 100; if (val < bestVal) { bestVal = val; best = i; }
    }
  }
  return best;
}
function drawPhaseAfterRoundBot({ defenderTook, attacker, defender }) {
  const drawOne = (hand) => { if (gameState.deck.length > 0) hand.push(gameState.deck.pop()); };
  const first  = attacker === "player" ? gameState.playerHand : gameState.botHand;
  const second = defender === "player" ? gameState.playerHand : gameState.botHand;

  while ((first.length < HAND_LIMIT || second.length < HAND_LIMIT) && gameState.deck.length > 0) {
    if (first.length  < HAND_LIMIT) drawOne(first);
    if (second.length < HAND_LIMIT) drawOne(second);
  }
  sortHand(gameState.playerHand);
  sortHand(gameState.botHand);

  if (defenderTook) { gameState.attacker = attacker; gameState.defender = defender; }
  else { gameState.attacker = defender; gameState.defender = attacker; }

  gameState.table = [];
  gameState.status = "attacking";
  gameState.currentPlayer = gameState.attacker;
  gameState.canAddCards = false;

  renderGame();
  if (gameState.currentPlayer === "bot") setTimeout(botMove, 400);
  gameOverCheckBot();
}
function gameOverCheckBot() {
  const deckEmpty = gameState.deck.length === 0;
  const tableEmpty = gameState.table.length === 0;
  if (!tableEmpty) return false;
  const playerEmpty = gameState.playerHand.length === 0;
  const botEmpty = gameState.botHand.length === 0;
  if (deckEmpty && (playerEmpty || botEmpty)) {
    if (playerEmpty && botEmpty) endGame("draw");
    else if (playerEmpty) endGame("player");
    else endGame("bot");
    return true;
  }
  return false;
}

/* ---------------- Вспомогательные ---------------- */
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}
function drawMany(deck, n) { const out=[]; for (let i=0;i<n && deck.length>0;i++) out.push(deck.pop()); return out; }
function sortHand(hand) {
  hand.sort((a, b) => {
    const aT = a.suit === gameState.trumpSuit, bT = b.suit === gameState.trumpSuit;
    if (aT !== bT) return aT ? 1 : -1;
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.value - b.value;
  });
}
function renderCardInline(card, isTrump) {
  const color = suitColorClass(card.suit);
  const trumpClass = isTrump || card.suit === gameState.trumpSuit ? "trump" : "";
  return `<span class="card ${trumpClass}">
    <span class="rank">${card.rank}</span><span class="suit ${color}">${card.suit}</span>
  </span>`;
}
function createCardElement(card, clickable) {
  const color = suitColorClass(card.suit);
  const el = document.createElement("div");
  el.className = `card ${clickable ? "clickable" : ""} ${card.suit === gameState.trumpSuit ? "trump" : ""}`;
  el.setAttribute('data-suit', card.suit);
  el.setAttribute('aria-label', `${card.rank}${card.suit}`);
  el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit ${color}">${card.suit}</span>`;
  return el;
}
function getStatusMessage() {
  if (gameState.status === "attacking")  return gameState.currentPlayer === "player" ? "✅ Ваш ход. Атакуйте!" : "⏳ Ожидаем ход соперника…";
  if (gameState.status === "defending")  return gameState.currentPlayer === "player" ? "🛡️ Ваш ход. Защищайтесь!" : "⏳ Соперник защищается…";
  return "Ожидание...";
}
function endGame(winner) {
  let text = "Ничья!";
  if (winner === "player") text = "🎉 Вы победили!";
  if (winner === "bot")    text = "🤖 Соперник победил!";
  gameBoard.innerHTML = `
    <div class="game-over">
      <h2>Игра окончена!</h2>
      <div class="winner">${text}</div>
      <button onclick="location.href='/?mode=bot${DEBUG ? '&debug=1' : ''}'" style="padding:12px 24px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer; margin-right:8px;">🎮 С ботом</button>
      <button onclick="location.href='/?mode=create${DEBUG ? '&debug=1' : ''}'" style="padding:12px 24px; border-radius:8px; border:none; background:#28a745; color:white; cursor:pointer;">👥 Новый матч</button>
    </div>`;
}

// Глобально
initInterface();

// Спиннер анимация
const style = document.createElement('style');
style.textContent = `@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`;
document.head.appendChild(style);
