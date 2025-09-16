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
    const gameId = urlParams.get('gameId');
    
    gameState.mode = mode;
    
    if (mode === 'bot') {
        showBotInterface();
    } else if (mode === 'create') {
        showMultiplayerCreateInterface();
    } else if (mode === 'join') {
        if (gameId) {
            showMultiplayerJoinInterface(gameId);
        } else {
            showMultiplayerJoinPrompt();
        }
    } else {
        showBotInterface();
    }
}

// Интерфейс игры с ботом
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
    
    startButton.onclick = initGame;
}

// Интерфейс ввода кода комнаты
function showMultiplayerJoinPrompt() {
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>🔗 Присоединиться к игре</h2>
            <p>Введите код комнаты:</p>
            <input type="text" id="game-code-input" placeholder="ABCDEF" 
                   style="padding: 12px; font-size: 18px; text-align: center; border-radius: 8px; border: 2px solid #ddd; width: 200px;"
                   maxlength="6">
            <br><br>
            <button onclick="joinWithCode()" 
                    style="padding: 12px 24px; font-size: 16px; border-radius: 8px; border: none; background: #007aff; color: white; cursor: pointer;">
                🎮 Присоединиться
            </button>
            <br><br>
            <button onclick="showBotInterface()" 
                    style="padding: 10px 20px; font-size: 14px; border-radius: 6px; border: none; background: #6c757d; color: white; cursor: pointer;">
                ↩️ Назад
            </button>
        </div>
    `;
    
    startButton.style.display = 'none';
}

// Интерфейс создания комнаты
function showMultiplayerCreateInterface() {
    startButton.style.display = 'block';
    startButton.textContent = '👥 Создать комнату';
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>👥 Создать комнату</h2>
            <p>Создайте комнату для игры с другом</p>
            <p>После создания поделитесь кодом комнаты</p>
        </div>
    `;
    
    startButton.onclick = createMultiplayerGame;
}

