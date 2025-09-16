const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

<<<<<<< HEAD
console.log('MiniApp loaded successfully');

const startButton = document.getElementById('start-game');
const gameBoard = document.getElementById('game-board');

startButton.addEventListener('click', () => {
    tg.HapticFeedback.impactOccurred('light');
    startButton.style.display = 'none';
    gameBoard.innerHTML = `
        <h2>Игра начинается!</h2>
        <p>Козырь: ♥</p>
        <div class="hand">
            <div class="card">6♠</div>
            <div class="card">7♥</div>
            <div class="card">10♦</div>
        </div>
        <p>Выберите карту для атаки</p>
    `;
});
=======
const gameMode = new URLSearchParams(window.location.search).get('mode') || 'bot';
const startButton = document.getElementById('start-game');
const gameBoard = document.getElementById('game-board');

if (gameMode === 'bot') {
    startButton.style.display = 'block';
    startButton.addEventListener('click', initGame);
} else {
    gameBoard.innerHTML = '<h3>Режим игры с другом</h3><p>Эта функция в разработке</p>';
}

function initGame() {
    tg.HapticFeedback.impactOccurred('light');
    startButton.style.display = 'none';
    gameBoard.innerHTML = '<p>Игра началась! Функциональность в разработке...</p>';
}
>>>>>>> 236014c0c39d0ef05012c2f6f1b66137bd9ce5d2
