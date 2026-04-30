function trade(type) {
    const s = STOCKS[curIdx];
    const p = priceHistories[curIdx][priceHistories[curIdx].length - 1];
    let qty = parseInt(document.getElementById('tradeAmt').value);
    if (isNaN(qty) || qty <= 0) return;
    const feeRate = (s.type === 'crypto') ? CRYPTO_FEE : STOCK_BUY_FEE;
    const taxRate = (s.type === 'crypto') ? 0 : STOCK_SELL_TAX;

    if (type === 'buy') {
        const totalCost = p * (1 + feeRate) * qty;
        if (cash < totalCost) { msg("❌ 現金不足！"); return; }
        cash -= totalCost; holdings[curIdx] += qty; totalCosts[curIdx] += totalCost;
        msg(`✅ 買進 ${qty} 單位 ${s.name}`);
    } else if (type === 'sell') {
        if (holdings[curIdx] < qty) qty = holdings[curIdx];
        if (qty <= 0) { msg("❌ 庫存不足！"); return; }
        const revenue = p * (1 - feeRate - taxRate) * qty;
        const avgCost = totalCosts[curIdx] / holdings[curIdx];
        totalCosts[curIdx] -= avgCost * qty;
        cash += revenue; holdings[curIdx] -= qty;
        if (holdings[curIdx] === 0) totalCosts[curIdx] = 0;
        msg(`✅ 賣出 ${qty} 單位 ${s.name}`);
    }
    updateUI();
}

function bankOp(type) {
    const amt = parseInt(document.getElementById('bankAmt').value);
    if (isNaN(amt) || amt <= 0) return;
    if (type === 'in' && cash >= amt) { cash -= amt; bank += amt; }
    else if (type === 'out' && bank >= amt) { bank -= amt; cash += amt; }
    updateUI();
}

function fundOp(type) {
    let amt = parseInt(document.getElementById('fundAmt').value);
    if (isNaN(amt) || amt <= 0) return;

    if (type === 'in') {
        let costWithFee = amt * (1 + FUND_FEE);
        if (costWithFee > cash) {
            amt = cash / (1 + FUND_FEE); 
            costWithFee = cash;          
            msg("⚠️ 現金不足，已為您全數買入！");
        }
        if (cash >= costWithFee && amt > 0) {
            cash -= costWithFee;
            fundUnits += amt / fundNAV;
            msg(`✅ 成功申購基金 $${amt.toFixed(0)}`);
        }
    } else if (type === 'out') {
        const neededUnits = amt / fundNAV;
        if (fundUnits >= neededUnits) {
            fundUnits -= neededUnits;
            cash += amt;
            msg(`✅ 成功贖回基金 $${amt.toFixed(0)}`);
        } else { msg("❌ 持有基金份額不足！"); }
    }
    updateUI();
}

function checkTitleProgress(totalAssets) {
    const nextLevel = currentTitleLevel + 1;
    if (nextLevel < TITLE_DATA.length) {
        const nextData = TITLE_DATA[nextLevel];
        const prevThreshold = TITLE_DATA[currentTitleLevel].threshold;
        const range = nextData.threshold - prevThreshold;
        const progress = Math.min(100, Math.max(0, ((totalAssets - prevThreshold) / range) * 100));
        
        document.getElementById('titleBar').style.width = `${progress}%`;
        document.getElementById('nextTitleText').innerText = `下一階：${nextData.name} ($${nextData.threshold.toLocaleString()})`;
        
        const btn = document.getElementById('upgradeTitleBtn');
        btn.style.display = totalAssets >= nextData.threshold ? 'block' : 'none';
        btn.innerText = `花費 $${nextData.cost} 升級`;
    } else {
        document.getElementById('titleBar').style.width = '100%';
        document.getElementById('nextTitleText').innerText = "已達最高階：股神";
        document.getElementById('upgradeTitleBtn').style.display = 'none';
    }

    let allBuffs = [];
    for (let i = 0; i <= currentTitleLevel; i++) {
        if (TITLE_DATA[i].buff !== "無特殊效果") allBuffs.push(TITLE_DATA[i].buff);
    }
    document.getElementById('curTitleName').innerText = TITLE_DATA[currentTitleLevel].name;
    document.getElementById('curTitleDesc').innerHTML = allBuffs.length > 0 
        ? `<span style="color:var(--title-gold)">已啟動：</span>` + allBuffs.join(" | ") 
        : "目前尚無加成效果";
}

function buyTitle() {
    const nextLevel = currentTitleLevel + 1;
    const cost = TITLE_DATA[nextLevel].cost;
    if (cash >= cost) {
        cash -= cost;
        currentTitleLevel = nextLevel;
        applyBuffs(currentTitleLevel); 
        msg(`🎊 成功晉升為 【${TITLE_DATA[currentTitleLevel].name}】！`);
        updateUI();
    } else { msg("❌ 現金不足，無法支付升級手續費！"); }
}

function applyBuffs(level) {
    BANK_RATE = 0.01; STOCK_BUY_FEE = 0.001425; STOCK_SELL_TAX = 0.003; CRYPTO_FEE = 0.001; TRUTH_RATE = 0.75; FUND_MGMT_FEE = 0.0001;
    if (level >= 1) BANK_RATE = 0.015;
    if (level >= 2) STOCK_BUY_FEE *= 0.9;
    if (level >= 3) TRUTH_RATE = 0.90;
    if (level >= 4) { FUND_MGMT_FEE = 0.00005; FUND_FEE = 0; }
    if (level >= 5) STOCK_SELL_TAX = 0.0015;
    if (level >= 6) CRYPTO_FEE *= 0.85;
    if (level >= 10) { STOCK_BUY_FEE = 0; STOCK_SELL_TAX = 0; CRYPTO_FEE = 0; BANK_RATE = 0.03; }
}