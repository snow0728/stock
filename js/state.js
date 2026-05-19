const GAME_SETTINGS = {
    marketTurnSeconds: 15,
    livingCostTurns: 15,
    scratchRestockSeconds: 30,
    scratchTicketsPerRestock: 10,
    divinationRefreshTurns: 3,
    divinationPlaysPerRefresh: 5,
    divinationMinBet: 500,
    divinationMaxBet: 2000,
    insuranceTurns: 15,
    cardCooldownTurns: 3,
    tradeImpactStrength: 0.22,
    maxTradeImpact: 0.055,
    marketLiquidity: [12, 50, 180, 100, 130],
    aiCatchUpLagTurns: 8,        // 落後幾回合後觸發追趕
    aiCatchUpThreshold: 0.75,    // AI 資產低於玩家幾 % 時算落後
    aiCatchUpBoostMin: 0.08,     // 秘密增幅下限
    aiCatchUpBoostMax: 0.18,     // 秘密增幅上限
};

const ITEM_IDS = {
    luck: "item_luck",
    vip: "item_vip",
    insurancePlus: "item_ins_plus",
    taxPlan: "item_tax_evade",
    crystalBall: "item_crystal_ball",
    voucherPersonal: "item_voucher1",
    voucherClass: "item_voucher2",
    redCard: "item_red_card",
    greenCard: "item_green_card",
    scratch: "item_scratch",
};

let cash = 10000;
let bank = 0;
let loan = 0;
let fundUnits = 0;
let fundNAV = 10.0;

let curIdx = 0;
let holdings = [0, 0, 0, 0, 0];
let totalCosts = [0, 0, 0, 0, 0];
let priceHistories = STOCKS.map(stock => Array(25).fill(stock.basePrice));

let fundWeights = [0.2, 0.2, 0.2, 0.2, 0.2];
let fundTotalCost = 0;

let currentEvents = [];
let turnCount = 0;
let currentTitleLevel = 0;
let chart;
let taxTurns = GAME_SETTINGS.livingCostTurns;
let accumulatedTax = 0;
let insuranceTurns = 0;

let hasWorkedThisTurn = false;
let isPaused = false;

let ownedItems = [];
let voucher1Count = 0;
let voucher2Count = 0;
let scratchTicketsLeft = GAME_SETTINGS.scratchTicketsPerRestock;
let scratchTimer = GAME_SETTINGS.scratchRestockSeconds;
let currentDiscounts = {};

let redCardCount = 0;
let greenCardCount = 0;
let activeRedCardStock = null;
let activeGreenCardStock = null;
let redCardCooldown = 0;
let greenCardCooldown = 0;
let lastMarketImpacts = STOCKS.map(() => 0);
let lastAiSummary = "AI 對手正在觀察市場";

let aiPlayers = AI_PLAYER_TEMPLATES.map(template => ({
    ...template,
    cash: template.startCash,
    holdings: STOCKS.map(() => 0),
    totalCosts: STOCKS.map(() => 0),
    lastAction: "觀望市場",
    lastImpact: 0,
    lagTurns: 0,        // 連續落後回合數
    catchUpCount: 0,    // 秘密補助觸發次數
}));

const STOCK_BUY_FEE = 0.001425;
const STOCK_SELL_TAX = 0.003;
const CRYPTO_FEE = 0.001;
const BANK_RATE = 0.01;
const LOAN_RATE = 0.05;
const TRUTH_RATE = 0.75;
const FUND_MGMT_FEE = 0.0001;
const DIVINATION_RTP = 0.85;

let divinationPlaysLeft = GAME_SETTINGS.divinationPlaysPerRefresh;
let isDivinationActive = false;
let divinationMines = [];
let divinationRevealedCount = 0;
let divinationCurrentMulti = 1.0;
let divinationEntryFee = GAME_SETTINGS.divinationMinBet;

function hasItem(itemId) {
    return ownedItems.includes(itemId);
}

function formatMoney(value, maximumFractionDigits = 0) {
    return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits })}`;
}

function getDiscountedItemCost(item) {
    const discount = currentDiscounts[item.id] || 0;
    return Math.floor(item.cost * (1 - discount));
}

function getCurrentPrice(index = curIdx) {
    const history = priceHistories[index];
    return history[history.length - 1];
}

function getStockShortName(index) {
    const match = STOCKS[index].name.match(/\(([^)]+)\)/);
    return match ? match[1] : STOCKS[index].name;
}

function getPriceChange(index, lookback = 3) {
    const history = priceHistories[index];
    const current = history[history.length - 1];
    const past = history[Math.max(0, history.length - 1 - lookback)];
    return past > 0 ? (current / past) - 1 : 0;
}

function getStockAssetValue() {
    return STOCKS.reduce((sum, stock, index) => {
        return sum + holdings[index] * getCurrentPrice(index);
    }, 0);
}

function getFundAssetValue() {
    return fundUnits * fundNAV;
}

function getTotalAssets() {
    return cash + bank + getStockAssetValue() + getFundAssetValue() - loan;
}

function getGrossAssets() {
    return cash + bank + getStockAssetValue() + getFundAssetValue();
}

function getAiStockAssetValue(ai) {
    return ai.holdings.reduce((sum, quantity, index) => {
        return sum + quantity * getCurrentPrice(index);
    }, 0);
}

function getAiTotalAssets(ai) {
    return ai.cash + getAiStockAssetValue(ai);
}
