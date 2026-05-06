function trade(type) {
    const s = STOCKS[curIdx], p = priceHistories[curIdx][priceHistories[curIdx].length-1];
    let qty = parseInt(document.getElementById('tradeAmt').value) || 0;
    
    let buyFee = (s.type==='crypto'?0.001:0.001425) * (currentTitleLevel >= 1 ? 0.5 : 1);
    let sellTax = (s.type==='crypto'?0:0.003) * (currentTitleLevel >= 5 ? 0 : 1);

    if(hasItem("item_vip")) sellTax = 0;

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
    if(amt <= 0) return;
    
    if(type==='in') {
        if(cash >= amt) { 
            cash -= amt; 
            bank += amt; 
            msg(`🏦 成功存入 $${amt.toLocaleString()}`);
        } else {
            msg("❌ 手邊現金不足！", "#e74c3c");
        }
    } else if(type==='out') {
        if(bank >= amt) { 
            bank -= amt; 
            cash += amt; 
            msg(`🏦 從存款提取 $${amt.toLocaleString()}`);
        } else {
            msg("❌ 銀行存款不足！請另外申請借貸。", "#e74c3c");
        }
    } else if(type==='borrow') {
        let borrowLimit = hasItem("item_vip") ? 0.8 : 0.5;
        let canBorrow = getGrossAssets() * borrowLimit;
        if(loan + amt <= canBorrow) {
            loan += amt;
            cash += amt;
            msg(`⚠️ 成功向銀行借貸 $${amt.toLocaleString()}`, "#f39c12");
        } else {
            msg(`❌ 借貸額度已滿 (上限為總資產${borrowLimit*100}%)！`, "#e74c3c");
        }
    }
    document.getElementById('bankAmt').value = "";
    updateUI();
}

function quickBank(type) {
    let input = document.getElementById('bankAmt');
    if(type === 'half') {
        input.value = Math.floor(cash / 2);
    } else if(type === 'all') {
        input.value = Math.floor(cash);
    } else if(type === 'clearLoan') {
        if(loan <= 0) { msg("😊 您目前沒有任何債務。"); return; }
        let maxCanRepay = cash + bank;
        let payAmt = Math.min(maxCanRepay, loan);
        
        if (payAmt > 0) {
            if (cash >= payAmt) {
                cash -= payAmt;
            } else {
                let fromBank = payAmt - cash;
                cash = 0;
                bank -= fromBank;
            }
            loan -= payAmt;
            msg(`✅ 已優先償還債務 $${payAmt.toLocaleString()}`);
        } else {
            msg("❌ 餘額不足以還款！", "#e74c3c");
        }
        updateUI();
    }
}

function fundOp(type) {
    let amt = parseInt(document.getElementById('fundAmt').value) || 0;
    let fee = (currentTitleLevel >= 4 ? 0 : 0.01);
    if(type==='in') {
        let c = amt * (1+fee); 
        if(c > cash) { 
            amt = cash / (1+fee); 
            c = cash; 
        }
        if (amt <= 0) return;
        cash -= c; 
        fundUnits += (amt / fundNAV);
        fundTotalCost += amt;
        msg(`✅ 申購基金 $${Math.floor(amt).toLocaleString()}`);
    } else {
        let maxAmt = fundUnits * fundNAV;
        if (amt >= maxAmt) {
            amt = maxAmt;
            msg(`⚠️ 全數贖回`);
        } else {
            msg(`✅ 贖回基金 $${Math.floor(amt).toLocaleString()}`);
        }
        
        let u = amt / fundNAV;
        if (u <= 0) return;
        
        let costRatio = u / fundUnits;
        fundTotalCost -= (fundTotalCost * costRatio);
        if (fundTotalCost < 0) fundTotalCost = 0;
        
        fundUnits -= u; 
        if (fundUnits < 0.0001) {
            fundUnits = 0;
            fundTotalCost = 0;
        }
        
        cash += amt;
    }
    updateUI();
}

function buyInsurance() {
    if (insuranceTurns > 0) {
        msg("⚠️ 已經有保險了，等這期結束再買吧！"); return;
    }
    let setupFee = 500; 
    if (cash >= setupFee) {
        cash -= setupFee;
        insuranceTurns = 15;
        showToast(`🛡️ 成功投保！扣除開辦費 $${setupFee}。`, '#3498db');
        updateUI();
    } else {
        msg("❌ 現金不夠付保險開辦費！", '#e74c3c');
    }
}

