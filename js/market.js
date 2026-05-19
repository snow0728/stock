// 隨機挑選 0~3 個尚未購買的商品，給 0% ~ 15% 折扣。
function updateShopDiscounts() {
    currentDiscounts = {};
    
    // 篩選出「尚未購買」的商品
    // buff 類型必須不在 ownedItems 陣列中；消耗品 (consumable) 則永遠有機會獲得折扣
    let availableItems = SHOP_ITEMS.filter(item => {
        if (item.type === 'buff') {
            return !ownedItems.includes(item.id);
        }
        return true; 
    }).map(item => item.id);
    
    // 隨機決定這回合要有幾件商品打折 (0 ~ 3)
    let discountCount = Math.floor(Math.random() * 4); 
    
    for (let i = 0; i < discountCount; i++) {
        if (availableItems.length === 0) break;
        
        let rIdx = Math.floor(Math.random() * availableItems.length);
        let selectedId = availableItems.splice(rIdx, 1)[0];
        
        let discountPercent = Math.floor(Math.random() * 16); // 產生 0 到 15 的隨機整數
        if (discountPercent > 0) {
            currentDiscounts[selectedId] = discountPercent / 100;
        }
    }
}

function applyMarketChanges() {
    turnCount++;
    hasWorkedThisTurn = false;
    lastMarketImpacts = STOCKS.map(() => 0);
    decreaseCardCooldowns();

    let isDiv = (turnCount % 5 === 0);
    let totalDiv = 0;

    if (insuranceTurns > 0) {
        let premium = Math.floor(50 + getGrossAssets() * 0.001);
        deductFunds(premium);
        insuranceTurns--;
        if (insuranceTurns === 0) {
            showToast(`ℹ️ 意外險已到期，請記得重新投保！`, '#7f8c8d');
        }
    }

    let hasExtreme = currentEvents.some(e => e.isExtreme);
    const marketBias = (Math.random() - 0.48) * 0.015;
    let previousPrices = [];

    let isExtremeDown = currentEvents.some(e => e.isExtreme && e.imp.some(val => val < 1.0));
    if (isExtremeDown && insuranceTurns > 0) {
        let payoutRate = hasItem(ITEM_IDS.insurancePlus) ? 0.2 : 0.1;
        let payout = Math.floor(getGrossAssets() * payoutRate);
        cash += payout;
        showToast(`🛡️ 股災保險理賠！獲得急難救助金 $${payout.toLocaleString()}`, '#3498db');
    }

    if (taxTurns > 5) {
        let baseLivingCost = 500; 
        let assetRate = 0.01; 
        let expectedTotalExpense = baseLivingCost + (getGrossAssets() * assetRate);
        let discount = (currentTitleLevel >= 3 ? 0.7 : 1);
        if(hasItem(ITEM_IDS.taxPlan)) discount *= 0.5;
        accumulatedTax += (expectedTotalExpense / 10) * discount;
    }

    let currentTruthRate = hasItem(ITEM_IDS.crystalBall) ? 1.0 : TRUTH_RATE;

    STOCKS.forEach((s, i) => {
        const hist = priceHistories[i];
        const last = hist[hist.length - 1];
        previousPrices[i] = last;
        const ma = hist.reduce((a, b) => a + b, 0) / hist.length;
        const meanRev = (ma - last) / ma * 0.035;

        let evImp = 1.0;
        currentEvents.forEach(e => { 
            if (e.isExtreme || SPECIAL_EVENTS.includes(e)) {
                evImp *= e.imp[i];
            } else {
                let isActuallyFake = e.isFake;
                if (currentTruthRate === 1.0) isActuallyFake = false;
                
                if (!isActuallyFake) evImp *= e.imp[i]; 
                else if (e.imp[i] !== 1.0) evImp *= (1.0 / e.imp[i]);
            }
        });

        let vola = s.vola * (Math.random() - 0.5) * 2;
        let change = Math.exp(s.drift + meanRev + (marketBias * s.beta) + vola);
        let next = last * change * evImp;

        if(s.type === 'stock' && !hasExtreme) {
            next = Math.max(last*0.9, Math.min(last*1.1, next));
        }

        // 紅綠卡會直接指定下一回合的漲跌方向。
        if (activeRedCardStock === i) {
            next = last * (1.05 + Math.random() * 0.05); // 強制上漲 5% ~ 10%
        } else if (activeGreenCardStock === i) {
            next = last * (0.90 + Math.random() * 0.05); // 強制下跌 5% ~ 10%
        }

        if(isDiv && s.type === 'stock' && s.divYield > 0) {
            let d = next * s.divYield; next -= d; totalDiv += d * holdings[i];
        }
        priceHistories[i].push(Math.max(1, next));
        if(priceHistories[i].length > 25) priceHistories[i].shift();
    });
    activeRedCardStock = null;
    activeGreenCardStock = null;
    runAiTurns();
    let returns = STOCKS.map((s, i) => getCurrentPrice(i) / previousPrices[i]);
    if (isDiv && fundUnits > 0) {
        let fundYield = 0;
        STOCKS.forEach((s, i) => {
            if (s.type === 'stock' && s.divYield > 0) {
                fundYield += (s.divYield * fundWeights[i]);
            }
        });

        if (fundYield > 0) {
            let fundDivPerUnit = fundNAV * fundYield;
            fundNAV -= fundDivPerUnit; 
            let myFundDiv = fundDivPerUnit * fundUnits;
            if (myFundDiv > 0) {
                totalDiv += myFundDiv;
                fundTotalCost = Math.max(0, fundTotalCost - myFundDiv); 
            }
        }
    }

    if(totalDiv > 0) { cash += totalDiv; msg(`💰 領到配息(股票+基金) $${totalDiv.toFixed(0)}`); }

    let perfs = STOCKS.map((s, i) => {
        let hist = priceHistories[i];
        let len = hist.length;
        let currentP = hist[len-1];
        let pastP = hist[Math.max(0, len-10)];
        let momentum = currentP / pastP;
        return Math.max(0.05, Math.pow(momentum, 3)); 
    });
    let sumP = perfs.reduce((a,b)=>a+b, 0);
    fundWeights = perfs.map(p => p/sumP);
    
    let fReturn = 0; STOCKS.forEach((s, i) => fReturn += returns[i] * fundWeights[i]);
    fundNAV *= fReturn * (1 - (currentTitleLevel >= 4 ? 0 : FUND_MGMT_FEE));

    // 存款利息每回合結算，貸款利息每 3 回合結算。
    if(bank > 0) {
        let rate = currentTitleLevel >= 2 ? BANK_RATE * 2 : BANK_RATE;
        let interest = Math.floor(bank * rate);
        bank += interest;
        if (interest > 0) msg(`🏦 銀行存款利息入帳：$${interest.toLocaleString()}`, '#27ae60');
    }

    if (turnCount % 3 === 0) {
        if(loan > 0) {
            let rate = currentTitleLevel >= 5 ? LOAN_RATE * 0.5 : LOAN_RATE;
            let loanInt = Math.floor(loan * rate);
            loan += loanInt;
            if (loanInt > 0) msg(`💸 銀行收取貸款利息：$${loanInt.toLocaleString()}`, '#e74c3c');
        }
    }
    triggerPersonalEvents();

    taxTurns--;
    if (taxTurns <= 0) {
        processTaxAndLivingExp();
        taxTurns = GAME_SETTINGS.livingCostTurns;
        accumulatedTax = 0;
    }

    updateShopDiscounts();
    checkMarginCall();
    checkGovernmentSubsidy(); 

    prepareEvents(); 
    updateUI();
    refreshDivinationPlaysIfReady();
}

