//------------------------------------
// HOLOGRAM GRID BACKGROUND
//------------------------------------
const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0,255,255,0.18)";
  ctx.lineWidth = 0.4;
  const step = 40;

  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}
setInterval(drawGrid, 80);

//------------------------------------
// STATE & STORAGE
//------------------------------------
const STORAGE_KEY = "sothis_lx_state_v1";

let state = {
  income: 0,
  expenses: 0,
  savings: 0,
  debt: 0,
  housing: 0,
  riskProfile: "balanced",
  history: [] // { t, netWorth }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state = {
        ...state,
        ...parsed,
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    }
  } catch (e) {
    console.warn("State load failed", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

//------------------------------------
// SMALL HELPERS
//------------------------------------
function euro(x) {
  if (x === null || x === undefined || isNaN(x)) return "–";
  const v = Math.round(x);
  return v.toLocaleString("fi-FI") + " €";
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// Box–Muller normaalijakauma
function randomNormal(mean = 0, std = 1) {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + std * z;
}

//------------------------------------
// CORE FORECAST + MONTE CARLO + BAYES
//------------------------------------
function runMonteCarlo(months = 12, trials = 600) {
  const { income, expenses, savings, debt, housing, riskProfile } = state;
  const surplus = income - expenses;
  let meanRet, vol; // monthly

  if (riskProfile === "conservative") {
    meanRet = 0.002; // 0.2% / kk
    vol = 0.01;
  } else if (riskProfile === "aggressive") {
    meanRet = 0.007; // 0.7% / kk
    vol = 0.04;
  } else {
    // balanced
    meanRet = 0.004;
    vol = 0.02;
  }

  const monthlyInvest = Math.max(0, surplus) * (riskProfile === "aggressive" ? 0.5 : riskProfile === "balanced" ? 0.35 : 0.2);

  const results = [];
  let successCount = 0;
  let goalSuccessCount = 0;

  for (let i = 0; i < trials; i++) {
    let wealth = savings - debt;
    let portfolio = Math.max(0, savings); // karkea jaottelu

    for (let m = 0; m < months; m++) {
      // kassavirta
      wealth += surplus;

      // sijoitus
      portfolio += monthlyInvest;
      const ret = randomNormal(meanRet, vol);
      portfolio *= 1 + ret;

      // yhdistä: varallisuus = portfolio + muu nettovarallisuus
      wealth = portfolio - debt;
    }

    results.push(wealth);
    if (wealth >= 0) successCount++;
    if (housing > 0 && wealth >= housing) goalSuccessCount++;
  }

  results.sort((a, b) => a - b);
  const median = results.length
    ? results[Math.floor(results.length / 2)]
    : 0;

  const mcSuccess = successCount / trials;
  const goalProb = housing > 0 ? goalSuccessCount / trials : mcSuccess;

  return {
    mcSuccess,
    median,
    vol,
    goalProb
  };
}

function computeBayesFromHistory() {
  const hist = state.history;
  if (!hist || hist.length < 2) {
    // fallback: käytä kassavirran signaalia
    const surplus = state.income - state.expenses;
    return surplus > 0 ? 0.7 : 0.35;
  }
  let good = 0;
  let bad = 0;
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1].netWorth;
    const cur = hist[i].netWorth;
    if (cur >= prev) good++;
    else bad++;
  }
  const alpha = 1 + good;
  const beta = 1 + bad;
  return alpha / (alpha + beta);
}

function forecast() {
  const { income, expenses, savings, debt, housing, riskProfile } = state;
  const surplus = income - expenses;

  // yksinkertainen deterministinen 12 kk
  const futureNet = savings + surplus * 12 - debt;
  const netWorthNow = savings - debt;

  // Monte Carlo
  const mc = runMonteCarlo(12, 600);

  // Riskitaso MC:n ja kassavirran perusteella
  let risk;
  if (mc.mcSuccess < 0.4 || surplus < 0) risk = "KORKEA";
  else if (mc.mcSuccess < 0.65) risk = "KESKI";
  else risk = "MATALA";

  // velan poistumisaika yksinkertaistettuna
  let debtMonths = null;
  if (surplus > 0 && debt > 0) {
    // olett: osa ylijäämästä (40%) menee velkaan
    const toDebt = surplus * 0.4;
    if (toDebt > 0) debtMonths = Math.ceil(debt / toDebt);
  }

  // asuntotavoite aika nykyrytmissä (ei MC)
  let houseMonths = null;
  if (housing > 0 && surplus > 0) {
    const effectiveSave = surplus * 0.35; // oletus
    if (effectiveSave > 0) {
      const missing = Math.max(0, housing - savings);
      houseMonths = Math.ceil(missing / effectiveSave);
    }
  }

  const bayesProb = computeBayesFromHistory();

  // ghost: +10% enemmän säästöä / kk (vaikuttaa deterministic futureNet)
  const ghostFutureNet = savings + surplus * 12 * 1.1 - debt;

  return {
    surplus,
    futureNet,
    netWorthNow,
    risk,
    debtMonths,
    houseMonths,
    mcSuccess: mc.mcSuccess,
    mcMedian: mc.median,
    mcVol: mc.vol,
    goalProb: mc.goalProb,
    bayesProb,
    ghostFutureNet
  };
}

//------------------------------------
// HISTORY / SPARKLINE
//------------------------------------
function addSnapshot() {
  const netWorthNow = state.savings - state.debt;
  const now = Date.now();
  state.history.push({ t: now, netWorth: netWorthNow });
  if (state.history.length > 60) {
    state.history.shift();
  }
}

function renderHistorySparkline() {
  const container = document.getElementById("history-sparkline");
  if (!container) return;
  container.innerHTML = "";

  const hist = state.history;
  if (!hist || hist.length === 0) {
    container.textContent = "Ei historiaa vielä – jokainen päivitys tallentaa snapshotin.";
    return;
  }

  const values = hist.map((h) => h.netWorth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  values.forEach((v, idx) => {
    const span = document.createElement("span");
    const h = 10 + ((v - min) / range) * 30; // 10–40px
    span.style.height = h + "px";
    // väri neutraali / positiivinen / negatiivinen
    if (idx > 0 && v < values[idx - 1]) {
      span.style.background =
        "linear-gradient(180deg,#ff7675,#d63031)";
    } else if (v >= 0) {
      span.style.background =
        "linear-gradient(180deg,#00f5ff,#0091ff)";
    } else {
      span.style.background =
        "linear-gradient(180deg,#ffeaa7,#fdcb6e)";
    }
    container.appendChild(span);
  });
}

//------------------------------------
// JARVIS ENGINE
//------------------------------------
function jarvisUpdate() {
  const j = document.getElementById("jarvis-brief");
  if (!j) return;

  const r = forecast();

  let msg = "";

  // CFO
  if (r.surplus > 0) {
    msg += `CFO: Kassavirta on positiivinen (${euro(r.surplus)} / kk). `;
    if (r.surplus > state.income * 0.25) {
      msg += "Ylijäämä on vahva – tämä on varallisuuden kiihtyvä moottori. ";
    } else {
      msg += "Ylijäämä on ok, mutta optimoitavissa nopeasti isommaksi. ";
    }
  } else if (r.surplus < 0) {
    msg += `CFO: Kassavirta on negatiivinen (${euro(
      r.surplus
    )} / kk). Ensimmäinen tavoite on kääntää tämä plussalle, vaikka 50 € kuussa. `;
  } else {
    msg += "CFO: Kassavirta on täsmälleen nolla. Se on hauras tasapaino. ";
  }

  // RISK
  if (r.risk === "KORKEA") {
    msg +=
      "Riskijärjestelmä: Punainen vyöhyke. MC-simulaatiot näyttävät paljon huonoja lopputuloksia, etenkin jos menot kasvavat. ";
  } else if (r.risk === "KESKI") {
    msg +=
      "Riskijärjestelmä: Keltainen vyöhyke. Pieni virhe tai pari huonoa kuukautta voi kääntää suunnan. ";
  } else {
    msg +=
      "Riskijärjestelmä: Sininen vyöhyke. Suurin riski on liiallinen mukavuus – järjestelmä on vahva, mutta sitä voi vielä vahvistaa. ";
  }

  // TRAJECTORY
  if (r.futureNet > 0) {
    msg += `Trajektori: Deterministinen 12 kk ennuste näyttää plussaa (${euro(
      r.futureNet
    )}). `;
  } else {
    msg += `Trajektori: Deterministinen 12 kk ennuste on vielä miinuksella (${euro(
      r.futureNet
    )}). `;
  }

  msg += `MC: Todennäköisyys olla 12 kk päästä plussalla: ${Math.round(
    r.mcSuccess * 100
  )} %. Bayes-arvio käyttäytymishistoriasta: ${Math.round(
    r.bayesProb * 100
  )} %. `;

  // GOALS
  if (r.houseMonths != null) {
    const years = (r.houseMonths / 12).toFixed(1);
    msg += `Asuntotavoite on nykyrytmissä noin ${r.houseMonths} kuukauden päässä (~${years} vuotta). Tavoitteen onnistumistodennäköisyys MC-simulaatiossa: ${Math.round(
      r.goalProb * 100
    )} %. `;
  } else if (state.housing > 0) {
    msg +=
      "Asuntotavoite on asetettu, mutta nykyinen ylijäämä ei riitä realistiseen aikajanaan. Tarvitsemme enemmän ylijäämää tai pienemmän tavoitteen. ";
  }

  // NEXT BEST MOVE
  let nbm = "";
  if (r.surplus <= 0) {
    nbm = "Nosta ylijäämää vähintään 50–150 € / kk (tulot ylös, kulut alas). Se kääntää koko universumin suuntaa.";
  } else if (r.futureNet < 0) {
    nbm =
      "Kohdista vähintään 30–40 % ylijäämästä velan purkuun. Kun velka laskee, ennustekäyrä nousee nopeasti plussalle.";
  } else if (r.mcSuccess < 0.6 || r.bayesProb < 0.6) {
    nbm =
      "Nosta säästö- / sijoitusastetta 5–10 %-yksikköä. Tämä siirtää Monte Carlo -jakaumaa selvästi parempaan suuntaan.";
  } else {
    nbm =
      "Holvi on rakenteellisesti terve. Seuraava taso on sijoitusten hajautus ja tuoton optimointi – ei enää selviytyminen vaan design.";
  }

  msg += `Next Best Move: ${nbm}`;

  j.textContent = msg;
}

//------------------------------------
// UPDATE ALL UI
//------------------------------------
function updateVault() {
  const r = forecast();

  // Forecast layer
  const mcPerc = Math.round(r.mcSuccess * 100);
  document.getElementById("m-forecast").textContent = euro(r.futureNet);
  document.getElementById("m-mc").textContent = mcPerc + " %";
  document.getElementById("m-median").textContent = euro(r.mcMedian);

  renderHistorySparkline();

  // Risk layer
  document.getElementById("m-risk").textContent = r.risk;
  document.getElementById("m-vol").textContent =
    (r.mcVol * 100).toFixed(1) + " % / kk";
  if (r.debtMonths != null) {
    document.getElementById("m-debtclear").textContent =
      r.debtMonths + " kk";
  } else if (state.debt > 0) {
    document.getElementById("m-debtclear").textContent =
      "Ei realistista nykyrytmissä";
  } else {
    document.getElementById("m-debtclear").textContent = "Ei velkaa";
  }

  // Goals layer
  if (r.houseMonths != null) {
    document.getElementById("m-housing").textContent =
      r.houseMonths + " kk";
  } else {
    document.getElementById("m-housing").textContent = "–";
  }
  document.getElementById("m-prob").textContent =
    Math.round(r.goalProb * 100) + " %";
  document.getElementById("m-ghost").textContent = euro(r.ghostFutureNet);

  jarvisUpdate();
}

//------------------------------------
// SWIPE → LAYER CONTROL
//------------------------------------
let touchStartX = 0;
let touchStartY = 0;

document.addEventListener(
  "touchstart",
  (e) => {
    if (!e.touches || e.touches.length === 0) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  (e) => {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > Math.abs(dy)) {
      // horizontal
      if (dx < -50) {
        // left
        showLayer("forecast");
      } else if (dx > 50) {
        showLayer("risk");
      }
    } else {
      // vertical
      if (dy < -50) {
        // up
        showLayer("goals");
      } else if (dy > 50) {
        // down
        hideLayers();
      }
    }
  },
  { passive: true }
);

function showLayer(which) {
  hideLayers();
  const el = document.getElementById("layer-" + which);
  if (el) el.classList.add("active");
}

function hideLayers() {
  document
    .querySelectorAll(".layer")
    .forEach((l) => l.classList.remove("active"));
}

//------------------------------------
// INPUT HANDLERS
//------------------------------------
function initInputs() {
  // load from state to inputs
  document.getElementById("in-income").value = state.income || "";
  document.getElementById("in-expenses").value = state.expenses || "";
  document.getElementById("in-savings").value = state.savings || "";
  document.getElementById("in-debt").value = state.debt || "";
  document.getElementById("in-housing").value = state.housing || "";
  document.getElementById("risk-profile").value =
    state.riskProfile || "balanced";

  document
    .getElementById("btn-update")
    .addEventListener("click", () => {
      state.income =
        parseFloat(document.getElementById("in-income").value) || 0;
      state.expenses =
        parseFloat(document.getElementById("in-expenses").value) || 0;
      state.savings =
        parseFloat(document.getElementById("in-savings").value) || 0;
      state.debt =
        parseFloat(document.getElementById("in-debt").value) || 0;
      state.housing =
        parseFloat(document.getElementById("in-housing").value) || 0;
      state.riskProfile =
        document.getElementById("risk-profile").value || "balanced";

      addSnapshot();
      saveState();
      updateVault();
    });
}

//------------------------------------
// INIT
//------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initInputs();
  updateVault();
});
