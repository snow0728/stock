function trade(type) {
    const s = STOCKS[curIdx];
    const p = getCurrentPrice();
    let qty = parseInt(document.getElementById('tradeAmt').value) || 0;

    const feeRate = (s.type === 'crypto' ? CRYPTO_FEE : STOCK_BUY_FEE) * (currentTitleLevel >= 1 ? 0.5 : 1);
    const sellTax = (s.type === 'crypto' || currentTitleLevel >= 5 || hasItem(ITEM_IDS.vip)) ? 0 : STOCK_SELL_TAX;

    if (type === 'buy') {
        const cost = p * (1 + feeRate) * qty;
        if (cash < cost) { msg('❌ 錢不夠喔！', '#e74c3c'); return; }
        cash -= cost;
        holdings[curIdx] += qty;
        totalCosts[curIdx] += cost;
        const impact = applyTradePriceImpact(curIdx, 'buy', qty);
        msg(`📈 你的買入讓 ${getStockShortName(curIdx)} 價格上升 ${formatImpactPercent(impact)}`, '#e74c3c');
        reactToPlayerTrade(curIdx, 'buy', qty);
    } else {
        qty = Math.min(qty, holdings[curIdx]);
        if (qty <= 0) return;
        const rev = p * (1 - feeRate - sellTax) * qty;
        const avg = totalCosts[curIdx] / holdings[curIdx];
        totalCosts[curIdx] -= avg * qty;
        holdings[curIdx] -= qty;
        cash += rev;
        if (holdings[curIdx] === 0) totalCosts[curIdx] = 0;
        const impact = applyTradePriceImpact(curIdx, 'sell', qty);
        msg(`📉 你的賣出讓 ${getStockShortName(curIdx)} 價格下降 ${(Math.abs(impact) * 100).toFixed(2)}%`, '#38ada9');
        reactToPlayerTrade(curIdx, 'sell', qty);
    }
    updateUI();
}

function bankOp(type) {
    const amt = parseInt(document.getElementById('bankAmt').value) || 0;
    if (amt <= 0) return;

    if (type === 'in') {
        if (cash < amt) { msg('❌ 手邊現金不足！', '#e74c3c'); return; }
        cash -= amt; bank += amt;
        msg(`🏦 成功存入 $${amt.toLocaleString()}`);
    } else if (type === 'out') {
        if (bank < amt) { msg('❌ 銀行存款不足！請另外申請借貸。', '#e74c3c'); return; }
        bank -= amt; cash += amt;
        msg(`🏦 從存款提取 $${amt.toLocaleString()}`);
    } else if (type === 'borrow') {
        const limit = hasItem(ITEM_IDS.vip) ? 0.8 : 0.5;
        if (loan + amt > getGrossAssets() * limit) {
            msg(`❌ 借貸額度已滿 (上限為總資產${limit * 100}%)！`, '#e74c3c');
            return;
        }
        loan += amt; cash += amt;
        msg(`⚠️ 成功向銀行借貸 $${amt.toLocaleString()}`, '#f39c12');
    }
    document.getElementById('bankAmt').value = '';
    updateUI();
}

function quickBank(type) {
    const input = document.getElementById('bankAmt');
    if (type === 'half')      { input.value = Math.floor(cash / 2); return; }
    if (type === 'all')       { input.value = Math.floor(cash);     return; }
    if (type === 'clearLoan') {
        if (loan <= 0) { msg('😊 您目前沒有任何債務。'); return; }
        const payAmt = Math.min(cash + bank, loan);
        if (payAmt <= 0) { msg('❌ 餘額不足以還款！', '#e74c3c'); return; }
        if (cash >= payAmt) {
            cash -= payAmt;
        } else {
            bank -= payAmt - cash;
            cash = 0;
        }
        loan -= payAmt;
        msg(`✅ 已優先償還債務 $${payAmt.toLocaleString()}`);
        updateUI();
    }
}

function fundOp(type) {
    let amt = parseInt(document.getElementById('fundAmt').value) || 0;
    const fee = currentTitleLevel >= 4 ? 0 : 0.01;

    if (type === 'in') {
        let cost = amt * (1 + fee);
        if (cost > cash) { amt = cash / (1 + fee); cost = cash; }
        if (amt <= 0) return;
        cash -= cost;
        fundUnits += amt / fundNAV;
        fundTotalCost += amt;
        msg(`✅ 申購基金 $${Math.floor(amt).toLocaleString()}`);
    } else {
        const maxAmt = fundUnits * fundNAV;
        if (amt >= maxAmt) { amt = maxAmt; msg('⚠️ 全數贖回'); }
        else msg(`✅ 贖回基金 $${Math.floor(amt).toLocaleString()}`);
        const u = amt / fundNAV;
        if (u <= 0) return;
        fundTotalCost = Math.max(0, fundTotalCost * (1 - u / fundUnits));
        fundUnits -= u;
        if (fundUnits < 0.0001) { fundUnits = 0; fundTotalCost = 0; }
        cash += amt;
    }
    updateUI();
}

