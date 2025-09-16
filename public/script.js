const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Константы игры
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// Состояние игры
let gameState = {
    mode: new URLSearchParams(window.location.search).get('mode') || 'bot',
    deck: [],
    trumpSuit: '',
    playerHand: [],
    botHand: [],
    table: [],
    currentPlayer: 'player',
    status: 'waiting',
    trumpCard: null,
    attacker: 'player',
    defender: 'bot',
    canAddCards: false
};

// DOM элементы
const gameBoard = document.getElementById('game-board');
const startButton = document.getElementById('start-game');

// Инициализация игры
function initGame() {
    tg.HapticFeedback.impactOccurred('light');
    startButton.style.display = 'none';
    
    // Создаем и перемешиваем колоду
    gameState.deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            gameState.deck.push({ rank, suit, value: RANK_VALUES[rank] });
        }
    }
    shuffleDeck(gameState.deck);
    
    // Определяем козырь
    gameState.trumpCard = gameState.deck.pop();
    gameState.trumpSuit = gameState.trumpCard.suit;
    
    // Раздаем карты
    gameState.playerHand = gameState.deck.splice(0, 6);
    gameState.botHand = gameState.deck.splice(0, 6);
    
    // Сортируем руки
    sortHand(gameState.playerHand);
    sortHand(gameState.botHand);
    
    gameState.status = 'attacking';
    gameState.attacker = 'player';
    gameState.defender = 'bot';
    gameState.table = [];
    gameState.canAddCards = false;
    
    renderGame();
}

// Основная функция рендеринга игры
function renderGame() {
    gameBoard.innerHTML = '';
    
    // Заголовок и козырь
    const header = document.createElement('div');
    header.innerHTML = `
        <h2>🎴 Подкидной дурак</h2>
        <div class="trump-info">
            <strong>Козырь:</strong> ${gameState.trumpSuit}
            <div class="trump-card">${gameState.trumpCard.rank}${gameState.trumpCard.suit}</div>
        </div>
        <div class="game-status">${getStatusMessage()}</div>
    `;
    gameBoard.appendChild(header);
    
    // Карты на столе
    if (gameState.table.length > 0) {
        renderTable();
    }
    
    // Кнопки действий
    renderActionButtons();
    
    // Рука игрока
    renderPlayerHand();
}

// Рендер стола
function renderTable() {
    const tableSection = document.createElement('div');
    tableSection.className = 'table-section';
    tableSection.innerHTML = '<h3>На столе:</h3>';
    
    const tableCards = document.createElement('div');
    tableCards.className = 'table-cards';
    
    gameState.table.forEach((pair, index) => {
        const pairElement = document.createElement('div');
        pairElement.className = 'card-pair';
        
        // Атакующая карта
        const attackCard = createCardElement(pair.attack, false);
        pairElement.appendChild(attackCard);
        
        // Защитная карта (если есть)
        if (pair.defend) {
            const defendCard = createCardElement(pair.defend, false);
            defendCard.classList.add('defended');
            pairElement.appendChild(defendCard);
        }
        
        tableCards.appendChild(pairElement);
    });
    
    tableSection.appendChild(tableCards);
    gameBoard.appendChild(tableSection);
}

// Рендер кнопок действий
function renderActionButtons() {
    const actions = document.createElement('div');
    actions.className = 'action-buttons';
    
    if (gameState.status === 'defending' && gameState.currentPlayer === 'player') {
        const takeButton = document.createElement('button');
        takeButton.textContent = 'Взять карты';
        takeButton.addEventListener('click', takeCards);
        actions.appendChild(takeButton);
    }
    
    if (gameState.status === 'attacking' && gameState.currentPlayer === 'player' && gameState.canAddCards) {
        const passButton = document.createElement('button');
        passButton.textContent = 'Бито';
        passButton.addEventListener('click', passTurn);
        actions.appendChild(passButton);
    }
    
    if (actions.children.length > 0) {
        gameBoard.appendChild(actions);
    }
}

