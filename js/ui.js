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

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('marketTab').style.display = 'none';
    document.getElementById('shopTab').style.display = 'none';
    document.getElementById('divinationTab').style.display = 'none'; // 隱藏占卜
    
    if (tabId === 'market') {
        document.getElementById('marketTab').style.display = 'block';
        document.querySelector('.nav-btn[onclick="switchTab(\'market\')"]').classList.add('active');
    } else if (tabId === 'shop') {
        document.getElementById('shopTab').style.display = 'block';
        document.querySelector('.nav-btn[onclick="switchTab(\'shop\')"]').classList.add('active');
        renderShop();
    } else if (tabId === 'divination') {
        document.getElementById('divinationTab').style.display = 'block';
        document.querySelector('.nav-btn[onclick="switchTab(\'divination\')"]').classList.add('active');
        
        // 第一次點進來時生成卡牌陣列
        if (!document.getElementById('divinationGrid').hasChildNodes()) {
            createDivinationGrid();
        }
        document.getElementById('divPlaysLeft').innerText = divinationPlaysLeft;
    }
}
function renderShop() {
    let container = document.getElementById('shopItemsContainer');
    // 更新金錢顯示，確保金額格式化
    document.getElementById('shopCashVal').innerText = `$${Math.floor(cash).toLocaleString()}`;
    
    let html = '';
    
    SHOP_ITEMS.forEach(item => {
        // --- 1. 價格與折扣邏輯 ---
        let discount = currentDiscounts[item.id] || 0;
        let actualCost = Math.floor(item.cost * (1 - discount));
        
        // --- 2. 判斷是否已擁有 (針對 Buff 類型) ---
        let isOwned = item.type === 'buff' && hasItem(item.id);
        
        // --- 3. 取得持有數量的顯示文字 (針對 Voucher) ---
        let countDisplay = "";
        if (item.id === "item_voucher1") {
            countDisplay = `<div style="font-size:12px; color:#e67e22; font-weight:bold;">持有：${voucher1Count}</div>`;
        } else if (item.id === "item_voucher2") {
            countDisplay = `<div style="font-size:12px; color:#e67e22; font-weight:bold;">持有：${voucher2Count}</div>`;
        }

        // --- 4. 折扣標籤標籤 ---
        let discountBadge = '';
        if (discount > 0 && !isOwned) {
            let discPercent = Math.round(discount * 100);
            discountBadge = `<div class="discount-badge">-${discPercent}%</div>`;
        }

        // --- 5. 按鈕與描述狀態判斷 ---
        let canBuy = false;
        let btnText = "";
        let btnClass = "btn-buy-item";
        let dynDesc = item.desc;
        
        if (item.type === 'buff') {
            // Buff 道具不受負債限制
            canBuy = cash >= actualCost && !isOwned;
            if (isOwned) {
                btnText = "✅ 已啟用";
                btnClass += " owned"; // 假設你有這個樣式
            } else {
                btnText = discount > 0 
                    ? `購買 (<s style="font-size:0.8em;opacity:0.7">$${item.cost}</s> $${actualCost})`
                    : `購買 ($${actualCost})`;
            }
        } else if (item.id === 'item_scratch') {
            canBuy = cash >= actualCost && scratchTicketsLeft > 0 && loan <= 0;
            
            if (scratchTicketsLeft > 0) {
                btnText = discount > 0
                    ? `刮一張 (<s style="font-size:0.8em;opacity:0.7">$${item.cost}</s> $${actualCost})`
                    : `刮一張 ($${actualCost})`;
            } else {
                btnText = `售完等補貨`;
            }

            // 新增：負債時的按鈕狀態顯示
            if (loan > 0) {
                canBuy = false;
                btnText = `需先還清負債`;
            }
            
            if (!canBuy && scratchTicketsLeft <= 0) btnClass += " disabled-cooldown";
            
            // 刮刮樂特有的動態描述（含剩餘張數與計時器）
            dynDesc = `${item.desc}<br><br>
                       剩餘數量：<b>${scratchTicketsLeft} / 10</b> 張<br>
                       補貨倒數：<b id="scratchTimerDisplay">${scratchTimer}</b> 秒`;
        } else {
            // 一般消耗性道具 (兌換券等)
            canBuy = cash >= actualCost && loan <= 0;
            btnText = discount > 0
                ? `購買 (<s style="font-size:0.8em;opacity:0.7">$${item.cost}</s> $${actualCost})`
                : `購買 ($${actualCost})`;

            // 新增：負債時的按鈕狀態顯示
            if (loan > 0) {
                canBuy = false;
                btnText = `需先還清負債`;
            }
        }

        // --- 6. 組合最終 HTML ---
        html += `
            <div class="shop-item-card">
                ${isOwned ? '<div class="item-owned-badge">✅ 已啟用</div>' : ''}
                ${!isOwned && discountBadge ? discountBadge : ''}
                <div class="shop-item-icon">${item.icon}</div>
                <div class="shop-item-name">${item.name}</div>
                ${countDisplay}
                <div class="shop-item-desc">${dynDesc}</div>
                <button class="${btnClass}" onclick="buyShopItem('${item.id}')" ${!canBuy ? 'disabled' : ''}>
                    ${btnText}
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
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
    document.getElementById('curProfit').innerText = `盈虧：$${pft.toFixed(0)}`;
    
    const cEl = document.getElementById('curChange');
    cEl.innerText = `${chg>=0?'▲':'▼'} ${Math.abs(chg)}%`;
    cEl.style.color = chg>=0?'var(--up-color)':'var(--down-color)';

    document.getElementById('total').innerText = `$${getTotalAssets().toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('cash').innerText = `$${cash.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('bank').innerText = `$${bank.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    document.getElementById('loan').innerText = `$${loan.toLocaleString(undefined,{maximumFractionDigits:0})}`;
    
    let fv = fundUnits * fundNAV;
    document.getElementById('fundValue').innerText = `$${Math.floor(fv).toLocaleString()}`;
    document.getElementById('fundNAV').innerText = fundNAV.toFixed(2);
    
    let fundPft = fv - fundTotalCost;
    let fundPftEl = document.getElementById('fundProfit');
    fundPftEl.innerText = `${fundPft >= 0 ? '+' : ''}$${Math.floor(fundPft).toLocaleString()}`;
    fundPftEl.style.color = fundPft >= 0 ? '#eb2f06' : '#38ada9';

    let configStrs = STOCKS.map((s, i) => {
        let shortName = s.name.match(/\(([^)]+)\)/)[1];
        return `${shortName} ${(fundWeights[i]*100).toFixed(0)}%`;
    });
    document.getElementById('fundConfigText').innerText = `配置: ` + configStrs.join(' | ');
    
    let sV = 0; holdings.forEach((h, i) => sV += h*priceHistories[i][priceHistories[i].length-1]);
    document.getElementById('stockValue').innerText = `$${sV.toLocaleString(undefined,{maximumFractionDigits:0})}`;

    let taxEl = document.getElementById('taxCountdown');
    taxEl.innerText = `生活費倒數: ${taxTurns} (預估: $${Math.floor(accumulatedTax).toLocaleString()})`;
    if (taxTurns <= 5) {
        taxEl.style.color = 'white';
        taxEl.style.backgroundColor = '#e74c3c';
    } else {
        taxEl.style.color = '#c0392b';
        taxEl.style.backgroundColor = 'transparent';
    }

    let insEl = document.getElementById('insStatus');
    if (insuranceTurns > 0) {
        let currentPremium = Math.floor(50 + getGrossAssets() * 0.001);
        insEl.innerText = `生效中 (${insuranceTurns}回) | 本期保費: $${currentPremium.toLocaleString()}`;
        insEl.style.color = '#27ae60';
        insEl.style.fontWeight = 'bold';
    } else {
        insEl.innerText = `未投保 (每期保費 50 + 0.1%資產)`;
        insEl.style.color = '#7f8c8d';
        insEl.style.fontWeight = 'normal';
    }

    if(document.getElementById('shopTab').style.display === 'block') {
        renderShop();
    }

    updateWorkBtnUI();
    updateTitle();
    chart.data.datasets[0].data = hist;
    chart.data.datasets[0].borderColor = STOCKS[curIdx].color;
    chart.update('none');
}

function updateWorkBtnUI() {
    const workBtn = document.getElementById('workBtn');
    const workCdText = document.getElementById('workCdText');
    if (workBtn && workCdText) {
        if (isPaused) {
            workBtn.style.background = "#95a5a6";
            workBtn.style.cursor = "not-allowed";
            workCdText.innerText = `(暫停中)`;
        } else if (hasWorkedThisTurn) {
            workBtn.style.background = "#95a5a6";
            workBtn.style.cursor = "not-allowed";
            workCdText.innerText = `(休息中...)`;
        } else {
            workBtn.style.background = "#8e44ad";
            workBtn.style.cursor = "pointer";
            workCdText.innerText = `(點擊開始打工)`;
        }
    }
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
    if(m==='max_buy') document.getElementById('tradeAmt').value = Math.floor(cash/(priceHistories[curIdx][priceHistories[curIdx].length-1]*1.002));
    else document.getElementById('tradeAmt').value = holdings[curIdx];
}