function buyInsurance() {
    if (insuranceTurns > 0) { msg('⚠️ 已經有保險了，等這期結束再買吧！'); return; }
    if (cash < 500) { msg('❌ 現金不夠付保險開辦費！', '#e74c3c'); return; }
    cash -= 500;
    insuranceTurns = GAME_SETTINGS.insuranceTurns;
    showToast('🛡️ 成功投保！扣除開辦費 $500。', '#3498db');
    updateUI();
}

function buyTitle() {
    const n = currentTitleLevel + 1;
    if (n < TITLE_DATA.length && cash >= TITLE_DATA[n].cost) {
        cash -= TITLE_DATA[n].cost;
        currentTitleLevel = n;
        updateUI();
        showToast(`🎊 恭喜！你升級為【${TITLE_DATA[n].name}】`, '#f1c40f');
    } else {
        msg('❌ 升級需要的錢還不夠喔！');
    }
}

function buyShopItem(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    const actualCost = getDiscountedItemCost(item);

    if (item.type === 'consumable' && loan > 0) {
        msg('❌ 身上還有銀行貸款未還清，無法購買消耗品！', '#e74c3c');
        return;
    }

    const isStackable = [ITEM_IDS.voucherPersonal, ITEM_IDS.voucherClass, ITEM_IDS.redCard, ITEM_IDS.greenCard].includes(itemId);

    if (isStackable) {
        if (itemId === ITEM_IDS.redCard) {
            if (redCardCount >= 1) { msg('❌ 紅卡最多只能同時持有一張！', '#e74c3c'); return; }
            if (redCardCooldown > 0) { msg(`⏳ 紅卡還在冷卻中！剩餘 ${redCardCooldown} 回合`, '#f39c12'); return; }
        } else if (itemId === ITEM_IDS.greenCard) {
            if (greenCardCount >= 1) { msg('❌ 綠卡最多只能同時持有一張！', '#e74c3c'); return; }
            if (greenCardCooldown > 0) { msg(`⏳ 綠卡還在冷卻中！剩餘 ${greenCardCooldown} 回合`, '#f39c12'); return; }
        }
        if (cash < actualCost) { msg('❌ 口袋現金不足以購買！', '#e74c3c'); return; }
        cash -= actualCost;
        if      (itemId === ITEM_IDS.voucherPersonal) voucher1Count++;
        else if (itemId === ITEM_IDS.voucherClass)    voucher2Count++;
        else if (itemId === ITEM_IDS.redCard)   { redCardCount++;   redCardCooldown   = GAME_SETTINGS.cardCooldownTurns; }
        else if (itemId === ITEM_IDS.greenCard) { greenCardCount++; greenCardCooldown = GAME_SETTINGS.cardCooldownTurns; }
        showToast(`✅ 購買成功：${item.name}！`, '#27ae60');
        updateUI();
        if (typeof renderShop === 'function') renderShop();
        return;
    }

    if (item.type === 'buff') {
        if (hasItem(itemId)) { msg('⚠️ 已經擁有這個道具囉！', '#f39c12'); return; }
        if (cash < actualCost) { msg('❌ 口袋現金不足以購買此道具！', '#e74c3c'); return; }
        cash -= actualCost;
        ownedItems.push(itemId);
        showToast(`🛍️ 成功購買道具：${item.name}！`, '#2ecc71');
        updateUI();
        return;
    }

    if (itemId === ITEM_IDS.scratch) {
        if (scratchTicketsLeft <= 0) { msg('⏳ 這批刮刮樂已經賣完囉，請等下一次補貨！', '#f39c12'); return; }
        if (cash < actualCost) { msg('❌ 口袋現金不足以購買刮刮樂！', '#e74c3c'); return; }
        cash -= actualCost;
        scratchTicketsLeft--;

        const roll = Math.random();
        let winAmt, msgText, color;
        if      (roll < 0.005) { winAmt = 3000; msgText = '🎉 太神啦！刮中特獎 $3,000！';  color = '#e74c3c'; }
        else if (roll < 0.035) { winAmt = 1000; msgText = '✨ 恭喜！刮中頭獎 $1,000！';    color = '#e67e22'; }
        else if (roll < 0.135) { winAmt = 500;  msgText = '💎 運氣不錯！刮中貳獎 $500！';  color = '#f1c40f'; }
        else if (roll < 0.385) { winAmt = 200;  msgText = '💰 刮中參獎 $200！';             color = '#2ecc71'; }
        else                   { winAmt = 100;  msgText = '🧧 普獎 $100，再接再厲！';       color = '#95a5a6'; }

        cash += winAmt;
        showToast(msgText, color);
        updateUI();
    }
}

