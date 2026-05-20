// ── Toast / message ──────────────────────────────────────

function showToast(text, color = '#3498db') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeftColor = color;
    t.innerHTML = text;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 3000);
}

// msg is an alias – keep same signature for call-site compatibility
function msg(text, color = '#34495e') { showToast(text, color); }

// ── Tab switching ─────────────────────────────────────────

function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    ['marketTab', 'shopTab', 'divinationTab'].forEach(id =>
        document.getElementById(id).style.display = 'none');

    const tabMap = { market: 'marketTab', shop: 'shopTab', divination: 'divinationTab' };
    document.getElementById(tabMap[tabId]).style.display = 'block';
    document.querySelector(`.nav-btn[onclick="switchTab('${tabId}')"]`).classList.add('active');

    if (tabId === 'shop') {
        renderShop();
    } else if (tabId === 'divination') {
        const grid = document.getElementById('divinationGrid');
        if (!grid.children.length) createDivinationGrid();
        document.getElementById('divPlaysLeft').innerText = divinationPlaysLeft;
    }
}

// ── Shop rendering ────────────────────────────────────────

function renderShop() {
    document.getElementById('shopCashVal').innerText = formatMoney(cash);
    document.getElementById('shopItemsContainer').innerHTML = SHOP_ITEMS.map(renderShopItemCard).join('');
}

function renderShopItemCard(item) {
    const discount  = currentDiscounts[item.id] || 0;
    const actualCost = getDiscountedItemCost(item);
    const isOwned   = item.type === 'buff' && hasItem(item.id);
    const btn       = getShopButtonState(item, actualCost, discount, isOwned);
    const badge     = (discount > 0 && !isOwned)
        ? `<div class="discount-badge">-${Math.round(discount * 100)}%</div>` : '';

    return `<div class="shop-item-card">
        ${isOwned ? '<div class="item-owned-badge">✅ 已啟用</div>' : ''}
        ${badge}
        <div class="shop-item-icon">${item.icon}</div>
        <div class="shop-item-name">${item.name}</div>
        ${getShopItemCountHtml(item.id)}
        <div class="shop-item-desc">${getShopItemDesc(item)}</div>
        <button class="${btn.className}" onclick="buyShopItem('${item.id}')" ${btn.canBuy ? '' : 'disabled'}>
            ${btn.text}
        </button>
    </div>`;
}

function getShopItemCountHtml(itemId) {
    const map = {
        [ITEM_IDS.voucherPersonal]: [voucher1Count, '#e67e22'],
        [ITEM_IDS.voucherClass]:    [voucher2Count, '#e67e22'],
        [ITEM_IDS.redCard]:         [redCardCount,  '#e74c3c'],
        [ITEM_IDS.greenCard]:       [greenCardCount, '#27ae60'],
    };
    const entry = map[itemId];
    return entry ? `<div class="shop-item-count" style="color:${entry[1]};">持有：${entry[0]}</div>` : '';
}

function getShopItemDesc(item) {
    if (item.id !== ITEM_IDS.scratch) return item.desc;
    return `${item.desc}<br><br>剩餘數量：<b>${scratchTicketsLeft} / ${GAME_SETTINGS.scratchTicketsPerRestock}</b> 張<br>補貨倒數：<b id="scratchTimerDisplay">${scratchTimer}</b> 秒`;
}

function getShopButtonState(item, actualCost, discount, isOwned) {
    const state = {
        canBuy: cash >= actualCost,
        className: 'btn-buy-item',
        text: buildBuyText('購買', item.cost, actualCost, discount),
    };

    if (item.type === 'buff') {
        state.canBuy = !isOwned && cash >= actualCost;
        if (isOwned) { state.text = '✅ 已啟用'; state.className += ' owned'; }
        return state;
    }

    if (item.id === ITEM_IDS.scratch) {
        state.canBuy = scratchTicketsLeft > 0 && cash >= actualCost && loan <= 0;
        if (scratchTicketsLeft > 0) {
            state.text = buildBuyText('刮一張', item.cost, actualCost, discount);
        } else {
            state.text = '售完等補貨';
            state.className += ' disabled-cooldown';
        }
    } else {
        applyCardLimitState(item.id, state);
    }

    if (loan > 0) { state.canBuy = false; state.text = '需先還清負債'; }
    return state;
}

function applyCardLimitState(itemId, state) {
    const check = (count, cd, label) => {
        if (count >= 1) { state.canBuy = false; state.text = '已達上限 (1/1)'; return; }
        if (cd > 0)     { state.canBuy = false; state.text = `冷卻中 (${cd}回合)`; state.className += ' disabled-cooldown'; }
    };
    if (itemId === ITEM_IDS.redCard)   check(redCardCount,   redCardCooldown);
    if (itemId === ITEM_IDS.greenCard) check(greenCardCount, greenCardCooldown);
}

