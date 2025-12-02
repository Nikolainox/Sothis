// ----------------------------
// Perustila & utilit
// ----------------------------

const STORAGE_KEY = "sothis_v3_vault_state";

let state = {
  config: {
    monthlyIncome: 0,
    fixedCosts: 0,
    startSavings: 0,
    debtAmount: 0
  },
  decisions: [], // { id, amount, kind, emotion }
  currentEmotion: "calm", // calm | tense | bored | euphoric
  wealthMode: "balanced" // balanced | debt | invest
};

let sessionStart = Date.now();
let lastAddTap = 0;
let touchStartX = null;
let touchStartY = null;
let cashTouchStartY = null;

document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initUI();
  attachHandlers();
  startSessionTimer();
  renderAll();
});

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    } catch (e) {
      console.warn("Virhe tilan latauksessa:", e);
    }
  }
  if (!Array.isArray(state.decisions)) state.decisions = [];
  if (!state.config) {
    state.config = {
      monthlyIncome: 0,
      fixedCosts: 0,
      startSavings: 0,
      debtAmount: 0
    };
  }
  if (!state.currentEmotion) state.currentEmotion = "calm";
  if (!state.wealthMode) state.wealthMode = "balanced";
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ----------------------------
// UI-init & sessionaika
// ----------------------------

function initUI() {
  const { monthlyIncome, fixedCosts, startSavings, debtAmount } = state.config;
  const incomeInput = document.getElementById("input-income");
  const fixedInput = document.getElementById("input-fixed");
  const savingsInput = document.getElementById("input-savings");
  const debtInput = document.getElementById("input-debt");

  if (incomeInput) incomeInput.value = monthlyIncome || "";
  if (fixedInput) fixedInput.value = fixedCosts || "";
  if (savingsInput) savingsInput.value = startSavings || "";
  if (debtInput) debtInput.value = debtAmount || "";

  const universeEl = document.getElementById("universe-step");
  if (universeEl) universeEl.textContent = `Päätös #${state.decisions.length}`;

  updateEmotionUI();
  updateWealthModeLabel();
}

function startSessionTimer() {
  sessionStart = Date.now();
  setInterval(() => {
    const sec = Math.floor((Date.now() - sessionStart) / 1000);
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    const el = document.getElementById("session-time");
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

// ----------------------------
// Event handlers
// ----------------------------

function attachHandlers() {
  const incomeInput = document.getElementById("input-income");
  const fixedInput = document.getElementById("input-fixed");
  const savingsInput = document.getElementById("input-savings");
  const debtInput = document.getElementById("input-debt");

  if (incomeInput) {
    incomeInput.addEventListener("change", () => {
      state.config.monthlyIncome = parseFloat(incomeInput.value) || 0;
      saveState();
      renderAll();
    });
  }
  if (fixedInput) {
    fixedInput.addEventListener("change", () => {
      state.config.fixedCosts = parseFloat(fixedInput.value) || 0;
      saveState();
      renderAll();
    });
  }
  if (savingsInput) {
    savingsInput.addEventListener("change", () => {
      state.config.startSavings = parseFloat(savingsInput.value) || 0;
      saveState();
      renderAll();
    });
  }
  if (debtInput) {
    debtInput.addEventListener("change", () => {
      state.config.debtAmount = parseFloat(debtInput.value) || 0;
      saveState();
      renderAll();
    });
  }

  // Swipe: koko app juoksee tämän varassa
  attachPillarGestures();

  const analyzeBtn = document.getElementById("analyze-btn");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", () => {
      runPurchaseAnalysis();
    });
  }
}