function buyTitle() {
    let n = currentTitleLevel + 1;
    if(n < TITLE_DATA.length && cash >= TITLE_DATA[n].cost) {
        cash -= TITLE_DATA[n].cost; currentTitleLevel = n; updateUI();
        showToast(`🎊 恭喜！你升級為【${TITLE_DATA[n].name}】`, '#f1c40f');
    } else {
        msg("❌ 升級需要的錢還不夠喔！");
    }
}

function buyShopItem(itemId) {
    let item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;

    // 計算實際花費 (若有折扣)
    let actualCost = item.cost;
    if (currentDiscounts[itemId]) {
        actualCost = Math.floor(item.cost * (1 - currentDiscounts[itemId]));
    }

    if (item.type === 'buff') {
        if (hasItem(itemId)) {
            msg("⚠️ 已經擁有這個道具囉！", "#f39c12");
            return;
        }

        if (cash >= actualCost) {
            cash -= actualCost;
            ownedItems.push(itemId);
            showToast(`🛍️ 成功購買道具：${item.name}！`, '#2ecc71');
            updateUI();
        } else {
            msg("❌ 口袋現金不足以購買此道具！", "#e74c3c");
        }
    } else if (item.id === 'item_scratch') {
        if (scratchTicketsLeft <= 0) {
            msg("⏳ 這批刮刮樂已經賣完囉，請等下一次補貨！", "#f39c12");
            return;
        }
        if (cash >= actualCost) {
            cash -= actualCost;
            scratchTicketsLeft--;
            
            let roll = Math.random();
            let winAmt = 0;
            let msgText = "";
            let color = "";
            
            // 期望值固定 250
            // 3000(0.5%), 1000(3.5%), 500(10%), 200(40%), 100(45%)
            if (roll < 0.005) { 
                winAmt = 3000; 
                msgText = "🎉 太神啦！刮中特獎 $3,000！"; 
                color = "#e74c3c"; 
            } else if (roll < 0.035) { 
                winAmt = 1000; 
                msgText = "✨ 恭喜！刮中頭獎 $1,000！"; 
                color = "#e67e22"; 
            } else if (roll < 0.135) { 
                winAmt = 500; 
                msgText = "💎 運氣不錯！刮中貳獎 $500！"; 
                color = "#f1c40f"; 
            } else if (roll < 0.385) { 
                winAmt = 200; 
                msgText = "💰 刮中參獎 $200！"; 
                color = "#2ecc71"; 
            } else { 
                winAmt = 100; 
                msgText = "🧧 普獎 $100，再接再厲！"; 
                color = "#95a5a6"; 
            }
            
            cash += winAmt;
            showToast(msgText, color);
            updateUI(); 
        } else {
            msg("❌ 口袋現金不足以購買刮刮樂！", "#e74c3c");
        }
    }
}

let boxOpened = false;
let boxRewards = [0, 0, 0];

function openWorkModal() {
    if (isPaused) {
        msg("⏸️ 遊戲暫停中，無法打工喔！", "#f39c12");
        return;
    }
    if (hasWorkedThisTurn) {
        msg("⚠️ 現在是休息時間！請等冷卻完畢。", "#f39c12");
        return;
    }
    boxOpened = false; 
    document.getElementById('workModal').style.display = 'flex';
    document.getElementById('workResult').style.display = 'none';
    document.getElementById('workTime').innerText = "選擇一個盲盒，看看這次打工賺多少！";
    
    let scale = Math.max(1, Math.ceil(getGrossAssets() / 50000));
    for(let i=0; i<3; i++) {
        boxRewards[i] = (Math.floor(Math.random() * 401) + 100) * scale;
        if(hasItem("item_luck")) boxRewards[i] = (Math.floor(Math.random() * 201) + 400) * scale;
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
    hasWorkedThisTurn = true;
    let reward = boxRewards[idx];
    
    for(let i=0; i<3; i++) {
        let b = document.getElementById('box'+i);
        if(i === idx) {
            b.className = 'mystery-box active';
            b.innerHTML = `💰<br>$${boxRewards[i].toLocaleString()}`;
            b.style.background = "#27ae60";
        } else {
            b.className = 'mystery-box disabled';
            b.innerHTML = `💸<br>$${boxRewards[i].toLocaleString()}`;
            b.style.background = "#95a5a6";
        }
    }
    
    document.getElementById('workTime').innerText = "打工結束！";
    document.getElementById('workResultText').innerText = `🎉 恭喜獲得打工薪水 $${reward.toLocaleString()}！`;
    document.getElementById('workResult').style.display = 'block';
    
    cash += reward;
    updateUI();
}

function closeWorkModal() {
    document.getElementById('workModal').style.display = 'none';
}