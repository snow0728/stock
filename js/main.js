let timer = GAME_SETTINGS.marketTurnSeconds;
let gameLoop;

window.onload = () => {
    updateShopDiscounts();
    prepareEvents();
    initChart();
    updateUI();
    startGameLoop();
};

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseBtn');
    if (isPaused) {
        btn.innerText = '恢復 ▶️';
        btn.style.background = '#27ae60';
        msg('⏸️ 遊戲已暫停', '#e74c3c');
    } else {
        btn.innerText = '暫停 ⏸️';
        btn.style.background = '#e67e22';
        msg('▶️ 遊戲恢復進行', '#27ae60');
    }
    updateWorkBtnUI();
}

function startGameLoop() {
    gameLoop = setInterval(() => {
        if (isPaused) return;
        tickScratchTicketTimer();
        tickMarketTimer();
        updateWorkBtnUI();
        if (timer <= 0) {
            applyMarketChanges();
            resetMarketTimer();
        }
    }, 1000);
}

function tickScratchTicketTimer() {
    if (--scratchTimer <= 0) {
        scratchTicketsLeft = GAME_SETTINGS.scratchTicketsPerRestock;
        scratchTimer = GAME_SETTINGS.scratchRestockSeconds;
        if (document.getElementById('shopTab').style.display === 'block') renderShop();
        return;
    }
    const el = document.getElementById('scratchTimerDisplay');
    if (el) el.innerText = scratchTimer;
}

function tickMarketTimer() {
    timer--;
    updateMarketTimerText();
}

function resetMarketTimer() {
    timer = GAME_SETTINGS.marketTurnSeconds;
    updateMarketTimerText();
}

function updateMarketTimerText() {
    const el = document.getElementById('timer');
    if (el) el.innerText = `變化倒數：${timer} 秒`;
}