function buildBuyText(action, orig, actual, discount) {
    if (discount <= 0) return `${action} (${formatMoney(actual)})`;
    return `${action} (<s style="font-size:0.8em;opacity:0.7">${formatMoney(orig)}</s> ${formatMoney(actual)})`;
}

// ── AI panel ──────────────────────────────────────────────

function renderAiPlayers() {
    const container = document.getElementById('aiPlayers');
    const impactEl  = document.getElementById('aiMarketImpact');
    if (!container || !impactEl) return;

    const impact = lastMarketImpacts[curIdx] || 0;
    impactEl.innerText = `${lastAiSummary}｜${
        Math.abs(impact) > 0.0001
            ? `${getStockShortName(curIdx)} 交易衝擊：${formatImpactPercent(impact)}`
            : '目前沒有明顯交易衝擊'
    }`;
    container.innerHTML = aiPlayers.map(renderAiPlayerCard).join('');
}

function renderAiPlayerCard(ai) {
    const mainHolding = (() => {
        const top = ai.holdings
            .map((qty, i) => ({ qty, i, val: qty * getCurrentPrice(i) }))
            .sort((a, b) => b.val - a.val)[0];
        return (!top || top.qty <= 0)
            ? '主要持有：尚未持股'
            : `主要持有：${getStockShortName(top.i)} ${top.qty} 單位`;
    })();
    const cls = ai.lastImpact > 0 ? 'up' : ai.lastImpact < 0 ? 'down' : '';

    return `<div class="ai-card" style="border-left-color:${ai.color};">
        <div class="ai-card-head">
            <span class="ai-name">${ai.icon} ${ai.name}</span>
            <span class="ai-style" style="background-color:${ai.color};">${ai.style}</span>
        </div>
        <div class="ai-info-body">
            <div class="ai-info-row"><span class="ai-label">總資產：</span><span class="ai-worth">${formatMoney(getAiTotalAssets(ai))}</span></div>
            <div class="ai-info-row"><span class="ai-label">主要持股：</span><span class="ai-holding">${mainHolding}</span></div>
            <div class="ai-info-row"><span class="ai-label">上回動作：</span><span class="ai-action ${cls}">${ai.lastAction}</span></div>
            <div class="ai-info-desc">${ai.desc}</div>
        </div>
    </div>`;
}

// ── Main UI update ────────────────────────────────────────

function updateUI() {
    const hist  = priceHistories[curIdx];
    const now   = hist[hist.length - 1];
    const prev  = hist[hist.length - 2];
    const chgPct = ((now - prev) / prev * 100).toFixed(2);

    // Stock list (single innerHTML assignment)
    document.getElementById('stockList').innerHTML = STOCKS.map((s, i) => {
        const p = getCurrentPrice(i);
        const pftPct = holdings[i] > 0
            ? ((p * holdings[i] - totalCosts[i]) / totalCosts[i] * 100).toFixed(1) : 0;
        return `<div class="stock-item${i === curIdx ? ' active' : ''}" onclick="curIdx=${i};updateUI();">
            <div style="display:flex;justify-content:space-between;font-size:14px;"><b>${s.name}</b><span>$${p.toFixed(1)}</span></div>
            <div style="font-size:11px;margin-top:5px;">
                ${holdings[i] > 0 ? `<span style="background:#57606f;color:white;padding:2px 6px;border-radius:4px;">持有 ${holdings[i]}</span>` : ''}
                ${holdings[i] > 0 ? `<span style="color:${pftPct >= 0 ? '#eb2f06' : '#38ada9'};margin-left:8px;">${pftPct >= 0 ? '+' : ''}${pftPct}%</span>` : ''}
            </div>
        </div>`;
    }).join('');

    // Chart area
    document.getElementById('curPrice').innerText = `$${now.toFixed(1)}`;
    document.getElementById('curName').innerText  = STOCKS[curIdx].name;
    document.getElementById('curInventory').innerText = `持有數量：${holdings[curIdx]}`;
    const pft = holdings[curIdx] > 0 ? now * holdings[curIdx] - totalCosts[curIdx] : 0;
    document.getElementById('curProfit').innerText = `盈虧：$${pft.toFixed(0)}`;

    const cEl = document.getElementById('curChange');
    cEl.innerText   = `${chgPct >= 0 ? '▲' : '▼'} ${Math.abs(chgPct)}%`;
    cEl.style.color = chgPct >= 0 ? 'var(--up-color)' : 'var(--down-color)';

    // Asset cards
    document.getElementById('total').innerText      = formatMoney(getTotalAssets());
    document.getElementById('cash').innerText       = formatMoney(cash);
    document.getElementById('bank').innerText       = formatMoney(bank);
    document.getElementById('loan').innerText       = formatMoney(loan);
    document.getElementById('stockValue').innerText = formatMoney(getStockAssetValue());

    // Fund
    const fv = getFundAssetValue();
    document.getElementById('fundValue').innerText = formatMoney(fv);
    document.getElementById('fundNAV').innerText   = fundNAV.toFixed(2);
    const fundPft    = fv - fundTotalCost;
    const fundPftEl  = document.getElementById('fundProfit');
    fundPftEl.innerText   = `${fundPft >= 0 ? '+' : ''}${formatMoney(fundPft)}`;
    fundPftEl.style.color = fundPft >= 0 ? '#eb2f06' : '#38ada9';
    document.getElementById('fundConfigText').innerText =
        '配置: ' + STOCKS.map((s, i) => `${STOCK_SHORT_NAMES[i]} ${(fundWeights[i] * 100).toFixed(0)}%`).join(' | ');

    renderAiPlayers();

    // Tax countdown
    const taxEl = document.getElementById('taxCountdown');
    taxEl.innerText = `生活費倒數: ${taxTurns} (預估: ${formatMoney(accumulatedTax)})`;
    const urgentTax = taxTurns <= 5;
    taxEl.style.color           = urgentTax ? 'white'       : '#c0392b';
    taxEl.style.backgroundColor = urgentTax ? '#e74c3c'     : 'transparent';

    // Insurance
    const insEl = document.getElementById('insStatus');
    if (insuranceTurns > 0) {
        insEl.innerText      = `生效中 (${insuranceTurns}回) | 本期保費: $${Math.floor(50 + getGrossAssets() * 0.001).toLocaleString()}`;
        insEl.style.color      = '#27ae60';
        insEl.style.fontWeight = 'bold';
    } else {
        insEl.innerText      = '未投保 (每期保費 50 + 0.1%資產)';
        insEl.style.color      = '#7f8c8d';
        insEl.style.fontWeight = 'normal';
    }

    if (document.getElementById('shopTab').style.display === 'block') renderShop();
    updateWorkBtnUI();
    updateTitle();

    chart.data.datasets[0].data        = hist;
    chart.data.datasets[0].borderColor = STOCKS[curIdx].color;
    chart.update('none');
}