let boxOpened = false;
let boxRewards = [0, 0, 0];

function openWorkModal() {
    if (isPaused)          { msg('⏸️ 遊戲暫停中，無法打工喔！', '#f39c12'); return; }
    if (hasWorkedThisTurn) { msg('⚠️ 現在是休息時間！請等冷卻完畢。', '#f39c12'); return; }
    boxOpened = false;
    document.getElementById('workModal').style.display = 'flex';
    document.getElementById('workResult').style.display = 'none';
    document.getElementById('workTime').innerText = '選擇一個盲盒，看看這次打工賺多少！';

    const scale = Math.max(1, Math.ceil(getGrossAssets() / 50000));
    const hasLuck = hasItem(ITEM_IDS.luck);
    for (let i = 0; i < 3; i++) {
        boxRewards[i] = hasLuck
            ? (Math.floor(Math.random() * 201) + 400) * scale
            : (Math.floor(Math.random() * 401) + 100) * scale;
        const b = document.getElementById('box' + i);
        b.className = 'mystery-box';
        b.innerHTML = `📦<br>盲盒 ${i + 1}`;
        b.style.background = '#8e44ad';
        b.style.transform = 'none';
    }
}

function selectBox(idx) {
    if (boxOpened) return;
    boxOpened = true;
    hasWorkedThisTurn = true;

    for (let i = 0; i < 3; i++) {
        const b = document.getElementById('box' + i);
        if (i === idx) {
            b.className = 'mystery-box active';
            b.innerHTML = `💰<br>$${boxRewards[i].toLocaleString()}`;
            b.style.background = '#27ae60';
        } else {
            b.className = 'mystery-box disabled';
            b.innerHTML = `💸<br>$${boxRewards[i].toLocaleString()}`;
            b.style.background = '#95a5a6';
        }
    }

    document.getElementById('workTime').innerText = '打工結束！';
    document.getElementById('workResultText').innerText = `🎉 恭喜獲得打工薪水 $${boxRewards[idx].toLocaleString()}！`;
    document.getElementById('workResult').style.display = 'block';
    cash += boxRewards[idx];
    updateUI();
}

function closeWorkModal() {
    document.getElementById('workModal').style.display = 'none';
}

// ── Divination mini-game ──────────────────────────────────

function createDivinationGrid() {
    const grid = document.getElementById('divinationGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'div-cell';
        cell.onclick = () => revealDivination(i);
        grid.appendChild(cell);
    }
}

function startDivination() {
    if (divinationPlaysLeft <= 0) {
        msg('⏳ 本期占卜次數已耗盡，請等待命運之輪重新轉動 (每3回合)！', '#e74c3c');
        return;
    }
    const fee = parseInt(document.getElementById('divinationEntryFee').value) || 0;
    if (fee < GAME_SETTINGS.divinationMinBet) return msg(`❌ 投注金額至少需 ${formatMoney(GAME_SETTINGS.divinationMinBet)}！`, '#e74c3c');
    if (fee > GAME_SETTINGS.divinationMaxBet) return msg(`❌ 投注金額上限為 ${formatMoney(GAME_SETTINGS.divinationMaxBet)}！`, '#e74c3c');
    if (cash < fee) return msg('❌ 手邊現金不足！', '#e74c3c');

    cash -= fee;
    divinationPlaysLeft--;
    divinationEntryFee = fee;
    isDivinationActive = true;
    divinationRevealedCount = 0;
    divinationCurrentMulti = 1.0;
    divinationMines = [];
    while (divinationMines.length < 3) {
        const r = Math.floor(Math.random() * 9);
        if (!divinationMines.includes(r)) divinationMines.push(r);
    }

    createDivinationGrid();
    document.getElementById('startDivBtn').style.display = 'none';
    document.getElementById('divinationEntryFee').disabled = true;
    const cb = document.getElementById('cashoutDivBtn');
    cb.style.display = 'block';
    cb.disabled = true;
    document.getElementById('divCurrentWin').innerText = '連結中...';
    document.getElementById('divCurrentWin').style.color = 'var(--title-gold)';
    updateDivinationDisplay();
    updateUI();
}

