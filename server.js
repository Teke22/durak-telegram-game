/* eslint-disable no-console */

// --- Безопасный доступ к Telegram WebApp (работает и в браузере без ТГ) ---
const tg = window.Telegram?.WebApp ?? {
  expand() {},
  enableClosingConfirmation() {},
  HapticFeedback: { impactOccurred() {} },
  showPopup({ title, message }) {
    alert(`${title ? title + "\n" : ""}${message ?? ""}`);
  },
  initDataUnsafe: {},
};

tg.expand();
tg.enableClosingConfirmation();

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

  // пары на столе: [{ attack: {rank,suit,value}, defend?: {…} }, ...]
  table: [],

  currentPlayer: "player", // "player" | "bot"
  status: "waiting", // "waiting" | "attacking" | "defending"
  attacker: "player", // кто атакует в текущем/следующем раунде
  defender: "bot",

  canAddCards: false, // можно ли подкидывать (после первого хода в раунде)
  roundActive: false,

  // multiplayer заглушки (интерфейс оставлен как у тебя)
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

  if (mode === "bot") {
    showBotInterface();
  } else if (mode === "create") {
    showMultiplayerCreateInterface();
  } else if (mode === "join") {
    if (gameId) {
      showMultiplayerJoinInterface(gameId);
    } else {
      showMultiplayerJoinPrompt();
    }
  } else {
    showBotInterface();
  }
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
  startButton.onclick = initGame;
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
      <button onclick="joinWithCode()"
              style="padding:12px 24px; font-size:16px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">
        🎮 Присоединиться
      </button>
      <br><br>
      <button onclick="showBotInterface()"
              style="padding:10px 20px; font-size:14px; border-radius:6px; border:none; background:#6c757d; color:white; cursor:pointer;">
        ↩️ Назад
      </button>
    </div>
  `;
  startButton.style.display = "none";
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
  const gameId = input.value.toUpperCase().trim();
  if (gameId.length === 6) {
    window.location.href = `?mode=join&gameId=${gameId}`;
  } else {
    tg.showPopup({ title: "Ошибка", message: "Введите корректный код комнаты (6 символов)" });
  }
}

// ---------------- Multiplayer API (минимум как у тебя) ----------------
async function createMultiplayerGame() {
  try {
    const response = await fetch("/api/create-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` }),
    });
    const data = await response.json();

    gameState.gameId = data.gameId;
    gameState.playerId = data.playerId;
    gameState.isMultiplayer = true;

    gameBoard.innerHTML = `
      <div style="text-align:center; padding:20px; color:white;">
        <h2>🎮 Комната создана!</h2>
        <p>Код комнаты:</p>
        <div style="font-size:32px; font-weight:bold; margin:15px 0; background:rgba(255,255,255,0.9); padding:10px; border-radius:10px; color:#333;">
          ${data.gameId}
        </div>

        <div style="display:flex; gap:10px; justify-content:center; margin:20px 0; flex-wrap:wrap;">
          <button onclick="copyGameCode('${data.gameId}')"
                  style="padding:12px 20px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">📋 Копировать код</button>
          <button onclick="shareGameCode('${data.gameId}')"
                  style="padding:12px 20px; border-radius:8px; border:none; background:#28a745; color:white; cursor:pointer;">📤 Поделиться</button>
        </div>

        <p>Поделитесь этим кодом с другом</p>
        <p>Ожидание второго игрока...</p>

        <div style="margin:20px 0; background:rgba(255,255,255,0.2); padding:15px; border-radius:10px;">
          <p>Или отправьте другу команду:</p>
          <p style="font-family:monospace; font-size:16px; background:rgba(0,0,0,0.3); padding:10px; border-radius:5px;">
            /join ${data.gameId}
          </p>
        </div>

        <button onclick="location.reload()"
                style="padding:10px 20px; border-radius:6px; border:none; background:#dc3545; color:white; cursor:pointer;">❌ Отмена</button>
      </div>
    `;
    startButton.style.display = "none";

    const checkInterval = setInterval(async () => {
      try {
        const gameResponse = await fetch(`/api/game/${data.gameId}`);
        if (gameResponse.ok) {
          const gameData = await gameResponse.json();
          if (gameData.players.length === 2) {
            clearInterval(checkInterval);
            initMultiplayerGame(gameData);
          }
        }
      } catch (e) {
        console.error("Error checking game status:", e);
      }
    }, 3000);
  } catch (error) {
    console.error("Error creating game:", error);
    gameBoard.innerHTML = `
      <div style="text-align:center; padding:20px; color:#ff4444;">
        <h2>❌ Ошибка</h2>
        <p>Не удалось создать комнату</p>
        <button onclick="location.reload()"
                style="padding:10px 20px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">🔄 Попробовать снова</button>
      </div>
    `;
  }
}

