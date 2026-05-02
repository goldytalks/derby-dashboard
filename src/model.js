function applyFactors(h) {
  const base = 1 / h.dec;
  const beyerF =
    h.beyer === null ? 0.84 :
    h.beyer >= 106 ? 1.30 :
    h.beyer >= 101 ? 1.16 :
    h.beyer === 100 ? 1.10 :
    h.beyer >= 95 ? 0.90 :
    h.beyer >= 90 ? 0.78 : 0.58;
  const postF =
    h.postGroup === "p1" ? 0.58 :
    h.postGroup === "p17" ? 0.62 :
    h.postGroup === "inner" ? 0.91 :
    h.postGroup === "sweet" ? 1.12 :
    h.postGroup === "outer" ? 0.92 : 0.80;
  const styleF = h.style === "closer" ? 1.14 : h.style === "stalker" ? 1.09 : 0.76;
  const expF = h.starts <= 2 ? 0.71 : h.starts === 3 ? 0.87 : 1.0;
  const foreignF = h.foreign ? 0.78 : 1.0;
  const tjF =
    h.lastYearCombo ? 1.20 :
    h.jDerby >= 3 ? 1.12 :
    (h.eliteJ && h.eliteT && h.jDerby >= 1) ? 1.08 :
    (h.eliteT && h.eliteJ) ? 1.04 :
    h.eliteT ? 1.02 : 1.0;
  const jWinF = h.jWinPct >= 0.25 ? 1.08 : h.jWinPct >= 0.20 ? 1.03 : 1.0;
  const hotJockeyF = h.jockeyHot ? 1.06 : 1.0;
  const steamF = h.name === "So Happy" ? 1.12 : 1.0;
  const formF = h.formCollapse ? 0.38 : 1.0;
  const maidenF = h.maiden ? 0.35 : 1.0;
  const bounceF = h.bounceRisk ? 0.88 : 1.0;
  return base * beyerF * postF * styleF * expF * foreignF * tjF * jWinF * hotJockeyF * steamF * formF * maidenF * bounceF;
}

export function buildModel(horses) {
  const raw = horses.map((h) => ({ ...h, raw: applyFactors(h) }));
  const totalRaw = raw.reduce((s, h) => s + h.raw, 0);
  const totalMarket = raw.reduce((s, h) => s + 1 / h.dec, 0);
  return raw
    .map((h) => ({
      ...h,
      modelProb: (h.raw / totalRaw) * 100,
      marketProb: ((1 / h.dec) / totalMarket) * 100,
    }))
    .map((h) => ({ ...h, valueRating: h.modelProb / h.marketProb }));
}

export function monteCarlo(horses, N = 10000) {
  const probs = horses.map((h) => h.modelProb / 100);
  const wins = new Array(horses.length).fill(0);
  const place = new Array(horses.length).fill(0);
  const show = new Array(horses.length).fill(0);
  for (let s = 0; s < N; s++) {
    const rem = [...Array(horses.length).keys()];
    const remP = [...probs];
    const top3 = [];
    for (let pos = 0; pos < 3; pos++) {
      const total = remP.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      let chosen = rem.length - 1;
      for (let j = 0; j < rem.length; j++) {
        r -= remP[j];
        if (r <= 0) {
          chosen = j;
          break;
        }
      }
      top3.push(rem[chosen]);
      rem.splice(chosen, 1);
      remP.splice(chosen, 1);
    }
    wins[top3[0]]++;
    place[top3[0]]++;
    place[top3[1]]++;
    show[top3[0]]++;
    show[top3[1]]++;
    show[top3[2]]++;
  }
  return horses.map((h, i) => ({
    ...h,
    simWin: (wins[i] / N) * 100,
    simPlace: (place[i] / N) * 100,
    simShow: (show[i] / N) * 100,
  }));
}

