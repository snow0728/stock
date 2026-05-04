function trade(type) {
    const s = STOCKS[curIdx], p = priceHistories[curIdx][priceHistories[curIdx].length-1];
    let qty = parseInt(document.getElementById('tradeAmt').value) || 0;
    
    // 量化機器人減免手續費
    let botDiscount = inventory.includes('trading_bot') ? 0.5 : 1.0;
    let buyFee = (s.type==='crypto'?0.001:0.001425) * (currentTitleLevel >= 1 ? 0.5 : 1) * botDiscount;
    let sellTax = (s.type==='crypto'?0:0.003) * (currentTitleLevel >= 5 ? 0 : 1);

    if(type==='buy') {
        let cost = p * (1+buyFee) * qty;
        if(cash < cost) { msg("❌ 錢不夠喔！", '#e74c3c'); return; }
        cash -= cost; holdings[curIdx] += qty; totalCosts[curIdx] += cost;
    } else {
        qty = Math.min(qty, holdings[curIdx]);
        if(qty <= 0) return;
        let rev = p * (1-buyFee-sellTax) * qty;
        let avg = totalCosts[curIdx] / holdings[curIdx];
        totalCosts[curIdx] -= avg * qty; holdings[curIdx] -= qty; cash += rev;
    }
    updateUI();
}

function bankOp(type) {
    let amt = parseInt(document.getElementById('bankAmt').value) || 0;
    if(type==='in' && cash>=amt) { cash-=amt; bank+=amt; }
    else if(type==='out' && bank>=amt) { bank-=amt; cash+=amt; }
    updateUI();
}

function loanOp(type) {
    let amt = parseInt(document.getElementById('loanAmt').value) || 0;
    if(type==='borrow') {
        let maxL = getGrossAssets() * 0.5;
        if(loan+amt > maxL) { msg(`❌ 銀行不借你那麼多錢！`, '#e74c3c'); return; }
        loan+=amt; cash+=amt;
    } else {
        let pay = Math.min(amt, loan, cash); cash-=pay; loan-=pay;
    }
    updateUI();
}

function fundOp(type) {
    let amt = parseInt(document.getElementById('fundAmt').value) || 0;
    let fee = (currentTitleLevel >= 4 ? 0 : 0.01);
    if(type==='in') {
        let c = amt * (1+fee); if(c > cash) { amt = cash/(1+fee); c = cash; }
        cash-=c; fundUnits += amt/fundNAV;
    } else {
        let u = Math.min(amt/fundNAV, fundUnits);
        if(amt >= fundUnits*fundNAV) { u = fundUnits; amt = u*fundNAV; msg(`⚠️ 全數贖回`, '#f39c12'); }
        fundUnits -= u; cash += amt;
    }
    updateUI();
}

function buyInsurance() {
    if (insuranceTurns > 0) {
        msg("⚠️ 已經有保險了，等這期結束再買吧！", '#f39c12'); return;
    }
    
    let riskPremium = fearGreedIndex < 40 ? 0.02 : 0.01; 
    let cost = Math.max(500, Math.floor(getTotalAssets() * riskPremium)); 
    let recurring = Math.max(50, Math.floor(getTotalAssets() * 0.002)); 
    
    if (cash >= cost) {
        cash -= cost;
        insurancePremium = recurring;
        insuranceTurns = 5;
        showToast(`🛡️ 購買成功！(首期 $${cost.toLocaleString()}，每期扣除 $${recurring.toLocaleString()})`, '#3498db');
        updateUI();
    } else {
        msg("❌ 現金不夠付保險費！", '#e74c3c');
    }
}

function buyTitle() {
    let n = currentTitleLevel + 1;
    if(n < TITLE_DATA.length && cash >= TITLE_DATA[n].cost && getTotalAssets() >= TITLE_DATA[n].threshold) {
        cash -= TITLE_DATA[n].cost; currentTitleLevel = n; updateUI();
        msg(`🎊 恭喜！你升級為【${TITLE_DATA[n].name}】`, '#f1c40f');
    } else {
        msg("❌ 升級需要的錢或總資產還不夠喔！", '#e74c3c');
    }
}

