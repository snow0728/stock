let cdTimer;

window.onload = () => { 
    initKuji();
    prepareEvents(); 
    initChart(); 
    updateUI(); 
};

function nextTurn() {
    if (turnCooldown > 0) return;
    
    applyMarketChanges();
    
    // 一番賞咖啡加成：冷卻縮短
    let cdReduc = myCollections.filter(c => c.grade === 'C').length;
    turnCooldown = Math.max(1, 5 - cdReduc); // 至少 1 秒冷卻
    
    updateUI();
    
    cdTimer = setInterval(() => {
        turnCooldown--;
        updateUI();
        if (turnCooldown <= 0) {
            clearInterval(cdTimer);
        }
    }, 1000);
}