function attachPillarGestures() {
  const pillarCash = document.getElementById("pillar-cash");
  const pillarWealth = document.getElementById("pillar-wealth");
  const pillarEmotion = document.getElementById("pillar-emotion");

  // Cash pillar: up/down ostospaneeli
  if (pillarCash) {
    pillarCash.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        cashTouchStartY = t.clientY;
      },
      { passive: true }
    );

    pillarCash.addEventListener(
      "touchend",
      (e) => {
        if (cashTouchStartY == null) return;
        const endY = e.changedTouches[0].clientY;
        const dy = endY - cashTouchStartY;
        if (Math.abs(dy) > 40) {
          if (dy < 0) {
            setPurchasePanelOpen(true);
          } else {
            setPurchasePanelOpen(false);
          }
        }
        cashTouchStartY = null;
      },
      { passive: true }
    );
  }

  // Wealth pillar: left/right vaihtaa moodia
  if (pillarWealth) {
    pillarWealth.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      },
      { passive: true }
    );

    pillarWealth.addEventListener(
      "touchend",
      (e) => {
        if (touchStartX == null || touchStartY == null) return;
        const x = e.changedTouches[0].clientX;
        const y = e.changedTouches[0].clientY;
        const dx = x - touchStartX;
        const dy = y - touchStartY;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) {
            // right
            cycleWealthMode(1);
          } else {
            // left
            cycleWealthMode(-1);
          }
        }
        touchStartX = null;
        touchStartY = null;
      },
      { passive: true }
    );
  }

  // Emotion pillar: up/down vaihtaa moodia
  if (pillarEmotion) {
    pillarEmotion.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      },
      { passive: true }
    );

    pillarEmotion.addEventListener(
      "touchend",
      (e) => {
        if (touchStartX == null || touchStartY == null) return;
        const x = e.changedTouches[0].clientX;
        const y = e.changedTouches[0].clientY;
        const dx = x - touchStartX;
        const dy = y - touchStartY;
        if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) {
          if (dy < 0) {
            cycleEmotion(1);
          } else {
            cycleEmotion(-1);
          }
        }
        touchStartX = null;
        touchStartY = null;
      },
      { passive: true }
    );
  }
}

// ----------------------------
// Emotion & wealth mode
// ----------------------------

const EMOTIONS = ["calm", "tense", "bored", "euphoric"];

function cycleEmotion(direction) {
  const idx = EMOTIONS.indexOf(state.currentEmotion);
  const next = (idx + direction + EMOTIONS.length) % EMOTIONS.length;
  state.currentEmotion = EMOTIONS[next];
  saveState();
  updateEmotionUI();
}

function updateEmotionUI() {
  const label = document.getElementById("emotion-label");
  const pill = document.getElementById("purchase-emotion-pill");
  const bar = document.getElementById("emotion-bar");
  let text = "Rauhallinen";
  let gradient =
    "radial-gradient(circle at 30% 0, #00cec9, #2e86de, #05060a)";

  if (state.currentEmotion === "tense") {
    text = "Kireä";
    gradient =
      "radial-gradient(circle at 30% 0, #d63031, #2d3436, #05060a)";
  } else if (state.currentEmotion === "bored") {
    text = "Tylsistynyt";
    gradient =
      "radial-gradient(circle at 30% 0, #636e72, #2d3436, #05060a)";
  } else if (state.currentEmotion === "euphoric") {
    text = "Euforinen";
    gradient =
      "radial-gradient(circle at 30% 0, #fdcb6e, #e17055, #05060a)";
  }

  if (label) label.textContent = text;
  if (pill) pill.textContent = `Tunne: ${text.toLowerCase()}`;
  if (bar) bar.style.background = gradient;
}

function cycleWealthMode(direction) {
  const modes = ["balanced", "debt", "invest"];
  const idx = modes.indexOf(state.wealthMode);
  const next = (idx + direction + modes.length) % modes.length;
  state.wealthMode = modes[next];
  saveState();
  updateWealthModeLabel();
  renderAll();
}

function updateWealthModeLabel() {
  const el = document.getElementById("wealth-mode-label");
  if (!el) return;
  if (state.wealthMode === "balanced") {
    el.textContent = "Wealth / Debt";
  } else if (state.wealthMode === "debt") {
    el.textContent = "Velka-fokus";
  } else {
    el.textContent = "Sijoitus-fokus";
  }
}

