const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

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