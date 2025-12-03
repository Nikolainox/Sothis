/****************************************************
 * Ghost Finance – AI-CFO Cockpit
 * Monte Carlo • Bayes • Ghost • Smart-kalenteri • Autopilot • Joystick
 ****************************************************/

// --------- DEFAULT STATE ---------
const defaultState = {
  savings: 10000,
  debt: 5000,
  incomeMonthly: 3000,
  expensesMonthly: 2000,
  debtInterestYearly: 0.05,
  horizonMonths: 24
};

let state = { ...defaultState };

// Bayes behavior (impulssiriski)
let bayesBehavior = {
  alpha: 1,
  beta: 3,
  get prior() {
    return this.alpha / (this.alpha + this.beta);
  }
};

// Autopilot state
const autopilot = {
  active: true,
  corridorMonths: 2,         // montako kk velka saa kärsiä
  corridorNetWorthPct: 0.08, // paljonko 24 kk net worth saa tippua (%)
  correctionsToday: 0,
  overrides: 0
};

// Joystick / cockpit transform state
let timelinePhase = 0; // -0.5...0.5
let zoomLevel = 1;     // 0.9...1.1
let rotationLevel = 0; // -1...1

// Cached simulation results
let baseTraj = null;
let ghostTraj = null;
let everythingTraj = null;
let mcResult = null;
let calendarData = null;

// --------- DOM ---------
const trajectoryCanvas = document.getElementById("trajectoryChart");
const calendarCanvas = document.getElementById("calendarTimeline");
const mcCanvas = document.getElementById("mcHistogram");
const ctxTraj = trajectoryCanvas.getContext("2d");
const ctxCal = calendarCanvas.getContext("2d");
const ctxMC = mcCanvas.getContext("2d");

// KPI
const kpiSavings = document.getElementById("kpi-savings");
const kpiDebt = document.getElementById("kpi-debt");
const kpiNetMonthly = document.getElementById("kpi-net-monthly");
const kpiDebtFreeDate = document.getElementById("kpi-debt-free-date");
const behaviorSummary = document.getElementById("behavior-summary");
const bayesProb = document.getElementById("bayes-prob");
const cfoMessage = document.getElementById("cfo-message");

// Sim result
const resultDebtDiff = document.getElementById("result-debt-diff");
const resultSavingsDiff = document.getElementById("result-savings-diff");
const resultRisk = document.getElementById("result-risk");
const resultAfford = document.getElementById("result-afford");

// Inputs
const purchaseAmountInput = document.getElementById("purchase-amount");
const purchaseCategorySelect = document.getElementById("purchase-category");
const simulateBtn = document.getElementById("simulate-btn");
const resetBtn = document.getElementById("reset-btn");

// Profile inputs
const profileSavings = document.getElementById("profile-savings");
const profileDebt = document.getElementById("profile-debt");
const profileIncome = document.getElementById("profile-income");
const profileExpenses = document.getElementById("profile-expenses");
const profileInterest = document.getElementById("profile-interest");
const profileSaveBtn = document.getElementById("profile-save-btn");

// Ghost buttons
const ghostEverythingBtn = document.getElementById("ghost-everything-btn");
const ghostClearBtn = document.getElementById("ghost-clear-btn");

// Autopilot DOM
const autopilotCard = document.getElementById("autopilot-card");
const autopilotStatus = document.getElementById("autopilot-status");
const autopilotStats = document.getElementById("autopilot-stats");
const autopilotToggle = document.getElementById("autopilot-toggle");

// Joystick
const joystick = document.getElementById("joystick");

// --------- UTIL ---------
function formatCurrency(n) {
  return n.toLocaleString("fi-FI", { maximumFractionDigits: 0 }) + " €";
}

function netPerMonth() {
  return state.incomeMonthly - state.expensesMonthly;
}

// --------- STORAGE ---------
function loadFromStorage() {
  try {
    const data = localStorage.getItem("gf_state");
    if (data) {
      const parsed = JSON.parse(data);
      state = { ...state, ...parsed };
    }
    const beh = localStorage.getItem("gf_behavior");
    if (beh) {
      const parsedB = JSON.parse(beh);
      bayesBehavior.alpha = parsedB.alpha ?? bayesBehavior.alpha;
      bayesBehavior.beta = parsedB.beta ?? bayesBehavior.beta;
    }
  } catch {
    // ignore
  }
}