// ----------------------------
// Haamuostos-paneeli
// ----------------------------

function setPurchasePanelOpen(open) {
  const panel = document.getElementById("purchase-panel");
  if (!panel) return;
  if (open) panel.classList.add("open");
  else panel.classList.remove("open");
}

// ----------------------------
// Aggregaattien laskenta
// ----------------------------

function trackEmotionStat(map, emotion, isBad) {
  if (!emotion) emotion = "unknown";
  if (!map[emotion]) map[emotion] = { total: 0, bad: 0 };
  map[emotion].total++;
  if (isBad) map[emotion].bad++;
}

function computeAggregatesFrom(decisions) {
  const { monthlyIncome, fixedCosts, startSavings, debtAmount } = state.config;

  let totalSpent = 0;
  let totalSaved = 0;
  let totalInvested = 0;
  let totalDebtPaid = 0;

  let goodCount = 0;
  let badCount = 0;
  let sumGoodGain = 0;
  let sumBadLoss = 0;

  const emotionStats = {};

  decisions.forEach((d) => {
    if (d.kind === "spend") {
      totalSpent += d.amount;
      badCount++;
      sumBadLoss += d.amount;
      trackEmotionStat(emotionStats, d.emotion, true);
    } else if (d.kind === "save") {
      totalSaved += d.amount;
      goodCount++;
      sumGoodGain += d.amount;
      trackEmotionStat(emotionStats, d.emotion, false);
    } else if (d.kind === "invest") {
      totalInvested += d.amount;
      goodCount++;
      sumGoodGain += d.amount * 1.15;
      trackEmotionStat(emotionStats, d.emotion, false);
    } else if (d.kind === "debt") {
      totalDebtPaid += d.amount;
      goodCount++;
      sumGoodGain += d.amount;
      trackEmotionStat(emotionStats, d.emotion, false);
    } else {
      trackEmotionStat(emotionStats, d.emotion, false);
    }
  });

  const currentDebt = Math.max(debtAmount - totalDebtPaid, 0);
  const netSavings = startSavings + totalSaved + totalInvested - totalSpent;
  const netPosition = netSavings - currentDebt;

  const monthlySurplus = monthlyIncome - fixedCosts;
  let payoffMonths = null;
  if (currentDebt > 0 && monthlySurplus > 0) {
    payoffMonths = currentDebt / monthlySurplus;
  }

  // Bayes
  let bayes = { mean: null, alpha: 1, beta: 1 };
  if (goodCount + badCount > 0) {
    const alpha = 1 + goodCount;
    const beta = 1 + badCount;
    const mean = alpha / (alpha + beta);
    bayes = { mean, alpha, beta };
  }

  // Keskimääräiset vaikutukset
  let avgGoodGain =
    goodCount > 0 ? sumGoodGain / goodCount : monthlySurplus > 0 ? monthlySurplus * 0.3 : 50;
  let avgBadLoss =
    badCount > 0 ? sumBadLoss / badCount : monthlySurplus > 0 ? monthlySurplus * 0.2 : 30;

  return {
    totalSpent,
    totalSaved,
    totalInvested,
    totalDebtPaid,
    currentDebt,
    netSavings,
    netPosition,
    monthlySurplus,
    payoffMonths,
    goodCount,
    badCount,
    bayes,
    avgGoodGain,
    avgBadLoss,
    emotionStats
  };
}

function computeAggregates() {
  return computeAggregatesFrom(state.decisions);
}

// Monte Carlo & Money Gravity

