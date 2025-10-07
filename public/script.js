/* eslint-disable no-console */

/* ——— безопасный Telegram.WebApp ——— */
const tg = window.Telegram?.WebApp ?? {
  expand() {}, enableClosingConfirmation() {},
  HapticFeedback: { impactOccurred() {} },
  showPopup({ title, message }) { try { alert(`${title ? title + "\n" : ""}${message ?? ""}`); } catch(_) {} },
  initDataUnsafe: {},
};
tg.expand?.();
tg.enableClosingConfirmation?.();

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

/* ——— маленький логгер ——— */
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

/* ——— константы игры ——— */
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VALUES = { "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14 };
const HAND_LIMIT = 6;
const suitColorClass = s => (s === "♥" || s === "♦") ? "red" : "black";

/* ——— DOM ——— */
const appEl = document.getElementById('app') || document.body;
let seatsEl = document.getElementById('seats');
if (!seatsEl) { // авто-создание seats, если забыли в HTML
  seatsEl = document.createElement('div');
  seatsEl.id = 'seats';
  const gameBoardEl = document.getElementById('game-board') || null;
  if (gameBoardEl && gameBoardEl.parentNode) gameBoardEl.parentNode.insertBefore(seatsEl, gameBoardEl);
  else appEl.appendChild(seatsEl);
}
const gameBoard = document.getElementById("game-board") || (() => {
  const d = document.createElement('div'); d.id = 'game-board'; appEl.appendChild(d); return d;
})();
const startButton = document.getElementById("start-game") || (() => {
  const b = document.createElement('button'); b.id = 'start-game'; b.textContent = 'Начать игру'; appEl.appendChild(b); return b;
})();

/* ——— состояние ——— */
let gameState = {
  mode: new URLSearchParams(window.location.search).get("mode") || "bot",

  // общие
  trumpSuit: "", trumpCard: null,
  table: [],

  // локальная игра (1×1)
  deck: [], playerHand: [], botHand: [],
  currentPlayer: "player", status: "waiting", attacker: "player", defender: "bot", canAddCards: false,

  // multiplayer
  isMultiplayer: false, deckCount: 0,
  gameId: null, playerId: null,
  seats: [],
  rawAttacker: null, rawDefender: null, rawCurrent: null,
  opponentId: null, opponentCount: 0,
};

/* ——— инициализация UI ——— */
function initInterface() {
  const urlParams = new URLSearchParams(window.location.search);
  const mode = urlParams.get("mode") || "bot";
  const gameId = urlParams.get("gameId");
  gameState.mode = mode;

  if (mode === "bot") showBotInterface();
  else if (mode === "quickbots") showQuickBotsInterface();
  else if (mode === "create") showMultiplayerCreateInterface();
  else if (mode === "join") gameId ? showMultiplayerJoinInterface(gameId) : showMultiplayerJoinPrompt();
  else showBotInterface();

  // страховка: если по какой-то причине onclick не назначен, назначим дефолт
  setTimeout(() => {
    if (!startButton.onclick) startButton.onclick = () => { if (gameState.mode === 'bot') initGameBot(); };
  }, 0);
}

/* ——— экраны ——— */
function showBotInterface() {
  gameState.isMultiplayer = false;
  startButton.style.display = "block";
  startButton.textContent = "🎮 Начать игру с ботом";
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div class="panel" style="text-align:center;">
      <h2>🎴 Игра с ботом (1×1)</h2>
      <p>Классический режим против одного бота</p>
    </div>
  `;
  startButton.onclick = initGameBot;
}

function showQuickBotsInterface() {
  gameState.isMultiplayer = true;
  startButton.style.display = "block";
  startButton.textContent = "⚡ Играть сейчас";
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div class="panel" style="text-align:center;">
      <h2>⚡ Быстрая игра с ботами</h2>
      <div class="row" style="margin-top:8px;">
        <div class="field"><label>Ботов:</label>
          <select id="qb-bots"><option value="1">1 бот</option><option value="2">2 бота</option></select>
        </div>
      </div>
      <p style="margin-top:8px;">Будет создана комната и заполнена ботами автоматически</p>
    </div>
  `;
  startButton.onclick = async () => {
    const bots = Number(document.getElementById('qb-bots').value || 1);
    await createMultiplayerGame({ maxPlayers: 1 + bots, botCount: bots, autostart: true, startWhenFull: false });
  };
}

function showMultiplayerJoinPrompt() {
  gameState.isMultiplayer = true;
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div class="panel" style="text-align:center;">
      <h2>🔗 Присоединиться к игре</h2>
      <p>Введите код комнаты:</p>
      <input type="text" id="game-code-input" placeholder="ABCDEF"
             style="padding:12px; font-size:18px; text-align:center; border-radius:8px; border:2px solid #ddd; width:200px;"
             maxlength="6">
      <div class="row" style="margin-top:12px;">
        <button class="btn" id="btn-join-with-code">🎮 Присоединиться</button>
        <button class="btn alt" id="btn-back-bot">↩️ Назад</button>
      </div>
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
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div class="panel" style="text-align:center;">
      <h2>👥 Создать комнату</h2>
      <div class="row" style="margin-top:10px;">
        <div class="field"><label>Мест:</label>
          <select id="room-size"><option>2</option><option>3</option><option>4</option><option>5</option><option>6</option></select>
        </div>
        <div class="field"><label>Ботов:</label>
          <select id="room-bots"><option>0</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select>
        </div>
        <div class="field">
          <label style="user-select:none;cursor:pointer;">
            <input type="checkbox" id="start-full" style="transform:translateY(2px); margin-right:6px;"> Ждать пока заполнится
          </label>
        </div>
      </div>
      <p style="margin-top:6px;">Можно сразу добавить ботов и/или ждать всех игроков</p>
    </div>
  `;
  startButton.onclick = async () => {
    const size = Number(document.getElementById('room-size').value || 2);
    const bots = Math.max(0, Math.min(Number(document.getElementById('room-bots').value || 0), size - 1));
    const startWhenFull = document.getElementById('start-full').checked;
    await createMultiplayerGame({ maxPlayers: size, botCount: bots, autostart: !startWhenFull, startWhenFull });
  };
}

function showMultiplayerJoinInterface(gameId) {
  gameState.isMultiplayer = true;
  startButton.style.display = "block";
  startButton.textContent = "🎮 Присоединиться к игре";
  seatsEl.innerHTML = '';
  gameBoard.innerHTML = `
    <div class="panel" style="text-align:center;">
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

/* ——— BOT (1×1) ——— */
function initGameBot() {
  tg.HapticFeedback?.impactOccurred?.("light");
  startButton.style.display = "none";

  gameState.deck = [];
  for (const suit of SUITS) for (const rank of RANKS) gameState.deck.push({ rank, suit, value: RANK_VALUES[rank] });
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

/* ——— MP ——— */
const mp = { gameId: null, playerId: null, pollId: null };

async function createMultiplayerGame({ maxPlayers, botCount, autostart, startWhenFull }) {
  try {
    const response = await fetch('/api/create-game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}`,
        maxPlayers, botCount, autostart, startWhenFull
      })
    });
    const data = await response.json();
    mp.gameId = data.gameId; mp.playerId = data.playerId;
    gameState.gameId = data.gameId; gameState.playerId = data.playerId;

    gameBoard.innerHTML = `
      <div class="panel" style="text-align:center;">
        <h2>🎮 Комната создана</h2>
        <p>Код комнаты:</p>
        <div style="font-size: 32px; font-weight: bold; margin: 15px 0; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 10px; color: #333;">
          ${data.gameId}
        </div>
        <p>Ожидание начала...</p>
        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007aff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto 0;"></div>
      </div>
    `;
    startButton.style.display = 'none';

    if (mp.pollId) clearInterval(mp.pollId);
    mp.pollId = setInterval(refreshGameFromServer, 900);
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

    mp.gameId = gameId; mp.playerId = data.playerId;
    gameState.gameId = gameId; gameState.playerId = data.playerId;

    gameBoard.innerHTML = `
      <div class="panel" style="text-align:center;">
        <h2>✅ Присоединились</h2>
        <p>Ожидание начала игры...</p>
        <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #007aff;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto 0;"></div>
      </div>
    `;
    startButton.style.display = 'none';

    if (mp.pollId) clearInterval(mp.pollId);
    mp.pollId = setInterval(refreshGameFromServer, 900);
  } catch (e) {
    console.error('join error', e);
    showToast('Не удалось присоединиться: проверьте код', 'warn');
  }
}