function updateWorkBtnUI() {
    const workBtn    = document.getElementById('workBtn');
    const workCdText = document.getElementById('workCdText');
    if (!workBtn || !workCdText) return;
    const paused = isPaused || hasWorkedThisTurn;
    workBtn.style.background = paused ? '#95a5a6' : '#8e44ad';
    workBtn.style.cursor     = paused ? 'not-allowed' : 'pointer';
    workCdText.innerText     = isPaused ? '(暫停中)' : hasWorkedThisTurn ? '(休息中...)' : '(點擊開始打工)';
}

function updateTitle() {
    const n     = currentTitleLevel + 1;
    const total = getTotalAssets();

    if (n < TITLE_DATA.length) {
        const tar = TITLE_DATA[n].threshold;
        document.getElementById('titleBar').style.width       = `${Math.min(100, total / tar * 100)}%`;
        document.getElementById('upgradeTitleBtn').style.display = (total >= tar && cash >= TITLE_DATA[n].cost) ? 'block' : 'none';
        document.getElementById('nextTitleText').innerText    = `下一階：${formatMoney(tar)} (升級費 ${formatMoney(TITLE_DATA[n].cost)})`;
    } else {
        document.getElementById('titleBar').style.width       = '100%';
        document.getElementById('nextTitleText').innerText    = '已達成最高階級！';
        document.getElementById('upgradeTitleBtn').style.display = 'none';
    }

    const buffs = TITLE_DATA.slice(0, currentTitleLevel + 1)
        .map(t => t.buff).filter(b => b && b !== '無特殊效果');
    document.getElementById('curTitleName').innerText = TITLE_DATA[currentTitleLevel].name;
    document.getElementById('curTitleDesc').innerText = buffs.length ? '✅ ' + buffs.join(' 、 ') : '無特殊效果';
}

function initChart() {
    chart = new Chart(document.getElementById('mainChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: Array(25).fill(''),
            datasets: [{
                data: priceHistories[curIdx],
                borderColor: STOCKS[curIdx].color,
                borderWidth: 3, pointRadius: 0, tension: 0.3, fill: false,
            }],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: false },
            scales: { x: { display: false }, y: { position: 'right', ticks: { font: { size: 11 } } } },
        },
    });
}

function setTradeAmt(m) {
    document.getElementById('tradeAmt').value = m === 'max_buy'
        ? Math.floor(cash / (getCurrentPrice() * 1.002))
        : holdings[curIdx];
}

function toggleAISidebar() {
    const sidebar = document.getElementById('aiSidebar');
    const btn     = document.getElementById('aiToggleBtn');
    sidebar.classList.toggle('open');
    btn.classList.toggle('open');
    btn.innerText = sidebar.classList.contains('open') ? '▶ 收起' : '🤖對手資訊';
}
