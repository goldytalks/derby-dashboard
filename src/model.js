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

// Generate dynamic ticket recommendations from model output
export function generateTicket(modeled) {
  const candidates = modeled
    .filter(
      (h) =>
        h.modelProb >= 4.0 &&
        h.valueRating >= 1.10 &&
        (h.beyer >= 100 || h.beyer === null) &&
        !h.formCollapse &&
        !h.maiden
    )
    .map((h) => ({ ...h, composite: h.modelProb * h.valueRating }))
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 5);

  const winAllocations = [30, 20, 15, 10, 5];
  const winBets = candidates.map((h, i) => ({
    type: "WIN",
    horses: [h],
    amount: winAllocations[i] || 0,
    why: `${h.name}: composite score ${h.composite.toFixed(1)} (model ${h.modelProb.toFixed(1)}% × value ${h.valueRating.toFixed(2)}). Beyer ${h.beyer ?? "—"}. Allocated $${winAllocations[i]}.`,
  }));

  const exactaBet =
    candidates.length >= 2
      ? {
          type: "EXACTA",
          horses: [candidates[0], candidates[1]],
          amount: 10,
          why: `Box top 2 candidates by composite score: ${candidates[0].name} & ${candidates[1].name}. $5 per combo × 2 combos = $10.`,
        }
      : null;

  // Trifecta wheel: top horse keyed 1st, all others 2nd & 3rd
  const triUnder = candidates.slice(1);
  const triCombos = triUnder.length >= 2 ? triUnder.length * (triUnder.length - 1) : 0;
  const triPerCombo = triCombos > 0 ? Math.max(1, Math.round((40 / triCombos) * 2) / 2) : 0;
  const triTotal = triCombos * triPerCombo;
  const trifectaBet =
    candidates.length >= 3
      ? {
          type: "TRIFECTA",
          horses: candidates,
          key: candidates[0],
          under: triUnder,
          amount: triTotal,
          combos: triCombos,
          perCombo: triPerCombo,
          why: `Key ${candidates[0].name} on top. ${triUnder.length} horses under (${triUnder.map((h) => h.name).join(", ")}) = ${triCombos} combos at $${triPerCombo} each = $${triTotal}.`,
        }
      : null;

  // Superfecta key: top horse 1st, then descending pools for 2/3/4
  let sfCombos = 0;
  if (candidates.length >= 4) {
    const p2 = candidates.slice(1, 3);
    const p3 = candidates.slice(1, 4);
    const p4 = candidates.slice(1, 5);
    for (const a of p2) for (const b of p3) for (const c of p4) {
      if (a.name !== b.name && a.name !== c.name && b.name !== c.name) sfCombos++;
    }
  }
  const sfPerCombo = sfCombos > 0 ? Math.max(0.5, Math.round((35 / sfCombos) * 2) / 2) : 0;
  const sfTotal = sfCombos * sfPerCombo;
  const superfectaBet =
    candidates.length >= 4
      ? {
          type: "SUPERFECTA",
          horses: candidates,
          key: candidates[0],
          amount: sfTotal,
          combos: sfCombos,
          perCombo: sfPerCombo,
          why: `Key ${candidates[0].name} 1st. Spreads underneath (positions 2-4) using candidates ranked 2-${candidates.length}. ${sfCombos} combos at $${sfPerCombo} each = $${sfTotal}. $${35 - sfTotal} of $35 superfecta budget unallocated.`,
        }
      : null;

  const winTotal = winBets.reduce((s, b) => s + b.amount, 0);
  const exactaTotal = exactaBet ? exactaBet.amount : 0;
  const reserve = 35;
  const allocated = winTotal + exactaTotal + triTotal + sfTotal + reserve;
  const remainder = 200 - allocated;

  const reserveBet = {
    type: "RESERVE",
    horses: [],
    amount: reserve + Math.max(0, remainder),
    why: `Tote watch reserve. Hold until 15 minutes before post. If a horse with valueRating > 1.5 drifts 20%+ from its current live odds, allocate to that win bet. Late tote money is the sharpest signal.`,
  };

  const bets = [...winBets, exactaBet, trifectaBet, superfectaBet, reserveBet].filter(Boolean);
  const total = bets.reduce((s, b) => s + b.amount, 0);

  return { bets, candidates, total };
}
