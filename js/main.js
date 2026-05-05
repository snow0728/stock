let timer = 15;
let gameLoop;

window.onload = () => { 
    prepareEvents(); 
    initChart(); 
    updateUI(); 
    startGameLoop();
};

function startGameLoop() {
    gameLoop = setInterval(() => {
        timer--;
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.innerText = `距離變化：${timer} 秒`;
        }

        if (typeof updateWorkBtnUI === "function") {
            updateWorkBtnUI();
        }

        if (timer <= 0) {
            applyMarketChanges();
            timer = 15;
            if (timerEl) {
                timerEl.innerText = `距離變化：${timer} 秒`;
            }
        }
    }, 1000);
}