// Интерфейс подключения к комнате
function showMultiplayerJoinInterface(gameId) {
    startButton.style.display = 'block';
    startButton.textContent = '🎮 Присоединиться к игре';
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>👥 Присоединение к игре</h2>
            <p>Код комнаты: <strong style="font-size: 24px;">${gameId}</strong></p>
            <p>Нажмите кнопку чтобы присоединиться</p>
        </div>
    `;
    
    startButton.onclick = () => joinMultiplayerGame(gameId);
}

// Функция подключения по коду
function joinWithCode() {
    const input = document.getElementById('game-code-input');
    const gameId = input.value.toUpperCase().trim();
    
    if (gameId.length === 6) {
        window.location.href = `?mode=join&gameId=${gameId}`;
    } else {
        tg.showPopup({
            title: 'Ошибка',
            message: 'Пожалуйста, введите корректный код комнаты (6 символов)'
        });
    }
}

// Создание multiplayer игры
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
                <p>Код комнаты: </p>
                <div style="font-size: 32px; font-weight: bold; margin: 15px 0; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 10px; color: #333;">
                    ${data.gameId}
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: center; margin: 20px 0; flex-wrap: wrap;">
                    <button onclick="copyGameCode('${data.gameId}')" 
                            style="padding: 12px 20px; border-radius: 8px; border: none; background: #007aff; color: white; cursor: pointer;">
                        📋 Копировать код
                    </button>
                    <button onclick="shareGameCode('${data.gameId}')" 
                            style="padding: 12px 20px; border-radius: 8px; border: none; background: #28a745; color: white; cursor: pointer;">
                        📤 Поделиться
                    </button>
                </div>
                
                <p>Поделитесь этим кодом с другом</p>
                <p>Ожидание второго игрока...</p>
                
                <div style="margin: 20px 0; background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px;">
                    <p>Или отправьте другу команду:</p>
                    <p style="font-family: monospace; font-size: 16px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px;">
                        /join ${data.gameId}
                    </p>
                </div>
                
                <button onclick="location.reload()" 
                        style="padding: 10px 20px; border-radius: 6px; border: none; background: #dc3545; color: white; cursor: pointer;">
                    ❌ Отмена
                </button>
            </div>
        `;
        
        startButton.style.display = 'none';
        
        // Проверяем подключение каждые 3 секунды
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
            } catch (error) {
                console.error('Error checking game status:', error);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error creating game:', error);
        gameBoard.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ff4444;">
                <h2>❌ Ошибка</h2>
                <p>Не удалось создать комнату</p>
                <button onclick="location.reload()" 
                        style="padding: 10px 20px; border-radius: 8px; border: none; background: #007aff; color: white; cursor: pointer;">
                    🔄 Попробовать снова
                </button>
            </div>
        `;
    }
}

// Подключение к multiplayer игре
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
                    <div class="loading" style="margin: 20px;">
                        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #007aff; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                    </div>
                </div>
            `;
            
            startButton.style.display = 'none';
            
            // Ждем начала игры
            const waitInterval = setInterval(async () => {
                try {
                    const gameResponse = await fetch(`/api/game/${gameId}`);
                    if (gameResponse.ok) {
                        const gameData = await gameResponse.json();
                        if (gameData.status === 'playing') {
                            clearInterval(waitInterval);
                            initMultiplayerGame(gameData);
                        }
                    }
                } catch (error) {
                    console.error('Error waiting for game:', error);
                }
            }, 2000);
            
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
                <button onclick="showMultiplayerJoinPrompt()" 
                        style="padding: 10px 20px; border-radius: 8px; border: none; background: #007aff; color: white; cursor: pointer;">
                    🔄 Попробовать снова
                </button>
            </div>
        `;
    }
}

// Копирование кода комнаты
function copyGameCode(gameId) {
    navigator.clipboard.writeText(gameId).then(() => {
        tg.showPopup({
            title: 'Успех',
            message: `Код ${gameId} скопирован в буфер обмена`
        });
    }).catch(err => {
        tg.showPopup({
            title: 'Ошибка',
            message: 'Не удалось скопировать код'
        });
    });
}

// Поделиться кодом комнаты
function shareGameCode(gameId) {
    const shareText = `🎮 Присоединяйся к игре в Подкидного дурака! Код комнаты: ${gameId}\n\nНапиши боту: /join ${gameId}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Присоединиться к игре',
            text: shareText
        });
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            tg.showPopup({
                title: 'Скопировано',
                message: 'Текст для分享 скопирован в буфер'
            });
        });
    }
}

// Инициализация multiplayer игры
function initMultiplayerGame(gameData) {
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px; color: white;">
            <h2>🎮 Игра начинается!</h2>
            <p>Multiplayer режим</p>
            <p>Игроков: ${gameData.players.length}/2</p>
            <p>Скоро здесь будет игра...</p>
        </div>
    `;
    
    // Здесь будет реальная инициализация игры
    setTimeout(() => {
        tg.showPopup({
            title: 'В разработке',
            message: 'Multiplayer режим скоро будет доступен!'
        });
    }, 1000);
}

// Инициализация игры с ботом
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
            <button onclick="location.reload()" 
                    style="padding: 12px 24px; border-radius: 8px; border: none; background: #007aff; color: white; cursor: pointer;">
                🔄 Играть снова
            </button>
        </div>
    `;
}

// Глобальные функции для HTML
window.joinWithCode = joinWithCode;
window.copyGameCode = copyGameCode;
window.shareGameCode = shareGameCode;
window.showBotInterface = showBotInterface;
window.showMultiplayerJoinPrompt = showMultiplayerJoinPrompt;

// Инициализация интерфейса при загрузке
initInterface();

// Стили для анимации загрузки
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Дебаг информация
console.log('Script loaded successfully');
console.log('Game mode:', gameState.mode);
console.log('Telegram user:', tg.initDataUnsafe.user);