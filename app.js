// --------------------------
// HOLOGRAM GRID
// --------------------------
const canvas = document.getElementById("holo-grid");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0,245,255,0.18)";
  ctx.lineWidth = 0.4;
  const spacing = 42;

  for (let x = 0; x < canvas.width; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}
setInterval(drawGrid, 80);

// --------------------------
// STATE
// --------------------------
const STORAGE_KEY = "sothis_x_vault_state_v1";

let state = {
  core: {
    income: 0,
    expenses: 0,
    savings: 0,
    debt: 0,
    housingGoal: 0
  },
  history: {
    good: 0,
    bad: 0
  }
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.core) state = parsed;
    }
  } catch (e) {
    console.warn("State load failed", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --------------------------
// HELPERS
// --------------------------
function euro(x) {
  if (x === null || x === undefined || isNaN(x)) return "–";
  const v = Math.round(x);
  return v.toLocaleString("fi-FI") + " €";
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// --------------------------
// CORE CALC
// --------------------------
function computeCore() {
  const { income, expenses, savings, debt, housingGoal } = state.core;
  const surplus = income - expenses;
  const futureSavings = surplus * 12;
  const futureNet = savings + futureSavings - debt;
  const risk =
    surplus < 0 ? "KORKEA" : surplus < income * 0.1 ? "KESKI" : "MATALA";

  let monthsToHouse = null;
  if (housingGoal > 0 && surplus > 0) {
    monthsToHouse = Math.max(0, Math.ceil((housingGoal - savings) / surplus));
  }

  const bufferMonths =
    expenses > 0 ? clamp(savings / expenses, 0, 9999) : null;

  // yksinkertainen Bayes-tyyppinen arvio
  const good = state.history.good;
  const bad = state.history.bad;
  const alpha = 1 + good;
  const beta = 1 + bad;
  const bayesMean =
    good + bad > 0 ? alpha / (alpha + beta) : surplus > 0 ? 0.7 : 0.3;

  // Monte Carlo -tyylinen arvio onnistumis-%:sta 12kk päästä
  let mc = 0.5;
  if (surplus > 0 && futureNet >= 0) mc = 0.8;
  else if (surplus > 0 && futureNet < 0) mc = 0.6;
  else if (surplus < 0 && futureNet < 0) mc = 0.3;

  return {
    surplus,
    futureNet,
    risk,
    monthsToHouse,
    bufferMonths,
    bayesMean,
    mcSuccess: mc
  };
}

// --------------------------
// RENDER CORE UI
// --------------------------
function renderCore() {
  const { income, expenses, savings, debt, housingGoal } = state.core;
  const agg = computeCore();

  // cells
  document.getElementById("cell-income").textContent = euro(income);
  document.getElementById("cell-expenses").textContent = euro(expenses);
  document.getElementById("cell-surplus").textContent = euro(agg.surplus);
  document.getElementById("cell-savings").textContent = euro(savings);
  document.getElementById("cell-debt").textContent = euro(debt);
  document.getElementById("cell-forecast").textContent = euro(agg.futureNet);
  document.getElementById("cell-risk").textContent = agg.risk;

  if (agg.monthsToHouse != null && agg.monthsToHouse !== Infinity) {
    document.getElementById("cell-housing").textContent =
      agg.monthsToHouse + " kk";
  } else {
    document.getElementById("cell-housing").textContent = "–";
  }

  // overview panel
  const bayesEl = document.getElementById("cell-bayes");
  const mcEl = document.getElementById("cell-mc");
  if (bayesEl) {
    bayesEl.textContent = (agg.bayesMean * 100).toFixed(1) + " %";
  }
  if (mcEl) {
    mcEl.textContent = (agg.mcSuccess * 100).toFixed(0) + " %";
  }

  // goals panel
  const ghm = document.getElementById("goal-housing-months");
  const ght = document.getElementById("goal-housing-text");
  const gbf = document.getElementById("goal-buffer");
  const gbt = document.getElementById("goal-buffer-text");

  if (ghm && ght) {
    if (agg.monthsToHouse != null && agg.monthsToHouse !== Infinity) {
      ghm.textContent = agg.monthsToHouse + " kk";
      const years = (agg.monthsToHouse / 12).toFixed(1);
      let prob = 0.4;
      if (agg.mcSuccess > 0.7) prob = 0.75;
      else if (agg.mcSuccess > 0.5) prob = 0.6;
      ght.textContent =
        "Nykyisellä tasolla realistinen arvio on noin " +
        years +
        " vuotta, ja onnistumistodennäköisyys on noin " +
        Math.round(prob * 100) +
        " % jos rytmi pysyy samana.";
    } else {
      ghm.textContent = "–";
      ght.textContent = "Syötä asuntotavoite ja positiivinen ylijäämä.";
    }
  }

  if (gbf && gbt) {
    if (agg.bufferMonths != null && isFinite(agg.bufferMonths)) {
      gbf.textContent = agg.bufferMonths.toFixed(1) + " kk";
      if (agg.bufferMonths < 1) {
        gbt.textContent =
          "Hengitysvara on ohut. Jokainen lisäeuro säästöön kasvattaa holvin turvaa.";
      } else if (agg.bufferMonths < 3) {
        gbt.textContent =
          "Sinulla on jonkin verran puskuria. 3–6 kk menot säästöissä on monen talousgurun peruslinja.";
      } else {
        gbt.textContent =
          "Hengitysvara on hyvä. Nyt voidaan alkaa optimoida myös tuottoa, ei pelkkää turvaa.";
      }
    } else {
      gbf.textContent = "–";
      gbt.textContent = "Syötä säästöt ja menot, niin arvioin puskurin.";
    }
  }

  jarvisCoreComment(agg);
}

// --------------------------
// JARVIS CORE
// --------------------------
function jarvisCoreComment(agg) {
  const out = document.getElementById("jarvis-output");
  if (!out) return;

  let msg = "";

  if (agg.surplus < 0) {
    msg += "Kassavirta on negatiivinen. Ensimmäinen tavoite: käännetään se plussalle, vaikka 20 € kuussa. ";
  } else if (agg.surplus < state.core.income * 0.1) {
    msg += "Kassavirta on ohut, mutta plussalla. Yksi tai kaksi turhaa ostosta kuukaudessa voi kaataa tämän. ";
  } else {
    msg += "Kassavirta näyttää terveeltä. Nyt kyse on siitä, mihin suuntaat tämän ylijäämän. ";
  }

  if (agg.futureNet < 0) {
    msg += "12 kuukauden ennuste on vielä miinuksella – velka tai kulutus painaa. ";
  } else {
    msg += "12 kuukauden ennuste näyttää plus-merkkiseltä, jos pysyt rytmissä. ";
  }

  if (agg.monthsToHouse != null && agg.monthsToHouse !== Infinity) {
    msg += `Asuntotavoite on realistisesti saavutettavissa noin ${agg.monthsToHouse} kuukaudessa, jos jatkat samalla tasolla.`;
  } else if (state.core.housingGoal > 0) {
    msg += "Asuntotavoite on asetettu, mutta nykyinen ylijäämä ei riitä sen saavuttamiseen järkevässä ajassa. Tarvitsemme lisää ylijäämää.";
  }

  out.textContent = msg;
}

// --------------------------
// CORE INPUT HANDLERS
// --------------------------
function initCoreInputs() {
  // load values to inputs
  document.getElementById("in-income").value =
    state.core.income || "";
  document.getElementById("in-expenses").value =
    state.core.expenses || "";
  document.getElementById("in-savings").value =
    state.core.savings || "";
  document.getElementById("in-debt").value =
    state.core.debt || "";
  document.getElementById("in-housing").value =
    state.core.housingGoal || "";

  document
    .getElementById("btn-update-core")
    .addEventListener("click", () => {
      state.core.income =
        parseFloat(document.getElementById("in-income").value) || 0;
      state.core.expenses =
        parseFloat(document.getElementById("in-expenses").value) || 0;
      state.core.savings =
        parseFloat(document.getElementById("in-savings").value) || 0;
      state.core.debt =
        parseFloat(document.getElementById("in-debt").value) || 0;
      state.core.housingGoal =
        parseFloat(document.getElementById("in-housing").value) || 0;

      saveState();
      renderCore();
    });
}

// --------------------------
// NAV
// --------------------------
function initNav() {
  const buttons = document.querySelectorAll(".nav-btn");
  const panels = {
    overview: document.getElementById("panel-overview"),
    purchase: document.getElementById("panel-purchase"),
    bills: document.getElementById("panel-bills"),
    goals: document.getElementById("panel-goals")
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-panel");
      Object.keys(panels).forEach((key) => {
        panels[key].classList.toggle("active", key === target);
      });
    });
  });

  // start with overview
  panels.overview.classList.add("active");
}

