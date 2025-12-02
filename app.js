/****************************************************
 * Ghost Finance – Full AI-CFO Engine
 * Monte Carlo • Bayes Behavior • Ghost Trajectory
 * Histograms • Risk Model • Psychological Engine
 ****************************************************/

// -----------------------------------------------
// STATE
// -----------------------------------------------
const state = {
  savings: 10000,
  debt: 5000,
  incomeMonthly: 3003000,
  expensesMonthly: 2000,
  debtInterestYearly: 0.05,
  horizonMonths: 24
};

// BAYES BEHAVIOR MODEL
let bayesBehavior = {
  alpha: 1,
  beta: 3,
  get prior() { 
    return this.alpha / (this.alpha + this.beta);
  }
};

// -----------------------------------------------
// CANVAS ELEMENTS
// -----------------------------------------------
const trajectoryCanvas = document.getElementById("trajectoryChart");
const mcCanvas = document.getElementById("mcHistogram");
const ctxTraj = trajectoryCanvas.getContext("2d");
const ctxMC = mcCanvas.getContext("2d");

// KPI elements
const kpiSavings = document.getElementById("kpi-savings");
const kpiDebt = document.getElementById("kpi-debt");
const kpiNetMonthly = document.getElementById("kpi-net-monthly");
const kpiDebtFreeDate = document.getElementById("kpi-debt-free-date");
const behaviorSummary = document.getElementById("behavior-summary");
const bayesProb = document.getElementById("bayes-prob");

// Result elements
const resultDebtDiff = document.getElementById("result-debt-diff");
const resultSavingsDiff = document.getElementById("result-savings-diff");
const resultRisk = document.getElementById("result-risk");
const resultAfford = document.getElementById("result-afford");
const cfoMessage = document.getElementById("cfo-message");

// Inputs & Buttons
const purchaseAmountInput = document.getElementById("purchase-amount");
const purchaseCategorySelect = document.getElementById("purchase-category");
const simulateBtn = document.getElementById("simulate-btn");
const resetBtn = document.getElementById("reset-btn");

// -----------------------------------------------
// UTILS
// -----------------------------------------------
function €(n) {
  return n.toLocaleString("fi-FI", {
    minimumFractionDigits: 0
  }) + " €";
}

// -----------------------------------------------
// BASE TRAJECTORY
// -----------------------------------------------
function computeBaseTrajectory() {
  const pts = [];
  let s = state.savings;
  let d = state.debt;

  const net = state.incomeMonthly - state.expensesMonthly;
  const mi = state.debtInterestYearly / 12;

  let debtFree = null;

  for (let m = 0; m <= state.horizonMonths; m++) {
    pts.push({ m, networth: s - d });

    if (m === state.horizonMonths) break;

    d *= 1 + mi;
    s += net;

    const pay = Math.min(s, d);
    d -= pay;
    s -= pay;

    if (d <= 1 && debtFree === null) debtFree = m + 1;
  }

  return { pts, debtFree };
}

// -----------------------------------------------
// GHOST TRAJECTORY (after purchase)
// -----------------------------------------------
function computeGhostTrajectory(amount, behaviorFactor) {
  const pts = [];
  let s = state.savings - amount;
  let d = state.debt;

  const adjExp = state.expensesMonthly * behaviorFactor;
  const net = state.incomeMonthly - adjExp;
  const mi = state.debtInterestYearly / 12;

  let debtFree = null;

  for (let m = 0; m <= state.horizonMonths; m++) {
    pts.push({ m, networth: s - d });

    if (m === state.horizonMonths) break;

    d *= 1 + mi;
    s += net;

    const pay = Math.min(s, d);
    d -= pay;
    s -= pay;

    if (d <= 1 && debtFree === null) debtFree = m + 1;
  }

  return { pts, debtFree };
}

// -----------------------------------------------
// BAYES BEHAVIOR
// -----------------------------------------------
function updateBayesModel(isImpulse) {
  if (isImpulse) bayesBehavior.alpha += 1;
  else bayesBehavior.beta += 1;
}

