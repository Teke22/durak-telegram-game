const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Получаем параметры из URL
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode') || 'bot';

let gameState = {
    deck: [],
    trumpSuit: '',
    playerHand: [],
    botHand: [],
    table: [],
    attackingPlayer: 'user',
    isGameStarted: false,
    currentTurn: 'user',
    gameMode: gameMode,
    canAttack: true,
    canDefend: false
};

// Элементы DOM
const startButton = document.getElementById('start-game');
const gameBoard = document.getElementById('game-board');
const statusElement = document.createElement('div');
statusElement.id = 'game-status';
gameBoard.appendChild(statusElement);

// Запуск игры
startButton.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('light');
    initGame();
    startButton.style.display = 'none';
});

function initGame() {
    // Создаем и перемешиваем колоду
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    gameState.deck = [];

    for (let suit of suits) {
        for (let rank of ranks) {
            gameState.deck.push({ rank, suit, value: ranks.indexOf(rank) });
        }
    }

    shuffleArray(gameState.deck);

    // Определяем козырную масть
    const trumpCard = gameState.deck[gameState.deck.length - 1];
    gameState.trumpSuit = trumpCard.suit;

    // Раздаем карты
    gameState.playerHand = gameState.deck.splice(0, 6);
    gameState.botHand = gameState.deck.splice(0, 6);

    // Сортируем карты по значению
    gameState.playerHand.sort((a, b) => a.value - b.value);
    gameState.botHand.sort((a, b) => a.value - b.value);

    gameState.isGameStarted = true;
    gameState.currentTurn = 'user';

    renderGame();
    updateStatus();
}

function updateStatus() {
    let statusText = '';
    
    if (gameState.currentTurn === 'user') {
        statusText = 'Ваш ход. Выберите карту для атаки.';
    } else {
        statusText = 'Ход бота...';
    }
    
    statusText += ` Козырь: ${gameState.trumpSuit}`;
    statusElement.textContent = statusText;
}

function renderGame() {
    gameBoard.innerHTML = '';
    gameBoard.appendChild(statusElement);

    // Отображаем стол (карты в центре)
    if (gameState.table.length > 0) {
        const tableElement = document.createElement('div');
        tableElement.className = 'game-table';
        tableElement.innerHTML = '<h3>На столе:</h3>';
        
        const tableCards = document.createElement('div');
        tableCards.className = 'table-cards';
        
        gameState.table.forEach((tableItem, index) => {
            const cardElement = document.createElement('div');
            cardElement.className = `card ${tableItem.defended ? 'defended' : ''}`;
            cardElement.textContent = `${tableItem.card.rank}${tableItem.card.suit}`;
            
            if (tableItem.player === 'bot') {
                cardElement.classList.add('bot-card');
            }
            
            tableCards.appendChild(cardElement);
        });
        
        tableElement.appendChild(tableCards);
        gameBoard.appendChild(tableElement);
    }

    // Отображаем карты игрока
    const playerHandElement = document.createElement('div');
    playerHandElement.className = 'hand player-hand';
    playerHandElement.innerHTML = '<h3>Ваши карты:</h3>';

    const playerCards = document.createElement('div');
    playerCards.className = 'cards';

    gameState.playerHand.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.textContent = `${card.rank}${card.suit}`;
        
        // Подсвечиваем козыри
        if (card.suit === gameState.trumpSuit) {
            cardElement.classList.add('trump');
        }
        
        // Обработчик клика зависит от фазы игры
        if (gameState.currentTurn === 'user') {
            if (gameState.table.length === 0 || gameState.canAttack) {
                // Фаза атаки
                cardElement.addEventListener('click', () => attack(card, index));
            } else if (gameState.canDefend) {
                // Фаза защиты
                cardElement.addEventListener('click', () => defend(card, index));
            }
        }
        
        playerCards.appendChild(cardElement);
    });
    
    playerHandElement.appendChild(playerCards);
    gameBoard.appendChild(playerHandElement);

    // Кнопки действий
    if (gameState.currentTurn === 'user') {
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        if (gameState.table.length > 0 && gameState.canDefend) {
            const takeButton = document.createElement('button');
            takeButton.textContent = 'Взять';
            takeButton.addEventListener('click', takeCards);
            actionButtons.appendChild(takeButton);
        }
        
        if (gameState.table.length > 0) {
            const passButton = document.createElement('button');
            passButton.textContent = 'Бито';
            passButton.addEventListener('click', passTurn);
            actionButtons.appendChild(passButton);
        }
        
        gameBoard.appendChild(actionButtons);
    }
}

function attack(card, index) {
    // Проверяем можно ли атаковать этой картой
    if (gameState.table.length > 0) {
        const canAttack = gameState.table.some(tableItem => 
            tableItem.card.rank === card.rank || tableItem.card.rank === card.rank
        );
        
        if (!canAttack) {
            tg.showPopup({
                title: 'Нельзя подкинуть',
                message: 'Можно подкидывать только карты того же достоинства, что уже лежат на столе'
            });
            return;
        }
    }
    
    // Убираем карту из руки и добавляем на стол
    gameState.playerHand.splice(index, 1);
    gameState.table.push({ card, player: 'user', defended: false });
    
    gameState.canAttack = false;
    gameState.canDefend = true;
    gameState.currentTurn = 'bot';
    
    renderGame();
    updateStatus();
    
    setTimeout(botMove, 1500);
}

function defend(card, index) {
    // Логика защиты будет реализована позже
    tg.showAlert('Функция защиты в разработке');
}

function takeCards() {
    // Игрок забирает все карты со стола
    gameState.playerHand = [...gameState.playerHand, ...gameState.table.map(item => item.card)];
    gameState.table = [];
    gameState.currentTurn = 'bot';
    
    renderGame();
    updateStatus();
    setTimeout(botMove, 1500);
}

function passTurn() {
    // Ход переходит к боту
    gameState.table = [];
    gameState.currentTurn = 'bot';
    gameState.canAttack = true;
    gameState.canDefend = false;
    
    renderGame();
    updateStatus();
    setTimeout(botMove, 1500);
}

function botMove() {
    if (gameState.botHand.length === 0) {
        tg.showAlert('Бот победил!');
        return;
    }
    
    // Простая логика бота: атакует самой младшей картой
    if (gameState.table.length === 0) {
        // Атака
        const attackCard = gameState.botHand[0];
        gameState.botHand.splice(0, 1);
        gameState.table.push({ card: attackCard, player: 'bot', defended: false });
        
        tg.showPopup({
            title: 'Бот атакует',
            message: `Бот подкидывает: ${attackCard.rank}${attackCard.suit}`
        });
    }
    
    gameState.currentTurn = 'user';
    renderGame();
    updateStatus();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Инициализация игры при загрузке
if (gameMode === 'bot') {
    startButton.style.display = 'block';
} else {
    gameBoard.innerHTML = '<h3>Режим игры с другом</h3><p>Эта функция в разработке</p>';
}
