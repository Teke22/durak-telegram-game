/* eslint-disable no-console */

// ---- Безопасный Telegram.WebApp и перехват ошибок ----
const tg = window.Telegram?.WebApp ?? {
  expand() {},
  enableClosingConfirmation() {},
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
  if (el) el.textContent = debugLog.slice(-60).join('\n');
}
function mountDebugOverlay() {
  if (!DEBUG) return;
  const el = document.createElement('div');
  el.id = 'debug-overlay';
  el.textContent = 'DEBUG ON';
  document.body.appendChild(el);

  window.addEventListener('error', (e) => {
    logDebug('window.error:', e?.message || e);
  });
  window.addEventListener('unhandledrejection', (e) => {
    logDebug('unhandledrejection:', e?.reason?.message || e?.reason || e);
  });
}

// ---------------- Константы игры ----------------
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = { "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const HAND_LIMIT = 6;

// ---------------- Глобальное состояние ----------------
let gameState = {
  mode: new URLSearchParams(window.location.search).get("mode") || "bot",

  deck: [],
  trumpSuit: "",
  trumpCard: null,

  playerHand: [],
  botHand: [],

  table: [], // [{ attack, defend? }]
  currentPlayer: "player",
  status: "waiting", // "attacking" | "defending"
  attacker: "player",
  defender: "bot",

  canAddCards: false,
  roundActive: true,

  gameId: null,
  playerId: null,
  opponentId: null,
  isMultiplayer: false,
};

// ---------------- DOM ----------------
const gameBoard = document.getElementById("game-board");
const startButton = document.getElementById("start-game");

// ---------------- Инициализация интерфейса ----------------
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

// ---------------- UI режимов ----------------
function showBotInterface() {
  startButton.style.display = "block";
  startButton.textContent = "🎮 Начать игру с ботом";
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>🎴 Игра с ботом</h2>
      <p>Сыграйте против простого компьютерного соперника</p>
      <p>Нажмите кнопку ниже, чтобы начать!</p>
    </div>
  `;
  startButton.onclick = () => { logDebug('start clicked'); initGame(); };
}

function showMultiplayerJoinPrompt() {
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

// ---------------- Multiplayer API (минимальные) ----------------
// (без изменений — опущено ради краткости, но у тебя уже есть рабочие — можно оставить старые)
// ... если нужно, скопируй из предыдущей версии; это не влияет на одиночную игру ...

// ---------------- Игровая логика (бот) ----------------
function initGame() {
  tg.HapticFeedback?.impactOccurred?.("light");
  startButton.style.display = "none";

  // создаём колоду 36
  gameState.deck = [];
  for (const suit of SUITS) for (const rank of RANKS) {
    gameState.deck.push({ rank, suit, value: RANK_VALUES[rank] });
  }
  shuffleDeck(gameState.deck);

  // раздача
  gameState.playerHand = drawMany(gameState.deck, HAND_LIMIT);
  gameState.botHand    = drawMany(gameState.deck, HAND_LIMIT);

  // козырь — последняя карта в колоде
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

  logDebug('initGame done', {
    deck: gameState.deck.length,
    trump: gameState.trumpCard,
    player: gameState.playerHand.length,
    bot: gameState.botHand.length,
  });

  renderGame();
}

// --- Рендер ---
function renderGame() {
  gameBoard.innerHTML = "";

  const header = document.createElement("div");
  const deckCount = gameState.deck.length;
  header.innerHTML = `
    <h2>🎴 Подкидной дурак</h2>
    <div class="trump-info">
      <strong>Козырь:</strong> ${gameState.trumpSuit}
      <div class="trump-card">${gameState.trumpCard.rank}${gameState.trumpCard.suit}</div>
      <div style="margin-top:6px;">В колоде: ${deckCount} карт</div>
    </div>
    <div class="game-status">${getStatusMessage()}</div>
  `;
  gameBoard.appendChild(header);

  if (gameState.table.length > 0) renderTable();
  renderActionButtons();
  renderPlayerHand();

  logDebug('render', {
    status: gameState.status,
    current: gameState.currentPlayer,
    table: gameState.table,
    player: gameState.playerHand.map(c=>c.rank+c.suit).join(' '),
    bot: gameState.botHand.length,
  });
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

  if (gameState.status === "defending" && gameState.currentPlayer === "player") {
    const takeBtn = document.createElement("button");
    takeBtn.className = "action-btn danger";
    takeBtn.textContent = "Взять карты";
    takeBtn.addEventListener('click', takeCards);
    actions.appendChild(takeBtn);
  }

  const allDefended = gameState.table.length > 0 && gameState.table.every((p) => p.defend);
  if (allDefended && gameState.currentPlayer === "player" && gameState.status !== "defending") {
    const passBtn = document.createElement("button");
    passBtn.className = "action-btn success";
    passBtn.textContent = "Бито";
    passBtn.addEventListener('click', passTurn);
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
    const canAttack = gameState.status === "attacking" && gameState.currentPlayer === "player" && canAttackWithCard(card);
    const canDefend = gameState.status === "defending" && gameState.currentPlayer === "player" && canDefendWithCard(card);
    const clickable = canAttack || canDefend;

    const el = createCardElement(card, clickable);

    if (clickable) {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        logDebug('card click', { card: card.rank + card.suit, canAttack, canDefend, status: gameState.status });
        if (canAttack) attackWithCard(card, index);
        else if (canDefend) defendWithCard(card, index);
      }, { passive: true });
    }

    playerCards.appendChild(el);
  });

  handSection.appendChild(playerCards);
  gameBoard.appendChild(handSection);
}

// --- Проверки возможности хода ---
function ranksOnTable() {
  const ranks = new Set();
  for (const p of gameState.table) {
    ranks.add(p.attack.rank);
    if (p.defend) ranks.add(p.defend.rank);
  }
  return ranks;
}

function canAttackWithCard(card) {
  if (gameState.table.length === 0) return true;
  const ranks = ranksOnTable();
  return ranks.has(card.rank);
}

function canDefendWithCard(card) {
  if (gameState.table.length === 0) return false;
  const lastPair = gameState.table[gameState.table.length - 1];
  if (lastPair.defend) return false;

  const attackCard = lastPair.attack;

  if (card.suit === attackCard.suit && card.value > attackCard.value) return true;
  if (card.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) return true;

  return false;
}

// --- Ходы игрока ---
function attackWithCard(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");

  gameState.playerHand.splice(index, 1);
  gameState.table.push({ attack: card, defend: null });

  gameState.status = "defending";
  gameState.currentPlayer = "bot";
  gameState.attacker = "player";
  gameState.defender = "bot";
  gameState.canAddCards = true;

  renderGame();
  setTimeout(botMove, 500);
}

function defendWithCard(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");

  const lastPair = gameState.table[gameState.table.length - 1];
  if (!lastPair || lastPair.defend) return;

  gameState.playerHand.splice(index, 1);
  lastPair.defend = card;

  const allDefended = gameState.table.every((p) => p.defend);
  renderGame();
  if (allDefended) setTimeout(botMove, 500);
}

function takeCards() {
  tg.HapticFeedback?.impactOccurred?.("heavy");

  for (const pair of gameState.table) {
    gameState.playerHand.push(pair.attack);
    if (pair.defend) gameState.playerHand.push(pair.defend);
  }
  gameState.table = [];
  sortHand(gameState.playerHand);

  drawPhaseAfterRound({ defenderTook: true, attacker: "player", defender: "bot" });
}

function passTurn() {
  tg.HapticFeedback?.impactOccurred?.("light");
  gameState.table = [];
  drawPhaseAfterRound({ defenderTook: false, attacker: gameState.attacker, defender: gameState.defender });
}

// --- Ходы бота ---
function botMove() {
  if (gameOverCheck()) return;

  if (gameState.status === "attacking" && gameState.currentPlayer === "bot") botAttack();
  else if (gameState.status === "defending" && gameState.currentPlayer === "bot") botDefend();
  else botTryAddCardsOrPass();
}

function botAttack() {
  const idx = botChooseAttackCard();
  if (idx === -1) {
    gameState.table = [];
    drawPhaseAfterRound({ defenderTook: false, attacker: "bot", defender: "player" });
    return;
  }
  const card = gameState.botHand.splice(idx, 1)[0];
  gameState.table.push({ attack: card, defend: null });

  gameState.status = "defending";
  gameState.currentPlayer = "player";
  gameState.attacker = "bot";
  gameState.defender = "player";
  gameState.canAddCards = true;

  renderGame();
}

function botDefend() {
  const lastPair = gameState.table[gameState.table.length - 1];
  if (!lastPair || lastPair.defend) { botTryAddCardsOrPass(); return; }

  const idx = botChooseDefendCard(lastPair.attack);
  if (idx === -1) {
    for (const pair of gameState.table) {
      gameState.botHand.push(pair.attack);
      if (pair.defend) gameState.botHand.push(pair.defend);
    }
    gameState.table = [];
    sortHand(gameState.botHand);
    drawPhaseAfterRound({ defenderTook: true, attacker: "player", defender: "bot" });
    return;
  }

  const card = gameState.botHand.splice(idx, 1)[0];
  lastPair.defend = card;

  renderGame();

  const allDefended = gameState.table.every((p) => p.defend);
  if (allDefended) setTimeout(botTryAddCardsOrPass, 500);
}

function botTryAddCardsOrPass() {
  const canAdd =
    gameState.table.length > 0 &&
    gameState.table.every((p) => p.defend) &&
    Math.min(gameState.playerHand.length, gameState.botHand.length) > gameState.table.length;

  if (!canAdd) {
    gameState.table = [];
    drawPhaseAfterRound({ defenderTook: false, attacker: gameState.attacker, defender: gameState.defender });
    return;
  }

  const rset = ranksOnTable();
  let addIdx = -1;
  for (let i = 0; i < gameState.botHand.length; i++) {
    if (rset.has(gameState.botHand[i].rank)) { addIdx = i; break; }
  }
  if (addIdx === -1) {
    gameState.table = [];
    drawPhaseAfterRound({ defenderTook: false, attacker: gameState.attacker, defender: gameState.defender });
    return;
  }

  const addCard = gameState.botHand.splice(addIdx, 1)[0];
  gameState.table.push({ attack: addCard, defend: null });

  gameState.status = "defending";
  gameState.currentPlayer = "player";
  gameState.attacker = "bot";
  gameState.defender = "player";
  gameState.canAddCards = true;

  renderGame();
}

// --- Выбор карт ботом ---
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
    const rset = ranksOnTable();
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
      const val = c.value + 100;
      if (val < bestVal) { bestVal = val; best = i; }
    }
  }
  return best;
}

// --- Добор после раунда ---
function drawPhaseAfterRound({ defenderTook, attacker, defender }) {
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
  if (gameState.currentPlayer === "bot") setTimeout(botMove, 500);
  gameOverCheck();
}

// --- Вспомогательные ---
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
function createCardElement(card, clickable) {
  const el = document.createElement("div");
  el.className = `card ${clickable ? "clickable" : ""} ${card.suit === gameState.trumpSuit ? "trump" : ""}`;
  el.textContent = `${card.rank}${card.suit}`;
  return el;
}
function getStatusMessage() {
  if (gameState.status === "attacking")  return gameState.currentPlayer === "player" ? "✅ Ваш ход. Атакуйте!" : "🤖 Бот атакует...";
  if (gameState.status === "defending")  return gameState.currentPlayer === "player" ? "🛡️ Ваш ход. Защищайтесь!" : "🤖 Бот защищается...";
  return "Ожидание...";
}
function gameOverCheck() {
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
function endGame(winner) {
  let text = "Ничья!";
  if (winner === "player") text = "🎉 Вы победили!";
  if (winner === "bot")    text = "🤖 Бот победил!";
  gameBoard.innerHTML = `
    <div class="game-over">
      <h2>Игра окончена!</h2>
      <div class="winner">${text}</div>
      <button onclick="location.reload()" style="padding:12px 24px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">🔄 Играть снова</button>
    </div>`;
}

// Запуск
initInterface();
