let cash = 10000, bank = 0, loan = 0, fundUnits = 0, fundNAV = 10.0;
let curIdx = 0, holdings = [0, 0, 0, 0, 0], totalCosts = [0, 0, 0, 0, 0];
let priceHistories = STOCKS.map(s => Array(25).fill(s.basePrice));

let fundWeights = [0.2, 0.2, 0.2, 0.2, 0.2];
let fundTotalCost = 0;

let currentEvents = [], turnCount = 0, currentTitleLevel = 0, chart;
let fearGreedIndex = 50; 
let taxTurns = 15;
let accumulatedTax = 0;
let insuranceTurns = 0;

let hasWorkedThisTurn = false;
let isPaused = false; 

// 道具系統追蹤
let ownedItems = [];
let scratchTicketsLeft = 10;
let scratchTimer = 30;
let currentDiscounts = {}; // 新增：追蹤目前商店的折扣

let STOCK_BUY_FEE = 0.001425, STOCK_SELL_TAX = 0.003, CRYPTO_FEE = 0.001;
let BANK_RATE = 0.01, LOAN_RATE = 0.02, TRUTH_RATE = 0.75, FUND_MGMT_FEE = 0.0001;

function hasItem(itemId) {
    return ownedItems.includes(itemId);
}

function getGrossAssets() {
    let sVal = 0; STOCKS.forEach((s, i) => sVal += (priceHistories[i][priceHistories[i].length-1] * holdings[i]));
    return cash + bank + sVal + (fundUnits * fundNAV);
}
function getTotalAssets() { return getGrossAssets() - loan; }