function decreaseCardCooldowns() {
    if (redCardCooldown > 0) redCardCooldown--;
    if (greenCardCooldown > 0) greenCardCooldown--;
}

function applyTradePriceImpact(stockIndex, direction, quantity) {
    if (quantity <= 0) return 0;

    const liquidity = GAME_SETTINGS.marketLiquidity[stockIndex] || 100;
    const rawImpact = (quantity / liquidity) * GAME_SETTINGS.tradeImpactStrength;
    const impact = Math.min(GAME_SETTINGS.maxTradeImpact, rawImpact);
    const signedImpact = direction === 'buy' ? impact : -impact;
    const history = priceHistories[stockIndex];
    const nextPrice = Math.max(1, getCurrentPrice(stockIndex) * (1 + signedImpact));

    history[history.length - 1] = nextPrice;
    lastMarketImpacts[stockIndex] += signedImpact;
    return signedImpact;
}

function runAiTurns() {
    const actions = [];
    const playerTotal = getTotalAssets();

    aiPlayers.forEach(ai => {
        // ── 隱藏機制：秘密追趕 ──
        const aiTotal = getAiTotalAssets(ai);
        const lagRatio = aiTotal / Math.max(1, playerTotal);
        if (lagRatio < GAME_SETTINGS.aiCatchUpThreshold) {
            ai.lagTurns++;
        } else {
            ai.lagTurns = Math.max(0, ai.lagTurns - 1); // 縮短落後計數
        }

        if (ai.lagTurns >= GAME_SETTINGS.aiCatchUpLagTurns) {
            // 觸發秘密補助：以「幸運交易」形式悄悄增加現金
            const boostRate = GAME_SETTINGS.aiCatchUpBoostMin +
                Math.random() * (GAME_SETTINGS.aiCatchUpBoostMax - GAME_SETTINGS.aiCatchUpBoostMin);
            const boostAmt = Math.floor(aiTotal * boostRate);
            ai.cash += boostAmt;
            ai.lagTurns = Math.floor(GAME_SETTINGS.aiCatchUpLagTurns * 0.4); // 重置冷卻，避免連續觸發
            ai.catchUpCount++;
            // 故意偽裝成一個正常的操作訊息，不讓玩家直接察覺
            ai.lastAction = `市場套利機會，增持現金儲備`;
        }

        const action = processAiTurn(ai);
        if (action) actions.push(action);
    });
    lastAiSummary = actions.length > 0 ? actions.join("、") : "AI 對手本回合多半觀望";
}