function inferBehaviorFactor(category, amount) {
  let base = 1.0;

  if (category === "rolex") base = 1.12;
  else if (category === "car") base = 1.08;
  else if (category === "tech") base = 1.05;
  else if (category === "lifestyle") base = 1.03;
  else base = 1.02;

  if (amount > state.incomeMonthly * 1.5) base += 0.05;

  const bayesBoost = 1 + bayesBehavior.prior * 0.4;
  return base * bayesBoost;
}

// -----------------------------------------------
// MONTE CARLO SIMULATION
// -----------------------------------------------
function monteCarloSimulation(runs = 2000) {
  const results = [];

  const net = state.incomeMonthly - state.expensesMonthly;
  const mi = state.debtInterestYearly / 12;

  const mu = 0.06 / 12;
  const sigma = 0.15 / Math.sqrt(12);

  for (let r = 0; r < runs; r++) {
    let s = state.savings;
    let d = state.debt;

    for (let m = 0; m < state.horizonMonths; m++) {
      d *= 1 + mi;
      s += net;

      const pay = Math.min(s, d);
      d -= pay;
      s -= pay;

      const rand = (Math.random() - 0.5) * sigma * 2;
      s *= 1 + mu + rand;
    }

    results.push(s - d);
  }

  results.sort((a, b) => a - b);

  const mean = results.reduce((a, b) => a + b, 0) / results.length;
  const median = results[Math.floor(results.length / 2)];
  const variance =
    results.reduce((acc, v) => acc + (v - mean) ** 2, 0) / results.length;
  const std = Math.sqrt(variance);

  return { mean, median, std, dist: results };
}

// -----------------------------------------------
// DRAW MONTE CARLO HISTOGRAM
// -----------------------------------------------
function drawHistogram(mc) {
  const ctx = ctxMC;
  const w = mcCanvas.width = mcCanvas.clientWidth * window.devicePixelRatio;
  const h = mcCanvas.height = mcCanvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, mcCanvas.clientWidth, mcCanvas.clientHeight);

  const dist = mc.dist;
  const bins = 30;
  const min = dist[0];
  const max = dist[dist.length - 1];
  const step = (max - min) / bins;

  const histogram = new Array(bins).fill(0);

  dist.forEach(v => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    histogram[idx]++;
  });

  const maxCount = Math.max(...histogram);
  const bw = mcCanvas.clientWidth / bins;

  ctx.fillStyle = "rgba(56,189,248,0.55)";

  histogram.forEach((count, i) => {
    const barHeight = (count / maxCount) * mcCanvas.clientHeight * 0.8;
    ctx.fillRect(
      i * bw,
      mcCanvas.clientHeight - barHeight,
      bw - 2,
      barHeight
    );
  });
}

// -----------------------------------------------
// DRAW TRAJECTORIES
// -----------------------------------------------
function drawTrajectory(base, ghost = null) {
  const canvas = trajectoryCanvas;
  const ctx = ctxTraj;

  const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
  const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  const all = [...base.pts, ...(ghost?.pts || [])];
  const vals = all.map(p => p.networth);
  const min = Math.min(...vals);
  const max = Math.max(...vals);

  const left = 40;
  const bottom = 30;
  const top = 20;

  const x = m =>
    left +
    (m / state.horizonMonths) *
      (canvas.clientWidth - left - 20);

  const y = v => {
    const ratio = (v - min) / (max - min || 1);
    return canvas.clientHeight - bottom - ratio * (canvas.clientHeight - top - bottom);
  };

  // Base line
  ctx.beginPath();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;

  base.pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(p.m), y(p.networth));
    else ctx.lineTo(x(p.m), y(p.networth));
  });
  ctx.stroke();

  // Ghost line
  if (ghost) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.setLineDash([6, 3]);
    ghost.pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(p.m), y(p.networth));
      else ctx.lineTo(x(p.m), y(p.networth));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// -----------------------------------------------