// --------------------------
// PURCHASE AI
// --------------------------
function initPurchaseAI() {
  const btn = document.getElementById("btn-analyze-purchase");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const amount =
      parseFloat(document.getElementById("purchase-amount").value) ||
      0;
    const type = document.getElementById("purchase-type").value;
    const freq = document.getElementById("purchase-frequency").value;

    const summaryEl = document.getElementById("purchase-summary");
    const ghostEl = document.getElementById("purchase-ghost");
    const probEl = document.getElementById("purchase-prob");
    const paybackEl = document.getElementById("purchase-payback");

    if (!amount || amount <= 0) {
      summaryEl.textContent = "Anna ensin ostoksen summa.";
      ghostEl.textContent = "";
      probEl.textContent = "";
      paybackEl.textContent = "";
      return;
    }

    const baseAgg = computeCore();

    // ostos vs ghost-vaihtoehto
    const monthlyImpact =
      freq === "once" ? amount : amount * 12;

    // skenaario: ostat
    const withFutureNet = baseAgg.futureNet - monthlyImpact;

    // ghost-skenaario: sama summa säästöön / velan lyhennykseen
    let ghostFutureNet = baseAgg.futureNet;
    if (type === "debt") {
      ghostFutureNet = baseAgg.futureNet + amount; // velan väheneminen parantaa nettotilannetta
    } else if (type === "invest" || type === "tool" || type === "experience") {
      ghostFutureNet = baseAgg.futureNet + amount * 0.5; // oletetaan puoliksi palautuva investointi
    } else {
      ghostFutureNet = baseAgg.futureNet + amount;
    }

    const deltaReal = withFutureNet - baseAgg.futureNet;
    const deltaGhost = ghostFutureNet - baseAgg.futureNet;

    summaryEl.textContent =
      `Jos teet tämän ostoksen, 12 kk ennuste muuttuisi tasolta ${euro(
        baseAgg.futureNet
      )} tasolle ${euro(withFutureNet)} (${deltaReal >= 0 ? "+" : ""}${Math.round(
        deltaReal
      )} €).`;

    ghostEl.textContent =
      `Jos sama raha menisi säästöön / velan lyhennykseen / sijoitukseen ghost-skenaariona, ennuste olisi ${euro(
        ghostFutureNet
      )} (${deltaGhost >= 0 ? "+" : ""}${Math.round(deltaGhost)} €).`;

    // Monte Carlo -tyyppinen todennäköisyys: käytetään yksinkertaista heuristiikkaa
    let regretProb = 0.4;
    if (type === "consumer" || type === "food") regretProb = 0.6;
    if (freq === "monthly") regretProb += 0.15;
    if (baseAgg.surplus < 0) regretProb += 0.2;
    regretProb = clamp(regretProb, 0.1, 0.9);

    probEl.textContent =
      `Arvioitu katumisriski seuraavan 30–90 päivän aikana: ${Math.round(
        regretProb * 100
      )} %. `;

    // takaisinmaksu / vaikutusaika
    let paybackText = "";
    if (type === "debt") {
      paybackText = "Tämä liike lyhentää velkaa heti – kyse ei ole ostoksen takaisinmaksusta vaan velan purusta.";
      state.history.good++;
    } else {
      if (state.core.income > 0) {
        const surplus = baseAgg.surplus;
        if (surplus > 0) {
          const monthsToRecover = monthlyImpact / Math.max(1, surplus);
          paybackText =
            "Nykyisellä kassavirralla tämä ostos 'katoaa' varallisuuskäyrältä noin " +
            monthsToRecover.toFixed(1) +
            " kuukauden sisällä, jos et lisää muita vastaavia menoja.";
        } else {
          paybackText =
            "Koska kassavirta on tällä hetkellä negatiivinen tai hyvin ohut, tämä ostos jää roikkumaan varallisuuskäyrään pitkään.";
          state.history.bad++;
        }
      }
    }

    paybackEl.textContent = paybackText;
    saveState();
    renderCore(); // päivitä Bayes ja kokonaisnäkymä
    jarvisPurchaseComment(amount, type, freq, deltaReal, deltaGhost, regretProb);
  });
}