function saveStateToStorage() {
  try {
    localStorage.setItem(
      "gf_state",
      JSON.stringify({
        savings: state.savings,
        debt: state.debt,
        incomeMonthly: state.incomeMonthly,
        expensesMonthly: state.expensesMonthly,
        debtInterestYearly: state.debtInterestYearly
      })
    );
  } catch {}
}

function saveBehaviorToStorage() {
  try {
    localStorage.setItem(
      "gf_behavior",
      JSON.stringify({
        alpha: bayesBehavior.alpha,
        beta: bayesBehavior.beta
      })
    );
  } catch {}
}

// --------- TRAJECTORIES ---------
function computeBaseTrajectory() {
  const pts = [];
  let s = state.savings;
  let d = state.debt;
  const net = netPerMonth();
  const mi = state.debtInterestYearly / 12;
  let debtFree = null;

  for (let m = 0; m <= state.horizonMonths; m++) {
    pts.push({ m, networth: s - d });

    if (m === state.horizonMonths) break;

    d *= 1 + mi;
    s += net;

    const pay = Math.min(d, Math.max(0, s));
    d -= pay;
    s -= pay;

    if (d <= 1 && debtFree === null) debtFree = m + 1;
  }
  return { pts, debtFree };
}

function computeGhostTrajectory(amount, behaviorFactor) {
  const pts = [];
  let s = state.savings - amount;
  let d = state.debt;

  const adjExpenses = state.expensesMonthly * behaviorFactor;
  const net = state.incomeMonthly - adjExpenses;
  const mi = state.debtInterestYearly / 12;
  let debtFree = null;

  for (let m = 0; m <= state.horizonMonths; m++) {
    pts.push({ m, networth: s - d });

    if (m === state.horizonMonths) break;

    d *= 1 + mi;
    s += net;

    const pay = Math.min(d, Math.max(0, s));
    d -= pay;
    s -= pay;

    if (d <= 1 && debtFree === null) debtFree = m + 1;
  }
  return { pts, debtFree };
}

// “osta kaikki” – maksimi-impulssikäyttäytyminen
function computeEverythingTrajectory() {
  const pts = [];
  let s = state.savings;
  let d = state.debt;

  const impulseMultiplier = 1.5 + bayesBehavior.prior; // mitä impulsiivisempi olet, sitä pahempi
  const adjExpenses = state.expensesMonthly * impulseMultiplier;
  const net = state.incomeMonthly - adjExpenses;
  const mi = state.debtInterestYearly / 12;
  let debtFree = null;

  for (let m = 0; m <= state.horizonMonths; m++) {
    pts.push({ m, networth: s - d });

    if (m === state.horizonMonths) break;

    d *= 1 + mi;
    s += net;

    // maksat velkaa enää osittain
    const pay = Math.min(d, Math.max(0, s * 0.2));
    d -= pay;
    s -= pay;

    if (d <= 1 && debtFree === null) debtFree = m + 1;
  }
  return { pts, debtFree };
}