async function joinMultiplayerGame(gameId) {
  try {
    const response = await fetch(`/api/join-game/${gameId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` }),
    });

    if (!response.ok) throw new Error("Join failed");

    const data = await response.json();
    gameState.gameId = gameId;
    gameState.playerId = data.playerId;
    gameState.isMultiplayer = true;

    gameBoard.innerHTML = `
      <div style="text-align:center; padding:20px; color:white;">
        <h2>✅ Присоединились!</h2>
        <p>Ожидание начала игры...</p>
        <div class="loading" style="margin:20px;">
          <div style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #007aff; border-radius:50%; animation:spin 1s linear infinite; margin:0 auto;"></div>
        </div>
      </div>
    `;
    startButton.style.display = "none";

    const waitInterval = setInterval(async () => {
      try {
        const gameResponse = await fetch(`/api/game/${gameId}`);
        if (gameResponse.ok) {
          const gameData = await gameResponse.json();
          if (gameData.status === "playing") {
            clearInterval(waitInterval);
            initMultiplayerGame(gameData);
          }
        }
      } catch (e) {
        console.error("Error waiting for game:", e);
      }
    }, 2000);
  } catch (error) {
    console.error("Error joining game:", error);
    gameBoard.innerHTML = `
      <div style="text-align:center; padding:20px; color:#ff4444;">
        <h2>❌ Ошибка</h2>
        <p>Не удалось присоединиться к комнате</p>
        <p>Проверьте код комнаты</p>
        <button onclick="showMultiplayerJoinPrompt()"
                style="padding:10px 20px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">🔄 Попробовать снова</button>
      </div>
    `;
  }
}

function copyGameCode(gameId) {
  navigator.clipboard
    .writeText(gameId)
    .then(() => tg.showPopup({ title: "Успех", message: `Код ${gameId} скопирован в буфер` }))
    .catch(() => tg.showPopup({ title: "Ошибка", message: "Не удалось скопировать код" }));
}

function shareGameCode(gameId) {
  const shareText = `🎮 Присоединяйся к игре в Подкидного дурака! Код комнаты: ${gameId}\n\nНапиши боту: /join ${gameId}`;
  if (navigator.share) {
    navigator.share({ title: "Присоединиться к игре", text: shareText });
  } else {
    navigator.clipboard.writeText(shareText).then(() => {
      tg.showPopup({ title: "Скопировано", message: "Текст для поделиться скопирован в буфер" });
    });
  }
}

function initMultiplayerGame(gameData) {
  gameBoard.innerHTML = `
    <div style="text-align:center; padding:20px; color:white;">
      <h2>🎮 Игра начинается!</h2>
      <p>Multiplayer режим</p>
      <p>Игроков: ${gameData.players.length}/2</p>
      <p>Скоро здесь будет игра...</p>
    </div>
  `;
  setTimeout(() => {
    tg.showPopup({ title: "В разработке", message: "Multiplayer режим скоро будет доступен!" });
  }, 1000);
}

// ---------------- Игровая логика (бот) ----------------
function initGame() {
  tg.HapticFeedback.impactOccurred("light");
  startButton.style.display = "none";

  // создаём колоду 36 карт
  gameState.deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      gameState.deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  shuffleDeck(gameState.deck);

  // Раздача: тянем с конца (pop). После раздачи определим козырь — последняя карта колоды (будет вытянута самой последней).
  gameState.playerHand = drawMany(gameState.deck, HAND_LIMIT);
  gameState.botHand = drawMany(gameState.deck, HAND_LIMIT);

  // Козырь — последняя карта, которая останется в колоде
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
  gameState.roundActive = true;

  renderGame();
}