function runMonteCarlo(agg, steps = 12, trials = 600) {
  if (!agg.bayes.mean) return null;
  const pGood = agg.bayes.mean;
  const goodGain = agg.avgGoodGain;
  const badLoss = agg.avgBadLoss;
  let successCount = 0;

  for (let t = 0; t < trials; t++) {
    let wealth = agg.netPosition;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < pGood) {
        wealth += goodGain;
      } else {
        wealth -= badLoss;
      }
    }
    if (wealth >= 0) successCount++;
  }

  return successCount / trials;
}

function computeMoneyGravity(agg) {
  const growth =
    agg.avgGoodGain - agg.avgBadLoss / 2 + (agg.netPosition > 0 ? 20 : 0);
  const safety =
    (agg.netSavings > 0 ? 20 : 0) +
    (agg.currentDebt === 0 ? 30 : -10) +
    (agg.monthlySurplus > 0 ? 15 : -15);
  const lifestyleInflation = agg.totalSpent - agg.totalSaved;
  const burnout =
    agg.totalDebtPaid > agg.monthlySurplus * 2 && agg.monthlySurplus > 0 ? 30 : 0;

  let main = "tasapaino";
  let explanation =
    "Universumi on neutraali – tästä on helppo kääntää suunta hieman parempaan.";

  if (growth > safety && growth > lifestyleInflation && growth > burnout) {
    main = "varallisuuden kasvu (North)";
    explanation =
      "Liikkeesi tukevat varallisuuden rakentumista. Suojaa tämä rytmi äläkä hajota sitä turhaan.";
  } else if (safety > growth && safety > lifestyleInflation && safety > burnout) {
    main = "turva & likviditeetti (East)";
    explanation =
      "Painotat turvaa. Hyvä. Varmista vain, ettet jää liian pitkäksi aikaa paikoillesi.";
  } else if (
    lifestyleInflation > growth &&
    lifestyleInflation > safety &&
    lifestyleInflation > burnout
  ) {
    main = "elintaso-inflaatio (South)";
    explanation =
      "Kulutus kasvaa suhteessa säästöön. Tämä ei ole häpeä, mutta se syö tulevaa vapautta.";
  } else if (burnout > 0) {
    main = "ylikireä maksutahti (West)";
    explanation =
      "Lyhennät aggressiivisesti. Velka sulaa, mutta jos hermosto palaa loppuun, dark-universumi voittaa.";
  }

  return { main, explanation };
}

// ----------------------------
// Ostosennuste / haamuostos
// ----------------------------

