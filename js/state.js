let cash = 10000, bank = 0, loan = 0, fundUnits = 0, fundNAV = 10.0;
let curIdx = 0, holdings = [0, 0, 0, 0, 0], totalCosts = [0, 0, 0, 0, 0];
let priceHistories = STOCKS.map(s => Array(25).fill(s.basePrice));
let fundWeights = [0.2, 0.2, 0.2, 0.2, 0.2];

let currentEvents = [], turnCount = 0, currentTitleLevel = 0, chart;
let fearGreedIndex = 50; 
let taxTurns = 15;
let accumulatedTax = 0;
let insuranceTurns = 0;
let insurancePremium = 0; 

let turnCooldown = 0; 
let hasWorkedThisTurn = false;

// 道具與一番賞狀態
let inventory = []; 
let kujiPool = [];  
let myCollections = []; 
let kujiPrice = 1000;

let STOCK_BUY_FEE = 0.001425, STOCK_SELL_TAX = 0.003, CRYPTO_FEE = 0.001;
let BANK_RATE = 0.01, LOAN_RATE = 0.02, TRUTH_RATE = 0.75, FUND_MGMT_FEE = 0.0001;

function getGrossAssets() {
    let sVal = 0; STOCKS.forEach((s, i) => sVal += (priceHistories[i][priceHistories[i].length-1] * holdings[i]));
    return cash + bank + sVal + (fundUnits * fundNAV);
}
function getTotalAssets() { return getGrossAssets() - loan; }