// Рендер руки игрока
function renderPlayerHand() {
    const handSection = document.createElement('div');
    handSection.className = 'hand-section';
    handSection.innerHTML = '<h3>Ваши карты:</h3>';
    
    const playerCards = document.createElement('div');
    playerCards.className = 'player-cards';
    
    gameState.playerHand.forEach((card, index) => {
        const cardEl = createCardElement(card, true);
        
        if (gameState.currentPlayer === 'player') {
            if (gameState.status === 'attacking' && canAttackWithCard(card)) {
                cardEl.addEventListener('click', () => attackWithCard(card, index));
            } else if (gameState.status === 'defending' && canDefendWithCard(card)) {
                cardEl.addEventListener('click', () => defendWithCard(card, index));
            }
        }
        
        playerCards.appendChild(cardEl);
    });
    
    handSection.appendChild(playerCards);
    gameBoard.appendChild(handSection);
}

// Проверка возможности атаки картой
function canAttackWithCard(card) {
    if (gameState.table.length === 0) return true;
    
    // Можно подкидывать карты того же достоинства, что уже на столе
    return gameState.table.some(pair => 
        pair.attack.rank === card.rank || (pair.defend && pair.defend.rank === card.rank)
    );
}

// Проверка возможности защиты картой
function canDefendWithCard(card) {
    if (gameState.table.length === 0) return false;
    
    const lastPair = gameState.table[gameState.table.length - 1];
    if (lastPair.defend) return false; // Уже защищено
    
    const attackCard = lastPair.attack;
    
    // Карта может побить если:
    // 1. Та же масть и старше
    // 2. Козырь (если атакующая карта не козырь)
    if (card.suit === attackCard.suit) {
        return card.value > attackCard.value;
    }
    if (card.suit === gameState.trumpSuit && attackCard.suit !== gameState.trumpSuit) {
        return true;
    }
    return false;
}

// Атака картой
function attackWithCard(card, index) {
    tg.HapticFeedback.impactOccurred('light');
    
    gameState.playerHand.splice(index, 1);
    gameState.table.push({ attack: card, defend: null });
    
    gameState.canAddCards = true;
    updateGameState();
}

// Защита картой
function defendWithCard(card, index) {
    tg.HapticFeedback.impactOccurred('light');
    
    gameState.playerHand.splice(index, 1);
    gameState.table[gameState.table.length - 1].defend = card;
    
    // Проверяем, все ли пары защищены
    const allDefended = gameState.table.every(pair => pair.defend);
    if (allDefended) {
        gameState.status = 'attacking';
        gameState.canAddCards = false;
    }
    
    updateGameState();
}

// Взять карты
function takeCards() {
    tg.HapticFeedback.impactOccurred('heavy');
    
    // Игрок забирает все карты со стола
    gameState.table.forEach(pair => {
        gameState.playerHand.push(pair.attack);
        if (pair.defend) {
            gameState.playerHand.push(pair.defend);
        }
    });
    
    gameState.table = [];
    gameState.status = 'attacking';
    gameState.attacker = 'bot';
    gameState.defender = 'player';
    gameState.currentPlayer = 'bot';
    gameState.canAddCards = false;
    
    // Сортируем руку
    sortHand(gameState.playerHand);
    
    renderGame();
    setTimeout(botMove, 1500);
}

// Завершить ход
function passTurn() {
    tg.HapticFeedback.impactOccurred('light');
    
    gameState.table = [];
    gameState.status = 'attacking';
    gameState.currentPlayer = 'bot';
    gameState.canAddCards = false;
    
    renderGame();
    setTimeout(botMove, 1500);
}

// Ход бота
function botMove() {
    if (gameState.status === 'attacking') {
        botAttack();
    } else {
        botDefend();
    }
}

// Бот атакует
function botAttack() {
    if (gameState.botHand.length === 0) {
        endGame('player');
        return;
    }
    
    let attackCard = null;
    let attackIndex = -1;
    
    if (gameState.table.length === 0) {
        // Первая атака - выбираем случайную карту
        attackIndex = 0;
        attackCard = gameState.botHand[attackIndex];
    } else {
        // Подкидываем карту того же достоинства
        for (let i = 0; i < gameState.botHand.length; i++) {
            const card = gameState.botHand[i];
            if (canAttackWithCard(card)) {
                attackCard = card;
                attackIndex = i;
                break;
            }
        }
    }
    
    if (attackCard && attackIndex !== -1) {
        gameState.botHand.splice(attackIndex, 1);
        gameState.table.push({ attack: attackCard, defend: null });
        gameState.status = 'defending';
        gameState.currentPlayer = 'player';
        gameState.canAddCards = true;
        
        renderGame();
    } else {
        // Бот не может атаковать - завершаем ход
        gameState.table = [];
        gameState.status = 'attacking';
        gameState.attacker = 'player';
        gameState.defender = 'bot';
        gameState.currentPlayer = 'player';
        gameState.canAddCards = false;
        
        renderGame();
    }
}

