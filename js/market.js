function applyMarketChanges() {
    turnCount++;
    hasWorkedThisTurn = false; 
    let isDiv = (turnCount % 5 === 0);
    let totalDiv = 0;

    if (insuranceTurns > 0) {
        let p = insurancePremium;
        if (cash >= p) {
            cash -= p;
        } else {
            p -= cash;
            cash = 0;
            if (bank >= p) {
                bank -= p;
            } else {
                p -= bank;
                bank = 0;
                loan += p;
            }
        }
        insuranceTurns--;
    }

    let hasExtreme = currentEvents.some(e => e.isExtreme);
    const marketBias = (Math.random() - 0.48) * 0.015;
    let returns = [];

    let isExtremeDown = currentEvents.some(e => e.isExtreme && e.imp[0] < 1.0);
    if (isExtremeDown && insuranceTurns > 0) {
        let payout = Math.floor(getGrossAssets() * 0.1);
        cash += payout;
        showToast(`🛡️ 股災保險理賠！獲得急難救助金 $${payout.toLocaleString()}`, '#3498db');
    }

    if (taxTurns > 3) {
        let baseLivingCost = 1000 + (currentTitleLevel * 1500); 
        let assetRate = 0.005; 
        
        // 避稅手冊道具減免 15%
        let itemDiscount = inventory.includes('tax_guide') ? 0.85 : 1.0;
        let expectedTotalExpense = (baseLivingCost + (getGrossAssets() * assetRate)) * itemDiscount;
        
        let discount = (currentTitleLevel >= 3 ? 0.7 : 1);
        accumulatedTax += (expectedTotalExpense / 12) * discount;
    }

    STOCKS.forEach((s, i) => {
        const hist = priceHistories[i];
        const last = hist[hist.length - 1];
        const ma = hist.reduce((a, b) => a + b, 0) / hist.length;
        const meanRev = (ma - last) / ma * 0.035;

        let evImp = 1.0;
        currentEvents.forEach(e => { 
            if (e.isExtreme || SPECIAL_EVENTS.includes(e)) {
                evImp *= e.imp[i];
            } else {
                if (Math.random() < TRUTH_RATE) evImp *= e.imp[i]; 
                else if (e.imp[i] !== 1.0) evImp *= (1.0 / e.imp[i]);
            }
        });

        let vola = s.vola * (Math.random() - 0.5) * 2;
        let change = Math.exp(s.drift + meanRev + (marketBias * s.beta) + vola);
        let next = last * change * evImp;

        if(s.type === 'stock' && !hasExtreme) {
            next = Math.max(last*0.9, Math.min(last*1.1, next));
        }

        if(isDiv && s.type === 'stock' && s.divYield > 0) {
            let d = next * s.divYield; next -= d; totalDiv += d * holdings[i];
        }
        returns.push(next / last);
        priceHistories[i].push(Math.max(1, next));
        if(priceHistories[i].length > 25) priceHistories[i].shift();
    });

    if(totalDiv > 0) { cash += totalDiv; msg(`💰 領到零用錢(配息) $${totalDiv.toFixed(0)}`); }

    let perfs = STOCKS.map((s, i) => Math.max(0.1, Math.pow(priceHistories[i][priceHistories[i].length-1]/priceHistories[i][0], 2)));
    let sumP = perfs.reduce((a,b)=>a+b, 0);
    fundWeights = perfs.map(p => p/sumP);
    let fReturn = 0; STOCKS.forEach((s, i) => fReturn += returns[i] * fundWeights[i]);
    fundNAV *= fReturn * (1 - (currentTitleLevel >= 4 ? 0 : FUND_MGMT_FEE));

    if(bank > 0) bank *= (1 + (currentTitleLevel >= 2 ? BANK_RATE*2 : BANK_RATE));
    if(loan > 0) loan *= (1 + (currentTitleLevel >= 5 ? LOAN_RATE*0.5 : LOAN_RATE));
    
    let avgRet = returns.reduce((a,b)=>a+b, 0) / returns.length;
    fearGreedIndex = Math.max(0, Math.min(100, fearGreedIndex * 0.8 + 50 * 0.2 + (avgRet - 1.0) * 500));

    triggerPersonalEvents();

    taxTurns--;
    if (taxTurns <= 0) {
        processTaxAndLivingExp();
        taxTurns = 15;
        accumulatedTax = 0;
    }

    checkMarginCall();
    prepareEvents(); 
    
    // 特賞：黃金招財貓被動收入
    let catCount = myCollections.filter(c => c.grade === 'A').length;
    if (catCount > 0) {
        let catIncome = catCount * 500;
        cash += catIncome;
        showToast(`🐱 黃金招財貓為你帶來了 $${catIncome.toLocaleString()} 的被動收入！`, '#f1c40f');
    }
}

