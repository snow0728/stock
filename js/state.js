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
    aiCatchUpLagTurns: 8,
    aiCatchUpThreshold: 0.75,
    aiCatchUpBoostMin: 0.08,
    aiCatchUpBoostMax: 0.18,
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

// Pre-compute stock short names once at load time
const STOCK_SHORT_NAMES = STOCKS.map(s => {
    const m = s.name.match(/\(([^)]+)\)/);
    return m ? m[1] : s.name;
});

let cash = 10000, bank = 0, loan = 0, fundUnits = 0, fundNAV = 10.0;
let curIdx = 0;
let holdings = [0, 0, 0, 0, 0];
let totalCosts = [0, 0, 0, 0, 0];
let priceHistories = STOCKS.map(s => Array(25).fill(s.basePrice));
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
let voucher1Count = 0, voucher2Count = 0;
let scratchTicketsLeft = GAME_SETTINGS.scratchTicketsPerRestock;
let scratchTimer = GAME_SETTINGS.scratchRestockSeconds;
let currentDiscounts = {};

let redCardCount = 0, greenCardCount = 0;
let activeRedCardStock = null, activeGreenCardStock = null;
let redCardCooldown = 0, greenCardCooldown = 0;
let lastMarketImpacts = STOCKS.map(() => 0);
let lastAiSummary = "AI 對手正在觀察市場";

let aiPlayers = AI_PLAYER_TEMPLATES.map(t => ({
    ...t,
    cash: t.startCash,
    holdings: STOCKS.map(() => 0),
    totalCosts: STOCKS.map(() => 0),
    lastAction: "觀望市場",
    lastImpact: 0,
    lagTurns: 0,
    catchUpCount: 0,
    aiRedCooldown: 0,   // turns until AI can play red card again
    aiGreenCooldown: 0, // turns until AI can play green card again
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

// ── Helpers ──────────────────────────────────────────────

function hasItem(itemId) { return ownedItems.includes(itemId); }

function formatMoney(value, maximumFractionDigits = 0) {
    return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits })}`;
}

function getDiscountedItemCost(item) {
    return Math.floor(item.cost * (1 - (currentDiscounts[item.id] || 0)));
}

function getCurrentPrice(index = curIdx) {
    const h = priceHistories[index];
    return h[h.length - 1];
}

// Use pre-computed cache instead of regex on every call
function getStockShortName(index) { return STOCK_SHORT_NAMES[index]; }

function getPriceChange(index, lookback = 3) {
    const h = priceHistories[index];
    const past = h[Math.max(0, h.length - 1 - lookback)];
    return past > 0 ? h[h.length - 1] / past - 1 : 0;
}

function getStockAssetValue() {
    return holdings.reduce((sum, qty, i) => sum + qty * getCurrentPrice(i), 0);
}

function getFundAssetValue() { return fundUnits * fundNAV; }

function getTotalAssets() {
    return cash + bank + getStockAssetValue() + getFundAssetValue() - loan;
}

function getGrossAssets() {
    return cash + bank + getStockAssetValue() + getFundAssetValue();
}

function getAiTotalAssets(ai) {
    return ai.cash + ai.holdings.reduce((sum, qty, i) => sum + qty * getCurrentPrice(i), 0);
}
