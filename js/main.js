let timer = 15;
let gameLoop;

window.onload = () => { 
    updateShopDiscounts(); // 初始化第一回合的商店折扣
    prepareEvents(); 
    initChart(); 
    updateUI(); 
    startGameLoop();
};

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pauseBtn');
    if (isPaused) {
        btn.innerText = "恢復 ▶️";
        btn.style.background = "#27ae60";
        msg("⏸️ 遊戲已暫停", "#e74c3c");
    } else {
        btn.innerText = "暫停 ⏸️";
        btn.style.background = "#e67e22";
        msg("▶️ 遊戲恢復進行", "#27ae60");
    }
    updateWorkBtnUI();
}

function startGameLoop() {
    gameLoop = setInterval(() => {
        if (isPaused) return; 

        // 獨立計算刮刮樂冷卻 (30秒)
        scratchTimer--;
        if (scratchTimer <= 0) {
            scratchTicketsLeft = 10;
            scratchTimer = 30;
            if (document.getElementById('shopTab').style.display === 'block') {
                renderShop();
            }
        } else {
            let stDisp = document.getElementById('scratchTimerDisplay');
            if (stDisp) stDisp.innerText = scratchTimer;
        }

        timer--;
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.innerText = `變化倒數：${timer} 秒`;
        }

        if (typeof updateWorkBtnUI === "function") {
            updateWorkBtnUI();
        }

        if (timer <= 0) {
            applyMarketChanges();
            timer = 15;
            if (timerEl) {
                timerEl.innerText = `變化倒數：${timer} 秒`;
            }
        }
    }, 1000);
}