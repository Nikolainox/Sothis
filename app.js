// ----------------------------
// Perustila & utilit
// ----------------------------

const STORAGE_KEY = "sothis_state_v2";

let state = {
  config: {
    monthlyIncome: 0,
    fixedCosts: 0,
    startSavings: 0,
    debtAmount: 0,
    identity: "architect" // architect | leverage | mystic
  },
  decisions: [] // { id, amount, kind, emotion }
};

let sessionStart = Date.now();
let lastAddTap = 0;
let touchStartX = null;
let touchStartY = null;
let selectedEmotion = null;
let decisionIdCounter = 1;

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
      debtAmount: 0,
      identity: "architect"
    };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ----------------------------
// UI-init & sessionaika
// ----------------------------

function initUI() {
  const { monthlyIncome, fixedCosts, startSavings, debtAmount, identity } =
    state.config;

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

  // identity UI
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    const id = btn.getAttribute("data-identity");
    btn.classList.toggle("active", id === identity);
  });
  updateIdentityText(identity);
}

function startSessionTimer() {
  sessionStart = Date.now();
  setInterval(() => {
    const sec = Math.floor((Date.now() - sessionStart) / 1000);
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    const el = document.getElementById("session-time");
    if (el) el.textContent = `${m}:${s}`;

    const hint = document.getElementById("focus-hint");
    if (hint && sec > 180) {
      hint.textContent = "Riittää. Rahaa rakennetaan nyt elämällä, ei ruudulla.";
      hint.style.borderColor = "rgba(255,118,117,0.8)";
      hint.style.background =
        "linear-gradient(90deg, rgba(255,118,117,0.15), rgba(255,255,255,0.02))";
    }
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

  // Identity selection
  document.querySelectorAll(".identity-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-identity");
      state.config.identity = id;
      saveState();
      document.querySelectorAll(".identity-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
      });
      updateIdentityText(id);
      renderAll();
    });
  });

  // Emotion selection
  document.querySelectorAll(".state-btn[data-emotion]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emotion = btn.getAttribute("data-emotion");
      setSelectedEmotion(emotion);
    });
  });

  // Add decision (single & double tap)
  const addBtn = document.getElementById("add-decision");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const now = Date.now();
      const double = now - lastAddTap < 350;
      lastAddTap = now;
      addDecision(double);
    });
  }

  // Swipe “mindset”-viestit
  const appRoot = document.getElementById("app-root");
  if (appRoot) {
    appRoot.addEventListener(
      "touchstart",
      (e) => {
        if (!e.touches || e.touches.length === 0) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    appRoot.addEventListener(
      "touchend",
      (e) => {
        if (touchStartX === null || touchStartY === null) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartX;
        const dy = touchEndY - touchStartY;

        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
          const note = document.getElementById("soothing-note");
          if (!note) return;

          if (dx > 0) {
            note.textContent =
              "Taaksepäin katsominen on analyysiä, ei häpeää. Tärkeintä on mihin seuraava liike osoittaa.";
          } else {
            note.textContent =
              "Eteenpäin on aina uusi universumi. Yksi hieman parempi päätös riittää kääntämään suunnan.";
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
// Identity-kuvaukset
// ----------------------------

function updateIdentityText(id) {
  const desc = document.getElementById("identity-description");
  const comment = document.getElementById("identity-comment");
  if (!desc || !comment) return;

  if (id === "architect") {
    desc.textContent =
      "Rakennat varallisuutta kuin insinööri: vakaus ensin, sitten kasvu. Sothis suosii velan purkua ja tasaista nousua.";
    comment.textContent =
      "Capital Architect -moodissa ghost-universumi painottaa turvaa ja ennustettavuutta. Isoja riskejä vain jos järjestelmä kestää ne.";
  } else if (id === "leverage") {
    desc.textContent =
      "Ajattelet vipua: aika, raha ja energia halutaan moninkertaistaa. Sothis painottaa sijoituksia ja mahdollisuuksien tunnistamista.";
    comment.textContent =
      "High-Leverage-tilassa ghost-universumi nostaa sijoitusten painoa ja sietää vähän suurempaa vaihtelua – mutta varo dark-universumia.";
  } else if (id === "mystic") {
    desc.textContent =
      "Sinulle raha on energiaa: haluat, että varallisuus tukee merkitystä ja tilaa ajatella. Sothis painottaa stressittömyyttä ja joustoa.";
    comment.textContent =
      "Wealth Mystic -tilassa painotamme hermoston rauhaa. Rahan liike saa olla pienempää, kunhan suunta tuntuu oikealta.";
  }
}

// ----------------------------
// Emotion valinta
// ----------------------------

function setSelectedEmotion(emotion) {
  selectedEmotion = emotion;
  document.querySelectorAll(".state-btn[data-emotion]").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.getAttribute("data-emotion") === emotion
    );
  });

  const tip = document.getElementById("emotion-tip");
  if (!tip) return;

  if (emotion === "calm") {
    tip.textContent =
      "Rauhallinen tila on yleensä paras isoille rahan liikkeille. Hyödynnetään se.";
  } else if (emotion === "tense") {
    tip.textContent =
      "Kireänä teet helpommin puolustusostoja ja paniikkimaksuja. Hengitä ja anna kehon rauhoittua ennen vahvistusta.";
  } else if (emotion === "bored") {
    tip.textContent =
      "Tylsyys on impulssiostojen magneetti. Kysy itseltäsi: tuoko tämä ostos oikeaa iloa vai vain hetken helpotusta?";
  } else if (emotion === "euphoric") {
    tip.textContent =
      "Euforia on ihana tunne, mutta kallis päätösten tausta. Pieni viive ennen klikkausta voi säästää paljon.";
  } else {
    tip.textContent =
      "Valitse tunne – appi oppii missä tilassa teet kalleimmat virheet.";
  }
}

// ----------------------------
// Päätöksen lisäys
// ----------------------------

function addDecision(doubleTapBoost) {
  const amountInput = document.getElementById("decision-amount");
  const typeSelect = document.getElementById("decision-type");
  if (!amountInput || !typeSelect) return;

  const amount = parseFloat(amountInput.value);
  const kind = typeSelect.value;

  if (!amount || amount <= 0) {
    alert("Anna summa ensin.");
    return;
  }

  const decision = {
    id: decisionIdCounter++,
    amount,
    kind,
    emotion: selectedEmotion || "unknown"
  };

  state.decisions.push(decision);
  saveState();

  amountInput.value = "";

  const universeEl = document.getElementById("universe-step");
  if (universeEl) {
    universeEl.textContent = `Päätös #${state.decisions.length}`;
  }

  if (doubleTapBoost) {
    const note = document.getElementById("soothing-note");
    if (note) {
      note.textContent =
        "Tupla-napautus rekisteröity. Tämä päätös on nyt tarinallinen ankkuri, ei vain numero listassa.";
    }
  }

  renderAll();
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

function computeAggregates() {
  const { monthlyIncome, fixedCosts, startSavings, debtAmount, identity } =
    state.config;

  let totalSpent = 0;
  let totalSaved = 0;
  let totalInvested = 0;
  let totalDebtPaid = 0;

  let goodCount = 0;
  let badCount = 0;
  let sumGoodGain = 0;
  let sumBadLoss = 0;

  const emotionStats = {};

  state.decisions.forEach((d) => {
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
      // Identity vaikuttaa sijoitusten “voimakkuuteen”
      let factor = 1.1;
      if (identity === "leverage") factor = 1.3;
      if (identity === "mystic") factor = 1.05;
      sumGoodGain += d.amount * factor;
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

  // Keskimääräiset vaikutukset – säädetään identiteetin mukaan
  let avgGoodGain;
  let avgBadLoss;

  if (goodCount > 0) {
    avgGoodGain = sumGoodGain / goodCount;
  } else {
    avgGoodGain = monthlySurplus > 0 ? monthlySurplus * 0.3 : 50;
  }

  if (badCount > 0) {
    avgBadLoss = sumBadLoss / badCount;
  } else {
    avgBadLoss = monthlySurplus > 0 ? monthlySurplus * 0.2 : 30;
  }

  if (identity === "leverage") {
    avgGoodGain *= 1.15;
    avgBadLoss *= 1.1;
  } else if (identity === "mystic") {
    avgGoodGain *= 0.9;
    avgBadLoss *= 0.8;
  }

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

// ----------------------------
// Monte Carlo & trajectories
// ----------------------------

function runMonteCarlo(agg, steps = 12, trials = 800) {
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

function generateTrajectories(agg, steps = 30) {
  const pGood = agg.bayes.mean || 0.6;
  const goodGain = agg.avgGoodGain;
  const badLoss = agg.avgBadLoss;

  const real = [];
  const ghost = [];
  const dark = [];

  let r = 0;
  let g = 0;
  let d = 0;

  for (let i = 0; i < steps; i++) {
    const expectedChange = pGood * goodGain - (1 - pGood) * badLoss;
    r += expectedChange;
    g += goodGain;
    d -= badLoss;

    real.push(r);
    ghost.push(g);
    dark.push(d);
  }

  return { real, ghost, dark };
}

// Money Gravity -suunta
function computeMoneyGravity(agg) {
  // Growth: miten paljon real nousee
  // Safety: velan pieneneminen ja netto plussalla
  // Lifestyle inflation: kulutus / surplus
  // Burnout: liian aggressiivinen velan maksu vs surplus

  const growth =
    agg.avgGoodGain - agg.avgBadLoss / 2 + (agg.netPosition > 0 ? 20 : 0);
  const safety =
    (agg.netSavings > 0 ? 20 : 0) +
    (agg.currentDebt === 0 ? 30 : -10) +
    (agg.monthlySurplus > 0 ? 15 : -15);

  const lifestyleInflation = agg.totalSpent - agg.totalSaved;
  const burnout = agg.totalDebtPaid > agg.monthlySurplus * 2 ? 30 : 0;

  // Suunnat
  let main = "tasapaino";
  let explanation =
    "Universumi on neutraali – nyt on täydellinen hetki säätää suuntaa hieman parempaan.";

  if (growth > safety && growth > lifestyleInflation && growth > burnout) {
    main = "varallisuuden kasvu (North)";
    explanation = "Liikkeesi tukevat varallisuuden rakentumista. Suojaa tämä rytmi.";
  } else if (safety > growth && safety > lifestyleInflation && safety > burnout) {
    main = "turva & likviditeetti (East)";
    explanation =
      "Painotat turvaa. Hyvä. Varmista vain, ettet pidä kaikkea liian passiivisena liian pitkään.";
  } else if (
    lifestyleInflation > growth &&
    lifestyleInflation > safety &&
    lifestyleInflation > burnout
  ) {
    main = "elintaso-inflaatio (South)";
    explanation =
      "Kulutus kasvaa suhteessa säästöön. Tämä ei ole häpeä, mutta se on suunta, joka syö tulevaa vapautta.";
  } else if (burnout > 0) {
    main = "ylikireä maksutahti (West)";
    explanation =
      "Lyhennät aggressiivisesti. Se voi olla hyvä, mutta jos hermosto väsyy, dark-universumi aktivoituu.";
  }

  return { main, explanation };
}

// ----------------------------
// Renderöinti
// ----------------------------

function renderAll() {
  const agg = computeAggregates();
  renderHub(agg);
  renderBayesSection(agg);
  renderBehaviorSection(agg);
  renderTrajectories(agg);
}

function renderHub(agg) {
  const rateEl = document.getElementById("hub-savings-rate");
  const netEl = document.getElementById("hub-net");
  const debtEl = document.getElementById("hub-debt");
  const payoffEl = document.getElementById("hub-payoff");
  const riskEl = document.getElementById("hub-risk");

  const { monthlyIncome, fixedCosts } = state.config;
  const income = monthlyIncome || 0;

  let savingsRateText = "–";
  if (income > 0) {
    const used = fixedCosts + agg.totalSpent;
    const rate = Math.max(0, 1 - used / income);
    savingsRateText = (rate * 100).toFixed(0) + " %";
  }

  if (rateEl) rateEl.textContent = savingsRateText;
  if (netEl) netEl.textContent = formatEuro(agg.netPosition);
  if (debtEl) debtEl.textContent = formatEuro(agg.currentDebt);

  if (payoffEl) {
    if (agg.payoffMonths == null) {
      payoffEl.textContent = agg.currentDebt > 0 ? "Ei realistista (nyt)" : "Velaton";
    } else {
      const months = agg.payoffMonths;
      payoffEl.textContent = months < 1 ? "< 1 kk" : months.toFixed(1) + " kk";
    }
  }

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

function renderBayesSection(agg) {
  const bayesEl = document.getElementById("bayes-prob");
  const mcEl = document.getElementById("mc-success");

  if (!agg.bayes.mean) {
    if (bayesEl) bayesEl.textContent = "–";
    if (mcEl) mcEl.textContent = "–";
    const commentEl = document.getElementById("identity-comment");
    if (commentEl)
      commentEl.textContent =
        "Anna minulle 5–10 päätöstä eri tunteissa. Sen jälkeen alan näyttämään, miltä sinun ghost-universumisi oikeasti näyttää.";
    return;
  }

  if (bayesEl) bayesEl.textContent = (agg.bayes.mean * 100).toFixed(1) + " %";

  const mc = runMonteCarlo(agg);
  if (mcEl && mc != null) mcEl.textContent = (mc * 100).toFixed(0) + " %";
}

function renderBehaviorSection(agg) {
  const behaviorEl = document.getElementById("behavior-note");
  const soothingEl = document.getElementById("soothing-note");
  const stats = agg.emotionStats;

  const entries = Object.entries(stats).filter(([emotion]) => emotion !== "unknown");
  if (!entries.length) {
    if (behaviorEl)
      behaviorEl.textContent =
        "Kun alat merkata tunteen jokaiseen päätökseen, näet missä moodissa vuoto on suurinta – ja voimme rakentaa suoraan sitä vastaan.";
    if (soothingEl)
      soothingEl.textContent =
        "Tämä data ei ole tuomio, vaan kartta. Jo 51 % paremmat päätökset riittävät kääntämään suunnan.";
    return;
  }

  const rates = entries.map(([emotion, obj]) => {
    const rate = obj.total ? obj.bad / obj.total : 0;
    return { emotion, rate, total: obj.total };
  });

  rates.sort((a, b) => b.rate - a.rate);

  const worst = rates[0];

  const niceName = (e) => {
    if (e === "calm") return "rauhallinen";
    if (e === "tense") return "kireä";
    if (e === "bored") return "tylsistynyt";
    if (e === "euphoric") return "euforinen";
    return e;
  };

  if (behaviorEl) {
    behaviorEl.textContent = `Historiasi mukaan kalleimmat virheet tapahtuvat, kun olet ${niceName(
      worst.emotion
    )} (noin ${(worst.rate * 100).toFixed(0)} % päätöksistä tässä tilassa on sinua vastaan).`;
  }

  if (soothingEl) {
    soothingEl.textContent =
      "Tunne ei ole vihollinen. Se vain kertoo, milloin kannattaa lisätä yksi lisäjarru ennen kuin raha liikkuu.";
  }
}

function renderTrajectories(agg) {
  const canvas = document.getElementById("trajectoryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const { real, ghost, dark } = generateTrajectories(agg, 30);

  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const margin = { left: 28, right: 10, top: 12, bottom: 18 };
  const allVals = real.concat(ghost).concat(dark);
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(...allVals, -1);

  const scaleX = (w - margin.left - margin.right) / Math.max(real.length - 1, 1);
  const scaleY = (h - margin.top - margin.bottom) / (maxVal - minVal || 1);

  function mapPoint(i, val) {
    const x = margin.left + i * scaleX;
    const y = h - margin.bottom - (val - minVal) * scaleY;
    return { x, y };
  }

  // zero-line jos tarpeen
  if (minVal < 0 && maxVal > 0) {
    const zeroY = h - margin.bottom - (0 - minVal) * scaleY;
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(w - margin.right, zeroY);
    ctx.stroke();
  }

  function drawLine(values, color, dash) {
    ctx.beginPath();
    values.forEach((val, i) => {
      const p = mapPoint(i, val);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    if (dash) ctx.setLineDash(dash);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawLine(ghost, "rgba(255,230,109,0.9)", [4, 4]); // ghost
  drawLine(dark, "rgba(255,118,117,0.9)", [3, 3]); // dark
  drawLine(real, "rgba(0,206,201,1)", null); // real

  // future index (12 steps)
  const indexEl = document.getElementById("future-index");
  if (indexEl) {
    const idx = Math.min(11, real.length - 1);
    const val = real[idx] || 0;
    indexEl.textContent = (val >= 0 ? "+" : "") + val.toFixed(0);
  }

  // Money Gravity
  const grav = computeMoneyGravity(agg);
  const gravEl = document.getElementById("gravity-text");
  if (gravEl) {
    gravEl.textContent = `Tällä hetkellä rahajärjestelmäsi painovoima suuntautuu kohti: ${grav.main}. ${grav.explanation}`;
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