// --- Рендер ---
function renderGame() {
  gameBoard.innerHTML = "";

  // Заголовок и информация
  const header = document.createElement("div");
  const deckCount = gameState.deck.length; // включая козырную карту внизу
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

    const attackEl = createCardElement(pair.attack, false);
    pairEl.appendChild(attackEl);

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

  // Защититься не можем — есть кнопка «Взять»
  if (gameState.status === "defending" && gameState.currentPlayer === "player") {
    const takeBtn = document.createElement("button");
    takeBtn.className = "action-btn danger";
    takeBtn.textContent = "Взять карты";
    takeBtn.onclick = takeCards;
    actions.appendChild(takeBtn);
  }

  // Все пары защищены — можно «Бито»
  const allDefended = gameState.table.length > 0 && gameState.table.every((p) => p.defend);
  if (allDefended && gameState.currentPlayer === "player" && gameState.status !== "defending") {
    const passBtn = document.createElement("button");
    passBtn.className = "action-btn success";
    passBtn.textContent = "Бито";
    passBtn.onclick = passTurn;
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
    const clickable =
      gameState.currentPlayer === "player" &&
      ((gameState.status === "attacking" && canAttackWithCard(card)) ||
        (gameState.status === "defending" && canDefendWithCard(card)));

    const el = createCardElement(card, clickable);

    if (clickable) {
      if (gameState.status === "attacking" && canAttackWithCard(card)) {
        el.onclick = () => attackWithCard(card, index);
      } else if (gameState.status === "defending" && canDefendWithCard(card)) {
        el.onclick = () => defendWithCard(card, index);
      }
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

  // 1) та же масть и старше
  if (card.suit === attackCard.suit && card.value > attackCard.value) return true;

  // 2) козырь против не-козыря
  if (card.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) return true;

  return false;
}

// --- Ходы игрока ---
function attackWithCard(card, index) {
  tg.HapticFeedback.impactOccurred("light");

  gameState.playerHand.splice(index, 1);
  gameState.table.push({ attack: card, defend: null });

  // после первой атаки в раунде разрешим подкидывание только после защиты бота
  gameState.status = "defending";
  gameState.currentPlayer = "bot";
  gameState.attacker = "player";
  gameState.defender = "bot";
  gameState.canAddCards = true;

  renderGame();
  setTimeout(botMove, 600);
}

function defendWithCard(card, index) {
  tg.HapticFeedback.impactOccurred("light");

  const lastPair = gameState.table[gameState.table.length - 1];
  if (!lastPair || lastPair.defend) return;

  gameState.playerHand.splice(index, 1);
  lastPair.defend = card;

  // если все пары защищены — ход вернётся боту (он либо подкинет, либо завершит раунд если не может)
  const allDefended = gameState.table.every((p) => p.defend);

  renderGame();

  if (allDefended) {
    // бот может попытаться подкинуть (если имеет карты по рангу на столе)
    setTimeout(botMove, 600);
  }
}

function takeCards() {
  tg.HapticFeedback.impactOccurred("heavy");

  // защитник (игрок) берёт все карты со стола
  for (const pair of gameState.table) {
    gameState.playerHand.push(pair.attack);
    if (pair.defend) gameState.playerHand.push(pair.defend);
  }
  gameState.table = [];

  sortHand(gameState.playerHand);

  // раунд завершён: атакующий остаётся тем же (player), но у нас защита провалена, значит следующий атакующий снова игрок
  // по правилам — да, атакующий сохраняется. Но т.к. атакующим был player, а защитник взял, то ход атакующего снова player.
  // Мы начнём новый раунд после добора.
  drawPhaseAfterRound({ defenderTook: true, attacker: "player", defender: "bot" });
}

// --- Завершить раунд «Бито» ---
function passTurn() {
  tg.HapticFeedback.impactOccurred("light");

  // Очистить стол, раздать добор, поменять роли: следующий раунд атакует бывший защитник
  gameState.table = [];

  drawPhaseAfterRound({ defenderTook: false, attacker: gameState.attacker, defender: gameState.defender });
}

// --- Ходы бота ---
function botMove() {
  if (gameOverCheck()) return;

  if (gameState.status === "attacking" && gameState.currentPlayer === "bot") {
    botAttack();
  } else if (gameState.status === "defending" && gameState.currentPlayer === "bot") {
    botDefend();
  } else {
    // Попытка подкинуть после успешной защиты игрока
    botTryAddCardsOrPass();
  }
}

function botAttack() {
  // если бот атакует: выбрать минимальную возможную карту
  const cardIndex = botChooseAttackCard();
  if (cardIndex === -1) {
    // не может атаковать → «бито» (очистка и смена ролей)
    gameState.table = [];
    drawPhaseAfterRound({ defenderTook: false, attacker: "bot", defender: "player" });
    return;
  }

  const card = gameState.botHand.splice(cardIndex, 1)[0];
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
  if (!lastPair || lastPair.defend) {
    // нечего защищать — попробуем подкинуть/передать ход
    botTryAddCardsOrPass();
    return;
  }

  const idx = botChooseDefendCard(lastPair.attack);
  if (idx === -1) {
    // не может защититься → бот берёт
    for (const pair of gameState.table) {
      gameState.botHand.push(pair.attack);
      if (pair.defend) gameState.botHand.push(pair.defend);
    }
    gameState.table = [];
    sortHand(gameState.botHand);

    // защитник (бот) взял → следующий раунд снова атакует игрок
    drawPhaseAfterRound({ defenderTook: true, attacker: "player", defender: "bot" });
    return;
  }

  const card = gameState.botHand.splice(idx, 1)[0];
  lastPair.defend = card;

  renderGame();

  // попытаться подкинуть, если все пары защищены
  const allDefended = gameState.table.every((p) => p.defend);
  if (allDefended) {
    setTimeout(botTryAddCardsOrPass, 600);
  }
}

function botTryAddCardsOrPass() {
  // Бот подкидывает только если он атакующий или если все пары защищены
  const canAdd =
    gameState.table.length > 0 &&
    gameState.table.every((p) => p.defend) &&
    // количество карт на столе не должно превышать карт защитника
    Math.min(gameState.playerHand.length, gameState.botHand.length) > gameState.table.length;

  if (!canAdd) {
    // завершить раунд «бито»
    gameState.table = [];
    drawPhaseAfterRound({
      defenderTook: false,
      attacker: gameState.attacker,
      defender: gameState.defender,
    });
    return;
  }

  // попытаться подкинуть карту по рангу
  const rset = ranksOnTable();
  let addIdx = -1;
  for (let i = 0; i < gameState.botHand.length; i++) {
    if (rset.has(gameState.botHand[i].rank)) {
      addIdx = i;
      break;
    }
  }

  if (addIdx === -1) {
    // пас
    gameState.table = [];
    drawPhaseAfterRound({
      defenderTook: false,
      attacker: gameState.attacker,
      defender: gameState.defender,
    });
    return;
  }

  const addCard = gameState.botHand.splice(addIdx, 1)[0];
  gameState.table.push({ attack: addCard, defend: null });

  // опять ход игрока для защиты
  gameState.status = "defending";
  gameState.currentPlayer = "player";
  gameState.attacker = "bot";
  gameState.defender = "player";
  gameState.canAddCards = true;

  renderGame();
}

// --- Выбор карт ботом ---
function botChooseAttackCard() {
  // если это первый ход в раунде — выбираем минимальную не-козырную; если нет, подкидываем по рангу
  if (gameState.table.length === 0) {
    let best = -1;
    let bestVal = Infinity;
    for (let i = 0; i < gameState.botHand.length; i++) {
      const c = gameState.botHand[i];
      const val = c.suit === gameState.trumpSuit ? c.value + 100 : c.value;
      if (val < bestVal) {
        bestVal = val;
        best = i;
      }
    }
    return best;
  } else {
    const rset = ranksOnTable();
    for (let i = 0; i < gameState.botHand.length; i++) {
      if (rset.has(gameState.botHand[i].rank)) return i;
    }
    return -1;
  }
}

function botChooseDefendCard(attackCard) {
  // самая дешёвая карта, которая бьёт
  let best = -1;
  let bestVal = Infinity;
  for (let i = 0; i < gameState.botHand.length; i++) {
    const c = gameState.botHand[i];
    if (c.suit === attackCard.suit && c.value > attackCard.value) {
      if (c.value < bestVal) {
        bestVal = c.value;
        best = i;
      }
    } else if (c.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) {
      // козырем можно побить любую не-козырную
      const val = c.value + 100; // чуть хуже обычной по масти, чтобы козыри экономить
      if (val < bestVal) {
        bestVal = val;
        best = i;
      }
    }
  }
  return best;
}

// --- Добор после раунда ---
function drawPhaseAfterRound({ defenderTook, attacker, defender }) {
  // Правила добора: сначала добирает атакующий, затем защитник, по 1 карте до 6.
  // Колода — массив, последняя карта (trumpCard) — в самом конце, её тянем последней.

  const drawOne = (hand) => {
    if (gameState.deck.length === 0) return;
    hand.push(gameState.deck.pop());
  };

  // кто был атакующим в прошедшем раунде?
  const first = attacker === "player" ? gameState.playerHand : gameState.botHand;
  const second = defender === "player" ? gameState.playerHand : gameState.botHand;

  // добор по очереди
  while ((first.length < HAND_LIMIT || second.length < HAND_LIMIT) && gameState.deck.length > 0) {
    if (first.length < HAND_LIMIT && gameState.deck.length > 0) drawOne(first);
    if (second.length < HAND_LIMIT && gameState.deck.length > 0) drawOne(second);
  }

  sortHand(gameState.playerHand);
  sortHand(gameState.botHand);

  // после «взял» атакующим остаётся тот же, после «бито» — меняются роли
  if (defenderTook) {
    gameState.attacker = attacker;
    gameState.defender = defender;
  } else {
    gameState.attacker = defender;
    gameState.defender = attacker;
  }

  // начать новый раунд
  gameState.table = [];
  gameState.status = "attacking";
  gameState.currentPlayer = gameState.attacker;
  gameState.canAddCards = false;

  renderGame();

  if (gameState.currentPlayer === "bot") {
    setTimeout(botMove, 600);
  }

  gameOverCheck(); // вдруг кто-то вышел в ноль без колоды
}

// --- Вспомогательные функции ---
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function drawMany(deck, n) {
  const taken = [];
  for (let i = 0; i < n && deck.length > 0; i++) {
    taken.push(deck.pop());
  }
  return taken;
}

function sortHand(hand) {
  // Сначала не-козыри по масти/значению, козыри в конце
  hand.sort((a, b) => {
    const aTrump = a.suit === gameState.trumpSuit;
    const bTrump = b.suit === gameState.trumpSuit;
    if (aTrump !== bTrump) return aTrump ? 1 : -1; // козыри после
    if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
    return a.value - b.value;
  });
}

function createCardElement(card, clickable) {
  const el = document.createElement("div");
  el.className = `card ${clickable ? "clickable" : ""} ${card.suit === gameState.trumpSuit ? "trump" : ""}`;
  el.innerHTML = `${card.rank}${card.suit}`;
  return el;
}

function getStatusMessage() {
  if (gameState.status === "attacking") {
    return gameState.currentPlayer === "player" ? "✅ Ваш ход. Атакуйте!" : "🤖 Бот атакует...";
  } else if (gameState.status === "defending") {
    return gameState.currentPlayer === "player" ? "🛡️ Ваш ход. Защищайтесь!" : "🤖 Бот защищается...";
  }
  return "Ожидание...";
}

function gameOverCheck() {
  // Игра заканчивается, когда: колода пуста И у кого-то пустая рука И стол пуст
  const deckEmpty = gameState.deck.length === 0;
  const tableEmpty = gameState.table.length === 0;

  if (!tableEmpty) return false;

  const playerEmpty = gameState.playerHand.length === 0;
  const botEmpty = gameState.botHand.length === 0;

  if (deckEmpty && (playerEmpty || botEmpty)) {
    if (playerEmpty && botEmpty) {
      endGame("draw");
    } else if (playerEmpty) {
      endGame("player");
    } else if (botEmpty) {
      endGame("bot");
    }
    return true;
  }
  return false;
}

function endGame(winner) {
  let winnerText = "Ничья!";
  if (winner === "player") winnerText = "🎉 Вы победили!";
  if (winner === "bot") winnerText = "🤖 Бот победил!";

  gameBoard.innerHTML = `
    <div class="game-over">
      <h2>Игра окончена!</h2>
      <div class="winner">${winnerText}</div>
      <button onclick="location.reload()"
              style="padding:12px 24px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">
        🔄 Играть снова
      </button>
    </div>
  `;
}

// --- Глобальные функции для HTML ---
window.joinWithCode = joinWithCode;
window.copyGameCode = copyGameCode;
window.shareGameCode = shareGameCode;
window.showBotInterface = showBotInterface;
window.showMultiplayerJoinPrompt = showMultiplayerJoinPrompt;

// --- Анимация лоадера ---
const style = document.createElement("style");
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// --- Debug ---
console.log("Script loaded successfully");
console.log("Game mode:", gameState.mode);
console.log("Telegram user:", tg.initDataUnsafe.user);

// Запуск интерфейса
initInterface();
