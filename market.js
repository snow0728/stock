function updateShopDiscounts() {
    currentDiscounts = {};
    const available = SHOP_ITEMS
        .filter(item => item.type !== 'buff' || !ownedItems.includes(item.id))
        .map(item => item.id);

    let count = Math.floor(Math.random() * 4);
    while (count-- > 0 && available.length > 0) {
        const rIdx = Math.floor(Math.random() * available.length);
        const id = available.splice(rIdx, 1)[0];
        const pct = Math.floor(Math.random() * 16);
        if (pct > 0) currentDiscounts[id] = pct / 100;
    }
}

function applyMarketChanges() {
    turnCount++;
    hasWorkedThisTurn = false;
    lastMarketImpacts = STOCKS.map(() => 0);
    if (redCardCooldown > 0) redCardCooldown--;
    if (greenCardCooldown > 0) greenCardCooldown--;
    aiPlayers.forEach(ai => {
        if (ai.aiRedCooldown   > 0) ai.aiRedCooldown--;
        if (ai.aiGreenCooldown > 0) ai.aiGreenCooldown--;
    });

    const isDiv = (turnCount % 5 === 0);
    let totalDiv = 0;

    // Insurance premium
    if (insuranceTurns > 0) {
        deductFunds(Math.floor(50 + getGrossAssets() * 0.001));
        if (--insuranceTurns === 0) showToast('ℹ️ 意外險已到期，請記得重新投保！', '#7f8c8d');
    }

    const hasExtreme = currentEvents.some(e => e.isExtreme);
    const isExtremeDown = currentEvents.some(e => e.isExtreme && e.imp.some(v => v < 1.0));
    const marketBias = (Math.random() - 0.48) * 0.015;
    const useCrystalBall = hasItem(ITEM_IDS.crystalBall);

    // Extreme-down insurance payout
    if (isExtremeDown && insuranceTurns > 0) {
        const rate = hasItem(ITEM_IDS.insurancePlus) ? 0.2 : 0.1;
        const payout = Math.floor(getGrossAssets() * rate);
        cash += payout;
        showToast(`🛡️ 股災保險理賠！獲得急難救助金 $${payout.toLocaleString()}`, '#3498db');
    }

    // Living cost accumulation
    if (taxTurns > 5) {
        const base = 500 + getGrossAssets() * 0.01;
        let discount = currentTitleLevel >= 3 ? 0.7 : 1;
        if (hasItem(ITEM_IDS.taxPlan)) discount *= 0.5;
        accumulatedTax += (base / 10) * discount;
    }

    // Price update — apply deferred trade impacts from last turn first, then clear
    const previousPrices = STOCKS.map((_, i) => getCurrentPrice(i));

    STOCKS.forEach((s, i) => {
        const hist = priceHistories[i];
        // Carry over any accumulated buy/sell pressure from the previous turn
        if (pendingTradeImpacts[i] !== 0) {
            hist[hist.length - 1] = Math.max(1, hist[hist.length - 1] * (1 + pendingTradeImpacts[i]));
        }
    });
    pendingTradeImpacts = STOCKS.map(() => 0);

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
                const fake = useCrystalBall ? false : e.isFake;
                evImp *= (fake && e.imp[i] !== 1.0) ? 1.0 / e.imp[i] : e.imp[i];
            }
        });

        const vola = s.vola * (Math.random() - 0.5) * 2;
        let next = last * Math.exp(s.drift + meanRev + marketBias * s.beta + vola) * evImp;
        if (s.type === 'stock' && !hasExtreme) next = Math.max(last * 0.9, Math.min(last * 1.1, next));

        if (activeRedCardStock === i)        next = last * (1.05 + Math.random() * 0.05);
        else if (activeGreenCardStock === i) next = last * (0.90 + Math.random() * 0.05);

        if (isDiv && s.type === 'stock' && s.divYield > 0) {
            const d = next * s.divYield;
            next -= d;
            totalDiv += d * holdings[i];
        }

        hist.push(Math.max(1, next));
        if (hist.length > 25) hist.shift();
    });
    activeRedCardStock = null;
    activeGreenCardStock = null;

    // Blank out currentEvents before AI acts so it cannot read the news ticker
    // that is still being displayed to the player this turn.
    // AI decisions rely only on price history; fresh events are set by prepareEvents() below.
    currentEvents = [];

    runAiTurns();

    // Fund NAV update
    const returns = STOCKS.map((_, i) => getCurrentPrice(i) / previousPrices[i]);

    if (isDiv && fundUnits > 0) {
        const fundYield = STOCKS.reduce((sum, s, i) =>
            s.type === 'stock' && s.divYield > 0 ? sum + s.divYield * fundWeights[i] : sum, 0);
        if (fundYield > 0) {
            const divPerUnit = fundNAV * fundYield;
            fundNAV -= divPerUnit;
            const myDiv = divPerUnit * fundUnits;
            if (myDiv > 0) { totalDiv += myDiv; fundTotalCost = Math.max(0, fundTotalCost - myDiv); }
        }
    }
    if (totalDiv > 0) { cash += totalDiv; msg(`💰 領到配息(股票+基金) $${totalDiv.toFixed(0)}`); }

    // Rebalance fund weights by momentum
    const perfs = STOCKS.map((_, i) => Math.max(0.05, Math.pow(getCurrentPrice(i) / previousPrices[i], 3)));
    const sumP = perfs.reduce((a, b) => a + b, 0);
    fundWeights = perfs.map(p => p / sumP);
    const fReturn = returns.reduce((sum, r, i) => sum + r * fundWeights[i], 0);
    fundNAV *= fReturn * (1 - (currentTitleLevel >= 4 ? 0 : FUND_MGMT_FEE));

    // Bank interest (every turn) — player
    if (bank > 0) {
        const rate = currentTitleLevel >= 2 ? BANK_RATE * 2 : BANK_RATE;
        const interest = Math.floor(bank * rate);
        bank += interest;
        if (interest > 0) msg(`🏦 銀行存款利息入帳：$${interest.toLocaleString()}`, '#27ae60');
    }

    // Bank interest — AI players (silent, same base rate as player without title bonuses)
    aiPlayers.forEach(ai => {
        if (ai.bank > 0) {
            const interest = Math.floor(ai.bank * BANK_RATE);
            ai.bank += interest;
        }
        // AI fund NAV follows the same global fundNAV (shared index fund)
        // No action needed — ai.fundUnits * fundNAV revalues automatically
    });

    // Loan interest (every 3 turns)
    if (loan > 0 && turnCount % 3 === 0) {
        const rate = currentTitleLevel >= 5 ? LOAN_RATE * 0.5 : LOAN_RATE;
        const loanInt = Math.floor(loan * rate);
        loan += loanInt;
        if (loanInt > 0) msg(`💸 銀行收取貸款利息：$${loanInt.toLocaleString()}`, '#e74c3c');
    }

    triggerPersonalEvents();

    if (--taxTurns <= 0) {
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

function applyTradePriceImpact(stockIndex, direction, quantity) {
    if (quantity <= 0) return 0;
    const liquidity = GAME_SETTINGS.marketLiquidity[stockIndex] || 100;
    const impact = Math.min(GAME_SETTINGS.maxTradeImpact,
        quantity / liquidity * GAME_SETTINGS.tradeImpactStrength);
    const signed = direction === 'buy' ? impact : -impact;
    // Accumulate into the deferred buffer — price will shift at the start of next turn
    pendingTradeImpacts[stockIndex] += signed;
    lastMarketImpacts[stockIndex] += signed;
    return signed;
}

function runAiTurns() {
    const playerTotal = getTotalAssets();
    const { aiCatchUpThreshold, aiCatchUpLagTurns, aiCatchUpBoostMin, aiCatchUpBoostMax } = GAME_SETTINGS;
    const actions = [];

    aiPlayers.forEach(ai => {
        const aiTotal = getAiTotalAssets(ai);
        const lagRatio = aiTotal / Math.max(1, playerTotal);

        if (lagRatio < aiCatchUpThreshold) {
            ai.lagTurns++;
        } else {
            ai.lagTurns = Math.max(0, ai.lagTurns - 1);
        }

        if (ai.lagTurns >= aiCatchUpLagTurns) {
            const rate = aiCatchUpBoostMin + Math.random() * (aiCatchUpBoostMax - aiCatchUpBoostMin);
            ai.cash += Math.floor(aiTotal * rate);
            ai.lagTurns = Math.floor(aiCatchUpLagTurns * 0.4);
            ai.catchUpCount++;
            ai.lastAction = '市場套利機會，增持現金儲備';
        }

        const action = processAiTurn(ai);
        if (action) actions.push(action);
    });

    lastAiSummary = actions.length > 0 ? actions.join('、') : 'AI 對手本回合多半觀望';
}

function processAiTurn(ai) {
    ai.lastImpact = 0;
    // Try card play first — cards take effect next turn via applyMarketChanges
    const cardPlayed = tryAiCardPlay(ai);
    if (cardPlayed) return cardPlayed;

    // Financial rebalancing (bank / fund) runs independently of stock decisions.
    // It returns an action string if it did something, but never blocks stock trading.
    const finDecision = getAiFinancialDecision(ai);
    if (finDecision) {
        let finAction = '';
        if (finDecision.type === 'bank_deposit')  finAction = executeAiBankDeposit(ai, finDecision.amount);
        if (finDecision.type === 'bank_withdraw')  finAction = executeAiBankWithdraw(ai, finDecision.amount);
        if (finDecision.type === 'fund_buy')       finAction = executeAiFundBuy(ai, finDecision.amount);
        if (finDecision.type === 'fund_sell')      finAction = executeAiFundSell(ai, finDecision.ratio);
        // Financial actions are logged but don't consume the stock decision slot
        if (finAction) {
            // Update lastAction only if no stock trade follows this turn
            const stockDecision = getAiDecision(ai);
            if (!stockDecision) return finAction;
            // Both happened — execute stock trade and append fin action to summary
            let stockAction = '';
            if (stockDecision.type === 'buy')  stockAction = executeAiBuy(ai, stockDecision.index, stockDecision.cashRatio);
            if (stockDecision.type === 'sell') stockAction = executeAiSell(ai, stockDecision.index, stockDecision.sellRatio);
            return stockAction || finAction;
        }
    }

    const decision = getAiDecision(ai);
    if (!decision) { ai.lastAction = '觀望市場'; return ''; }
    if (decision.type === 'buy')  return executeAiBuy(ai, decision.index, decision.cashRatio);
    if (decision.type === 'sell') return executeAiSell(ai, decision.index, decision.sellRatio);
    ai.lastAction = '觀望市場';
    return '';
}

// ── AI card playing logic ─────────────────────────────────
//
// AIs have their own virtual red/green card ability with a 5-turn cooldown.
// They share the global activeRedCardStock / activeGreenCardStock slots, so
// only one card of each colour can be active at a time across all AIs.
//
// Personality rules:
//   trend      → Red card on the stock it holds with the best profit (pump it higher).
//               Chance rises when it's already up. Never uses green card.
//   contrarian → Green card on the stock with the strongest recent uptrend (suppress it,
//               then buys the dip next turn). Never uses red card.
//   steady     → Red card on its preferred stocks (FOOD=2, MED=3) only when deeply
//               undervalued (mean-reversion gap > 8%). Very conservative trigger.
//   adventurous→ Uses both cards aggressively on BTC/ENT. Red when it holds a lot,
//               green card on rival stock to create a relative advantage.

const AI_CARD_COOLDOWN = 5; // turns between card uses (player has 3; AI slightly longer)

function tryAiCardPlay(ai) {
    // Base trigger probabilities — kept low so cards feel like rare events
    const triggerChance = { steady: 0.10, trend: 0.15, contrarian: 0.13, adventurous: 0.20 };
    if (Math.random() > triggerChance[ai.strategy]) return '';

    switch (ai.strategy) {

        case 'trend': {
            // Red card: pump the most profitable holding
            if (ai.aiRedCooldown > 0 || activeRedCardStock !== null) return '';
            const best = getBestAiProfit(ai);
            if (!best || best.profitRate < 0.05) return '';   // only if already winning
            const momentum = getPriceChange(best.index, 3);
            if (momentum < 0) return '';                       // don't pump a falling stock
            activeRedCardStock = best.index;
            ai.aiRedCooldown = AI_CARD_COOLDOWN;
            const name = getStockShortName(best.index);
            ai.lastAction = `🟥 使用上漲紅卡鎖定 ${name}，下回合強制上漲！`;
            showToast(`🤖 ${ai.icon} ${ai.name} 對 ${name} 打出【上漲紅卡】！`, '#e74c3c');
            return `${ai.name}打出紅卡(${name})`;
        }

        case 'contrarian': {
            // Green card: suppress the hottest stock, then plans to buy the dip
            if (ai.aiGreenCooldown > 0 || activeGreenCardStock !== null) return '';
            // Find stock with strongest uptrend that the AI does NOT heavily hold
            const target = STOCKS.map((_, i) => ({ i, m: getPriceChange(i, 3) }))
                .filter(s => s.m > 0.04 && ai.holdings[s.i] * getCurrentPrice(s.i) < 500)
                .sort((a, b) => b.m - a.m)[0];
            if (!target) return '';
            activeGreenCardStock = target.i;
            ai.aiGreenCooldown = AI_CARD_COOLDOWN;
            const name = getStockShortName(target.i);
            ai.lastAction = `🟩 使用下跌綠卡鎖定 ${name}，下回合強制下跌！`;
            showToast(`🤖 ${ai.icon} ${ai.name} 對 ${name} 打出【下跌綠卡】！`, '#27ae60');
            return `${ai.name}打出綠卡(${name})`;
        }

        case 'steady': {
            // Red card: only on FOOD or MED when deeply undervalued
            if (ai.aiRedCooldown > 0 || activeRedCardStock !== null) return '';
            const preferred = [2, 3];
            const deepDip = preferred
                .map(i => {
                    const hist = priceHistories[i];
                    const ma   = hist.reduce((a, b) => a + b, 0) / hist.length;
                    return { i, gap: (ma - getCurrentPrice(i)) / ma };
                })
                .filter(s => s.gap > 0.08 && ai.holdings[s.i] > 0)
                .sort((a, b) => b.gap - a.gap)[0];
            if (!deepDip) return '';
            activeRedCardStock = deepDip.i;
            ai.aiRedCooldown = AI_CARD_COOLDOWN;
            const name = getStockShortName(deepDip.i);
            ai.lastAction = `🟥 守護持股！對 ${name} 使用上漲紅卡穩住股價`;
            showToast(`🤖 ${ai.icon} ${ai.name} 護盤出手！對 ${name} 打出【上漲紅卡】`, '#27ae60');
            return `${ai.name}護盤紅卡(${name})`;
        }

        case 'adventurous': {
            // Uses both cards on BTC/ENT. Flips a coin between red on held, green on rival.
            const preferred = [0, 4];
            if (Math.random() < 0.55) {
                // Red card: pump the preferred stock it holds most
                if (ai.aiRedCooldown > 0 || activeRedCardStock !== null) return '';
                const topHeld = preferred
                    .map(i => ({ i, val: ai.holdings[i] * getCurrentPrice(i) }))
                    .filter(s => s.val > 0)
                    .sort((a, b) => b.val - a.val)[0];
                if (!topHeld) return '';
                activeRedCardStock = topHeld.i;
                ai.aiRedCooldown = AI_CARD_COOLDOWN;
                const name = getStockShortName(topHeld.i);
                ai.lastAction = `🟥 幣哥豪賭！紅卡押注 ${name} 強制飆漲！`;
                showToast(`🤖 ${ai.icon} ${ai.name} 豪氣出手！對 ${name} 打出【上漲紅卡】⚡`, '#f39c12');
                return `${ai.name}豪賭紅卡(${name})`;
            } else {
                // Green card: suppress a non-preferred stock that's been rising
                if (ai.aiGreenCooldown > 0 || activeGreenCardStock !== null) return '';
                const rival = STOCKS.map((_, i) => ({ i, m: getPriceChange(i, 3) }))
                    .filter(s => !preferred.includes(s.i) && s.m > 0.03)
                    .sort((a, b) => b.m - a.m)[0];
                if (!rival) return '';
                activeGreenCardStock = rival.i;
                ai.aiGreenCooldown = AI_CARD_COOLDOWN;
                const name = getStockShortName(rival.i);
                ai.lastAction = `🟩 幣哥壓制 ${name}，轉移資金到幣圈！`;
                showToast(`🤖 ${ai.icon} ${ai.name} 壓制出手！對 ${name} 打出【下跌綠卡】⚡`, '#f39c12');
                return `${ai.name}壓制綠卡(${name})`;
            }
        }
    }
    return '';
}

function getAiDecision(ai) {
    const actionRates = { steady: 0.70, trend: 0.88, contrarian: 0.80, adventurous: 0.92 };
    if (Math.random() > actionRates[ai.strategy]) return null;

    // ── News signal ───────────────────────────────────────────
    // Compute a per-stock sentiment score from last turn's published news.
    // imp > 1.0  → bullish for stock i  → positive signal
    // imp < 1.0  → bearish for stock i  → negative signal
    // Fake events fool all AIs except 'contrarian' (who is naturally skeptical).
    // Extreme / special events are always treated as real (too big to ignore).
    const newsSignal = STOCKS.map((_, i) => {
        let signal = 0;
        aiVisibleEvents.forEach(e => {
            const isReal = e.isExtreme || !e.isFake;
            // contrarian trusts only ~40% of unverified normal news
            const believesFake = (ai.strategy === 'contrarian') ? Math.random() < 0.40 : true;
            if (!isReal && !believesFake) return;
            const raw = e.imp[i] - 1.0;  // e.g. 0.08 for +8%, -0.12 for -12%
            signal += raw;
        });
        return signal; // positive = bullish, negative = bearish
    });

    // News action threshold: only act on signal if it exceeds a per-strategy minimum
    const newsThreshold = { steady: 0.04, trend: 0.02, contrarian: 0.05, adventurous: 0.03 };
    const thresh = newsThreshold[ai.strategy];

    function scoreStock(index) {
        const hist = priceHistories[index];
        const price = getCurrentPrice(index);
        const ma = hist.reduce((a, b) => a + b, 0) / hist.length;
        return {
            index,
            momentum3: getPriceChange(index, 3),
            momentum8: getPriceChange(index, 8),
            meanRevGap: (ma - price) / ma,
            vola: STOCKS[index].vola,
            news: newsSignal[index],
        };
    }

    const scores = STOCKS.map((_, i) => scoreStock(i));

    // ── News-driven override (before strategy logic) ──────────
    // If a strong-enough signal exists, bias the decision toward it.
    // Each strategy applies the signal differently.
    const strongBullish = scores.filter(s => s.news >= thresh).sort((a, b) => b.news - a.news)[0];
    const strongBearish = scores.filter(s => s.news <= -thresh).sort((a, b) => a.news - b.news)[0];

    if (ai.strategy === 'trend') {
        // Trend-follower believes all news and acts aggressively
        if (strongBullish && ai.cash > 500) {
            const boost = Math.min(0.20, strongBullish.news * 1.5);
            return { type: 'buy', index: strongBullish.index, cashRatio: 0.28 + boost };
        }
        if (strongBearish && ai.holdings[strongBearish.index] > 0) {
            return { type: 'sell', index: strongBearish.index, sellRatio: 0.50 + Math.min(0.25, Math.abs(strongBearish.news) * 2) };
        }
    }

    if (ai.strategy === 'contrarian') {
        // Contrarian fades the news: buys bearish headlines, sells into bullish ones
        if (strongBearish && ai.cash > 600) {
            const boost = Math.min(0.15, Math.abs(strongBearish.news) * 1.2);
            return { type: 'buy', index: strongBearish.index, cashRatio: 0.20 + boost };
        }
        if (strongBullish && ai.holdings[strongBullish.index] > 0) {
            return { type: 'sell', index: strongBullish.index, sellRatio: 0.35 + Math.min(0.20, strongBullish.news * 1.5) };
        }
    }

    if (ai.strategy === 'steady') {
        // Steady only reacts to news on preferred stocks (FOOD=2, MED=3)
        const preferred = [2, 3];
        const prefBull = scores.filter(s => preferred.includes(s.index) && s.news >= thresh)
            .sort((a, b) => b.news - a.news)[0];
        const prefBear = scores.filter(s => preferred.includes(s.index) && s.news <= -thresh)
            .sort((a, b) => a.news - b.news)[0];
        if (prefBull && ai.cash > 600) {
            return { type: 'buy', index: prefBull.index, cashRatio: 0.15 + Math.min(0.10, prefBull.news) };
        }
        if (prefBear && ai.holdings[prefBear.index] > 0) {
            return { type: 'sell', index: prefBear.index, sellRatio: 0.30 + Math.min(0.20, Math.abs(prefBear.news)) };
        }
    }

    if (ai.strategy === 'adventurous') {
        // Adventurous reacts to any news on BTC/ENT, and uses extreme events market-wide
        const preferred = [0, 4];
        const extBull = scores.filter(s => s.news >= thresh)
            .sort((a, b) => b.news - a.news)[0];
        const prefBull = scores.filter(s => preferred.includes(s.index) && s.news >= thresh)
            .sort((a, b) => b.news - a.news)[0];
        const prefBear = scores.filter(s => preferred.includes(s.index) && s.news <= -thresh)
            .sort((a, b) => a.news - b.news)[0];
        // Extreme events: react regardless of stock type
        if (extBull && extBull.news >= 0.15 && ai.cash > 500) {
            return { type: 'buy', index: extBull.index, cashRatio: 0.35 + Math.min(0.25, extBull.news) };
        }
        if (prefBull && ai.cash > 500) {
            return { type: 'buy', index: prefBull.index, cashRatio: 0.30 + Math.min(0.20, prefBull.news * 1.5) };
        }
        if (prefBear && ai.holdings[prefBear.index] > 0) {
            return { type: 'sell', index: prefBear.index, sellRatio: 0.45 + Math.min(0.25, Math.abs(prefBear.news) * 2) };
        }
    }

    // ── Fallback: original momentum/mean-reversion logic ─────

    if (ai.strategy === 'steady') {
        const preferred = [2, 3];
        const profits = getAiProfitList(ai, preferred);
        const sell = profits
            .filter(p => p.profitRate > 0.18 && getPriceChange(p.index, 2) < getPriceChange(p.index, 5))
            .sort((a, b) => b.profitRate - a.profitRate)[0];
        if (sell) return { type: 'sell', index: sell.index, sellRatio: 0.40 };
        const stop = profits.filter(p => p.profitRate < -0.12)[0];
        if (stop) return { type: 'sell', index: stop.index, sellRatio: 0.50 };
        if (ai.cash > 600) {
            const t = scores.filter(s => preferred.includes(s.index))
                .sort((a, b) => (b.meanRevGap - b.vola * 2) - (a.meanRevGap - a.vola * 2))[0];
            return { type: 'buy', index: t.index, cashRatio: 0.20 + Math.random() * 0.15 };
        }
        return null;
    }

    if (ai.strategy === 'trend') {
        const worst = getWorstAiProfit(ai);
        if (worst && (worst.profitRate < -0.10 || getPriceChange(worst.index, 2) < -0.04))
            return { type: 'sell', index: worst.index, sellRatio: 0.55 };
        const best = getBestAiProfit(ai);
        if (best && best.profitRate > 0.22) return { type: 'sell', index: best.index, sellRatio: 0.45 };
        if (ai.cash > 700) {
            const t = scores
                .map(s => ({ ...s, trendScore: s.momentum3 * 0.6 + s.momentum8 * 0.4 }))
                .sort((a, b) => b.trendScore - a.trendScore)[0];
            return { type: 'buy', index: t.index, cashRatio: 0.30 + Math.min(0.20, Math.max(0, t.momentum3) * 1.5) };
        }
        return null;
    }

    if (ai.strategy === 'contrarian') {
        const best = getBestAiProfit(ai);
        if (best && best.profitRate > 0.15 && getPriceChange(best.index, 2) < 0.01)
            return { type: 'sell', index: best.index, sellRatio: 0.50 };
        if (ai.cash > 700) {
            const t = scores
                .map(s => ({ ...s, dip: s.meanRevGap - s.momentum3 * 0.5 }))
                .sort((a, b) => b.dip - a.dip)[0];
            const oversold = Math.max(0, t.meanRevGap);
            return { type: 'buy', index: t.index, cashRatio: 0.22 + Math.min(0.15, oversold * 0.8) };
        }
        return null;
    }

    if (ai.strategy === 'adventurous') {
        const preferred = [0, 4];
        const worst = getWorstAiProfit(ai, preferred);
        if (worst && worst.profitRate < -0.15) return { type: 'sell', index: worst.index, sellRatio: 0.65 };
        const best = getBestAiProfit(ai, preferred);
        if (best && best.profitRate > 0.28) return { type: 'sell', index: best.index, sellRatio: 0.55 };
        if (ai.cash > 500) {
            const t = scores.filter(s => preferred.includes(s.index))
                .sort((a, b) => (b.momentum3 + b.momentum8) - (a.momentum3 + a.momentum8))[0];
            return { type: 'buy', index: t.index, cashRatio: 0.40 + Math.min(0.20, Math.max(0, t.momentum3) * 1.2) };
        }
        return null;
    }

    return null;
}

function executeAiBuy(ai, idx, cashRatio) {
    const price = getCurrentPrice(idx);
    // Keep a minimum cash reserve (15% of total assets) so AI isn't perpetually cash-starved.
    // Adventurous ignores the floor — it commits hard.
    const reserveFloor = ai.strategy === 'adventurous' ? 0.05 : 0.15;
    const spendable = Math.max(0, ai.cash - getAiTotalAssets(ai) * reserveFloor);
    const qty = Math.floor(Math.min(spendable, spendable * cashRatio * (0.75 + Math.random() * 0.5)) / price);
    if (qty <= 0) { ai.lastAction = '保留備用金，暫不出手'; return ''; }
    const cost = qty * price;
    ai.cash -= cost;
    ai.holdings[idx] += qty;
    ai.totalCosts[idx] += cost;
    const impact = applyTradePriceImpact(idx, 'buy', qty);
    ai.lastImpact = impact;
    ai.lastAction = `買進 ${getStockShortName(idx)} ${qty} 單位 (${formatImpactPercent(impact)})`;
    return `${ai.name}買進${getStockShortName(idx)}`;
}

function executeAiSell(ai, idx, sellRatio) {
    const holding = ai.holdings[idx];
    if (holding <= 0) { ai.lastAction = '沒有持股可賣，先觀望'; return ''; }
    const qty = Math.min(holding, Math.max(1, Math.floor(holding * sellRatio)));
    const price = getCurrentPrice(idx);
    const avgCost = ai.totalCosts[idx] / holding;
    ai.holdings[idx] -= qty;
    ai.totalCosts[idx] = Math.max(0, ai.totalCosts[idx] - avgCost * qty);
    if (ai.holdings[idx] === 0) ai.totalCosts[idx] = 0;
    ai.cash += qty * price;
    const impact = applyTradePriceImpact(idx, 'sell', qty);
    ai.lastImpact = impact;
    ai.lastAction = `賣出 ${getStockShortName(idx)} ${qty} 單位 (${formatImpactPercent(impact)})`;
    return `${ai.name}賣出${getStockShortName(idx)}`;
}

// ── AI bank & fund execution ──────────────────────────────

function executeAiBankDeposit(ai, amount) {
    amount = Math.floor(Math.min(ai.cash, amount));
    if (amount <= 0) return '';
    ai.cash -= amount;
    ai.bank += amount;
    ai.lastAction = `存入銀行 $${amount.toLocaleString()}，等待利息`;
    return `${ai.name}存款`;
}

function executeAiBankWithdraw(ai, amount) {
    amount = Math.floor(Math.min(ai.bank, amount));
    if (amount <= 0) return '';
    ai.bank -= amount;
    ai.cash += amount;
    ai.lastAction = `提領銀行存款 $${amount.toLocaleString()}，準備出手`;
    return `${ai.name}提款`;
}

function executeAiFundBuy(ai, amount) {
    amount = Math.floor(Math.min(ai.cash, amount));
    if (amount <= 0 || fundNAV <= 0) return '';
    ai.cash -= amount;
    ai.fundUnits += amount / fundNAV;
    ai.fundTotalCost += amount;
    ai.lastAction = `申購指數基金 $${amount.toLocaleString()}`;
    return `${ai.name}買基金`;
}

function executeAiFundSell(ai, redeemRatio) {
    if (ai.fundUnits <= 0) return '';
    const value = ai.fundUnits * fundNAV;
    const redeemValue = Math.floor(value * redeemRatio);
    const units = redeemValue / fundNAV;
    ai.fundTotalCost = Math.max(0, ai.fundTotalCost * (1 - redeemRatio));
    ai.fundUnits -= units;
    if (ai.fundUnits < 0.0001) { ai.fundUnits = 0; ai.fundTotalCost = 0; }
    ai.cash += redeemValue;
    ai.lastAction = `贖回基金 $${redeemValue.toLocaleString()}`;
    return `${ai.name}贖基金`;
}

// ── AI financial decision (bank / fund cash management) ───
//
// Called every turn alongside the stock decision. Each AI manages
// its liquid cash vs. savings vs. fund exposure differently.
//
// Target allocations (of total AI assets):
//   steady:      30% bank (safe yield), 20% fund (diversified), rest stocks
//   trend:       10% bank (minimal reserve), 10% fund, rest for chasing stocks
//   contrarian:  20% bank (dry powder for dips), 15% fund, rest stocks
//   adventurous:  5% bank (always deployed), 25% fund (lazy diversification), rest BTC/ENT
//
// Logic: compare current allocation to target → deposit/withdraw/buy/sell to rebalance.
// Acts on deviations > 5% to avoid churning every turn.

function getAiFinancialDecision(ai) {
    const total = getAiTotalAssets(ai);
    if (total <= 0) return null;

    const bankPct  = ai.bank / total;
    const fundPct  = (ai.fundUnits * fundNAV) / total;
    const cashPct  = ai.cash / total;

    // Per-personality target bands [min, target, max]
    const targets = {
        steady:       { bank: [0.20, 0.30, 0.40], fund: [0.12, 0.20, 0.28] },
        trend:        { bank: [0.05, 0.10, 0.18], fund: [0.05, 0.10, 0.18] },
        contrarian:   { bank: [0.12, 0.20, 0.30], fund: [0.08, 0.15, 0.22] },
        adventurous:  { bank: [0.02, 0.05, 0.12], fund: [0.15, 0.25, 0.35] },
    };
    const t = targets[ai.strategy];
    const TOLERANCE = 0.05; // only rebalance if deviation exceeds 5%

    // 1. Bank: too much cash sitting idle → deposit
    if (cashPct > 0.50 && bankPct < t.bank[1] - TOLERANCE) {
        const depositAmt = Math.floor(ai.cash * 0.30);
        if (depositAmt >= 200) return { type: 'bank_deposit', amount: depositAmt };
    }

    // 2. Bank: need cash for trading and have too much in bank → withdraw
    if (bankPct > t.bank[2] + TOLERANCE && ai.cash < total * 0.10) {
        const withdrawAmt = Math.floor(ai.bank * 0.40);
        if (withdrawAmt >= 200) return { type: 'bank_withdraw', amount: withdrawAmt };
    }

    // 3. Fund: underweight → buy fund with spare cash (keep at least 25% cash floor)
    if (fundPct < t.fund[0] - TOLERANCE && cashPct > 0.25) {
        const buyAmt = Math.floor(ai.cash * 0.20);
        if (buyAmt >= 500) return { type: 'fund_buy', amount: buyAmt };
    }

    // 4. Fund: overweight or needs liquidity → partially redeem
    if (fundPct > t.fund[2] + TOLERANCE) {
        const excessPct = fundPct - t.fund[1];
        return { type: 'fund_sell', ratio: Math.min(0.40, excessPct / fundPct) };
    }

    // 5. Opportunistic fund buy: market just dropped (fund NAV fell), buy the dip
    //    Only adventurous and contrarian do this
    if ((ai.strategy === 'adventurous' || ai.strategy === 'contrarian')) {
        const recentDrop = getPriceChange(0, 3) * fundWeights[0]
            + getPriceChange(1, 3) * fundWeights[1]
            + getPriceChange(2, 3) * fundWeights[2]
            + getPriceChange(3, 3) * fundWeights[3]
            + getPriceChange(4, 3) * fundWeights[4];
        if (recentDrop < -0.04 && cashPct > 0.20) {
            const buyAmt = Math.floor(ai.cash * 0.15);
            if (buyAmt >= 300) return { type: 'fund_buy', amount: buyAmt };
        }
    }

    return null;
}

function getAiProfitList(ai, allowedIndexes = null) {
    return ai.holdings
        .map((qty, i) => {
            if (qty <= 0 || (allowedIndexes && !allowedIndexes.includes(i))) return null;
            return { index: i, profitRate: (qty * getCurrentPrice(i)) / (ai.totalCosts[i] || 1) - 1 };
        })
        .filter(Boolean);
}

function getBestAiProfit(ai, allowed = null) {
    return getAiProfitList(ai, allowed).sort((a, b) => b.profitRate - a.profitRate)[0] || null;
}

function getWorstAiProfit(ai, allowed = null) {
    return getAiProfitList(ai, allowed).sort((a, b) => a.profitRate - b.profitRate)[0] || null;
}

function formatImpactPercent(impact) {
    return `${impact >= 0 ? '+' : ''}${(impact * 100).toFixed(2)}%`;
}

// ── AI reaction to player trades ──────────────────────────
//
// Called immediately after the player buys or sells.
// Each AI personality has its own logic:
//   trend      → follows the player (same direction)
//   contrarian → opposes the player (opposite direction)
//   steady     → only reacts to its preferred stocks (FOOD=2, MED=3), conservatively
//   adventurous→ reacts only to BTC=0 and ENT=4, randomly amplified

function reactToPlayerTrade(stockIndex, direction, playerQty) {
    if (playerQty <= 0) return;

    const reactions = [];

    aiPlayers.forEach(ai => {
        let reactionDir = null;
        let cashRatio   = 0;
        let sellRatio   = 0;

        switch (ai.strategy) {

            case 'trend':
                // Follows the player: buys when player buys, sells when player sells.
                // Probability scales up with the player's trade size.
                if (Math.random() < 0.70) {
                    reactionDir = direction;
                    cashRatio   = 0.12 + Math.random() * 0.10;
                    sellRatio   = 0.25 + Math.random() * 0.15;
                }
                break;

            case 'contrarian':
                // Opposes the player: interprets a big buy as "overbought" and vice-versa.
                if (Math.random() < 0.65) {
                    reactionDir = direction === 'buy' ? 'sell' : 'buy';
                    cashRatio   = 0.10 + Math.random() * 0.12;
                    sellRatio   = 0.20 + Math.random() * 0.15;
                }
                break;

            case 'steady':
                // Only cares about FOOD (2) and MED (3). Reacts timidly and only on buy signals.
                if ([2, 3].includes(stockIndex) && direction === 'buy' && Math.random() < 0.45) {
                    reactionDir = 'buy';
                    cashRatio   = 0.08 + Math.random() * 0.07;
                }
                break;

            case 'adventurous':
                // Focused on BTC (0) and ENT (4). Reacts boldly but only ~55% of the time.
                if ([0, 4].includes(stockIndex) && Math.random() < 0.55) {
                    reactionDir = direction;
                    cashRatio   = 0.18 + Math.random() * 0.18;
                    sellRatio   = 0.30 + Math.random() * 0.20;
                }
                break;
        }

        if (!reactionDir) return;

        let actionText = '';
        if (reactionDir === 'buy') {
            const qty = Math.floor(Math.min(ai.cash, ai.cash * cashRatio) / Math.max(1, getCurrentPrice(stockIndex)));
            if (qty <= 0) return;
            const cost = qty * getCurrentPrice(stockIndex);
            ai.cash -= cost;
            ai.holdings[stockIndex] += qty;
            ai.totalCosts[stockIndex] += cost;
            const impact = applyTradePriceImpact(stockIndex, 'buy', qty);
            ai.lastImpact = impact;
            actionText = `跟進買入 ${getStockShortName(stockIndex)} ${qty} 單位`;
            ai.lastAction = actionText + ` (${formatImpactPercent(impact)})`;
        } else {
            const holding = ai.holdings[stockIndex];
            if (holding <= 0) return;
            const qty = Math.max(1, Math.floor(holding * sellRatio));
            const price = getCurrentPrice(stockIndex);
            const avgCost = ai.totalCosts[stockIndex] / holding;
            ai.holdings[stockIndex] -= qty;
            ai.totalCosts[stockIndex] = Math.max(0, ai.totalCosts[stockIndex] - avgCost * qty);
            if (ai.holdings[stockIndex] === 0) ai.totalCosts[stockIndex] = 0;
            ai.cash += qty * price;
            const impact = applyTradePriceImpact(stockIndex, 'sell', qty);
            ai.lastImpact = impact;
            actionText = `跟進賣出 ${getStockShortName(stockIndex)} ${qty} 單位`;
            ai.lastAction = actionText + ` (${formatImpactPercent(impact)})`;
        }

        reactions.push(`${ai.name}${actionText}`);
    });

    if (reactions.length > 0) {
        lastAiSummary = reactions.join('、');
        // Show a brief toast summarising AI reactions so the player notices
        const dirLabel = direction === 'buy' ? '你買入' : '你賣出';
        msg(`🤖 ${dirLabel} ${getStockShortName(stockIndex)} 後 — ${reactions.join('；')}`, '#8e44ad');
    }
}

function refreshDivinationPlaysIfReady() {
    if (turnCount % GAME_SETTINGS.divinationRefreshTurns !== 0) return;
    divinationPlaysLeft = GAME_SETTINGS.divinationPlaysPerRefresh;
    const el = document.getElementById('divPlaysLeft');
    if (el) el.innerText = divinationPlaysLeft;
    msg(`🔮 命運之輪已轉動，占卜次數已刷新為 ${divinationPlaysLeft} 次！`, '#9b59b6');
}

function getRandomEvent(events) {
    let r = Math.random() * events.reduce((s, e) => s + e.weight, 0);
    for (const e of events) { if (r < e.weight) return e; r -= e.weight; }
    return events[events.length - 1];
}

function deductFunds(amount) {
    if (cash >= amount) { cash -= amount; return; }
    amount -= cash; cash = 0;
    if (bank >= amount) { bank -= amount; return; }
    amount -= bank; bank = 0;
    loan += amount;
}

function triggerPersonalEvents() {
    const scale = Math.max(1, Math.ceil(getTotalAssets() / 20000));
    const hasLuck = hasItem(ITEM_IDS.luck);

    if (Math.random() < (hasLuck ? 0.25 : 0.15)) {
        const ev = getRandomEvent(PERSONAL_GOOD);
        const amt = ev.base * scale;
        cash += amt;
        showToast(`🎉 ${ev.t} (獲得 $${amt.toLocaleString()})`, '#2ed573');
    }

    if (Math.random() < (hasLuck ? 0.10 : 0.20)) {
        const ev = getRandomEvent(PERSONAL_BAD);
        const amt = ev.base * scale;
        if (insuranceTurns > 0) {
            const minRatio = hasItem(ITEM_IDS.insurancePlus) ? 0.8 : 0.6;
            const ratio = minRatio + Math.random() * (1.0 - minRatio);
            const covered = Math.floor(amt * ratio);
            const actualLoss = amt - covered;
            if (actualLoss > 0) {
                deductFunds(actualLoss);
                showToast(`🛡️ 保險理賠 ${Math.floor(ratio * 100)}%！抵銷 $${covered.toLocaleString()}，你僅需付 $${actualLoss.toLocaleString()}。原因：${ev.t}`, '#3498db');
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
    const roll = Math.random();
    const extremeChance = 0.03;

    if (roll < extremeChance) {
        const pool = [...EXTREME_UP_EVENTS, ...EXTREME_DOWN_EVENTS];
        const ev = pool[Math.floor(Math.random() * pool.length)];
        currentEvents.push(ev);
        const color = ev.imp.some(v => v > 1) ? '#ff4757' : '#2ed573';
        box.innerHTML = `<div class="news-item" style="color:${color};font-size:22px;font-weight:900;">🚨 ${ev.t}</div>`;
    } else if (roll < extremeChance + 0.12) {
        const ev = SPECIAL_EVENTS[Math.floor(Math.random() * SPECIAL_EVENTS.length)];
        currentEvents.push(ev);
        box.innerHTML = `<div class="news-item" style="color:#ffa502;font-size:20px;font-weight:bold;">✨ ${ev.t}</div>`;
    } else {
        const pool = [...NORMAL_EVENTS];
        const hasCrystal = hasItem(ITEM_IDS.crystalBall);
        for (let i = 0; i < 2; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            const ev = { ...pool.splice(idx, 1)[0], isFake: Math.random() >= TRUTH_RATE };
            currentEvents.push(ev);
        }
        box.innerHTML = currentEvents.map(e => {
            let text = e.t;
            if (hasCrystal) text = `🔮 [真情報] ${text}`;
            else if (currentTitleLevel >= 6)
                text += e.isFake
                    ? " <span style='color:#e74c3c;'>【情報：假消息❌】</span>"
                    : " <span style='color:#27ae60;'>【情報：屬實✅】</span>";
            return `<div class="news-item">${text}</div>`;
        }).join('');
    }

    // Publish a snapshot for AI to read next turn — same info the player sees now.
    // AI receives the raw event objects (including isFake flag) so personality-based
    // skepticism can be applied in getAiDecision.
    aiVisibleEvents = currentEvents.map(e => ({ ...e }));
}

function processTaxAndLivingExp() {
    let expense = Math.floor(accumulatedTax);
    let paid = 0;

    if (cash >= expense) { cash -= expense; paid = expense; }
    else {
        paid += cash; cash = 0;
        const remain1 = expense - paid;
        if (bank >= remain1) { bank -= remain1; paid += remain1; }
        else {
            paid += bank; bank = 0;
            let remain = expense - paid;
            for (let i = 0; i < STOCKS.length && remain > 0; i++) {
                if (holdings[i] <= 0) continue;
                const price = priceHistories[i][priceHistories[i].length - 1] * 0.8;
                const sellQty = Math.min(holdings[i], Math.ceil(remain / price));
                const avgCost = totalCosts[i] / holdings[i];
                totalCosts[i] = Math.max(0, totalCosts[i] - avgCost * sellQty);
                holdings[i] -= sellQty;
                if (holdings[i] === 0) totalCosts[i] = 0;
                remain -= sellQty * price;
            }
            msg('🚨 現金與存款不足！你的股票被強制低價變賣繳費！', '#e74c3c');
        }
    }
    if (paid >= expense) msg(`💸 繳交本季動態生活費：$${expense.toLocaleString()}`);
}

function checkMarginCall() {
    const gross = getGrossAssets();
    const limit = hasItem(ITEM_IDS.vip) ? 0.9 : 0.8;
    if (loan > 0 && loan > gross * limit) {
        msg('☠️ 【斷頭】欠款過高！你的財產被強制賣出還債！', '#c0392b');
        for (let i = 0; i < STOCKS.length; i++) { holdings[i] = 0; totalCosts[i] = 0; }
        cash += fundUnits * fundNAV; fundUnits = 0;
        if (cash >= loan) { cash -= loan; loan = 0; } else { loan -= cash; cash = 0; }
    }
}

function checkGovernmentSubsidy() {
    if (getGrossAssets() < 5000) {
        cash += 1000;
        msg('🏛️ 政府紓困金核發：總資產過低，獲得 $1,000 補助！', '#f39c12');
    }
}
