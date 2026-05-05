function trade(type) {
    const s = STOCKS[curIdx], p = priceHistories[curIdx][priceHistories[curIdx].length-1];
    let qty = parseInt(document.getElementById('tradeAmt').value) || 0;
    
    let buyFee = (s.type==='crypto'?0.001:0.001425) * (currentTitleLevel >= 1 ? 0.5 : 1);
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
        msg(`✅ 成功借款 $${amt.toLocaleString()}`);
    } else {
        let maxCanRepay = cash + bank;
        let repay = Math.min(amt, loan, maxCanRepay);
        if (repay > 0) {
            if (cash >= repay) {
                cash -= repay;
            } else {
                let fromBank = repay - cash;
                cash = 0;
                bank -= fromBank;
            }
            loan -= repay;
            msg(`✅ 成功還款 $${repay.toLocaleString()}`, '#27ae60');
        } else {
            if (loan <= 0) msg(`✅ 目前沒有欠款！`);
            else msg(`❌ 現金與存款不足！`, '#e74c3c');
        }
    }
    updateUI();
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

let boxOpened = false;
let boxRewards = [0, 0, 0];

function openWorkModal() {
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