// UPDATE KPI PANEL
// -----------------------------------------------
function updateKpis(base) {
  kpiSavings.textContent = €(state.savings);
  kpiDebt.textContent = €(state.debt);

  const net = state.incomeMonthly - state.expensesMonthly;
  kpiNetMonthly.textContent = (net >= 0 ? "+" : "") + €(net);

  kpiDebtFreeDate.textContent = base.debtFree ? base.debtFree + " kk" : ">24 kk";
}

// -----------------------------------------------
// PSYCHOLOGICAL PROFILE
// -----------------------------------------------
function updatePsychology() {
  const p = bayesBehavior.prior;

  let profile = "";
  if (p < 0.15) profile = "Rauhallinen, rationaalinen ostaja";
  else if (p < 0.35) profile = "Hieman impulsiivinen, mutta kontrolloitavissa";
  else if (p < 0.6) profile = "Selvästi impulssiriskinen";
  else profile = "Vahvasti impulssiostaja";

  behaviorSummary.textContent = profile;
  bayesProb.textContent = "Impulssiostos riski: " + (p * 100).toFixed(1) + "%";
}

// -----------------------------------------------
// CFO ANALYSIS
// -----------------------------------------------
function updateResults(base, ghost, amount, bf) {
  if (!ghost) {
    resultDebtDiff.textContent = "–";
    resultSavingsDiff.textContent = "–";
    resultRisk.textContent = "–";
    resultAfford.textContent = "–";
    return;
  }

  const diff = (ghost.debtFree ?? 24) - (base.debtFree ?? 24);
  resultDebtDiff.textContent = diff >= 0 ? "+" + diff + " kk" : diff + " kk";

  const endBase = base.pts.at(-1).networth;
  const endGhost = ghost.pts.at(-1).networth;

  const diffMoney = endGhost - endBase;
  resultSavingsDiff.textContent = €(diffMoney);

  let risk = "Matala";
  if (bf > 1.1) risk = "Korkea";
  if (bf > 1.18) risk = "Erittäin korkea";

  resultRisk.textContent = risk;

  const nw = state.savings - state.debt;
  const ratio = amount / Math.max(1, nw);

  let msg = "";
  if (ratio > 0.7) msg = "Ei varaa";
  else if (ratio > 0.4) msg = "Huono idea";
  else if (ratio > 0.2) msg = "Välttävä";
  else msg = "Mahdollinen";

  resultAfford.textContent = msg;

  cfoMessage.textContent =
    msg === "Ei varaa"
      ? "Osto pidentäisi velattomuusaikaa ja nostaisi riskitasoa merkittävästi."
      : "Analyysi valmis. Tarkastele ghost-viivaa ja histogrammia.";
}

// -----------------------------------------------
// INIT ALL
// -----------------------------------------------
function init() {
  const base = computeBaseTrajectory();
  updateKpis(base);
  updatePsychology();
  drawTrajectory(base);

  const mc = monteCarloSimulation();
  drawHistogram(mc);

  simulateBtn.onclick = () => {
    const amount = Number(purchaseAmountInput.value);
    const cat = purchaseCategorySelect.value;

    if (!amount || amount <= 0) return alert("Syötä ostohinta.");

    const bf = inferBehaviorFactor(cat, amount);
    const impulse = bf > 1.07;
    updateBayesModel(impulse);

    const base = computeBaseTrajectory();
    const ghost = computeGhostTrajectory(amount, bf);

    drawTrajectory(base, ghost);
    updateKpis(base);
    updatePsychology();
    updateResults(base, ghost, amount, bf);

    const mc = monteCarloSimulation();
    drawHistogram(mc);
  };

  resetBtn.onclick = () => {
    const base = computeBaseTrajectory();
    drawTrajectory(base);
    updateResults(base, null, 0, 1);
  };
}

init();
