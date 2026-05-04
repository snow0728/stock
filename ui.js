function showToast(text, color = '#3498db') {
    let container = document.getElementById('toast-container');
    let t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeftColor = color;
    t.innerHTML = text; 
    container.appendChild(t);
    
    setTimeout(() => {
        t.style.opacity = 0;
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

function msg(t, color = '#34495e') { 
    showToast(t, color);
}

function switchTab(name, event) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    
    if(event) event.currentTarget.classList.add('active');
    else document.querySelector(`.tab-btn[onclick*="${name}"]`).classList.add('active');
    
    document.getElementById(name + 'Tab').classList.add('active');
    
    if(name === 'shop') renderShop();
    if(name === 'kuji') renderKuji();
}

function renderShop() {
    const grid = document.getElementById('shopGrid');
    grid.innerHTML = SHOP_ITEMS.map(item => {
        const isOwned = inventory.includes(item.id);
        return `
            <div class="item-card ${isOwned ? 'owned' : ''}">
                <div class="item-name">${item.name}</div>
                <div class="item-desc">${item.desc}</div>
                <div class="item-price">$${item.price.toLocaleString()}</div>
                <button class="op-btn btn-in sm" style="width:100%" 
                    onclick="buyItem('${item.id}')" ${isOwned ? 'disabled' : ''}>
                    ${isOwned ? '已持有' : '購買'}
                </button>
            </div>
        `;
    }).join('');
}

function renderKuji() {
    if (kujiPool.length === 0 && cash >= 0) initKuji(); // safety init
    
    document.getElementById('poolTotal').innerText = kujiPool.length;
    
    const stats = {};
    KUJI_PRIZES.forEach(p => stats[p.grade] = 0);
    kujiPool.forEach(grade => stats[grade]++);
    
    document.getElementById('kujiPoolDisplay').innerHTML = KUJI_PRIZES.map(p => 
        `<div style="font-weight:bold;">${p.grade}賞: <span style="color:#2d3436;">${stats[p.grade]}/${p.count}</span></div>`
    ).join('');
    
    document.getElementById('collectionList').innerHTML = myCollections.map(c => 
        `<span class="badge" title="${c.desc}">${c.icon} ${c.name}</span>`
    ).join('') || '<span style="color:#aaa; font-size:12px;">空空如也，快去抽獎吧！</span>';
}

function updateUI() {
    const hist = priceHistories[curIdx], now = hist[hist.length-1];
    const chg = ((now - hist[hist.length-2])/hist[hist.length-2]*100).toFixed(2);
    
    document.getElementById('stockList').innerHTML = STOCKS.map((s, i) => {
        let p = priceHistories[i][priceHistories[i].length-1];
        let pftPercent = holdings[i]>0 ? ((p*holdings[i] - totalCosts[i])/totalCosts[i]*100).toFixed(1) : 0;
        return `<div class="stock-item ${i===curIdx?'active':''}" onclick="curIdx=${i};updateUI();">
            <div style="display:flex;justify-content:space-between;font-size:14px;"><b>${s.name}</b> <span>$${p.toFixed(1)}</span></div>
            <div style="font-size:11px; margin-top:5px;">
                ${holdings[i]>0 ? `<span style="background:#57606f;color:white;padding:2px 6px;border-radius:4px;">持有 ${holdings[i]}</span>` : ''}
                ${holdings[i]>0 ? `<span style="color:${pftPercent>=0?'#eb2f06':'#38ada9'};margin-left:8px;">${pftPercent>=0?'+':''}${pftPercent}%</span>` : ''}
            </div>
        </div>`;
    }).join('');

    document.getElementById('curPrice').innerText = `$${now.toFixed(1)}`;
    document.getElementById('curName').innerText = STOCKS[curIdx].name;
    document.getElementById('curInventory').innerText = `持有數量：${holdings[curIdx]}`;
    const pft = holdings[curIdx]>0 ? (now*holdings[curIdx]-totalCosts[curIdx]) : 0;
    document.getElementById('curProfit').innerText = `賺或賠：$${pft.toFixed(0)}`;
    
    const cEl = document.getElementById('curChange');
    cEl.innerText = `${chg>=0?'▲':'▼'} ${Math.abs(chg)}%`;
    cEl.style.color = chg>=0?'var(--up-color)':'var(--down-color)';

    document.getElementById('total').innerText = `$${getTotalAssets().toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('cash').innerText = `$${cash.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('bank').innerText = `$${bank.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('loan').innerText = `$${loan.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('fundNAV').innerText = fundNAV.toFixed(2);
    document.getElementById('fundValue').innerText = `$${(fundUnits*fundNAV).toLocaleString(undefined,{maximumFractionDigits:0})}`;
    
    // --- 基金顯示邏輯 ---
    let fundDesc = "";
    if (turnCount < 5) {
        fundDesc = `AI 投資演算中... (剩餘 ${5 - turnCount} 回合)`;
    } else {
        let roi = ((fundNAV - 10.0) / 10.0 * 100).toFixed(1);
        let sign = roi >= 0 ? '+' : '';
        let roiColor = roi >= 0 ? 'var(--up-color)' : 'var(--down-color)';
        
        let wStrs = [];
        for(let i=0; i<STOCKS.length; i++) {
            let w = Math.round(fundWeights[i] * 100);
            let ticker = STOCKS[i].name.match(/\(([^)]+)\)/)[1];
            wStrs.push(`${ticker} ${w}%`);
        }
        fundDesc = `<div style="margin-bottom:2px; font-style:normal;">累計收益: <span style="color:${roiColor}; font-weight:bold;">${sign}${roi}%</span></div><div style="font-size:10px; color:#666; line-height:1.2; font-style:normal;">配置: ${wStrs.join(' | ')}</div>`;
    }
    document.getElementById('fundConfigText').innerHTML = fundDesc;

    let sV = 0; holdings.forEach((h, i) => sV += h*priceHistories[i][priceHistories[i].length-1]);
    document.getElementById('stockValue').innerText = `$${sV.toLocaleString(undefined,{maximumFractionDigits:0})}`;

    // --- 市場透視鏡邏輯 ---
    let lensHtml = "";
    if (inventory.includes('market_lens')) {
        let lensStr = `🔍 預測：貪婪恐慌指數 ${Math.round(fearGreedIndex)} `;
        if(fearGreedIndex > 80) lensStr += "(極度貪婪，隨時崩盤)";
        else if (fearGreedIndex < 20) lensStr += "(極度恐慌，可能反彈)";
        else lensStr += "(情緒平穩)";
        lensHtml = `<br><span style="color:#f39c12; font-size:11px;">${lensStr}</span>`;
    }

    let taxEl = document.getElementById('taxCountdown');
    taxEl.innerHTML = `生活費倒數: ${taxTurns} 回合 (預估: $${Math.floor(accumulatedTax).toLocaleString()})${lensHtml}`;
    if (taxTurns <= 3) {
        taxEl.style.color = 'white';
        taxEl.style.backgroundColor = '#e74c3c';
    } else {
        taxEl.style.color = '#c0392b';
        taxEl.style.backgroundColor = 'transparent';
    }

    let riskPremium = fearGreedIndex < 40 ? 0.02 : 0.01;
    let insCost = Math.max(500, Math.floor(getTotalAssets() * riskPremium));
    let recurring = Math.max(50, Math.floor(getTotalAssets() * 0.002));
    
    document.getElementById('insCost').innerText = `$${insCost.toLocaleString()} + $${recurring.toLocaleString()}/期`;

    let insEl = document.getElementById('insStatus');
    if (insuranceTurns > 0) {
        insEl.innerText = `生效中 (${insuranceTurns}回, -$${insurancePremium.toLocaleString()}/期)`;
        insEl.style.color = '#27ae60';
        insEl.style.fontWeight = 'bold';
    } else {
        insEl.innerText = `未投保`;
        insEl.style.color = '#7f8c8d';
        insEl.style.fontWeight = 'normal';
    }

    let nextBtn = document.getElementById('nextTurnBtn');
    if (turnCooldown > 0) {
        nextBtn.innerText = `冷卻中 (${turnCooldown}s)`;
        nextBtn.disabled = true;
        nextBtn.style.background = '#95a5a6';
    } else {
        nextBtn.innerText = `進入下一回合 ➔`;
        nextBtn.disabled = false;
        nextBtn.style.background = 'var(--primary)';
    }

    let workBtnEl = document.getElementById('openWorkBtn');
    if (hasWorkedThisTurn) {
        workBtnEl.style.background = '#95a5a6';
        workBtnEl.innerText = "本回已打工";
    } else {
        workBtnEl.style.background = '#e67e22';
        workBtnEl.innerText = "去打工";
    }

    updateTitle();
    chart.data.datasets[0].data = hist;
    chart.data.datasets[0].borderColor = STOCKS[curIdx].color;
    chart.update('none');
}

function updateTitle() {
    let n = currentTitleLevel + 1, total = getTotalAssets();
    if(n < TITLE_DATA.length) {
        let tar = TITLE_DATA[n].threshold;
        document.getElementById('titleBar').style.width = `${Math.min(100, (total/tar)*100)}%`;
        document.getElementById('upgradeTitleBtn').style.display = (total >= tar && cash >= TITLE_DATA[n].cost) ? 'block' : 'none';
        document.getElementById('nextTitleText').innerText = `下一階：$${tar.toLocaleString()} (升級費 $${TITLE_DATA[n].cost})`;
    } else {
        document.getElementById('titleBar').style.width = `100%`;
        document.getElementById('nextTitleText').innerText = `已達成最高階級！`;
        document.getElementById('upgradeTitleBtn').style.display = 'none';
    }
    
    let allBuffs = TITLE_DATA
        .slice(0, currentTitleLevel + 1)
        .map(t => t.buff)
        .filter(b => b !== "無特殊效果" && b !== "");
        
    let buffDisplay = allBuffs.length > 0 ? "✅ " + allBuffs.join(" 、 ") : "無特殊效果";

    document.getElementById('curTitleName').innerText = TITLE_DATA[currentTitleLevel].name;
    document.getElementById('curTitleDesc').innerText = buffDisplay;
}

function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: Array(25).fill(''), datasets: [{ data: priceHistories[curIdx], borderColor: STOCKS[curIdx].color, borderWidth: 3, pointRadius: 0, tension: 0.3, fill: false }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false }, scales: { x: { display: false }, y: { position: 'right', ticks: { font: { size: 11 } } } } }
    });
}

function setTradeAmt(m) {
    if(m==='max_buy') {
        let p = priceHistories[curIdx][priceHistories[curIdx].length-1];
        let botDiscount = inventory.includes('trading_bot') ? 0.5 : 1.0;
        let buyFee = (STOCKS[curIdx].type==='crypto'?0.001:0.001425) * (currentTitleLevel >= 1 ? 0.5 : 1) * botDiscount;
        document.getElementById('tradeAmt').value = Math.floor(cash/(p*(1+buyFee)));
    }
    else document.getElementById('tradeAmt').value = holdings[curIdx];
}
