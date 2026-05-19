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
        
        const divinationGrid = document.getElementById('divinationGrid');
        if (divinationGrid.children.length === 0) {
            createDivinationGrid();
        }
        document.getElementById('divPlaysLeft').innerText = divinationPlaysLeft;
    }
}
function renderShop() {
    let container = document.getElementById('shopItemsContainer');
    document.getElementById('shopCashVal').innerText = formatMoney(cash);
    container.innerHTML = SHOP_ITEMS.map(renderShopItemCard).join('');
}

function renderShopItemCard(item) {
    const discount = currentDiscounts[item.id] || 0;
    const actualCost = getDiscountedItemCost(item);
    const isOwned = item.type === 'buff' && hasItem(item.id);
    const buttonState = getShopButtonState(item, actualCost, discount, isOwned);
    const discountBadge = discount > 0 && !isOwned
        ? `<div class="discount-badge">-${Math.round(discount * 100)}%</div>`
        : '';

    return `
        <div class="shop-item-card">
            ${isOwned ? '<div class="item-owned-badge">✅ 已啟用</div>' : ''}
            ${discountBadge}
            <div class="shop-item-icon">${item.icon}</div>
            <div class="shop-item-name">${item.name}</div>
            ${getShopItemCountHtml(item.id)}
            <div class="shop-item-desc">${getShopItemDesc(item)}</div>
            <button class="${buttonState.className}" onclick="buyShopItem('${item.id}')" ${!buttonState.canBuy ? 'disabled' : ''}>
                ${buttonState.text}
            </button>
        </div>
    `;
}

function getShopItemCountHtml(itemId) {
    const countMap = {
        [ITEM_IDS.voucherPersonal]: { count: voucher1Count, color: '#e67e22' },
        [ITEM_IDS.voucherClass]: { count: voucher2Count, color: '#e67e22' },
        [ITEM_IDS.redCard]: { count: redCardCount, color: '#e74c3c' },
        [ITEM_IDS.greenCard]: { count: greenCardCount, color: '#27ae60' },
    };
    const itemCount = countMap[itemId];
    if (!itemCount) return '';
    return `<div class="shop-item-count" style="color:${itemCount.color};">持有：${itemCount.count}</div>`;
}

function getShopItemDesc(item) {
    if (item.id !== ITEM_IDS.scratch) return item.desc;
    return `${item.desc}<br><br>
        剩餘數量：<b>${scratchTicketsLeft} / ${GAME_SETTINGS.scratchTicketsPerRestock}</b> 張<br>
        補貨倒數：<b id="scratchTimerDisplay">${scratchTimer}</b> 秒`;
}

function getShopButtonState(item, actualCost, discount, isOwned) {
    let state = {
        canBuy: cash >= actualCost,
        className: 'btn-buy-item',
        text: buildBuyText('購買', item.cost, actualCost, discount),
    };

    if (item.type === 'buff') {
        state.canBuy = cash >= actualCost && !isOwned;
        if (isOwned) {
            state.text = '✅ 已啟用';
            state.className += ' owned';
        }
        return state;
    }

    if (item.id === ITEM_IDS.scratch) {
        state.canBuy = cash >= actualCost && scratchTicketsLeft > 0 && loan <= 0;
        state.text = scratchTicketsLeft > 0
            ? buildBuyText('刮一張', item.cost, actualCost, discount)
            : '售完等補貨';
        if (scratchTicketsLeft <= 0) state.className += ' disabled-cooldown';
    } else {
        applyCardLimitState(item.id, state);
    }

    if (loan > 0) {
        state.canBuy = false;
        state.text = '需先還清負債';
    }

    return state;
}

function applyCardLimitState(itemId, state) {
    if (itemId === ITEM_IDS.redCard) {
        if (redCardCount >= 1) {
            state.canBuy = false;
            state.text = '已達上限 (1/1)';
        } else if (redCardCooldown > 0) {
            state.canBuy = false;
            state.text = `冷卻中 (${redCardCooldown}回合)`;
            state.className += ' disabled-cooldown';
        }
    }

    if (itemId === ITEM_IDS.greenCard) {
        if (greenCardCount >= 1) {
            state.canBuy = false;
            state.text = '已達上限 (1/1)';
        } else if (greenCardCooldown > 0) {
            state.canBuy = false;
            state.text = `冷卻中 (${greenCardCooldown}回合)`;
            state.className += ' disabled-cooldown';
        }
    }
}

function buildBuyText(action, originalCost, actualCost, discount) {
    if (discount <= 0) return `${action} (${formatMoney(actualCost)})`;
    return `${action} (<s style="font-size:0.8em;opacity:0.7">${formatMoney(originalCost)}</s> ${formatMoney(actualCost)})`;
}