// === 商店系統 ===
function buyItem(id) {
    const item = SHOP_ITEMS.find(i => i.id === id);
    if (!item) return;
    if (cash < item.price) { msg("❌ 現金不夠購買此道具！", "#e74c3c"); return; }
    
    cash -= item.price;
    inventory.push(id);
    msg(`✅ 成功購買道具：${item.name}`, "#27ae60");
    renderShop();
    updateUI();
}

// === 一番賞抽獎系統 ===
function initKuji() {
    kujiPool = [];
    KUJI_PRIZES.forEach(p => {
        for(let i=0; i<p.count; i++) kujiPool.push(p.grade);
    });
    // Shuffle
    for (let i = kujiPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [kujiPool[i], kujiPool[j]] = [kujiPool[j], kujiPool[i]];
    }
}

function drawKuji() {
    if (cash < kujiPrice) { msg("❌ 抽一次要 $1,000 哦！快去賺錢吧！", "#e74c3c"); return; }
    if (kujiPool.length === 0) { msg("⚠️ 獎池已空，請點擊下方按鈕重置！"); return; }
    
    cash -= kujiPrice;
    const grade = kujiPool.pop();
    const prize = KUJI_PRIZES.find(p => p.grade === grade);
    
    if (grade === 'D') {
        cash += prize.rewardValue;
        showToast(`🧧 抽到了 ${prize.name}！獲得 $${prize.rewardValue}`, "#f1c40f");
    } else {
        myCollections.push(prize);
        showToast(`🎊 太幸運了！抽中了 ${prize.grade}賞：${prize.name}！`, "#e67e22");
    }
    
    renderKuji();
    updateUI();
}

function resetKuji() {
    if (!confirm("確定要花費 $5,000 重置獎池嗎？(已獲得的收藏品會保留)")) return;
    if (cash < 5000) { msg("❌ 你的錢不夠重置獎池喔...", "#e74c3c"); return; }
    cash -= 5000;
    initKuji();
    msg("🔄 獎池已重置！快來試試手氣吧！", "#2ecc71");
    renderKuji();
    updateUI();
}

// === 盲盒打工小遊戲系統 ===
let boxOpened = false;
let boxRewards = [0, 0, 0];

function openWorkMiniGame() {
    if (hasWorkedThisTurn) {
        msg("❌ 這回合已經打過工了，請點擊「下一回合」再試！", '#e74c3c'); return;
    }
    
    boxOpened = false; 
    document.getElementById('workModal').style.display = 'flex';
    document.getElementById('workResult').style.display = 'none';
    document.getElementById('workTime').innerText = "選擇一個盲盒，看看這次打工賺多少！";
    
    // 大賞顯卡加成
    let gpuBonus = myCollections.filter(c => c.grade === 'B').length * 0.5;
    
    for(let i=0; i<3; i++) {
        let baseR = Math.floor(Math.random() * 401) + 100;
        boxRewards[i] = Math.floor(baseR * (1 + gpuBonus));
    }
    
    for(let i=0; i<3; i++) {
        let b = document.getElementById('box'+i);
        b.className = 'mystery-box';
        b.innerHTML = `📦<br>盲盒 ${i+1}`;
        b.style.background = "#8e44ad"; 
        b.style.transform = "none";
    }
}

function selectBox(idx) {
    if (boxOpened) return; 
    
    boxOpened = true; 
    let reward = boxRewards[idx];
    
    for(let i=0; i<3; i++) {
        let b = document.getElementById('box'+i);
        if(i === idx) {
            b.className = 'mystery-box active';
            b.innerHTML = `💰<br>$${boxRewards[i]}`;
            b.style.background = "#27ae60";
        } else {
            b.className = 'mystery-box disabled';
            b.innerHTML = `💸<br>$${boxRewards[i]}`;
        }
    }
    
    document.getElementById('workTime').innerText = "打工結算！其他盲盒的金額也揭曉囉！";
    document.getElementById('workResultText').innerText = `你打開了盲盒 ${idx+1}，獲得了辛苦錢 $${reward.toLocaleString()}！`;
    document.getElementById('workResult').style.display = 'block';
    
    cash += reward;
    hasWorkedThisTurn = true;
    updateUI();
}

function closeWork() {
    document.getElementById('workModal').style.display = 'none';
}
