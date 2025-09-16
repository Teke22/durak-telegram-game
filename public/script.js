const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Константы игры
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '6': 0, '7': 1, '8': 2, '9': 3, '10': 4, 'J': 5, 'Q': 6, 'K': 7, 'A': 8 };

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
    trumpCard: null
};

// DOM элементы
const gameBoard = document.getElementById('game-board');
const startButton = document.getElementById('start-game');

// Инициализация игры
function initGame() {
    tg.HapticFeedback.impactOccurred('light');
    startButton.style.display = 'none';
    
    // Создаем колоду
    gameState.deck = [];
    for (let suit of SUITS) {
        for (let rank of RANKS) {
            gameState.deck.push({ rank, suit });
        }
    }
    
    // Перемешиваем
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
    
    gameState.status = 'playing';
    renderGame();
}

// Рендер игры
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
    `;
    gameBoard.appendChild(header);
    
    // Карты на столе
    if (gameState.table.length > 0) {
        const tableSection = document.createElement('div');
        tableSection.className = 'table-section';
        tableSection.innerHTML = '<h3>На столе:</h3>';
        
        const tableCards = document.createElement('div');
        tableCards.className = 'table-cards';
        
        gameState.table.forEach(card => {
            const cardEl = createCardElement(card, false);
            tableCards.appendChild(cardEl);
        });
        
        tableSection.appendChild(tableCards);
        gameBoard.appendChild(tableSection);
    }
    
    // Рука игрока
    const playerHandSection = document.createElement('div');
    playerHandSection.className = 'hand-section';
    playerHandSection.innerHTML = '<h3>Ваши карты:</h3>';
    
    const playerCards = document.createElement('div');
    playerCards.className = 'player-cards';
    
    gameState.playerHand.forEach((card, index) => {
        const cardEl = createCardElement(card, true);
        cardEl.addEventListener('click', () => playCard(card, index));
        playerCards.appendChild(cardEl);
    });
    
    playerHandSection.appendChild(playerCards);
    gameBoard.appendChild(playerHandSection);
    
    // Статус игры
    const statusEl = document.createElement('div');
    statusEl.className = 'game-status';
    statusEl.innerHTML = gameState.currentPlayer === 'player' ? 
        'Ваш ход. Выберите карту для атаки.' : 'Ход бота...';
    gameBoard.appendChild(statusEl);
    
    // Если ход бота
    if (gameState.currentPlayer === 'bot') {
        setTimeout(botMove, 1500);
    }
}

// Ход игрока
function playCard(card, index) {
    if (gameState.currentPlayer !== 'player') return;
    
    // Убираем карту из руки
    gameState.playerHand.splice(index, 1);
    gameState.table.push(card);
    gameState.currentPlayer = 'bot';
    
    renderGame();
    tg.HapticFeedback.impactOccurred('light');
}

// Ход бота
function botMove() {
    if (gameState.botHand.length === 0) return;
    
    // Простая логика бота - ходит первой картой
    const card = gameState.botHand.shift();
    gameState.table.push(card);
    gameState.currentPlayer = 'player';
    
    renderGame();
    tg.HapticFeedback.impactOccurred('light');
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
        return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
    });
}

function createCardElement(card, clickable) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${clickable ? 'clickable' : ''} ${card.suit === gameState.trumpSuit ? 'trump' : ''}`;
    cardEl.innerHTML = `${card.rank}${card.suit}`;
    return cardEl;
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