async function refreshGameFromServer() {
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(`/api/game/${mp.gameId}?playerId=${mp.playerId}`);
    if (!r.ok) return;
    const s = await r.json();
    applyServerState(s);
    renderGame();
    if (s.status === 'finished') clearInterval(mp.pollId);
  } catch (_) {}
}

function applyServerState(s) {
  if (!s || !s.status) return;
  gameState.isMultiplayer = true;

  gameState.trumpSuit = s.trumpSuit || gameState.trumpSuit;
  gameState.trumpCard = s.trumpCard || gameState.trumpCard;
  gameState.table = s.table || [];
  gameState.seats = s.seats || [];
  gameState.rawAttacker = s.attacker || null;
  gameState.rawDefender = s.defender || null;
  gameState.rawCurrent  = s.currentPlayer || null;

  const you = s.you;
  gameState.playerId = you || gameState.playerId;
  gameState.deckCount = s.deckCount ?? 0;

  gameState.attacker = (s.attacker === you) ? 'player' : 'bot';
  gameState.defender = (s.defender === you) ? 'player' : 'bot';
  gameState.currentPlayer = (s.currentPlayer === you) ? 'player' : 'bot';
  gameState.status = s.phase || 'attacking';

  let opponentId = null;
  if (s.attacker === you) opponentId = s.defender;
  else if (s.defender === you) opponentId = s.attacker;
  gameState.opponentId = opponentId;
  const oppSeat = s.seats?.find(seat => seat.id === opponentId);
  gameState.opponentCount = oppSeat?.handCount ?? 0;

  gameState.playerHand = s.hand || [];
  gameState.botHand = Array.from({ length: gameState.opponentCount }, () => null);

  if (s.status === 'finished') {
    if (s.loserId == null) endGame('draw');
    else if (s.loserId === you) endGame('bot');
    else endGame('player');
  }
}