function processAiTurn(ai) {
    ai.lastImpact = 0;
    const decision = getAiDecision(ai);
    if (!decision) {
        ai.lastAction = "觀望市場";
        return "";
    }

    if (decision.type === "buy") {
        return executeAiBuy(ai, decision.index, decision.cashRatio);
    }

    if (decision.type === "sell") {
        return executeAiSell(ai, decision.index, decision.sellRatio);
    }

    ai.lastAction = "觀望市場";
    return "";
}

function getAiDecision(ai) {
    const actionRates = { steady: 0.70, trend: 0.88, contrarian: 0.80, adventurous: 0.92 };
    if (Math.random() > actionRates[ai.strategy]) return null;

    // 共用工具：計算某支股票的綜合評分（動能 + 均值回歸 + 波動懲罰）
    function scoreStock(index) {
        const hist = priceHistories[index];
        const price = getCurrentPrice(index);
        const ma = hist.reduce((a, b) => a + b, 0) / hist.length;
        const momentum3 = getPriceChange(index, 3);
        const momentum8 = getPriceChange(index, 8);
        const meanRevGap = (ma - price) / ma;   // 正值 = 低於均線 (有回升潛力)
        const vola = STOCKS[index].vola;
        return { index, momentum3, momentum8, meanRevGap, price, vola };
    }

    const scores = STOCKS.map((_, i) => scoreStock(i));

    // ── 穩健型：偏好 FOOD/MED；低波動；均值回歸優先 ──
    if (ai.strategy === "steady") {
        const preferred = [2, 3];
        // 賣出：盈利 > 18% 且動能開始趨弱
        const sellCandidate = getAiProfitList(ai, preferred)
            .filter(p => p.profitRate > 0.18 && getPriceChange(p.index, 2) < getPriceChange(p.index, 5))
            .sort((a, b) => b.profitRate - a.profitRate)[0];
        if (sellCandidate) return { type: "sell", index: sellCandidate.index, sellRatio: 0.40 };

        // 停損：虧損 > 12%
        const stopLoss = getAiProfitList(ai, preferred)
            .filter(p => p.profitRate < -0.12)[0];
        if (stopLoss) return { type: "sell", index: stopLoss.index, sellRatio: 0.50 };

        // 買入：選均值回歸空間最大的低波動股
        if (ai.cash > 600) {
            const target = scores.filter(s => preferred.includes(s.index))
                .sort((a, b) => (b.meanRevGap - b.vola * 2) - (a.meanRevGap - a.vola * 2))[0];
            const ratio = 0.20 + Math.random() * 0.15;
            return { type: "buy", index: target.index, cashRatio: ratio };
        }
        return null;
    }

    // ── 追漲型：動能最強；快進快出；小停損 ──
    if (ai.strategy === "trend") {
        // 停損：虧損 > 10% 或動能反轉
        const stopLoss = getWorstAiProfit(ai);
        if (stopLoss && (stopLoss.profitRate < -0.10 || getPriceChange(stopLoss.index, 2) < -0.04))
            return { type: "sell", index: stopLoss.index, sellRatio: 0.55 };

        // 獲利了結：盈利 > 22%
        const takePft = getBestAiProfit(ai);
        if (takePft && takePft.profitRate > 0.22)
            return { type: "sell", index: takePft.index, sellRatio: 0.45 };

        // 買入：動能最強的股票（3 日 + 8 日動能加權）
        if (ai.cash > 700) {
            const ranked = scores
                .map(s => ({ ...s, trendScore: s.momentum3 * 0.6 + s.momentum8 * 0.4 }))
                .sort((a, b) => b.trendScore - a.trendScore);
            const target = ranked[0];
            // 動能越強買越多
            const ratio = 0.30 + Math.min(0.20, Math.max(0, target.momentum3) * 1.5);
            return { type: "buy", index: target.index, cashRatio: ratio };
        }
        return null;
    }

    // ── 反向型：抄底超跌股；分批建倉；高位獲利了結 ──
    if (ai.strategy === "contrarian") {
        // 獲利了結：盈利 > 15% 且近期動能轉弱（反彈結束）
        const takePft = getBestAiProfit(ai);
        if (takePft && takePft.profitRate > 0.15 && getPriceChange(takePft.index, 2) < 0.01)
            return { type: "sell", index: takePft.index, sellRatio: 0.50 };

        // 買入：選最偏離均線向下、但波動不過大的股票（超跌反彈機會）
        if (ai.cash > 700) {
            const target = scores
                .map(s => ({ ...s, dip: s.meanRevGap - s.momentum3 * 0.5 }))  // 均值回歸空間 - 繼續下跌風險
                .sort((a, b) => b.dip - a.dip)[0];
            // 跌越深，倉位越小（分批攤平思維）
            const oversold = Math.max(0, target.meanRevGap);
            const ratio = 0.22 + Math.min(0.15, oversold * 0.8);
            return { type: "buy", index: target.index, cashRatio: ratio };
        }
        return null;
    }

    // ── 冒險型：偏好 BTC/ENT；大倉位；高風高報 ──
    if (ai.strategy === "adventurous") {
        const preferred = [0, 4];
        // 停損：虧損 > 15%
        const stopLoss = getWorstAiProfit(ai, preferred);
        if (stopLoss && stopLoss.profitRate < -0.15)
            return { type: "sell", index: stopLoss.index, sellRatio: 0.65 };

        // 獲利了結：盈利 > 28%
        const takePft = getBestAiProfit(ai, preferred);
        if (takePft && takePft.profitRate > 0.28)
            return { type: "sell", index: takePft.index, sellRatio: 0.55 };

        // 買入：動能最強的偏好股，倉位加重
        if (ai.cash > 500) {
            const target = scores.filter(s => preferred.includes(s.index))
                .sort((a, b) => (b.momentum3 + b.momentum8) - (a.momentum3 + a.momentum8))[0];
            const ratio = 0.40 + Math.min(0.20, Math.max(0, target.momentum3) * 1.2);
            return { type: "buy", index: target.index, cashRatio: ratio };
        }
        return null;
    }

    return null;
}