// 10x bankroll target ($200 → $2,000) with longshot-heavy exotics.
// Strategy: small wins on anchors + lottery wins on longshots, then concentrate
// in trifectas/superfectas keyed with anchors on top and longshots underneath.
// That payout structure is where 10x+ multipliers actually exist on Derby Day.
export function generateTicket(modeled) {
  const sorted = [...modeled].sort((a, b) => b.modelProb - a.modelProb);

  // ANCHORS — high model%, fundamentals intact. Top of every ticket.
  const anchors = sorted
    .filter(
      (h) =>
        h.modelProb >= 8 &&
        (h.beyer === null || h.beyer >= 100) &&
        !h.formCollapse &&
        !h.maiden
    )
    .slice(0, 4);

  // MID — secondary contenders that fit in the 3rd slot of supers.
  // Includes mid-priced horses with realistic upside (Renegade, Wonder Dean, Potente, Danon Bourbon).
  const mid = sorted
    .filter(
      (h) =>
        !anchors.includes(h) &&
        h.modelProb >= 2.5 &&
        !h.maiden &&
        h.starts >= 3
    )
    .slice(0, 5);

  // LONGSHOTS — 13/1+, real path (not maidens, not 0-start newbies, not formCollapse).
  // These are the engine of the 10x payout — they sit underneath anchors in exotics.
  // Note: includes mid-tier horses too, since 14/1+ horses are still "longshots" in
  // betting terms even if the model gives them respectable %.
  const longshots = sorted
    .filter(
      (h) =>
        !anchors.includes(h) &&
        h.dec >= 13 &&
        !h.maiden &&
        !h.formCollapse &&
        h.starts >= 3
    )
    .slice(0, 8);

  const bets = [];

  // WIN — anchors at $5 each (cover, not 10x driver)
  anchors.forEach((h) => {
    bets.push({
      type: "WIN",
      horses: [h],
      amount: 5,
      why: `Anchor. Model ${h.modelProb.toFixed(1)}% · value ${h.valueRating.toFixed(2)}× · Beyer ${h.beyer ?? "—"}. $5 → $${(5 * h.dec).toFixed(0)} if wins.`,
    });
  });

  // WIN — top 6 longshots at $4 each (lottery tickets, 14/1–48/1 range).
  // Cheap individually but if any one hits at 25/1+ we clear $100+ on a $4 bet.
  const longshotWinPicks = longshots.slice(0, 6);
  longshotWinPicks.forEach((h) => {
    bets.push({
      type: "WIN",
      horses: [h],
      amount: 4,
      why: `Longshot lottery @ ${h.oddsDisplay}. $4 → $${(4 * h.dec).toFixed(0)} if wins. Path: ${h.notes.split(".")[0]}.`,
    });
  });

  // EXACTA BOX — 4 anchors, $1 × 12 combos = $12
  let exactaBet = null;
  if (anchors.length >= 4) {
    const combos = anchors.length * (anchors.length - 1);
    exactaBet = {
      type: "EXACTA",
      horses: anchors,
      amount: combos * 1,
      combos,
      perCombo: 1,
      why: `$1 box of all ${anchors.length} anchors. ${combos} combos. Hits if any 2 anchors finish 1-2. Estimated payout $40–$200.`,
    };
    bets.push(exactaBet);
  }

  // TRIFECTA — key each top-3 anchor 1st separately, with anchors 2nd, longshots 3rd.
  // 1 × (anchors-1) × longshotPool combos at $1 each.
  const triKeys = anchors.slice(0, 3);
  const triUnderAnchors = anchors;
  const triUnderLongshots = longshots.slice(0, 6);
  triKeys.forEach((key) => {
    const second = triUnderAnchors.filter((h) => h !== key);
    const third = triUnderLongshots;
    const combos = second.length * third.length;
    bets.push({
      type: "TRIFECTA",
      horses: [key, ...second, ...third],
      key,
      under: [...second, ...third],
      amount: combos * 1,
      combos,
      perCombo: 1,
      why: `Key ${key.name} 1st / ${second.length} anchors 2nd / ${third.length} longshots 3rd = ${combos} combos × $1. Estimated hit $1,500–$5,000+ when a longshot lands 3rd. ← 10x target lives here.`,
    });
  });

  // SUPERFECTA — key each top-3 anchor 1st, anchors 2nd, mid 3rd, deep longshots 4th.
  // Wide 4th slot (7 longshots) maximizes the chance of catching a deep board-filler
  // landing 4th, where the biggest payouts live ($5,000–$50,000+ typical Derby SF).
  const sfKeys = anchors.slice(0, 3);
  const sfThirdPool = mid.slice(0, 5);
  const sfFourthPool = longshots.slice(0, 7);
  sfKeys.forEach((key) => {
    const second = anchors.filter((h) => h !== key);
    const third = sfThirdPool.filter((h) => h !== key);
    const fourth = sfFourthPool;
    let combos = 0;
    for (const b of second)
      for (const c of third)
        for (const d of fourth)
          if (b !== c && b !== d && c !== d && b !== key && c !== key && d !== key) combos++;
    const perCombo = 0.4;
    bets.push({
      type: "SUPERFECTA",
      horses: [key, ...second, ...third, ...fourth],
      key,
      amount: +(combos * perCombo).toFixed(2),
      combos,
      perCombo,
      why: `Key ${key.name} 1st / ${second.length} anchors 2nd / ${third.length} mid 3rd / ${fourth.length} deep 4th = ${combos} combos × $${perCombo}. Estimated hit $5,000–$50,000+ when a longshot lands 4th. ← Primary 10x driver.`,
    });
  });

  const allocated = bets.reduce((s, b) => s + b.amount, 0);
  const remainder = Math.max(0, 200 - allocated);
  bets.push({
    type: "RESERVE",
    horses: [],
    amount: remainder,
    why: `Late-tote reserve. Hold until 15 min before post. If a longshot at 25/1+ shortens 30% on the board, fire $5–10 win bets. Late drift is the sharpest signal in horse racing.`,
  });

  // Candidates surfaced to UI: anchors first, then longshots-with-win-bets
  const candidates = [...anchors, ...longshotWinPicks];
  const total = bets.reduce((s, b) => s + b.amount, 0);

  return { bets, candidates, total, anchors, mid, longshots, longshotWinPicks };
}
