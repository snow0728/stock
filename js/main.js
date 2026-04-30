window.onload = () => { 
    prepareNextEvents(); 
    initChart(); 
    updateUI(); 
    setInterval(tick, 1000); 
};

function tick() {
    timer--;
    document.getElementById('timer').innerText = `距離行情實現：${timer}秒`;
    if (timer <= 0) { 
        applyMarketChanges(); 
        timer = 15; 
    }
}