function executeAiBuy(ai, stockIndex, cashRatio) {
    const price = getCurrentPrice(stockIndex);
    const budget = Math.min(ai.cash, ai.cash * cashRatio * (0.75 + Math.random() * 0.5));
    const quantity = Math.floor(budget / price);
    if (quantity <= 0) {
        ai.lastAction = "現金不足，先觀望";
        return "";
    }

    const cost = quantity * price;
    ai.cash -= cost;
    ai.holdings[stockIndex] += quantity;
    ai.totalCosts[stockIndex] += cost;

    const impact = applyTradePriceImpact(stockIndex, "buy", quantity);
    ai.lastImpact = impact;
    ai.lastAction = `買進 ${getStockShortName(stockIndex)} ${quantity} 單位 (${formatImpactPercent(impact)})`;
    return `${ai.name}買進${getStockShortName(stockIndex)}`;
}

function executeAiSell(ai, stockIndex, sellRatio) {
    const holding = ai.holdings[stockIndex];
    if (holding <= 0) {
        ai.lastAction = "沒有持股可賣，先觀望";
        return "";
    }

    const quantity = Math.min(holding, Math.max(1, Math.floor(holding * sellRatio)));
    const price = getCurrentPrice(stockIndex);
    const avgCost = ai.totalCosts[stockIndex] / holding;

    ai.holdings[stockIndex] -= quantity;
    ai.totalCosts[stockIndex] = Math.max(0, ai.totalCosts[stockIndex] - avgCost * quantity);
    if (ai.holdings[stockIndex] === 0) ai.totalCosts[stockIndex] = 0;
    ai.cash += quantity * price;

    const impact = applyTradePriceImpact(stockIndex, "sell", quantity);
    ai.lastImpact = impact;
    ai.lastAction = `賣出 ${getStockShortName(stockIndex)} ${quantity} 單位 (${formatImpactPercent(impact)})`;
    return `${ai.name}賣出${getStockShortName(stockIndex)}`;
}