// Бот защищается
function botDefend() {
    const lastPair = gameState.table[gameState.table.length - 1];
    if (lastPair.defend) {
        // Уже защищено - пропускаем
        gameState.status = 'attacking';
        gameState.currentPlayer = 'bot';
        renderGame();
        setTimeout(botMove, 1500);
        return;
    }
    
    const attackCard = lastPair.attack;
    let defendCard = null;
    let defendIndex = -1;
    
    // Ищем карту для защиты
    for (let i = 0; i < gameState.botHand.length; i++) {
        const card = gameState.botHand[i];
        if (canDefendWithCard(card)) {
            defendCard = card;
            defendIndex = i;
            break;
        }
    }
    
    if (defendCard && defendIndex !== -1) {
        gameState.botHand.splice(defendIndex, 1);
        lastPair.defend = defendCard;
        
        // Проверяем, все ли пары защищены
        const allDefended = gameState.table.every(pair => pair.defend);
        if (allDefended) {
            gameState.status = 'attacking';
            gameState.currentPlayer = 'bot';
        }
        
        renderGame();
        if (gameState.currentPlayer === 'bot') {
            setTimeout(botMove, 1500);
        }
    } else {
        // Бот не может защититься - забирает карты
        gameState.table.forEach(pair => {
            gameState.botHand.push(pair.attack);
            if (pair.defend) {
                gameState.botHand.push(pair.defend);
            }
        });
        
        gameState.table = [];
        gameState.status = 'attacking';
        gameState.attacker = 'player';
        gameState.defender = 'bot';
        gameState.currentPlayer = 'player';
        
        sortHand(gameState.botHand);
        renderGame();
    }
}

// Вспомогательные функции
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function sortHand(hand) {
    hand.sort((a, b) => {
        if (a.suit === gameState.trumpSuit && b.suit !== gameState.trumpSuit) return -1;
        if (a.suit !== gameState.trumpSuit && b.suit === gameState.trumpSuit) return 1;
        if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
        return a.value - b.value;
    });
}

function createCardElement(card, clickable) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${clickable ? 'clickable' : ''} ${card.suit === gameState.trumpSuit ? 'trump' : ''}`;
    cardEl.innerHTML = `${card.rank}${card.suit}`;
    return cardEl;
}

function getStatusMessage() {
    if (gameState.status === 'attacking') {
        return gameState.currentPlayer === 'player' ? 
            '✅ Ваш ход. Атакуйте!' : '🤖 Бот атакует...';
    } else {
        return gameState.currentPlayer === 'player' ? 
            '🛡️ Ваш ход. Защищайтесь!' : '🤖 Бот защищается...';
    }
}

function updateGameState() {
    // Проверяем конец игры
    if (gameState.playerHand.length === 0 && gameState.deck.length === 0) {
        endGame('player');
        return;
    }
    if (gameState.botHand.length === 0 && gameState.deck.length === 0) {
        endGame('bot');
        return;
    }
    
    renderGame();
    
    if (gameState.currentPlayer === 'bot') {
        setTimeout(botMove, 1500);
    }
}

function endGame(winner) {
    const winnerText = winner === 'player' ? '🎉 Вы победили!' : '🤖 Бот победил!';
    gameBoard.innerHTML = `
        <div class="game-over">
            <h2>Игра окончена!</h2>
            <div class="winner">${winnerText}</div>
            <button onclick="location.reload()">🔄 Играть снова</button>
        </div>
    `;
}

// Обработчики событий
startButton.addEventListener('click', initGame);

// Показываем кнопку старта для режима с ботом
if (gameState.mode === 'bot') {
    startButton.style.display = 'block';
    gameBoard.innerHTML = '<p>Нажмите "Начать игру" чтобы сыграть против бота!</p>';
} else {
    gameBoard.innerHTML = '<p>Режим игры с другом скоро будет доступен!</p>';
}