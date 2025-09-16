const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Проверяем параметры URL
const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get('mode') || 'bot';

console.log('🎮 Game mode:', mode);
console.log('📱 Telegram WebApp version:', tg.version);

// Показываем информацию о загрузке
const gameBoard = document.getElementById('game-board');
const startButton = document.getElementById('start-game');

gameBoard.innerHTML = `
    <div style="text-align: center; padding: 20px;">
        <h2>🎴 Подкидной дурак</h2>
        <p>Режим: ${mode === 'bot' ? 'против бота' : 'мультиплеер'}</p>
        <p>Загрузка игры...</p>
    </div>
`;

// Функция для проверки доступности сервера
async function checkServerHealth() {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        console.log('✅ Server health:', data);
        return true;
    } catch (error) {
        console.error('❌ Server health check failed:', error);
        return false;
    }
}

// Инициализация игры
async function initGame() {
    const isServerHealthy = await checkServerHealth();
    
    if (!isServerHealthy) {
        gameBoard.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #ff4444;">
                <h2>⚠️ Ошибка подключения</h2>
                <p>Сервер недоступен. Попробуйте позже.</p>
            </div>
        `;
        return;
    }

    tg.HapticFeedback.impactOccurred('light');
    startButton.style.display = 'none';
    
    // Здесь будет ваша игровая логика
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h2>🎮 Игра начинается!</h2>
            <p>Режим: ${mode === 'bot' ? 'против бота' : 'с другом'}</p>
            <div class="trump-card" style="font-size: 24px; margin: 20px;">♠️</div>
            <p>Выберите карту для начала игры</p>
        </div>
    `;
    
    // Здесь добавьте вашу игровую логику из предыдущего сообщения
}

// Показываем кнопку старта
if (mode === 'bot') {
    startButton.style.display = 'block';
    startButton.textContent = '🎮 Начать игру с ботом';
    startButton.addEventListener('click', initGame);
} else {
    gameBoard.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h2>👥 Игра с другом</h2>
            <p>Этот режим пока в разработке</p>
            <p>Скоро можно будет играть с друзьями!</p>
        </div>
    `;
}

// Проверяем сервер при загрузке
checkServerHealth();