function getRankedStocksByMomentum(lookback) {
    return STOCKS
        .map((stock, index) => ({ index, change: getPriceChange(index, lookback) }))
        .sort((a, b) => b.change - a.change)
        .map(item => item.index);
}

function getBestAiProfit(ai, allowedIndexes = null) {
    return getAiProfitList(ai, allowedIndexes).sort((a, b) => b.profitRate - a.profitRate)[0] || null;
}

function getWorstAiProfit(ai, allowedIndexes = null) {
    return getAiProfitList(ai, allowedIndexes).sort((a, b) => a.profitRate - b.profitRate)[0] || null;
}

function getAiProfitList(ai, allowedIndexes = null) {
    return ai.holdings
        .map((quantity, index) => {
            if (quantity <= 0 || (allowedIndexes && !allowedIndexes.includes(index))) return null;
            const currentValue = quantity * getCurrentPrice(index);
            const cost = ai.totalCosts[index] || 1;
            return { index, profitRate: currentValue / cost - 1 };
        })
        .filter(Boolean);
}

function formatImpactPercent(impact) {
    const sign = impact >= 0 ? "+" : "";
    return `${sign}${(impact * 100).toFixed(2)}%`;
}

function refreshDivinationPlaysIfReady() {
    const refreshText = document.getElementById('divNextRefresh');
    if (turnCount % GAME_SETTINGS.divinationRefreshTurns !== 0) {
        if (refreshText) refreshText.innerText = "下回合刷新";
        return;
    }

    divinationPlaysLeft = GAME_SETTINGS.divinationPlaysPerRefresh;
    const playsLeft = document.getElementById('divPlaysLeft');
    if (playsLeft) playsLeft.innerText = divinationPlaysLeft;
    if (refreshText) refreshText.innerText = "已刷新";
    msg(`🔮 命運之輪已轉動，占卜次數已刷新為 ${divinationPlaysLeft} 次！`, "#9b59b6");
}

function getRandomEvent(events) {
    let totalWeight = events.reduce((sum, ev) => sum + ev.weight, 0);
    let random = Math.random() * totalWeight;
    for (let ev of events) {
        if (random < ev.weight) return ev;
        random -= ev.weight;
    }
    return events[events.length - 1];
}

function deductFunds(amount) {
    if (cash >= amount) {
        cash -= amount;
    } else {
        let remain = amount - cash;
        cash = 0;
        if (bank >= remain) {
            bank -= remain;
        } else {
            remain -= bank;
            bank = 0;
            loan += remain;
        }
    }
}