function revealDivination(idx) {
    if (!isDivinationActive) return;
    const cells = document.querySelectorAll('.div-cell');
    if (cells[idx].classList.contains('revealed')) return;
    cells[idx].classList.add('revealed');
    cells[idx].innerHTML = '';

    if (divinationMines.includes(idx)) {
        endDivination(false, idx);
    } else {
        divinationRevealedCount++;
        const stepProb = (9 - (divinationRevealedCount - 1) - 3) / (9 - (divinationRevealedCount - 1));
        divinationCurrentMulti *= (1 / stepProb) * Math.pow(DIVINATION_RTP, 1 / 6);
        cells[idx].classList.add('treasure');
        cells[idx].innerHTML = '<span style="font-size:30px">☀️</span><div class="card-label">太陽</div>';
        document.getElementById('cashoutDivBtn').disabled = false;
        updateDivinationDisplay();
        if (divinationRevealedCount === 6) endDivination(true);
    }
}

function updateDivinationDisplay() {
    const win = Math.floor(divinationEntryFee * divinationCurrentMulti);
    document.getElementById('divCurrentWin').innerText = `金錢回饋: $${win}`;
    document.getElementById('cashoutDivBtn').innerText = `收回金錢 $${win}`;
    document.getElementById('divPlaysLeft').innerText = divinationPlaysLeft;
    if (divinationRevealedCount < 6) {
        const nextProb = (9 - divinationRevealedCount - 3) / (9 - divinationRevealedCount);
        const nextMulti = divinationCurrentMulti * (1 / nextProb) * Math.pow(DIVINATION_RTP, 1 / 6);
        document.getElementById('divNextMulti').innerText = `下一張牌預兆: x${nextMulti.toFixed(2)}`;
    } else {
        document.getElementById('divNextMulti').innerText = `已洞悉所有未來 (最高倍率: x${divinationCurrentMulti.toFixed(2)})`;
    }
}

function cashOutDivination() {
    if (!isDivinationActive) return;
    const win = Math.floor(divinationEntryFee * divinationCurrentMulti);
    cash += win;
    msg(`✨ 儀式平安終結，獲得 $${win.toLocaleString()}`, '#fbc531');
    endDivination(true, true);
    updateUI();
}

function endDivination(isWin, alreadyPaid = false) {
    isDivinationActive = false;
    const cells = document.querySelectorAll('.div-cell');
    divinationMines.forEach(m => {
        if (cells[m]) {
            cells[m].classList.add('revealed', 'mine');
            cells[m].innerHTML = '<span style="font-size:30px">☁️</span><div class="card-label">烏雲</div>';
        }
    });

    const statusEl = document.getElementById('divCurrentWin');
    if (!isWin) {
        statusEl.innerText = '⚡ 遇到烏雲，本次挑戰結束';
        statusEl.style.color = '#ff4757';
        msg('☁️ 抽中烏雲，投入的資金消散了...', '#ff4757');
    } else if (divinationRevealedCount === 6) {
        statusEl.innerText = '🌟 命運主宰者';
        statusEl.style.color = '#4cd137';
        if (!alreadyPaid) {
            const win = Math.floor(divinationEntryFee * divinationCurrentMulti);
            cash += win;
            msg(`🌟 達成命運主宰者！自動獲得最高獎金 $${win.toLocaleString()}！`, '#f1c40f');
            updateUI();
        }
    } else {
        statusEl.innerText = '🕯️ 儀式已平安終結';
        statusEl.style.color = '#4cd137';
    }

    document.getElementById('startDivBtn').style.display = 'block';
    document.getElementById('cashoutDivBtn').style.display = 'none';
    document.getElementById('divinationEntryFee').disabled = false;
}

// ── Card usage ────────────────────────────────────────────

function applyCard(type) {
    if (type === 'red') {
        if (redCardCount <= 0)            { msg('❌ 你沒有上漲紅卡！', '#e74c3c'); return; }
        if (activeRedCardStock === curIdx) { msg('⚠️ 這支股票已經使用了紅卡！', '#f39c12'); return; }
        if (activeGreenCardStock === curIdx) { msg('⚠️ 這支股票已經使用綠卡，不能同時使用紅卡！', '#f39c12'); return; }
        redCardCount--;
        activeRedCardStock = curIdx;
        msg(`🟥 已對 ${STOCKS[curIdx].name} 使用上漲紅卡！下回合必定上漲！`, '#e74c3c');
    } else {
        if (greenCardCount <= 0)             { msg('❌ 你沒有下跌綠卡！', '#e74c3c'); return; }
        if (activeGreenCardStock === curIdx) { msg('⚠️ 這支股票已經使用了綠卡！', '#f39c12'); return; }
        if (activeRedCardStock === curIdx)   { msg('⚠️ 這支股票已經使用紅卡，不能同時使用綠卡！', '#f39c12'); return; }
        greenCardCount--;
        activeGreenCardStock = curIdx;
        msg(`🟩 已對 ${STOCKS[curIdx].name} 使用下跌綠卡！下回合必定下跌！`, '#27ae60');
    }
    if (typeof renderShop === 'function' && document.getElementById('shopTab').style.display === 'block') {
        renderShop();
    }
}
