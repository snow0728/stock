function applyMarketChanges() {
    const marketSentiment = (Math.random() - 0.45) * 0.01; 
    let stockReturns = []; 

    STOCKS.forEach((s, i) => {
        const last = priceHistories[i][priceHistories[i].length - 1];
        let eventImpact = 1.0;
        
        currentEvents.forEach(ev => {
            const isTrue = Math.random() < TRUTH_RATE;
            if (isTrue) eventImpact *= ev.imp[i]; 
            else if (ev.imp[i] !== 1.0) eventImpact *= (1.0 / ev.imp[i]);
        });

        const meanReversion = (s.basePrice - last) / s.basePrice * 0.01;
        let volatility = s.vola * (Math.random() - 0.5) * 2;
        let changeRate = Math.exp(s.drift + meanReversion + (marketSentiment * s.beta) + volatility);
        let nextPrice = last * changeRate * eventImpact;

        if (s.type === 'stock') {
            if (nextPrice / last > 1.1) nextPrice = last * 1.1; 
            if (nextPrice / last < 0.9) nextPrice = last * 0.9;
        }

        if (nextPrice < 1) nextPrice = 1;
        priceHistories[i].push(nextPrice);
        if (priceHistories[i].length > 25) priceHistories[i].shift();
        stockReturns.push(nextPrice / last);
    });

    let weightedReturn = 0;
    for (let i = 0; i < STOCKS.length; i++) weightedReturn += stockReturns[i] * fundWeights[i];
    fundNAV = fundNAV * weightedReturn * (1 - FUND_MGMT_FEE);

    if (bank > 0) bank *= (1 + BANK_RATE); 
    if (currentTitleLevel >= 8) cash += 200; 

    prepareNextEvents(); 
    updateUI();
}

function prepareNextEvents() {
    currentEvents = [];
    let pool = [...PREDICTIONS]; 
    for (let i = 0; i < 3; i++) {
        if (pool.length === 0) break;
        const idx = Math.floor(Math.random() * pool.length);
        currentEvents.push(pool.splice(idx, 1)[0]);
    }
    const box = document.getElementById('newsBox');
    box.innerHTML = currentEvents.map(ev => `<div class="news-item">${ev.t}</div>`).join('');
}