function renderAiPlayers() {
    const container = document.getElementById('aiPlayers');
    const impactText = document.getElementById('aiMarketImpact');
    if (!container || !impactText) return;

    const selectedImpact = lastMarketImpacts[curIdx] || 0;
    const selectedImpactText = Math.abs(selectedImpact) > 0.0001
        ? `${getStockShortName(curIdx)} 交易衝擊：${formatImpactPercent(selectedImpact)}`
        : "目前沒有明顯交易衝擊";

    impactText.innerText = `${lastAiSummary}｜${selectedImpactText}`;
    container.innerHTML = aiPlayers.map(renderAiPlayerCard).join('');
}

function renderAiPlayerCard(ai) {
    const mainHolding = getAiMainHolding(ai);
    const actionClass = ai.lastImpact > 0 ? 'up' : ai.lastImpact < 0 ? 'down' : '';
    
    // 計算總資產
    const totalAssets = getAiTotalAssets(ai);
    
    return `
        <div class="ai-card" style="border-left-color:${ai.color};">
            <div class="ai-card-head">
                <span class="ai-name">${ai.icon} ${ai.name}</span>
                <span class="ai-style" style="background-color:${ai.color};">${ai.style}</span>
            </div>
            
            <div class="ai-info-body">
                <div class="ai-info-row">
                    <span class="ai-label">總資產：</span>
                    <span class="ai-worth">${formatMoney(totalAssets)}</span>
                </div>
                <div class="ai-info-row">
                    <span class="ai-label">主要持股：</span>
                    <span class="ai-holding">${mainHolding}</span>
                </div>
                <div class="ai-info-row">
                    <span class="ai-label">上回動作：</span>
                    <span class="ai-action ${actionClass}">${ai.lastAction}</span>
                </div>
                <div class="ai-info-desc">
                    ${ai.desc}
                </div>
            </div>
        </div>
    `;
}

function getAiMainHolding(ai) {
    const topHolding = ai.holdings
        .map((quantity, index) => ({ quantity, index, value: quantity * getCurrentPrice(index) }))
        .sort((a, b) => b.value - a.value)[0];

    if (!topHolding || topHolding.quantity <= 0) return "主要持有：尚未持股";
    return `主要持有：${getStockShortName(topHolding.index)} ${topHolding.quantity} 單位`;
}

function updateUI() {
    const hist = priceHistories[curIdx], now = getCurrentPrice();
    const chg = ((now - hist[hist.length-2])/hist[hist.length-2]*100).toFixed(2);
    
    document.getElementById('stockList').innerHTML = STOCKS.map((s, i) => {
        let p = getCurrentPrice(i);
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

    document.getElementById('total').innerText = formatMoney(getTotalAssets());
    document.getElementById('cash').innerText = formatMoney(cash);
    document.getElementById('bank').innerText = formatMoney(bank);
    document.getElementById('loan').innerText = formatMoney(loan);
    
    let fv = getFundAssetValue();
    document.getElementById('fundValue').innerText = formatMoney(fv);
    document.getElementById('fundNAV').innerText = fundNAV.toFixed(2);
    
    let fundPft = fv - fundTotalCost;
    let fundPftEl = document.getElementById('fundProfit');
    fundPftEl.innerText = `${fundPft >= 0 ? '+' : ''}${formatMoney(fundPft)}`;
    fundPftEl.style.color = fundPft >= 0 ? '#eb2f06' : '#38ada9';

    let configStrs = STOCKS.map((s, i) => {
        let shortName = s.name.match(/\(([^)]+)\)/)[1];
        return `${shortName} ${(fundWeights[i]*100).toFixed(0)}%`;
    });
    document.getElementById('fundConfigText').innerText = `配置: ` + configStrs.join(' | ');
    
    document.getElementById('stockValue').innerText = formatMoney(getStockAssetValue());
    renderAiPlayers();

    let taxEl = document.getElementById('taxCountdown');
    taxEl.innerText = `生活費倒數: ${taxTurns} (預估: ${formatMoney(accumulatedTax)})`;
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
        document.getElementById('nextTitleText').innerText = `下一階：${formatMoney(tar)} (升級費 ${formatMoney(TITLE_DATA[n].cost)})`;
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
    if(m==='max_buy') document.getElementById('tradeAmt').value = Math.floor(cash/(getCurrentPrice()*1.002));
    else document.getElementById('tradeAmt').value = holdings[curIdx];
}

// 🤖 切換 AI 側邊欄顯示/隱藏
function toggleAISidebar() {
    const sidebar = document.getElementById('aiSidebar');
    const btn = document.getElementById('aiToggleBtn');
    
    // 切換 'open' 這個 class
    sidebar.classList.toggle('open');
    btn.classList.toggle('open');
    
    // 根據目前的狀態更換按鈕文字
    if (sidebar.classList.contains('open')) {
        btn.innerText = "▶ 收起";
    } else {
        btn.innerText = "🤖對手資訊";
    }
}