function jarvisPurchaseComment(amount, type, freq, deltaReal, deltaGhost, regretProb) {
  const out = document.getElementById("jarvis-output");
  if (!out) return;

  let t = "";
  if (deltaReal < 0 && Math.abs(deltaReal) > amount * 0.8) {
    t +=
      "Tämä ostos on raskaasti sinua vastaan taloudellisesti. Se syö enemmän tulevaa liikkumatilaa kuin pelkkä hinta kertoo. ";
  } else if (deltaReal < 0) {
    t +=
      "Ostos on taloudellisesti neutraali–negatiivinen. Voit tehdä sen, mutta olisi järkevää sopia vastaliike, esim. yksi pienempi säästörutistus. ";
  } else {
    t +=
      "Ostos ei näytä kaatavan järjestelmääsi. Todellinen kysymys on: vahvistaako se identiteettiäsi vai paikkaako se vain tunnetta. ";
  }

  if (deltaGhost > deltaReal) {
    t +=
      "Ghost-skenaario on merkittävästi vahvempi kuin ostosskenaario. Universumin näkökulmasta tulevaisuuden sinä kiittäisi, jos siirtäisit osan summasta säästöön tai velan maksuun. ";
  }

  t += `Arvioitu katumisriski ${Math.round(
    regretProb * 100
  )} %. Jos et ole varma, odota 24 tuntia ja katso tuntuuko osto vielä silloin yhtä tärkeältä.`;

  out.textContent = t;
}

