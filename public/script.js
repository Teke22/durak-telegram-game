const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

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