// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

let gameState = {
    deck: [],
    trumpSuit: '',
    playerHand: [],
    botHand: [],
    table: [],
    attackingPlayer: 'user',
    isGameStarted: false
};

// Элементы DOM
const startButton = document.getElementById('start-game');
const gameBoard = document.getElementById('game-board');

// Запуск игры
startButton.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('light');
    initGame();
    startButton.style.display = 'none';
});

function initGame() {
    // 1. Создаем колоду (36 карт)
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    gameState.deck = [];

    for (let suit of suits) {
        for (let rank of ranks) {
            gameState.deck.push(rank + suit);
        }
    }

    // 2. Перемешиваем колоду
    shuffleArray(gameState.deck);

    // 3. Определяем козырную масть
    const trumpCard = gameState.deck[gameState.deck.length - 1];
    gameState.trumpSuit = trumpCard.slice(-1);

    // 4. Раздаем карты игроку и боту
    gameState.playerHand = gameState.deck.splice(0, 6);
    gameState.botHand = gameState.deck.splice(0, 6);

    gameState.isGameStarted = true;

    // 5. Обновляем интерфейс
    renderGame();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function renderGame() {
    gameBoard.innerHTML = '';

    // Показываем козырь
    const trumpElement = document.createElement('div');
    trumpElement.innerHTML = `<strong>Козырь:</strong> ${gameState.trumpSuit}`;
    gameBoard.appendChild(trumpElement);

    // Показываем карты игрока
    const playerHandElement = document.createElement('div');
    playerHandElement.className = 'hand player-hand';
    playerHandElement.innerHTML = '<h3>Ваши карты:</h3>';

    gameState.playerHand.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        cardElement.textContent = card;
        cardElement.addEventListener('click', () => makeMove(card, index));
        playerHandElement.appendChild(cardElement);
    });
    gameBoard.appendChild(playerHandElement);
}

function makeMove(card, index) {
    gameState.playerHand.splice(index, 1);
    gameState.table.push({ card, player: 'user' });
    renderGame();
    setTimeout(botMove, 1000);
}

function botMove() {
    if (gameState.botHand.length > 0) {
        const randomIndex = Math.floor(Math.random() * gameState.botHand.length);
        const botCard = gameState.botHand[randomIndex];
        gameState.botHand.splice(randomIndex, 1);
        gameState.table.push({ card: botCard, player: 'bot' });
        renderGame();
    }
}