/* ——— рендер ——— */
function renderGame() {
  renderSeats();
  gameBoard.innerHTML = "";

  const header = document.createElement("div");
  const deckCount = gameState.isMultiplayer ? gameState.deckCount : gameState.deck.length;
  const trumpHtml = gameState.trumpCard ? renderCardInline(gameState.trumpCard, true) : '';

  header.innerHTML = `
    <h2>🎴 Подкидной дурак</h2>
    <div class="trump-info">
      <div class="trump-card"><span class="trump-badge">Козырь</span> ${trumpHtml || '<b>—</b>'}</div>
      <div style="margin-top:6px;">В колоде: ${deckCount} карт</div>
      ${ gameState.isMultiplayer ? `<div style="margin-top:6px;">Игроков: ${gameState.seats.length}</div>` : '' }
    </div>
    <div class="game-status">${getStatusMessage()}</div>
  `;
  gameBoard.appendChild(header);

  renderOpponentHand();
  if (gameState.table.length > 0) renderTable();
  renderActionButtons();
  renderPlayerHand();
}

function seatName(id) {
  if (!id) return '—';
  const s = String(id);
  if (s.startsWith('bot_')) return '🤖 Бот';
  if (/^\d+$/.test(s)) return `ID ${s.slice(-4)}`;
  return s.length > 12 ? s.slice(0, 4) + '…' + s.slice(-4) : s;
}

function renderSeats() {
  if (!gameState.isMultiplayer || !Array.isArray(gameState.seats)) { seatsEl.innerHTML = ''; return; }
  const you = gameState.playerId;
  const idx = gameState.seats.findIndex(s => s.id === you);
  const ordered = idx >= 0 ? [...gameState.seats.slice(idx), ...gameState.seats.slice(0, idx)] : [...gameState.seats];

  seatsEl.innerHTML = ordered.map(seat => {
    const classes = ['seat'];
    if (seat.id === you) classes.push('you');
    if (seat.id === gameState.rawAttacker) classes.push('attacker');
    if (seat.id === gameState.rawDefender) classes.push('defender');
    const badges = [];
    if (seat.id === you) badges.push('<span class="badge you">You</span>');
    if (seat.id === gameState.rawAttacker) badges.push('<span class="badge a">A</span>');
    if (seat.id === gameState.rawDefender) badges.push('<span class="badge d">D</span>');
    const initials = seatName(seat.id).replace(/[^A-Za-zА-Яа-я0-9]/g,'').slice(0,2).toUpperCase() || 'P';
    return `
      <div class="${classes.join(' ')}">
        <div class="avatar">${initials}</div>
        <div class="meta">
          <div class="name">${seatName(seat.id)}</div>
          <div class="info">Карт: ${seat.handCount ?? 0} · ${seat.type === 'bot' ? 'бот' : 'игрок'}</div>
        </div>
        <div class="badges">${b adges = badges.join('')}</div>
      </div>
    `;
  }).join('');
}