function runPurchaseAnalysis() {
  const amountInput = document.getElementById("purchase-amount");
  const kindSelect = document.getElementById("purchase-kind");
  const summaryEl = document.getElementById("purchase-summary");
  const cfoEl = document.getElementById("purchase-cfo");

  if (!amountInput || !kindSelect || !summaryEl || !cfoEl) return;

  const amount = parseFloat(amountInput.value);
  const kind = kindSelect.value;

  if (!amount || amount <= 0) {
    summaryEl.textContent = "Anna summa, jotta voin simuloida universumit.";
    cfoEl.textContent = "";
    return;
  }

  const baseAgg = computeAggregates();

  // jos ei ole vielä dataa, tee varovainen oletus
  if (!baseAgg.bayes.mean) {
    summaryEl.textContent =
      "Tarvitsen muutaman oikean päätöksen, jotta tunnen järjestelmäsi. Voit silti käyttää tätä suuntaa-antavana.";
  }

  // Haamuostos ekstra-päätös
  const extraDecision = {
    id: -1,
    amount,
    kind: kind === "debt" ? "debt" : kind === "invest" ? "invest" : "spend",
    emotion: state.currentEmotion
  };
  const withPurchaseAgg = computeAggregatesFrom(
    state.decisions.concat(extraDecision)
  );

  // Ghost-vaihtoehto: käytä sama summa velkaan tai sijoitukseen
  let ghostDecision;
  if (kind === "debt") {
    ghostDecision = extraDecision; // jo velan maksu
  } else if (kind === "invest" || kind === "tool" || kind === "experience") {
    ghostDecision = {
      id: -2,
      amount,
      kind: "invest",
      emotion: state.currentEmotion
    };
  } else {
    ghostDecision = {
      id: -2,
      amount,
      kind: "save",
      emotion: state.currentEmotion
    };
  }
  const ghostAgg = computeAggregatesFrom(
    state.decisions.concat(ghostDecision)
  );

  const baseMC = runMonteCarlo(baseAgg) ?? null;
  const withMC = runMonteCarlo(withPurchaseAgg) ?? null;
  const ghostMC = runMonteCarlo(ghostAgg) ?? null;

  const deltaNet = withPurchaseAgg.netPosition - baseAgg.netPosition;
  const ghostDeltaNet = ghostAgg.netPosition - baseAgg.netPosition;

  let emoRiskText = "";
  const aggStats = baseAgg.emotionStats;
  const emoStats = aggStats[state.currentEmotion];
  if (emoStats && emoStats.total > 0) {
    const rate = emoStats.bad / emoStats.total;
    if (rate > 0.5) {
      emoRiskText = `Historiadata: ${emotionLabel(
        state.currentEmotion
      )}-tilassa noin ${(rate * 100).toFixed(
        0
      )}% päätöksistä on mennyt sinua vastaan. `;
    }
  } else if (state.currentEmotion !== "calm") {
    emoRiskText =
      "Tässä tunnetilassa sinulla ei vielä ole dataa, mutta keho on todennäköisesti herkempi impulssiostoksille. ";
  }

  // Summary
  const baseNet = formatEuro(baseAgg.netPosition);
  const withNet = formatEuro(withPurchaseAgg.netPosition);
  const ghostNet = formatEuro(ghostAgg.netPosition);

  summaryEl.textContent =
    `Nykyinen nettoasema: ${baseNet}. ` +
    `Jos teet tämän ostoksen nyt, ennustettu nettoasema siirtyy tasolle ${withNet} (${deltaNet >= 0 ? "+" : ""}${deltaNet.toFixed(
      0
    )} €). ` +
    `Jos sama summa menisi ghost-vaihtoehtoon (säästö/velan lyhennys/sijoitus), netto olisi ${ghostNet} (${ghostDeltaNet >= 0 ? "+" : ""}${ghostDeltaNet.toFixed(
      0
    )} €).`;

  // CFO-kommentti
  let cfoText = emoRiskText;

  if (kind === "debt") {
    cfoText +=
      "Tämä liike vahvistaa järjestelmääsi – velan lyhennys on yleensä ghost-ystävällinen päätös.";
  } else if (kind === "invest" || kind === "tool" || kind === "experience") {
    if (deltaNet < 0 && ghostDeltaNet > 0) {
      cfoText +=
        "Taloudellisesti tämä on investointi, mutta ghost-universumi olisi vahvempi jos käyttäisit osan summasta velan lyhennykseen tai säästöön.";
    } else {
      cfoText +=
        "Tämä näyttää investoinnilta, jonka järjestelmäsi todennäköisesti kestää – tärkeämpää on, tukeeko se identiteettiäsi.";
    }
  } else {
    if (deltaNet < 0 && Math.abs(deltaNet) > amount * 0.8) {
      cfoText +=
        "Tämä ostos on selkeästi järjestelmän vastainen: se siirtää sinua financieelisesti taaksepäin enemmän kuin pelkkä hinta antaisi ymmärtää.";
    } else if (deltaNet < 0) {
      cfoText +=
        "Voit tehdä tämän, mutta se on trade-off: maksat tulevaisuuden liikkumatilalla. Sovi itsesi kanssa yksi vastaliike (pieni säästö) ennen kuin ostat.";
    } else {
      cfoText +=
        "Tämä ostos ei näytä kaatavan järjestelmää. Jos tunne pysyy rauhallisena vielä 10 minuutin päästä, voit tehdä päätöksen luottavaisesti.";
    }
  }

  if (baseMC != null && withMC != null && ghostMC != null) {
    cfoText += `\n\nMonte Carlo -ennuste: nykytila ~${(baseMC * 100).toFixed(
      0
    )}% mahdollisuus olla plussalla 12 kk päästä, ostoksen jälkeen ~${(
      withMC * 100
    ).toFixed(0)} %, ghost-vaihtoehdolla ~${(ghostMC * 100).toFixed(
      0
    )} %.`;
  }

  cfoEl.textContent = cfoText;
}