function triggerPersonalEvents() {
    let scale = Math.max(1, Math.ceil(getTotalAssets() / 20000));
    
    let goodChance = hasItem(ITEM_IDS.luck) ? 0.25 : 0.15;
    let badChance = hasItem(ITEM_IDS.luck) ? 0.10 : 0.20;

    if (Math.random() < goodChance) {
        let ev = getRandomEvent(PERSONAL_GOOD);
        let amt = ev.base * scale;
        cash += amt;
        showToast(`🎉 ${ev.t} (獲得 $${amt.toLocaleString()})`, '#2ed573');
    }

    if (Math.random() < badChance) {
        let ev = getRandomEvent(PERSONAL_BAD);
        let amt = ev.base * scale;
        
        if (insuranceTurns > 0) {
            let minRatio = hasItem(ITEM_IDS.insurancePlus) ? 0.8 : 0.6;
            let ratio = minRatio + (Math.random() * (1.0 - minRatio));
            let covered = Math.floor(amt * ratio);
            let actualLoss = amt - covered;
            
            if (actualLoss > 0) {
                deductFunds(actualLoss);
                showToast(`🛡️ 保險理賠 ${Math.floor(ratio*100)}%！抵銷 $${covered.toLocaleString()}，你僅需付 $${actualLoss.toLocaleString()}。原因：${ev.t}`, '#3498db');
            }
        } else {
            deductFunds(amt);
            showToast(`💸 糟糕！${ev.t} (失去 $${amt.toLocaleString()})`, '#ff4757');
        }
    }
}

function prepareEvents() {
    currentEvents = []; 
    const box = document.getElementById('newsBox');
    let roll = Math.random();
    
    // 極端事件固定 3% 機率觸發。
    let extremeChance = 0.03;

    if (roll < extremeChance) {
        let pool = [...EXTREME_UP_EVENTS, ...EXTREME_DOWN_EVENTS];
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
            let ev = Object.assign({}, pool.splice(idx, 1)[0]);
            ev.isFake = (Math.random() >= TRUTH_RATE);
            currentEvents.push(ev);
        }
        
        let htmlStr = currentEvents.map(e => {
            let newsText = e.t;
            if (hasItem(ITEM_IDS.crystalBall)) {
                newsText = `🔮 [真情報] ${e.t}`;
            } else if (currentTitleLevel >= 6) {
                newsText += e.isFake ? " <span style='color:#e74c3c;'>【情報：假消息❌】</span>" : " <span style='color:#27ae60;'>【情報：屬實✅】</span>";
            }
            return `<div class="news-item">${newsText}</div>`;
        }).join('');
        box.innerHTML = htmlStr;
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
                    
                    // 【修復】計算每股平均成本，並等比例扣除歷史總成本
                    let avgCost = totalCosts[i] / holdings[i];
                    totalCosts[i] = Math.max(0, totalCosts[i] - (avgCost * sellQty));
                    
                    // 執行持股扣除
                    holdings[i] -= sellQty;
                    
                    // 【安全防禦】如果持股已清空，確保總成本安全清零，避免浮點數殘留
                    if (holdings[i] === 0) {
                        totalCosts[i] = 0;
                    }
                    
                    remain -= sellQty * price;
                }
            }
            msg(`🚨 現金與存款不足！你的股票被強制低價變賣繳費！`, '#e74c3c');
        }
    }
    if(paid >= expense) msg(`💸 繳交本季動態生活費：$${expense.toLocaleString()}`);
}

function checkMarginCall() {
    let gross = getGrossAssets();
    let marginLimit = hasItem(ITEM_IDS.vip) ? 0.9 : 0.8;
    if (loan > 0 && loan > gross * marginLimit) {
        msg(`☠️ 【斷頭】欠款過高！你的財產被強制賣出還債！`, '#c0392b');
        STOCKS.forEach((s, i) => { holdings[i] = 0; totalCosts[i] = 0; });
        cash += (fundUnits * fundNAV); fundUnits = 0;
        if (cash >= loan) { cash -= loan; loan = 0; } else { loan -= cash; cash = 0; }
    }
}

// 政府補助金邏輯
function checkGovernmentSubsidy() {
    let grossAssets = getGrossAssets();
    
    // 當總資產低於 5000 時，發放 1000 補助金
    if (grossAssets < 5000) {
        cash += 1000;
        msg(`🏛️ 政府紓困金核發：總資產過低，獲得 $1,000 補助！`, '#f39c12');
    }
}