function renderOpponentHand() {
  const n = gameState.botHand?.length || 0;
  const section = document.createElement('div');
  section.className = 'opponent-section';
  section.innerHTML = `<h3>${gameState.isMultiplayer ? 'Текущий соперник' : 'Карты бота'}: ${n}</h3>`;
  const row = document.createElement('div'); row.className = 'opponent-cards';
  for (let i = 0; i < Math.min(n, 12); i++) {
    const back = document.createElement('div'); back.className = 'card back'; row.appendChild(back);
  }
  section.appendChild(row);
  gameBoard.appendChild(section);
}

function renderTable() {
  const section = document.createElement("div");
  section.className = "table-section";
  section.innerHTML = "<h3>На столе:</h3>";
  const row = document.createElement("div");
  row.className = "table-cards";
  gameState.table.forEach(pair => {
    const wrap = document.createElement("div");
    wrap.className = "card-pair";
    wrap.appendChild(createCardElement(pair.attack, false));
    if (pair.defend) {
      const d = createCardElement(pair.defend, false);
      d.classList.add("defended");
      wrap.appendChild(d);
    }
    row.appendChild(wrap);
  });
  section.appendChild(row);
  gameBoard.appendChild(section);
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
    takeBtn.addEventListener('click', () => { if (gameState.isMultiplayer) sendMove('take'); else takeCardsBot(); });
    actions.appendChild(takeBtn);
  }

  if (allDefended && playerIsAttacker && gameState.currentPlayer === "player" && gameState.status === "attacking") {
    const passBtn = document.createElement("button");
    passBtn.className = "action-btn success";
    passBtn.textContent = "Бито";
    passBtn.addEventListener('click', () => { if (gameState.isMultiplayer) sendMove('pass'); else passTurnBot(); });
    actions.appendChild(passBtn);
  }

  if (actions.children.length > 0) gameBoard.appendChild(actions);
}

function renderPlayerHand() {
  const section = document.createElement("div");
  section.className = "hand-section";
  section.innerHTML = "<h3>Ваши карты:</h3>";

  const row = document.createElement("div");
  row.className = "player-cards";

  gameState.playerHand.forEach((card, index) => {
    const canAttack = !gameState.isMultiplayer
      ? (gameState.status === "attacking" && gameState.currentPlayer === "player")
      : (gameState.status === "attacking" && gameState.currentPlayer === "player" && gameState.rawAttacker === gameState.playerId);

    const canDefend = gameState.status === "defending" && gameState.currentPlayer === "player";
    const canAdd = gameState.isMultiplayer && canAddByOthersLocal(card);

    const clickable = (canAttack && canAttackWithCardLocal(card)) || (canDefend && canDefendWithCardLocal(card)) || canAdd;
    const el = createCardElement(card, clickable);

    if (clickable) {
      el.addEventListener('click', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (gameState.isMultiplayer) {
          if (canDefend && canDefendWithCardLocal(card))      sendMove('defend', { rank: card.rank, suit: card.suit });
          else if (canAttack && canAttackWithCardLocal(card)) sendMove('attack', { rank: card.rank, suit: card.suit });
          else if (canAdd)                                    sendMove('add',    { rank: card.rank, suit: card.suit });
        } else {
          if (canAttack && canAttackWithCardLocal(card)) attackWithCardBot(card, index);
          else if (canDefend && canDefendWithCardLocal(card)) defendWithCardBot(card, index);
        }
      }, { passive: true });
    }
    row.appendChild(el);
  });

  section.appendChild(row);
  gameBoard.appendChild(section);
}

/* ——— локальные проверки ——— */
function ranksOnTableLocal() {
  const r = new Set();
  for (const p of gameState.table) { r.add(p.attack.rank); if (p.defend) r.add(p.defend.rank); }
  return r;
}
function defenderHandCountLocal() {
  if (!gameState.isMultiplayer) return gameState.defender === 'player' ? gameState.playerHand.length : gameState.botHand.length;
  const dSeat = gameState.seats.find(s => s.id === gameState.rawDefender);
  return dSeat?.handCount ?? 0;
}
function canAttackWithCardLocal(card) {
  const limitOk = gameState.table.length < defenderHandCountLocal();
  if (gameState.table.length === 0) return limitOk;
  return limitOk && ranksOnTableLocal().has(card.rank);
}
function canDefendWithCardLocal(card) {
  if (gameState.table.length === 0) return false;
  const lastPair = gameState.table[gameState.table.length - 1];
  if (lastPair.defend) return false;
  const a = lastPair.attack;
  if (card.suit === a.suit && card.value > a.value) return true;
  if (card.suit === gameState.trumpSuit && a.suit !== gameState.trumpSuit) return true;
  return false;
}
function canAddByOthersLocal(card) {
  if (gameState.status !== 'defending' || !gameState.isMultiplayer) return false;
  if (gameState.rawDefender === gameState.playerId) return false;
  const limitOk = gameState.table.length < defenderHandCountLocal();
  return limitOk && ranksOnTableLocal().has(card.rank);
}