// ----------------------------
// Renderöinti
// ----------------------------

function renderAll() {
  const agg = computeAggregates();
  renderCashPillar(agg);
  renderWealthPillar(agg);
  renderHub(agg);
  renderBayesAndGravity(agg);
  renderBehavior(agg);
}

function renderCashPillar(agg) {
  const income = state.config.monthlyIncome || 0;
  const fixed = state.config.fixedCosts || 0;
  const surplus = income - fixed;

  const posEl = document.getElementById("cash-pos");
  const fixedEl = document.getElementById("cash-fixed");
  const negEl = document.getElementById("cash-neg");
  const surplusEl = document.getElementById("cash-surplus");

  if (surplusEl) {
    surplusEl.textContent =
      (surplus >= 0 ? "+ " : "- ") + Math.abs(surplus).toFixed(0) + " €";
  }

  if (!posEl || !fixedEl || !negEl) return;

  let posHeight = 0;
  let fixedHeight = 0;
  let negHeight = 0;

  if (income > 0) {
    const fixedRatio = Math.min(1, fixed / income);
    const spendRatio = Math.min(
      1,
      agg.totalSpent / Math.max(1, income - fixed)
    );

    fixedHeight = fixedRatio * 100;
    if (surplus >= 0) {
      posHeight = (1 - fixedRatio) * 100;
      negHeight = 0;
    } else {
      posHeight = 0;
      negHeight = Math.min(100 - fixedHeight, spendRatio * 100);
    }
  }

  posEl.style.height = posHeight + "%";
  fixedEl.style.height = fixedHeight + "%";
  negEl.style.height = negHeight + "%";
}

function renderWealthPillar(agg) {
  const realEl = document.getElementById("wealth-real");
  const ghostEl = document.getElementById("wealth-ghost");
  const darkEl = document.getElementById("wealth-dark");
  const netEl = document.getElementById("hub-net");
  const payoffEl = document.getElementById("hub-payoff");

  if (netEl) netEl.textContent = formatEuro(agg.netPosition);

  if (payoffEl) {
    if (agg.payoffMonths == null) {
      payoffEl.textContent = agg.currentDebt > 0 ? "Ei realistista (nyt)" : "Velaton";
    } else {
      const months = agg.payoffMonths;
      payoffEl.textContent = months < 1 ? "< 1 kk" : months.toFixed(1) + " kk";
    }
  }

  if (!realEl || !ghostEl || !darkEl) return;

  const base = Math.max(
    Math.abs(agg.netPosition),
    Math.abs(agg.currentDebt),
    1
  );

  let realH = Math.min(100, (agg.netPosition / base) * 50 + 50);
  let ghostH = Math.min(100, (agg.netSavings / base) * 50 + 50);
  let darkH = Math.min(100, (-agg.currentDebt / base) * 50 + 50);

  if (state.wealthMode === "debt") {
    darkH = Math.min(100, darkH + 15);
  } else if (state.wealthMode === "invest") {
    ghostH = Math.min(100, ghostH + 15);
  }

  realEl.style.height = Math.max(5, realH) + "%";
  ghostEl.style.height = Math.max(5, ghostH) + "%";
  darkEl.style.height = Math.max(5, darkH) + "%";
}

