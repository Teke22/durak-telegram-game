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
    opponentHand: [],
    table: [],
    currentPlayer: 'player',
    status: 'waiting',
    trumpCard: null,
    attacker: 'player',
    defender: 'opponent',
    canAddCards: false,
    gameId: null,
    playerId: null,
    opponentId: null,
    isMultiplayer: false
};

// DOM элементы
const gameBoard = document.getElementById('game-board');
const startButton = document.getElementById('start-game');

// Инициализация интерфейса
function initInterface() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || 'bot';
    
    gameState.mode = mode;
    
    if (mode === 'bot') {
        showBotInterface();
    } else if (mode === 'create') {
        showMultiplayerCreateInterface();
    } else if (mode === 'join') {
        const gameId = urlParams.get('gameId');
        if (gameId) {
            showMultiplayerJoinInterface(gameId);
        } else {
            showMultiplayerCreateInterface();
        }
    } else {
        showBotInterface();
    }
}

function showBotInterface() {
    startButton.style.display = 'block';
    startButton.textContent = '🎮 Начать игру с ботом';
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>🎴 Игра с ботом</h2>
            <p>Сыграйте против компьютерного противника</p>
            <p>Нажмите кнопку ниже чтобы начать!</p>
        </div>
    `;
}

function showMultiplayerCreateInterface() {
    startButton.style.display = 'block';
    startButton.textContent = '👥 Создать комнату';
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>👥 Мультиплеер</h2>
            <p>Создайте комнату для игры с другом</p>
            <p>Поделитесь кодом комнаты с другом</p>
        </div>
    `;
    
    startButton.addEventListener('click', createMultiplayerGame);
}

function showMultiplayerJoinInterface(gameId) {
    startButton.style.display = 'block';
    startButton.textContent = '🎮 Присоединиться к игре';
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>👥 Присоединение к игре</h2>
            <p>Код комнаты: <strong>${gameId}</strong></p>
            <p>Нажмите кнопку чтобы присоединиться</p>
        </div>
    `;
    
    startButton.addEventListener('click', () => joinMultiplayerGame(gameId));
}

// Multiplayer функции
async function createMultiplayerGame() {
    try {
        const response = await fetch('/api/create-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` })
        });
        
        const data = await response.json();
        
        gameState.gameId = data.gameId;
        gameState.playerId = data.playerId;
        gameState.isMultiplayer = true;
        
        gameBoard.innerHTML = `
            <div style="text-align: center; padding: 20px; color: white;">
                <h2>🎮 Комната создана!</h2>
                <p>Код комнаты: <strong>${data.gameId}</strong></p>
                <p>Поделитесь этим кодом с другом</p>
                <p>Ожидание второго игрока...</p>
            </div>
        `;
        
        startButton.style.display = 'none';
        
        // Проверяем подключение каждые 3 секунды
        const checkInterval = setInterval(async () => {
            const gameResponse = await fetch(`/api/game/${data.gameId}`);
            if (gameResponse.ok) {
                const gameData = await gameResponse.json();
                if (gameData.players.length === 2) {
                    clearInterval(checkInterval);
                    initMultiplayerGame(gameData);
                }
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error creating game:', error);
        gameBoard.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ff4444;">
                <h2>❌ Ошибка</h2>
                <p>Не удалось создать комнату</p>
                <button onclick="location.reload()">🔄 Попробовать снова</button>
            </div>
        `;
    }
}

async function joinMultiplayerGame(gameId) {
    try {
        const response = await fetch(`/api/join-game/${gameId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerId: tg.initDataUnsafe.user?.id || `user_${Date.now()}` })
        });
        
        if (response.ok) {
            const data = await response.json();
            gameState.gameId = gameId;
            gameState.playerId = data.playerId;
            gameState.isMultiplayer = true;
            
            gameBoard.innerHTML = `
                <div style="text-align: center; padding: 20px; color: white;">
                    <h2>✅ Присоединились!</h2>
                    <p>Ожидание начала игры...</p>
                </div>
            `;
            
            startButton.style.display = 'none';
            initMultiplayerGame();
        } else {
            throw new Error('Join failed');
        }
        
    } catch (error) {
        console.error('Error joining game:', error);
        gameBoard.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ff4444;">
                <h2>❌ Ошибка</h2>
                <p>Не удалось присоединиться к комнате</p>
                <p>Проверьте код комнаты</p>
                <button onclick="location.reload()">🔄 Попробовать снова</button>
            </div>
        `;
    }
}

function initMultiplayerGame() {
    // Здесь будет инициализация multiplayer игры
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>🎮 Игра начинается!</h2>
            <p>Multiplayer режим</p>
            <p>Скоро здесь будет игра...</p>
        </div>
    `;
}

// Основная игровая логика (остается такой же, как в предыдущей версии)
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
    gameState.opponentHand = gameState.deck.splice(0, 6);
    
    // Сортируем руки
    sortHand(gameState.playerHand);
    sortHand(gameState.opponentHand);
    
    gameState.status = 'attacking';
    gameState.attacker = 'player';
    gameState.defender = 'opponent';
    gameState.table = [];
    gameState.canAddCards = false;
    
    renderGame();
}

// Все остальные функции игры остаются такими же, как в предыдущей версии
// (renderGame, attackWithCard, defendWithCard, takeCards, passTurn, и т.д.)

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

// Обработчики событий
if (gameState.mode === 'bot') {
    startButton.addEventListener('click', initGame);
}

// Инициализация интерфейса при загрузке
initInterface();

// Дебаг информация
console.log('Script loaded successfully');
console.log('Game mode:', gameState.mode);
console.log('Telegram user:', tg.initDataUnsafe.user);