/* ——— BOT-only ——— */
function attackWithCardBot(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");
  gameState.playerHand.splice(index, 1);
  gameState.table.push({ attack: card, defend: null });
  gameState.status = "defending";
  gameState.currentPlayer = "bot";
  gameState.attacker = "player";
  gameState.defender = "bot";
  renderGame();
  setTimeout(botMove, 300);
}
function defendWithCardBot(card, index) {
  tg.HapticFeedback?.impactOccurred?.("light");
  const last = gameState.table[gameState.table.length - 1];
  if (!last || last.defend) return;
  gameState.playerHand.splice(index, 1);
  last.defend = card;
  renderGame();
  const allDefended = gameState.table.every(p => p.defend);
  if (allDefended) { gameState.status = "attacking"; gameState.currentPlayer = gameState.attacker; showToast("🤖 Отбился"); setTimeout(botMove, 300); }
}
function takeCardsBot() {
  tg.HapticFeedback?.impactOccurred?.("heavy");
  for (const p of gameState.table) { gameState.playerHand.push(p.attack); if (p.defend) gameState.playerHand.push(p.defend); }
  gameState.table = []; sortHand(gameState.playerHand);
  showToast("Вы взяли карты", "warn");
  drawPhaseAfterRoundBot({ defenderTook: true, attacker: "bot", defender: "player" });
}
function passTurnBot() {
  tg.HapticFeedback?.impactOccurred?.("light");
  gameState.table = []; showToast("Вы: Бито", "success");
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
    if (idx === -1) { gameState.table = []; showToast("🤖 Бито", "success"); drawPhaseAfterRoundBot({ defenderTook: false, attacker: "bot", defender: "player" }); return; }
    const card = gameState.botHand.splice(idx, 1)[0];
    gameState.table.push({ attack: card, defend: null });
    gameState.status = "defending"; gameState.currentPlayer = "player"; gameState.attacker = "bot"; gameState.defender = "player";
    showToast("🤖 Бот атакует"); renderGame(); return;
  }
  const allDefended = gameState.table.every(p => p.defend);
  const canAddMore = gameState.table.length < defenderHandCountLocal();
  if (allDefended && canAddMore) {
    const rset = ranksOnTableLocal();
    let addIdx = -1; for (let i = 0; i < gameState.botHand.length; i++) if (rset.has(gameState.botHand[i].rank)) { addIdx = i; break; }
    if (addIdx !== -1) {
      const addCard = gameState.botHand.splice(addIdx, 1)[0];
      gameState.table.push({ attack: addCard, defend: null });
      gameState.status = "defending"; gameState.currentPlayer = "player"; renderGame(); return;
    }
  }
  gameState.table = []; showToast("🤖 Бито", "success");
  drawPhaseAfterRoundBot({ defenderTook: false, attacker: "bot", defender: "player" });
}
function botDefend() {
  const last = gameState.table[gameState.table.length - 1];
  if (!last || last.defend) { gameState.status = "attacking"; gameState.currentPlayer = gameState.attacker; renderGame(); return; }
  const idx = botChooseDefendCard(last.attack);
  if (idx === -1) {
    for (const p of gameState.table) { gameState.botHand.push(p.attack); if (p.defend) gameState.botHand.push(p.defend); }
    gameState.table = []; sortHand(gameState.botHand);
    showToast("🤖 Бот взял карты", "warn");
    drawPhaseAfterRoundBot({ defenderTook: true, attacker: "player", defender: "bot" }); return;
  }
  const card = gameState.botHand.splice(idx, 1)[0];
  last.defend = card; gameState.status = "attacking"; gameState.currentPlayer = gameState.attacker; showToast("🤖 Отбился"); renderGame();
}
function botChooseAttackCard() {
  if (gameState.table.length === 0) {
    let best = -1, bestVal = Infinity;
    for (let i = 0; i < gameState.botHand.length; i++) {
      const c = gameState.botHand[i]; const val = c.suit === gameState.trumpSuit ? c.value + 100 : c.value;
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
    if (c.suit === attackCard.suit && c.value > attackCard.value) { if (c.value < bestVal) { bestVal = c.value; best = i; } }
    else if (c.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) {
      const v = c.value + 100; if (v < bestVal) { bestVal = v; best = i; }
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
  sortHand(gameState.playerHand); sortHand(gameState.botHand);

  if (defenderTook) { gameState.attacker = attacker; gameState.defender = defender; }
  else { gameState.attacker = defender; gameState.defender = attacker; }

  gameState.table = []; gameState.status = "attacking"; gameState.currentPlayer = gameState.attacker;
  renderGame(); if (gameState.currentPlayer === "bot") setTimeout(botMove, 300); gameOverCheckBot();
}
function gameOverCheckBot() {
  const deckEmpty = gameState.deck.length === 0, tableEmpty = gameState.table.length === 0;
  if (!tableEmpty) return false;
  const playerEmpty = gameState.playerHand.length === 0, botEmpty = gameState.botHand.length === 0;
  if (deckEmpty && (playerEmpty || botEmpty)) { if (playerEmpty && botEmpty) endGame("draw"); else if (playerEmpty) endGame("player"); else endGame("bot"); return true; }
  return false;
}

/* ——— сеть ——— */
async function sendMove(action, card) {
  if (!mp.gameId || !mp.playerId) return;
  try {
    const r = await fetch(`/api/game/${mp.gameId}/move`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: mp.playerId, action, card })
    });
    const data = await r.json();
    if (!r.ok) showToast(data?.error || 'Ошибка хода', 'warn');
  } catch { showToast('Сеть недоступна', 'warn'); }
}