function renderHub(agg) {
  const rateEl = document.getElementById("hub-savings-rate");
  const debtEl = document.getElementById("hub-debt");
  const riskEl = document.getElementById("hub-risk");

  const income = state.config.monthlyIncome || 0;
  let savingsRateText = "–";
  if (income > 0) {
    const used = state.config.fixedCosts + agg.totalSpent;
    const rate = Math.max(0, 1 - used / income);
    savingsRateText = (rate * 100).toFixed(0) + " %";
  }

  if (rateEl) rateEl.textContent = savingsRateText;
  if (debtEl) debtEl.textContent = formatEuro(agg.currentDebt);

  if (riskEl) {
    let label = "NO DATA";
    if (agg.bayes.mean) {
      if (agg.bayes.mean < 0.4) label = "HIGH";
      else if (agg.bayes.mean < 0.7) label = "MED";
      else label = "LOW";
    }
    riskEl.textContent = label;
  }
}

function renderBayesAndGravity(agg) {
  const bayesEl = document.getElementById("bayes-prob");
  const mcEl = document.getElementById("mc-success");
  const gravityEl = document.getElementById("gravity-text");

  if (!agg.bayes.mean) {
    if (bayesEl) bayesEl.textContent = "–";
    if (mcEl) mcEl.textContent = "–";
    if (gravityEl)
      gravityEl.textContent =
        "Tarvitsen muutaman päätöksen, jotta näen mihin suuntaan rahauniversumisi vetää.";
    return;
  }

  if (bayesEl) bayesEl.textContent = (agg.bayes.mean * 100).toFixed(1) + " %";
  const mc = runMonteCarlo(agg);
  if (mcEl && mc != null) mcEl.textContent = (mc * 100).toFixed(0) + " %";

  const grav = computeMoneyGravity(agg);
  if (gravityEl) {
    gravityEl.textContent = `Tällä hetkellä rahajärjestelmäsi painovoima suuntautuu kohti: ${grav.main}. ${grav.explanation}`;
  }
}

function renderBehavior(agg) {
  const behaviorEl = document.getElementById("behavior-note");
  const soothingEl = document.getElementById("soothing-note");
  const stats = agg.emotionStats;

  const entries = Object.entries(stats).filter(([emotion]) => emotion !== "unknown");
  if (!entries.length) {
    if (behaviorEl)
      behaviorEl.textContent =
        "Kun alat merkata tunteen jokaiseen päätökseen, näet missä moodissa vuoto on suurinta ja voidaan rakentaa suoraan sitä vastaan.";
    if (soothingEl)
      soothingEl.textContent =
        "Tämä kartta ei ole tuomio vaan työkalu. Jopa 51 % paremmat päätökset riittävät kääntämään suunnan.";
    return;
  }

  const rates = entries.map(([emotion, obj]) => {
    const rate = obj.total ? obj.bad / obj.total : 0;
    return { emotion, rate, total: obj.total };
  });

  rates.sort((a, b) => b.rate - a.rate);
  const worst = rates[0];

  if (behaviorEl) {
    behaviorEl.textContent = `Historiasi mukaan kalleimmat virheet tapahtuvat, kun olet ${emotionLabel(
      worst.emotion
    )}-tilassa (noin ${(worst.rate * 100).toFixed(
      0
    )}% päätöksistä tässä moodissa valuu sinua vastaan).`;
  }

  if (soothingEl) {
    soothingEl.textContent =
      "Tunne ei ole vihollinen. Se kertoo, milloin kannattaa lisätä yksi lisäjarru ennen kuin raha liikkuu.";
  }
}

// ----------------------------
// Helpers
// ----------------------------

function formatEuro(x) {
  const n = Number(x || 0);
  const sign = n < 0 ? "- " : "";
  const v = Math.abs(n).toFixed(0);
  return `${sign}${v} €`;
}

function emotionLabel(e) {
  if (e === "calm") return "rauhallinen";
  if (e === "tense") return "kireä";
  if (e === "bored") return "tylsistynyt";
  if (e === "euphoric") return "euforinen";
  return e;
}
