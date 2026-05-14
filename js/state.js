let cash = 10000, bank = 0, loan = 0, fundUnits = 0, fundNAV = 10.0;
let curIdx = 0, holdings = [0, 0, 0, 0, 0], totalCosts = [0, 0, 0, 0, 0];
let priceHistories = STOCKS.map(s => Array(25).fill(s.basePrice));

let fundWeights = [0.2, 0.2, 0.2, 0.2, 0.2];
let fundTotalCost = 0;

let currentEvents = [], turnCount = 0, currentTitleLevel = 0, chart;
// 已經移除恐懼與貪婪指數 (fearGreedIndex)
let taxTurns = 1;
let accumulatedTax = 0;
let insuranceTurns = 0;

let hasWorkedThisTurn = false;
let isPaused = false; 

// 道具系統追蹤
let ownedItems = [];
let voucher1Count = 0;
let voucher2Count = 0;
let scratchTicketsLeft = 10;
let scratchTimer = 30;
let currentDiscounts = {}; // 追蹤目前商店的折扣

// 新增：紅綠卡道具變數
let redCardCount = 0;
let greenCardCount = 0;
let activeRedCardStock = null;  // 紀錄這回合哪支股票被用了紅卡
let activeGreenCardStock = null; // 紀錄這回合哪支股票被用了綠卡

// ========== 再次新增：紅綠卡購買冷卻 (回合數) ==========
let redCardCooldown = 0;
let greenCardCooldown = 0;
// ========================================================

let STOCK_BUY_FEE = 0.001425, STOCK_SELL_TAX = 0.003, CRYPTO_FEE = 0.001;
// 存款基礎利率 1% (0.01)，貸款基礎利率 5% (0.05)
let BANK_RATE = 0.01, LOAN_RATE = 0.05, TRUTH_RATE = 0.75, FUND_MGMT_FEE = 0.0001;

function hasItem(itemId) {
    return ownedItems.includes(itemId);
}

function getTotalAssets() {
    let stockAsset = 0;
    for(let i=0; i<STOCKS.length; i++) {
        stockAsset += holdings[i] * priceHistories[i][priceHistories[i].length-1];
    }
    let fundAsset = fundUnits * fundNAV;
    return cash + bank + stockAsset + fundAsset - loan;
}

function getGrossAssets() {
    let stockAsset = 0;
    for(let i=0; i<STOCKS.length; i++) {
        stockAsset += holdings[i] * priceHistories[i][priceHistories[i].length-1];
    }
    let fundAsset = fundUnits * fundNAV;
    return cash + bank + stockAsset + fundAsset; 
}
// ====== 新增：占卜小遊戲系統狀態 ======
let divinationPlaysLeft = 5;
let isDivinationActive = false;
let divinationMines = [];
let divinationRevealedCount = 0;
let divinationCurrentMulti = 1.0;
let divinationEntryFee = 100;
const DIVINATION_RTP = 0.85;