// --------------------------
// BILLS / PAYSMART
// --------------------------
function initBills() {
  const btn = document.getElementById("btn-analyze-bill");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const amount =
      parseFloat(document.getElementById("bill-amount").value) || 0;
    const dueDay =
      parseFloat(document.getElementById("bill-due").value) || null;
    const summaryEl = document.getElementById("bill-summary");

    if (!amount || !dueDay || dueDay < 1 || dueDay > 31) {
      summaryEl.textContent =
        "Anna laskun summa ja eräpäivä (1–31), niin arvioin optimaalisen maksupäivän.";
      return;
    }

    const agg = computeCore();
    const surplus = agg.surplus;

    let suggestionDay;
    let explanation = "";

    if (surplus <= 0) {
      suggestionDay = dueDay - 1;
      if (suggestionDay < 1) suggestionDay = 1;
      explanation =
        "Kassavirta on kireä tai negatiivinen. Siksi paras strategia on maksaa lasku mahdollisimman lähellä eräpäivää, mutta ei myöhässä. ";
    } else {
      // yksinkertainen malli: maksa hieman ennen eräpäivää, jos puskuria on
      suggestionDay = Math.round(dueDay * 0.7);
      explanation =
        "Koska kassavirta on plussalla, voit maksaa laskun hieman ennen eräpäivää ja pitää silti puskuria yllättäville menoille. ";
    }

    explanation += `Suositeltu maksupäivä on noin kuukauden ${suggestionDay}. päivä.`;

    summaryEl.textContent = explanation;
    jarvisBillsComment(amount, dueDay, suggestionDay, surplus);
  });
}

function jarvisBillsComment(amount, dueDay, suggestionDay, surplus) {
  const out = document.getElementById("jarvis-output");
  if (!out) return;

  let t = `Analysoin laskun (${amount.toFixed(
    0
  )} €), jonka eräpäivä on kuukauden ${dueDay}. `;
  if (surplus <= 0) {
    t +=
      "Koska kassavirta on nollan tuntumassa tai miinuksella, tärkeintä on pitää lasku ajallaan, mutta venyttää maksua hetkeen jolloin tuloja on sisällä. ";
  } else {
    t +=
      "Koska kassavirta on plussalla, voimme olla aktiivisia: maksat hieman etukäteen, mutta et jää ilman puskuria. ";
  }
  t += `Tavoite ei ole maksaa mahdollisimman aikaisin, vaan maksaa siten, että hermosto pysyy rauhallisena ja holvi kasvaa.`;

  out.textContent = t;
}

// --------------------------
// INIT
// --------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initCoreInputs();
  initNav();
  initPurchaseAI();
  initBills();
  renderCore();
});
