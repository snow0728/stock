function updateUI() {
    const history = priceHistories[curIdx];
    const now = history[history.length - 1];
    const change = ((now - history[history.length - 2]) / history[history.length - 2] * 100).toFixed(2);

    document.getElementById('stockList').innerHTML = STOCKS.map((s, i) => {
        const p = priceHistories[i][priceHistories[i].length-1];
        const lp = priceHistories[i][priceHistories[i].length-2];
        let limitClass = (s.type === 'stock' && p/lp >= 1.099) ? "limit-up" : (s.type === 'stock' && p/lp <= 0.901) ? "limit-down" : "";
        const profitPercent = holdings[i] > 0 ? ((p * holdings[i] - totalCosts[i]) / totalCosts[i] * 100) : 0;
        return `<div class="stock-item ${i === curIdx ? 'active' : ''} ${limitClass}" onclick="selectStock(${i})">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size: 14px;">${s.name}</b>
                <span style="font-size: 14px;">$${p.toFixed(1)}</span>
            </div>
            <div class="badge-row">
                ${holdings[i] > 0 ? `<span class="hold-badge">${holdings[i]}單</span>` : ''}
                ${holdings[i] > 0 ? `<span class="profit-badge" style="background:${profitPercent>=0?'#eb2f06':'#38ada9'}">${profitPercent>=0?'+':''}${profitPercent.toFixed(1)}%</span>` : ''}
            </div>
        </div>`;
    }).join('');

    document.getElementById('curPrice').innerText = `$${now.toFixed(1)}`;
    document.getElementById('curName').innerText = STOCKS[curIdx].name;
    document.getElementById('curInventory').innerText = `持有：${holdings[curIdx]}`;
    const curVal = now * holdings[curIdx];
    document.getElementById('curProfit').innerText = `淨收益：$${(holdings[curIdx] > 0 ? (curVal - totalCosts[curIdx]) : 0).toFixed(0)}`;
    
    const cEl = document.getElementById('curChange');
    cEl.innerText = `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%`;
    cEl.style.color = change >= 0 ? 'var(--up-color)' : 'var(--down-color)';

    let sVal = 0, cVal = 0;
    STOCKS.forEach((s, i) => {
        let val = priceHistories[i][priceHistories[i].length-1] * holdings[i];
        if(s.type === 'crypto') cVal += val; else sVal += val;
    });
    fundBalance = fundUnits * fundNAV;
    const totalAssets = cash + bank + sVal + cVal + fundBalance;

    document.getElementById('stockValue').innerText = `$${sVal.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('fundValue').innerText = `$${fundBalance.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('total').innerText = `$${totalAssets.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('cash').innerText = `$${cash.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('bank').innerText = `$${bank.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('fundNAV').innerText = fundNAV.toFixed(2);

    checkTitleProgress(totalAssets);
    chart.data.datasets[0].data = history;
    chart.data.datasets[0].borderColor = STOCKS[curIdx].color;
    chart.data.datasets[0].backgroundColor = STOCKS[curIdx].color + '15';
    chart.update('none');
}

function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array(25).fill(''), datasets: [{ data: priceHistories[curIdx], borderColor: STOCKS[curIdx].color, borderWidth: 4, pointRadius: 0, tension: 0.4, fill: true, backgroundColor: STOCKS[curIdx].color + '15' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, scales: { x: { display: false }, y: { position: 'right' } } }
    });
}

function selectStock(i) { curIdx = i; document.getElementById('tradeAmt').value = 1; updateUI(); }

function setTradeAmt(mode) {
    const p = priceHistories[curIdx][priceHistories[curIdx].length - 1];
    const feeRate = (STOCKS[curIdx].type === 'crypto') ? CRYPTO_FEE : STOCK_BUY_FEE;
    if (mode === 'max_buy') document.getElementById('tradeAmt').value = Math.floor(cash / (p * (1 + feeRate)));
    else if (mode === 'max_sell') document.getElementById('tradeAmt').value = holdings[curIdx];
}

function msg(t) { document.getElementById('msg').innerText = t; }