/* ——— утилиты ——— */
function shuffleDeck(deck) { for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
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
  return `<span class="card ${trumpClass}"><span class="rank">${card.rank}</span><span class="suit ${color}">${card.suit}</span></span>`;
}
function createCardElement(card, clickable) {
  const color = suitColorClass(card.suit);
  const el = document.createElement("div");
  el.className = `card ${clickable ? "clickable" : ""} ${card.suit === gameState.trumpSuit ? "trump" : ""}`;
  el.innerHTML = `<span class="rank">${card.rank}</span><span class="suit ${color}">${card.suit}</span>`;
  return el;
}
function getStatusMessage() {
  if (gameState.isMultiplayer) {
    if (gameState.status === "attacking")  return gameState.currentPlayer === "player" ? "✅ Ваш ход. Атакуйте!" : "⏳ Ход атакующего…";
    if (gameState.status === "defending")  {
      if (gameState.currentPlayer === "player") return "🛡️ Ваш ход. Защищайтесь!";
      if (gameState.rawDefender !== gameState.playerId) return "♻️ Идёт защита — вы можете подкидывать";
      return "⏳ Соперники могут подкидывать…";
    }
    return "Ожидание...";
  } else {
    if (gameState.status === "attacking")  return gameState.currentPlayer === "player" ? "✅ Ваш ход. Атакуйте!" : "🤖 Бот атакует...";
    if (gameState.status === "defending")  return gameState.currentPlayer === "player" ? "🛡️ Ваш ход. Защищайтесь!" : "🤖 Бот защищается...";
    return "Ожидание...";
  }
}
function endGame(winner) {
  let text = "Ничья!"; if (winner === "player") text = "🎉 Победа!"; if (winner === "bot") text = "😅 Поражение";
  gameBoard.innerHTML = `
    <div class="game-over">
      <h2>Игра окончена!</h2>
      <div class="winner">${text}</div>
      <button onclick="location.href='/?mode=quickbots${DEBUG ? '&debug=1' : ''}'" style="padding:12px 24px; border-radius:8px; border:none; background:#28a745; color:white; cursor:pointer; margin-right:8px;">⚡ Быстрая игра</button>
      <button onclick="location.href='/?mode=create${DEBUG ? '&debug=1' : ''}'" style="padding:12px 24px; border-radius:8px; border:none; background:#007aff; color:white; cursor:pointer;">👥 Новая комната</button>
    </div>`;
}

/* ——— запуск ——— */
try {
  initInterface();
} catch (e) {
  console.error(e);
  showToast('Ошибка инициализации фронта', 'warn', 2500);
}

/* спиннер */
const style = document.createElement('style');
style.textContent = `@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`;
document.head.appendChild(style);