function triggerPersonalEvents() {
    let scale = Math.max(1, Math.ceil(getTotalAssets() / 20000));
    
    // 幸運草提升 20% 好事機率 (0.15 * 1.2 = 0.18)
    let goodChance = inventory.includes('luck_clover') ? 0.18 : 0.15;
    
    if (Math.random() < goodChance) {
        let totalWeight = 0;
        PERSONAL_GOOD.forEach(ev => { totalWeight += (1 / ev.base); });
        let r = Math.random() * totalWeight;
        let cumulative = 0;
        let selectedEv = PERSONAL_GOOD[0];
        for (let i = 0; i < PERSONAL_GOOD.length; i++) {
            cumulative += (1 / PERSONAL_GOOD[i].base);
            if (r <= cumulative) {
                selectedEv = PERSONAL_GOOD[i];
                break;
            }
        }
        let amt = selectedEv.base * scale;
        cash += amt;
        showToast(`🎉 ${selectedEv.t} (獲得 $${amt.toLocaleString()})`, '#2ed573');
    }

    if (Math.random() < 0.15) {
        let ev = PERSONAL_BAD[Math.floor(Math.random() * PERSONAL_BAD.length)];
        let amt = ev.base * scale;
        
        if (insuranceTurns > 0) {
            let ratio = 0.6 + (Math.random() * 0.4);
            let covered = Math.floor(amt * ratio);
            let actualLoss = amt - covered;
            
            if (actualLoss > 0) {
                if (cash >= actualLoss) { cash -= actualLoss; }
                else { loan += (actualLoss - cash); cash = 0; }
            }
            showToast(`🛡️ 保險理賠 ${Math.floor(ratio*100)}%！抵銷 $${covered.toLocaleString()}，你僅需付 $${actualLoss.toLocaleString()}。原因：${ev.t}`, '#3498db');
        } else {
            if (cash >= amt) { cash -= amt; }
            else { loan += (amt - cash); cash = 0; }
            showToast(`💸 糟糕！${ev.t} (失去 $${amt.toLocaleString()})`, '#ff4757');
        }
    }
}

function prepareEvents() {
    currentEvents = []; 
    const box = document.getElementById('newsBox');
    let roll = Math.random();
    let extremeChance = (fearGreedIndex > 80 || fearGreedIndex < 20) ? 0.10 : 0.03;

    if (roll < extremeChance) {
        let pool = fearGreedIndex > 80 ? EXTREME_DOWN_EVENTS : (fearGreedIndex < 20 ? EXTREME_UP_EVENTS : [...EXTREME_UP_EVENTS, ...EXTREME_DOWN_EVENTS]);
        let ev = pool[Math.floor(Math.random() * pool.length)];
        currentEvents.push(ev);
        let color = ev.imp[0] > 1 || ev.imp[1] > 1 ? '#ff4757' : '#2ed573';
        box.innerHTML = `<div class="news-item" style="color:${color}; font-size:22px; font-weight:900;">🚨 ${ev.t}</div>`;
    } else if (roll < extremeChance + 0.12) {
        let ev = SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)];
        currentEvents.push(ev);
        box.innerHTML = `<div class="news-item" style="color:#ffa502; font-size:20px; font-weight:bold;">✨ ${ev.t}</div>`;
    } else {
        let pool = [...NORMAL_EVENTS];
        for (let i = 0; i < 2; i++) {
            let idx = Math.floor(Math.random() * pool.length);
            currentEvents.push(pool.splice(idx, 1)[0]);
        }
        box.innerHTML = currentEvents.map(e => `<div class="news-item">${e.t}</div>`).join('');
    }
}

function processTaxAndLivingExp() {
    let expense = Math.floor(accumulatedTax);
    let paid = 0;
    if (cash >= expense) { cash -= expense; paid = expense; }
    else {
        paid += cash; cash = 0;
        let remain = expense - paid;
        if (bank >= remain) { bank -= remain; paid += remain; }
        else {
            paid += bank; bank = 0;
            remain = expense - paid;
            for(let i=0; i<STOCKS.length; i++) {
                if (remain <= 0) break;
                if (holdings[i] > 0) {
                    let price = priceHistories[i][priceHistories[i].length-1] * 0.8;
                    let sellQty = Math.min(holdings[i], Math.ceil(remain / price));
                    holdings[i] -= sellQty;
                    remain -= sellQty * price;
                }
            }
            msg(`🚨 現金不夠付生活費！你的股票被強制低價變賣了！`, '#e74c3c');
        }
    }
    if(paid >= expense) msg(`💸 繳交本季動態生活費：$${expense.toLocaleString()}`);
}

function checkMarginCall() {
    let gross = getGrossAssets();
    if (loan > 0 && loan > gross * 0.8) {
        msg(`☠️ 【斷頭】欠銀行的錢太多了！你的財產被強制賣出還債！`, '#c0392b');
        STOCKS.forEach((s, i) => { holdings[i] = 0; totalCosts[i] = 0; });
        cash += (fundUnits * fundNAV); fundUnits = 0;
        if (cash >= loan) { cash -= loan; loan = 0; } else { loan -= cash; cash = 0; }
    }
}