// --------- BAYES BEHAVIOR ---------
function updateBayesModel(isImpulse) {
  if (isImpulse) bayesBehavior.alpha += 1;
  else bayesBehavior.beta += 1;
  saveBehaviorToStorage();
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

// --------- MONTE CARLO ---------
function monteCarloSimulation(runs = 1500) {
  const results = [];
  const mi = state.debtInterestYearly / 12;
  const mu = 0.06 / 12; // odotettu tuotto
  const sigma = 0.15 / Math.sqrt(12); // volatiliteetti
  const net = netPerMonth();

  for (let r = 0; r < runs; r++) {
    let s = state.savings;
    let d = state.debt;

    for (let m = 0; m < state.horizonMonths; m++) {
      d *= 1 + mi;
      s += net;

      const pay = Math.min(d, Math.max(0, s));
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

// --------- SMART-KALENTERI DATA ---------
function generateSmartCalendar(base, everything, mc) {
  const days = 90; // 3 kk eteenpäin
  const result = [];

  const mean = mc.mean;
  const std = mc.std || 1;

  for (let i = 0; i < days; i++) {
    const idx = Math.min(
      base.pts.length - 1,
      Math.floor((i / days) * base.pts.length)
    );

    const baseNW = base.pts[idx].networth;
    const worstNW = everything ? everything.pts[idx].networth : baseNW;

    const behaviorRisk = bayesBehavior.prior; // 0–1

    const mcStress = 0.5 + ((mean - baseNW) / (std * 3));
    const ghostStress =
      baseNW <= 0
        ? 1
        : Math.max(0, Math.min(1, (baseNW - worstNW) / Math.abs(baseNW || 1)));

    let risk = behaviorRisk * 0.5 + ghostStress * 0.3 + mcStress * 0.2;
    risk = Math.max(0, Math.min(1, risk));

    result.push({
      day: i,
      risk,
      baseNW
    });
  }
  return result;
}

// --------- AUTOPILOT ANALYYSI ---------
function evaluateImpact(base, ghost) {
  const baseMonth = base.debtFree ?? state.horizonMonths;
  const ghostMonth = ghost.debtFree ?? state.horizonMonths;
  const debtDiffMonths = ghostMonth - baseMonth;

  const baseEnd = base.pts[base.pts.length - 1].networth;
  const ghostEnd = ghost.pts[ghost.pts.length - 1].networth;
  const netWorthDiff = ghostEnd - baseEnd;
  const netWorthDropPct = baseEnd !== 0 ? -netWorthDiff / Math.abs(baseEnd) : 0;

  return { debtDiffMonths, netWorthDiff, netWorthDropPct };
}

function autopilotAnalyze(impact, amount) {
  if (!autopilot.active || amount <= 0) {
    return { level: "off", reason: "Autopilot ei aktiivinen." };
  }

  const { debtDiffMonths, netWorthDropPct } = impact;

  // BLOCK
  if (
    debtDiffMonths > autopilot.corridorMonths ||
    netWorthDropPct > autopilot.corridorNetWorthPct
  ) {
    return {
      level: "block",
      reason:
        "Ostos veisi sinut liian kauas optimaalisesta reitistä (velka + net worth). Autopilot blokkaa."
    };
  }

  // WARN
  if (debtDiffMonths > 0 || netWorthDropPct > 0.03) {
    return {
      level: "warn",
      reason:
        "Ostos heikentää reittiäsi, mutta pysyt vielä koridorissa. Autopilot suosittelee harkintaa."
    };
  }

  // OK
  return {
    level: "ok",
    reason: "Ostos ei riko autopilotin rajoja. Reitti säilyy vakaana."
  };
}

// --------- DRAW: TRAJECTORY ---------
function drawTrajectory(base, ghost, everything) {
  const dpr = window.devicePixelRatio || 1;
  const width = trajectoryCanvas.clientWidth;
  const height = trajectoryCanvas.clientHeight;
  trajectoryCanvas.width = width * dpr;
  trajectoryCanvas.height = height * dpr;
  ctxTraj.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctxTraj.clearRect(0, 0, width, height);

  const allPts = [
    ...base.pts,
    ...(ghost ? ghost.pts : []),
    ...(everything ? everything.pts : [])
  ];
  const vals = allPts.map(p => p.networth);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const left = 40;
  const right = 20;
  const top = 20;
  const bottom = 30;

  const x = m =>
    left +
    (m / state.horizonMonths) * (width - left - right);

  const y = v => {
    const ratio = (v - min) / (max - min || 1);
    return height - bottom - ratio * (height - top - bottom);
  };

  // grid
  ctxTraj.strokeStyle = "rgba(148,163,184,0.35)";
  ctxTraj.lineWidth = 0.5;
  ctxTraj.setLineDash([4, 4]);
  for (let m = 0; m <= state.horizonMonths; m += 3) {
    ctxTraj.beginPath();
    ctxTraj.moveTo(x(m), top);
    ctxTraj.lineTo(x(m), height - bottom);
    ctxTraj.stroke();
  }
  ctxTraj.setLineDash([]);

  // base
  ctxTraj.beginPath();
  base.pts.forEach((p, i) => {
    if (i === 0) ctxTraj.moveTo(x(p.m), y(p.networth));
    else ctxTraj.lineTo(x(p.m), y(p.networth));
  });
  ctxTraj.strokeStyle = "#38bdf8";
  ctxTraj.lineWidth = 2;
  ctxTraj.stroke();

  // ghost (ostoksen jälkeen)
  if (ghost) {
    ctxTraj.beginPath();
    ghost.pts.forEach((p, i) => {
      if (i === 0) ctxTraj.moveTo(x(p.m), y(p.networth));
      else ctxTraj.lineTo(x(p.m), y(p.networth));
    });
    ctxTraj.strokeStyle = "rgba(248,250,252,0.8)";
    ctxTraj.lineWidth = 1.8;
    ctxTraj.setLineDash([6, 3]);
    ctxTraj.stroke();
    ctxTraj.setLineDash([]);
  }

  // everything (osta kaikki)
  if (everything) {
    ctxTraj.beginPath();
    everything.pts.forEach((p, i) => {
      if (i === 0) ctxTraj.moveTo(x(p.m), y(p.networth));
      else ctxTraj.lineTo(x(p.m), y(p.networth));
    });
    ctxTraj.strokeStyle = "#f97373";
    ctxTraj.lineWidth = 1.6;
    ctxTraj.setLineDash([2, 2]);
    ctxTraj.stroke();
    ctxTraj.setLineDash([]);
  }
}

// --------- DRAW: MONTE CARLO HISTOGRAM ---------
function drawHistogram(mc) {
  const dpr = window.devicePixelRatio || 1;
  const width = mcCanvas.clientWidth;
  const height = mcCanvas.clientHeight;
  mcCanvas.width = width * dpr;
  mcCanvas.height = height * dpr;
  ctxMC.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctxMC.clearRect(0, 0, width, height);
  const dist = mc.dist;
  if (!dist || !dist.length) return;

  const bins = 30;
  const min = dist[0];
  const max = dist[dist.length - 1];
  const step = (max - min || 1) / bins;
  const hist = new Array(bins).fill(0);

  dist.forEach(v => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    hist[idx]++;
  });

  const maxCount = Math.max(...hist);
  const barWidth = width / bins;

  ctxMC.fillStyle = "rgba(56,189,248,0.7)";

  hist.forEach((count, i) => {
    const barHeight = (count / maxCount) * (height * 0.85);
    ctxMC.fillRect(
      i * barWidth,
      height - barHeight,
      barWidth - 2,
      barHeight
    );
  });
}

// --------- DRAW: SMART CALENDAR TIMELINE ---------
function drawCalendarTimeline(calendarData, phase = 0) {
  const dpr = window.devicePixelRatio || 1;
  const width = calendarCanvas.clientWidth;
  const height = calendarCanvas.clientHeight;
  calendarCanvas.width = width * dpr;
  calendarCanvas.height = height * dpr;
  ctxCal.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctxCal.clearRect(0, 0, width, height);

  const days = calendarData.length;
  if (!days) return;

  const barWidth = width / days;
  const offset = phase * days;

  // riskipalkit
  calendarData.forEach((d, i) => {
    let color;
    if (d.risk < 0.33) color = "#22c55e";
    else if (d.risk < 0.66) color = "#facc15";
    else color = "#f97373";

    const barHeight = (0.2 + d.risk * 0.8) * (height * 0.9);

    const xIndex = i + offset;
    const frac = (((xIndex % days) + days) % days) / days;
    const x = frac * width;
    const y = height - barHeight;

    ctxCal.fillStyle = color;
    ctxCal.globalAlpha = 0.8;
    ctxCal.fillRect(x, y, barWidth - 1, barHeight);
  });

  ctxCal.globalAlpha = 1;

  // “sykeviiva”: net worth trendi päälle
  const baseNW = calendarData.map(d => d.baseNW);
  const minNW = Math.min(...baseNW);
  const maxNW = Math.max(...baseNW);

  ctxCal.beginPath();
  baseNW.forEach((nw, i) => {
    const t = (nw - minNW) / (maxNW - minNW || 1);
    const xIndex = i + offset;
    const frac = (((xIndex % days) + days) % days) / days;
    const x = frac * width + barWidth / 2;
    const y = height - (t * 0.7 + 0.15) * height;
    if (i === 0) ctxCal.moveTo(x, y);
    else ctxCal.lineTo(x, y);
  });
  ctxCal.strokeStyle = "rgba(248,250,252,0.9)";
  ctxCal.lineWidth = 1.6;
  ctxCal.setLineDash([5, 3]);
  ctxCal.stroke();
  ctxCal.setLineDash([]);
}

// --------- UI: KPI & PSYKOLOGIA & AUTOPILOT & RESULTS ---------
function updateKpis(base) {
  kpiSavings.textContent = formatCurrency(state.savings);
  kpiDebt.textContent = formatCurrency(state.debt);
  const net = netPerMonth();
  kpiNetMonthly.textContent =
    (net >= 0 ? "+" : "") + formatCurrency(net).replace(" €", "") + " €/kk";
  kpiDebtFreeDate.textContent = base.debtFree
    ? base.debtFree + " kk"
    : "> " + state.horizonMonths + " kk";
}

function updatePsychology() {
  const p = bayesBehavior.prior;
  let profile;
  if (p < 0.15) profile = "Rauhallinen, rationaalinen ostaja.";
  else if (p < 0.35) profile = "Hieman impulsiivinen, hallittavissa.";
  else if (p < 0.6) profile = "Selvästi impulssiriskinen.";
  else profile = "Kova impulssiostaja – tarvitset tiukat rajat.";

  behaviorSummary.textContent = profile;
  bayesProb.textContent = "Impulssiostos riski: " + (p * 100).toFixed(1) + " %";
}

function updateAutopilotUI() {
  if (!autopilotCard) return;

  if (autopilot.active) {
    autopilotCard.classList.remove("autopilot-off");
    autopilotStatus.textContent = "AUTOPILOT: AKTIIVINEN · Reitti lukittu";
    autopilotToggle.textContent = "Autopilot: ON";
  } else {
    autopilotCard.classList.add("autopilot-off");
    autopilotStatus.textContent = "AUTOPILOT: POIS PÄÄLTÄ · Manuaalinen ohjaus";
    autopilotToggle.textContent = "Autopilot: OFF";
  }

  autopilotStats.textContent =
    `Korjaukset tänään: ${autopilot.correctionsToday} · Override: ${autopilot.overrides}`;
}

function updateResults(base, ghost, amount, bf, autopilotInfo) {
  if (!ghost) {
    resultDebtDiff.textContent = "–";
    resultSavingsDiff.textContent = "–";
    resultRisk.textContent = "–";
    resultAfford.textContent = "–";
    cfoMessage.textContent =
      "Syötä ostos tai käytä “Haamu: osta kaikki” nähdäksesi todellisen tulevaisuuden.";
    return;
  }

  const baseMonth = base.debtFree ?? state.horizonMonths;
  const ghostMonth = ghost.debtFree ?? state.horizonMonths;
  const debtDiff = ghostMonth - baseMonth;

  const baseEnd = base.pts[base.pts.length - 1].networth;
  const ghostEnd = ghost.pts[ghost.pts.length - 1].networth;
  const diffMoney = ghostEnd - baseEnd;

  resultDebtDiff.textContent =
    (debtDiff >= 0 ? "+" : "") + debtDiff + " kk";
  resultSavingsDiff.textContent = formatCurrency(diffMoney);

  let risk = "Matala";
  if (bf > 1.1) risk = "Korkea";
  if (bf > 1.2) risk = "Erittäin korkea";
  resultRisk.textContent = risk;

  const nw = state.savings - state.debt;
  const ratio = amount > 0 ? amount / Math.max(1, nw) : 0;

  let decision;
  if (amount === 0) {
    decision = "Stressitesti: osta kaikki -haamutarkastelu.";
  } else if (nw <= 0 && amount > 0) {
    decision =
      "Et ole edes nettovarallisuudessa plussalla. Tämä ostos on puolustusta vastaan, ei edistystä.";
  } else if (ratio > 0.7) {
    decision = "Taloudellisesti typerä liike. Älä osta.";
  } else if (ratio > 0.4) {
    decision = "Vahvasti ei-suositeltava. Maksetaan vapaudella, ei vain rahalla.";
  } else if (ratio > 0.2) {
    decision = "Voi toimia, jos velka ja sijoitussuunnitelma ovat hallinnassa.";
  } else {
    decision = "Taloudellisesti mahdollinen, jos tämä tukee pitkän aikavälin strategiaasi.";
  }

  resultAfford.textContent = decision;

  // Autopilot-viesti
  if (!autopilotInfo || autopilotInfo.level === "off") {
    if (amount === 0) {
      cfoMessage.textContent =
        "Haamu-hologrammi näyttää tien, jossa annat mielitekojesi ohjata. Näet selvästi, mihin se johtaa.";
    } else {
      cfoMessage.textContent =
        "Ghost-viiva kertoo todellisen hinnan: euroja, kuukausia ja tulevaa liikkumavapauttasi.";
    }
    return;
  }

  if (autopilotInfo.level === "block") {
    cfoMessage.textContent =
      "AUTOPILOT BLOCK: " + autopilotInfo.reason;
  } else if (autopilotInfo.level === "warn") {
    cfoMessage.textContent =
      "AUTOPILOT WARNING: " + autopilotInfo.reason;
  } else if (autopilotInfo.level === "ok") {
    cfoMessage.textContent =
      "AUTOPILOT OK: " + autopilotInfo.reason;
  }
}

// --------- PROFILE ---------
function loadProfileInputs() {
  profileSavings.value = state.savings;
  profileDebt.value = state.debt;
  profileIncome.value = state.incomeMonthly;
  profileExpenses.value = state.expensesMonthly;
  profileInterest.value = (state.debtInterestYearly * 100).toFixed(1);
}

// --------- COCKPIT TRANSFORM (JOYSTICK) ---------
function applyCockpitTransform() {
  const panel = document.querySelector(".main-panel");
  if (!panel) return;
  const rotateX = (zoomLevel - 1) * -12; // pieni kallistus
  const rotateY = rotationLevel * 10;
  panel.style.transform =
    `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
}

// --------- INIT ---------
function init() {
  loadFromStorage();
  loadProfileInputs();

  baseTraj = computeBaseTrajectory();
  everythingTraj = computeEverythingTrajectory();
  ghostTraj = null;

  mcResult = monteCarloSimulation();
  calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

  updateKpis(baseTraj);
  updatePsychology();
  updateAutopilotUI();
  applyCockpitTransform();

  drawTrajectory(baseTraj, null, null);
  drawHistogram(mcResult);
  drawCalendarTimeline(calendarData, timelinePhase);
  updateResults(baseTraj, null, 0, 1, null);

  // Simulate purchase
  simulateBtn.addEventListener("click", () => {
    const amount = Number(purchaseAmountInput.value) || 0;
    const category = purchaseCategorySelect.value;

    if (amount <= 0) {
      alert("Syötä ostohinta, joka on suurempi kuin 0 €.");
      return;
    }

    const bf = inferBehaviorFactor(category, amount);
    const isImpulse = bf > 1.07;
    updateBayesModel(isImpulse);

    baseTraj = computeBaseTrajectory();
    const ghostCandidate = computeGhostTrajectory(amount, bf);
    everythingTraj = computeEverythingTrajectory();

    let autopilotInfo = { level: "off", reason: "" };
    let ghostToDraw = ghostCandidate;

    if (autopilot.active) {
      const impact = evaluateImpact(baseTraj, ghostCandidate);
      autopilotInfo = autopilotAnalyze(impact, amount);

      if (autopilotInfo.level === "block") {
        ghostToDraw = null;
        autopilot.correctionsToday += 1;
      } else if (autopilotInfo.level === "warn") {
        autopilot.correctionsToday += 1;
      }
    }

    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

    updateKpis(baseTraj);
    updatePsychology();
    updateAutopilotUI();
    drawTrajectory(baseTraj, ghostToDraw, everythingTraj);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
    updateResults(baseTraj, ghostCandidate, amount, bf, autopilotInfo);
  });

  // Reset
  resetBtn.addEventListener("click", () => {
    baseTraj = computeBaseTrajectory();
    ghostTraj = null;
    everythingTraj = computeEverythingTrajectory();
    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

    updateKpis(baseTraj);
    updatePsychology();
    updateAutopilotUI();
    drawTrajectory(baseTraj, null, null);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
    updateResults(baseTraj, null, 0, 1, null);
  });

  // Save profile
  profileSaveBtn.addEventListener("click", () => {
    state.savings = Number(profileSavings.value) || 0;
    state.debt = Number(profileDebt.value) || 0;
    state.incomeMonthly = Number(profileIncome.value) || 0;
    state.expensesMonthly = Number(profileExpenses.value) || 0;
    state.debtInterestYearly =
      (Number(profileInterest.value) || 0) / 100;

    saveStateToStorage();

    baseTraj = computeBaseTrajectory();
    ghostTraj = null;
    everythingTraj = computeEverythingTrajectory();
    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

    updateKpis(baseTraj);
    updatePsychology();
    updateAutopilotUI();
    drawTrajectory(baseTraj, null, null);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
    updateResults(baseTraj, null, 0, 1, null);

    cfoMessage.textContent =
      "Profiili päivitetty. Tämä on nyt uusi taloudellinen todellisuutesi.";
  });

  // Ghost: osta kaikki
  ghostEverythingBtn.addEventListener("click", () => {
    baseTraj = computeBaseTrajectory();
    everythingTraj = computeEverythingTrajectory();
    ghostTraj = everythingTraj;
    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

    updateKpis(baseTraj);
    updatePsychology();
    updateAutopilotUI();
    drawTrajectory(baseTraj, null, everythingTraj);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
    updateResults(baseTraj, everythingTraj, 0, 1.5 + bayesBehavior.prior, null);
  });

  // Clear ghost
  ghostClearBtn.addEventListener("click", () => {
    baseTraj = computeBaseTrajectory();
    ghostTraj = null;
    everythingTraj = computeEverythingTrajectory();
    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);

    updateKpis(baseTraj);
    updatePsychology();
    updateAutopilotUI();
    drawTrajectory(baseTraj, null, null);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
    updateResults(baseTraj, null, 0, 1, null);
  });

  // Autopilot toggle
  autopilotToggle.addEventListener("click", () => {
    autopilot.active = !autopilot.active;
    if (!autopilot.active) {
      autopilot.overrides += 1;
    }
    updateAutopilotUI();
  });

  // Resize handling
  window.addEventListener("resize", () => {
    mcResult = monteCarloSimulation();
    calendarData = generateSmartCalendar(baseTraj, everythingTraj, mcResult);
    drawTrajectory(baseTraj, ghostTraj, everythingTraj);
    drawHistogram(mcResult);
    drawCalendarTimeline(calendarData, timelinePhase);
  });

  // Joystick control
  initJoystick();
}

// --------- JOYSTICK LOGIC ---------
function initJoystick() {
  if (!joystick) return;
  const baseEl = joystick.parentElement; // joystick-base
  const baseSize = 120;
  const stickSize = 38;
  const radius = (baseSize - stickSize) / 2;

  let dragging = false;

  function resetJoystick() {
    joystick.style.transform = "translate(0px, 0px)";
  }

  function updateJoystick(dx, dy) {
    const mag = Math.sqrt(dx * dx + dy * dy);
    let ndx = dx;
    let ndy = dy;
    if (mag > radius) {
      ndx = (dx / mag) * radius;
      ndy = (dy / mag) * radius;
    }
    joystick.style.transform = `translate(${ndx}px, ${ndy}px)`;

    const nx = ndx / radius; // -1..1
    const ny = ndy / radius;

    // cockpit-efektit
    zoomLevel = Math.max(0.9, Math.min(1.1, zoomLevel - ny * 0.01));
    rotationLevel = Math.max(-1, Math.min(1, rotationLevel + nx * 0.02));
    timelinePhase = Math.max(-0.5, Math.min(0.5, timelinePhase + nx * 0.01));

    applyCockpitTransform();
    if (calendarData) {
      drawCalendarTimeline(calendarData, timelinePhase);
    }
  }

  joystick.addEventListener("pointerdown", e => {
    dragging = true;
    joystick.setPointerCapture(e.pointerId);
  });

  joystick.addEventListener("pointermove", e => {
    if (!dragging) return;
    const rect = baseEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    updateJoystick(dx, dy);
  });

  joystick.addEventListener("pointerup", () => {
    dragging = false;
    resetJoystick();
  });

  joystick.addEventListener("pointercancel", () => {
    dragging = false;
    resetJoystick();
  });
}

// --------- STARTUP ---------
init();
