import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import { RACE, FIELD } from "./data";
import { buildModel, monteCarlo, generateTicket } from "./model";

const COLORS = {
  bg: "#080f08",
  panel: "#0d1f0d",
  panel2: "#102610",
  border: "#1a3a1a",
  gold: "#b8973a",
  goldDim: "#8a7128",
  green: "#2d5a2d",
  greenLight: "#4a8a4a",
  text: "#e8e6dc",
  textDim: "#9a9788",
  red: "#c2410c",
  amber: "#d97706",
  purple: "#7c3aed",
};

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

const STORAGE_KEY = "derby-custom-odds-v1";

function useCustomOdds() {
  const [overrides, setOverrides] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [updatedAt, setUpdatedAt] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY + "-ts") || null;
    } catch {
      return null;
    }
  });
  const setOdds = (post, dec) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (dec === null || dec === undefined || isNaN(dec)) delete next[post];
      else next[post] = dec;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        const ts = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY + "-ts", ts);
        setUpdatedAt(ts);
      } catch {}
      return next;
    });
  };
  const resetAll = () => {
    setOverrides({});
    setUpdatedAt(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + "-ts");
    } catch {}
  };
  return { overrides, setOdds, resetAll, updatedAt };
}

function applyOverrides(field, overrides) {
  return field.map((h) => {
    if (overrides[h.post] !== undefined) {
      const dec = overrides[h.post];
      const frac = dec - 1;
      const oddsDisplay =
        Number.isInteger(frac) ? `${frac}/1` : `${frac.toFixed(1)}/1`;
      return { ...h, dec, oddsDisplay, edited: true };
    }
    return h;
  });
}

const fmt = (n, d = 1) => (typeof n === "number" ? n.toFixed(d) : "—");

function Badge({ children, color = COLORS.gold }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.6,
        borderRadius: 3,
        background: color,
        color: "#0a0a0a",
        marginRight: 4,
        marginBottom: 4,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function StatBlock({ label, value, color = COLORS.text }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Header({ isMobile, editMode, setEditMode, updatedAt, resetAll, overrideCount }) {
  const tsLabel = updatedAt
    ? new Date(updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  return (
    <div
      style={{
        background: `linear-gradient(180deg, #0e1f0e 0%, #0a170a 100%)`,
        borderBottom: `1px solid ${COLORS.gold}`,
        padding: isMobile ? "14px 14px 10px" : "20px 28px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: isMobile ? 11 : 12,
              color: COLORS.gold,
              letterSpacing: 2,
              fontWeight: 600,
            }}
          >
            ★ {RACE.date.toUpperCase()} · {RACE.track.toUpperCase()} ★
          </div>
          <div
            style={{
              fontSize: isMobile ? 22 : 30,
              fontWeight: 700,
              color: COLORS.text,
              marginTop: 4,
              letterSpacing: 0.5,
            }}
          >
            {RACE.name}
          </div>
          <div style={{ fontSize: isMobile ? 12 : 13, color: COLORS.textDim, marginTop: 4 }}>
            {RACE.distance} · Post {RACE.postTime} · {RACE.runners} runners · Track {RACE.condition}
          </div>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          style={{
            background: editMode ? COLORS.gold : "transparent",
            color: editMode ? "#0a0a0a" : COLORS.gold,
            border: `1px solid ${COLORS.gold}`,
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {editMode ? "Done" : "✎ Edit Odds"}
        </button>
      </div>
      {(overrideCount > 0 || editMode) && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            background: COLORS.panel2,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            fontSize: 11,
            color: COLORS.textDim,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>
            {overrideCount > 0 ? (
              <>
                <strong style={{ color: COLORS.gold }}>{overrideCount}</strong> odds edited
                {tsLabel ? ` · last update ${tsLabel}` : ""}
              </>
            ) : (
              <>Edit mode on. Tap any odds value in the Field tab to override.</>
            )}
          </span>
          {overrideCount > 0 && (
            <button
              onClick={resetAll}
              style={{
                background: "transparent",
                color: COLORS.red,
                border: `1px solid ${COLORS.red}`,
                padding: "3px 8px",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TabBar({ tab, setTab, isMobile }) {
  const tabs = [
    { id: "model", icon: "📊", label: "Model" },
    { id: "field", icon: "🏇", label: "Field" },
    { id: "signals", icon: "📡", label: "Signals" },
    { id: "ticket", icon: "🎟️", label: "$200" },
  ];
  return (
    <div
      style={{
        position: isMobile ? "fixed" : "sticky",
        bottom: isMobile ? 0 : "auto",
        top: isMobile ? "auto" : 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: COLORS.panel,
        borderTop: isMobile ? `1px solid ${COLORS.gold}` : "none",
        borderBottom: isMobile ? "none" : `1px solid ${COLORS.border}`,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        height: isMobile ? 60 : 50,
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "transparent",
              border: "none",
              borderTop:
                active && isMobile ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              borderBottom:
                active && !isMobile ? `2px solid ${COLORS.gold}` : "2px solid transparent",
              color: active ? COLORS.gold : COLORS.textDim,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: isMobile ? 11 : 13,
              fontWeight: 600,
              letterSpacing: 0.5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              textTransform: "uppercase",
            }}
          >
            <span style={{ fontSize: isMobile ? 18 : 14, marginBottom: 2 }}>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelTab({ modeled, isMobile }) {
  const top = [...modeled].sort((a, b) => b.modelProb - a.modelProb).slice(0, isMobile ? 5 : 8);
  const chartData = top.map((h) => ({
    name: h.name.length > 14 ? h.name.slice(0, 13) + "…" : h.name,
    Model: +h.modelProb.toFixed(2),
    Market: +h.marketProb.toFixed(2),
  }));
  const valuePicks = modeled
    .filter((h) => h.valueRating > 1.18)
    .sort((a, b) => b.valueRating - a.valueRating);

  return (
    <div style={{ padding: isMobile ? 12 : 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 12,
          }}
        >
          <StatBlock label="Post Time" value={RACE.postTime} color={COLORS.gold} />
          <StatBlock label="Track" value={RACE.condition} />
          <StatBlock label="Weather" value="58°F" />
          <StatBlock label="Pace" value="HOT" color={COLORS.amber} />
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: COLORS.panel2,
            borderLeft: `3px solid ${COLORS.amber}`,
            fontSize: 12,
            color: COLORS.textDim,
            lineHeight: 1.5,
          }}
        >
          {RACE.paceScenario}
        </div>
      </Card>

      <div
        style={{
          background: "linear-gradient(90deg, #3a2e0a 0%, #1a1605 100%)",
          border: `1px solid ${COLORS.gold}`,
          borderRadius: 6,
          padding: 12,
          fontSize: isMobile ? 13 : 14,
          color: COLORS.text,
          lineHeight: 1.5,
        }}
      >
        🔥 <strong style={{ color: COLORS.gold }}>So Happy: 15/1 ML → 6/1 live</strong> — largest sharp move in
        the field. <strong style={{ color: COLORS.greenLight }}>Chief Wallabee: 8/1 → 6/1</strong> — Mott/Alvarado
        combo getting hammered.
      </div>

      <Card>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.gold,
            marginBottom: 10,
            letterSpacing: 0.5,
          }}
        >
          MODEL vs MARKET (Top {isMobile ? 5 : 8})
        </div>
        <div style={{ width: "100%", height: isMobile ? 240 : 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke={COLORS.border} horizontal={false} />
              <XAxis type="number" stroke={COLORS.textDim} fontSize={11} />
              <YAxis
                type="category"
                dataKey="name"
                stroke={COLORS.textDim}
                fontSize={isMobile ? 10 : 12}
                width={isMobile ? 80 : 110}
              />
              <Tooltip
                contentStyle={{
                  background: COLORS.panel2,
                  border: `1px solid ${COLORS.gold}`,
                  borderRadius: 4,
                  color: COLORS.text,
                }}
                formatter={(v) => `${v}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: COLORS.textDim }} />
              <Bar dataKey="Model" fill={COLORS.gold} barSize={isMobile ? 14 : 18} />
              <Bar dataKey="Market" fill={COLORS.green} barSize={isMobile ? 14 : 18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.gold,
            marginBottom: 10,
            letterSpacing: 0.5,
          }}
        >
          VALUE OVERLAYS (Model &gt; Market)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {valuePicks.map((h) => {
            const vColor = h.valueRating > 1.35 ? COLORS.gold : COLORS.greenLight;
            return (
              <div
                key={h.post}
                style={{
                  background: COLORS.panel2,
                  borderLeft: `3px solid ${h.color}`,
                  padding: 10,
                  borderRadius: 4,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>
                    #{h.post} {h.name}
                  </div>
                  <Badge color={vColor}>{fmt(h.valueRating, 2)}×</Badge>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 6,
                    fontSize: 11,
                  }}
                >
                  <StatBlock label="Odds" value={h.oddsDisplay} />
                  <StatBlock
                    label="Beyer"
                    value={h.beyer ?? "—"}
                    color={h.beyer >= 100 ? COLORS.gold : COLORS.text}
                  />
                  <StatBlock label="Model" value={`${fmt(h.modelProb)}%`} color={COLORS.gold} />
                  <StatBlock label="Mkt" value={`${fmt(h.marketProb)}%`} color={COLORS.textDim} />
                </div>
              </div>
            );
          })}
          {valuePicks.length === 0 && (
            <div style={{ color: COLORS.textDim, fontSize: 12 }}>No overlays detected.</div>
          )}
        </div>
      </Card>

      <Card style={{ borderColor: COLORS.amber }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.amber,
            marginBottom: 6,
            letterSpacing: 0.5,
          }}
        >
          ⚡ HOT JOCKEYS (Today's Undercard)
        </div>
        <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6 }}>
          <strong>Velazquez</strong> (Further Ado) and <strong>Prat</strong> (Emerging Market) each won 2 races on
          today's undercard. Prat has the highest jockey win rate in the field at <strong>25%</strong>.
        </div>
      </Card>
    </div>
  );
}

function OddsInput({ horse, setOdds }) {
  const [val, setVal] = useState((horse.dec - 1).toString());
  useEffect(() => {
    setVal((horse.dec - 1).toString());
  }, [horse.dec]);
  const commit = () => {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return;
    setOdds(horse.post, n + 1);
  };
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          fontSize: 10,
          color: COLORS.gold,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 700,
        }}
      >
        Odds /1
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.target.blur();
            }
          }}
          style={{
            background: COLORS.bg,
            border: `1px solid ${COLORS.gold}`,
            color: COLORS.gold,
            padding: "4px 6px",
            borderRadius: 3,
            fontSize: 14,
            fontWeight: 700,
            width: "100%",
            minWidth: 0,
            fontFamily: "inherit",
          }}
        />
        <span style={{ color: COLORS.textDim, fontSize: 12 }}>/1</span>
      </div>
    </div>
  );
}

function FieldTab({ modeled, isMobile, editMode, setOdds }) {
  const [sort, setSort] = useState("modelProb");
  const [expanded, setExpanded] = useState(null);
  const sorts = [
    { id: "modelProb", label: "Model%" },
    { id: "simWin", label: "Sim Win" },
    { id: "beyer", label: "Beyer" },
    { id: "dec", label: "Odds" },
    { id: "valueRating", label: "Value" },
  ];

  const sorted = useMemo(() => {
    return [...modeled].sort((a, b) => {
      if (sort === "dec") return a.dec - b.dec;
      if (sort === "beyer") return (b.beyer ?? 0) - (a.beyer ?? 0);
      return b[sort] - a[sort];
    });
  }, [modeled, sort]);

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 12,
          overflowX: "auto",
          paddingBottom: 4,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {sorts.map((s) => (
          <button
            key={s.id}
            onClick={() => setSort(s.id)}
            style={{
              background: sort === s.id ? COLORS.gold : "transparent",
              color: sort === s.id ? "#0a0a0a" : COLORS.textDim,
              border: `1px solid ${sort === s.id ? COLORS.gold : COLORS.border}`,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              minHeight: 36,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((h) => {
          const isFade = h.valueRating < 0.72 || h.formCollapse || h.maiden || h.starts <= 2;
          const isValue = h.valueRating > 1.25;
          const dim = h.modelProb < 1.8;
          const isExp = expanded === h.post;
          return (
            <div
              key={h.post}
              onClick={() => setExpanded(isExp ? null : h.post)}
              style={{
                background: COLORS.panel,
                borderLeft: `3px solid ${h.color}`,
                border: `1px solid ${isValue ? COLORS.gold : COLORS.border}`,
                borderLeftWidth: 3,
                borderLeftColor: h.color,
                borderRadius: 4,
                padding: 12,
                opacity: dim ? 0.5 : 1,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: COLORS.textDim,
                        fontWeight: 600,
                      }}
                    >
                      #{h.post}
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>
                      {h.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                    {h.jockeyName} / {h.trainerName}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                    maxWidth: "55%",
                  }}
                >
                  {isValue && <Badge color={COLORS.gold}>Value</Badge>}
                  {isFade && <Badge color={COLORS.red}>Fade</Badge>}
                  {h.jockeyHot && <Badge color={COLORS.amber}>Hot J</Badge>}
                  {h.lastYearCombo && <Badge color={COLORS.greenLight}>Repeat</Badge>}
                  {h.name === "So Happy" && <Badge color={COLORS.purple}>Steam</Badge>}
                  {h.edited && <Badge color={COLORS.purple}>Edited</Badge>}
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 8,
                }}
              >
                {editMode ? (
                  <OddsInput horse={h} setOdds={setOdds} />
                ) : (
                  <StatBlock label="Odds" value={h.oddsDisplay} color={COLORS.gold} />
                )}
                <StatBlock
                  label="Beyer"
                  value={h.beyer ?? "—"}
                  color={h.beyer >= 100 ? COLORS.gold : COLORS.textDim}
                />
                <StatBlock label="Model%" value={`${fmt(h.modelProb)}`} />
                <StatBlock label="Sim Win" value={`${fmt(h.simWin)}%`} color={COLORS.greenLight} />
              </div>

              {h.mlMove && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    fontStyle: "italic",
                    color: COLORS.goldDim,
                    lineHeight: 1.4,
                  }}
                >
                  {h.mlMove}
                </div>
              )}

              {isExp && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: `1px solid ${COLORS.border}`,
                    fontSize: 12,
                    color: COLORS.text,
                    lineHeight: 1.6,
                  }}
                >
                  {h.notes}
                  <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textDim }}>
                    Value rating <strong style={{ color: COLORS.gold }}>{fmt(h.valueRating, 2)}×</strong> · Place{" "}
                    {fmt(h.simPlace)}% · Show {fmt(h.simShow)}%
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignalsTab({ modeled, isMobile }) {
  const moves = [
    { name: "So Happy", ml: "15/1", live: "6/1", pct: "-60%", note: "🔥 Sharp money. Largest move in field. Slight cool-off from earlier 5/1.", color: COLORS.gold },
    { name: "Chief Wallabee", ml: "8/1", live: "6/1", pct: "-25%", note: "🔥 Mott/Alvarado combo (last year's winners) getting hammered.", color: COLORS.greenLight },
    { name: "Renegade", ml: "4/1", live: "5/1", pct: "+25%", note: "Mild drift from ML. Stabilized as co-favorite. Post 1 concerns persist.", color: COLORS.red },
    { name: "Litmus Test", ml: "50/1", live: "25/1", pct: "-50%", note: "Notable but form doesn't support. Likely public.", color: COLORS.textDim },
    { name: "Emerging Market", ml: "15/1", live: "9/1", pct: "-40%", note: "Prat money + 2 undercard wins. Hard filters fail.", color: COLORS.amber },
    { name: "Great White", ml: "50/1", live: "23/1", pct: "-54%", note: "Likely public money. Below Beyer threshold.", color: COLORS.textDim },
    { name: "Further Ado", ml: "6/1", live: "6/1", pct: "0%", note: "Smart money holding. Projected actual fav at ~4.8/1.", color: COLORS.greenLight },
  ];

  const filters = [
    { id: 1, label: "100+ Beyer (every winner since 2000)", check: (h) => (h.beyer === null ? "unknown" : h.beyer >= 100 ? "pass" : "fail") },
    { id: 2, label: "Post 1 curse (0-for-40 since 1986)", check: (h) => (h.postGroup === "p1" ? "fail" : "pass") },
    { id: 3, label: "Post 17 jinx (0-for-46 all time)", check: (h) => (h.postGroup === "p17" ? "fail" : "pass") },
    { id: 4, label: "≤2 career starts (0-for since 1883)", check: (h) => (h.starts <= 2 ? "fail" : "pass") },
    { id: 5, label: "Maiden (none since 1882)", check: (h) => (h.maiden ? "fail" : "pass") },
    { id: 6, label: "International (poor record)", check: (h) => (h.foreign ? "fail" : "pass") },
  ];

  const mc = [...modeled].sort((a, b) => b.simWin - a.simWin);

  return (
    <div style={{ padding: isMobile ? 12 : 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5, marginBottom: 10 }}>
          📈 TOTE MOVEMENT — ML vs LIVE
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {moves.map((m) => (
            <div
              key={m.name}
              style={{
                background: COLORS.panel2,
                borderLeft: `3px solid ${m.color}`,
                padding: 10,
                borderRadius: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text }}>{m.name}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.pct}</div>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>
                ML <strong style={{ color: COLORS.text }}>{m.ml}</strong> → Live{" "}
                <strong style={{ color: COLORS.gold }}>{m.live}</strong>
              </div>
              <div style={{ fontSize: 12, color: COLORS.text, marginTop: 6, lineHeight: 1.4 }}>{m.note}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5, marginBottom: 10 }}>
          🛂 HISTORICAL HARD FILTERS
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
            gap: 8,
          }}
        >
          {filters.map((f) => {
            const failures = modeled.filter((h) => f.check(h) === "fail");
            return (
              <div
                key={f.id}
                style={{
                  background: COLORS.panel2,
                  border: `1px solid ${COLORS.border}`,
                  padding: 10,
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                <div style={{ fontWeight: 700, color: COLORS.text, fontSize: 12, lineHeight: 1.3 }}>
                  {f.label}
                </div>
                <div style={{ marginTop: 6, color: COLORS.red, lineHeight: 1.4 }}>
                  {failures.length === 0 ? "—" : failures.map((h) => h.name).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5, marginBottom: 10 }}>
          💰 EXOTIC POOLS
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <StatBlock label="Exacta" value={RACE.exactaPool} />
          <StatBlock label="Trifecta Jackpot" value={RACE.trifectaJackpot} color={COLORS.gold} />
          <StatBlock label="Superfecta" value={RACE.superfectaPool} />
          <StatBlock label="Super Hi 5" value={RACE.superHi5Pool} />
        </div>
        <div
          style={{
            background: COLORS.panel2,
            borderLeft: `3px solid ${COLORS.gold}`,
            padding: 10,
            fontSize: 12,
            color: COLORS.text,
            lineHeight: 1.5,
          }}
        >
          Keying Further Ado on top in the trifecta with a $16.4M jackpot pool is the highest-EV play in this race.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5, marginBottom: 10 }}>
          🎲 MONTE CARLO — 10,000 SIMULATIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {mc.slice(0, 12).map((h) => (
            <div
              key={h.post}
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "auto 1fr auto auto" : "auto 1fr auto auto auto auto",
                gap: 8,
                alignItems: "center",
                padding: 8,
                background: COLORS.panel2,
                borderRadius: 4,
                borderLeft: `3px solid ${h.color}`,
                fontSize: 12,
              }}
            >
              <div style={{ color: COLORS.textDim, fontWeight: 600, minWidth: 24 }}>#{h.post}</div>
              <div
                style={{
                  fontWeight: 700,
                  color: COLORS.text,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {h.name}
              </div>
              <div style={{ color: COLORS.gold, fontWeight: 600, fontSize: 11 }}>{h.oddsDisplay}</div>
              <div style={{ color: COLORS.greenLight, fontWeight: 700, minWidth: 50, textAlign: "right" }}>
                {fmt(h.simWin)}%
              </div>
              {!isMobile && (
                <>
                  <div style={{ color: COLORS.textDim, fontSize: 11 }}>P {fmt(h.simPlace)}%</div>
                  <div style={{ color: COLORS.textDim, fontSize: 11 }}>S {fmt(h.simShow)}%</div>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function BetCard({ bet }) {
  const typeColors = {
    WIN: COLORS.gold,
    EXACTA: COLORS.greenLight,
    TRIFECTA: COLORS.amber,
    SUPERFECTA: COLORS.purple,
    RESERVE: COLORS.textDim,
  };
  const c = typeColors[bet.type] || COLORS.gold;

  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${c}`,
        borderRadius: 4,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Badge color={c}>{bet.type}</Badge>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.gold }}>${bet.amount}</div>
      </div>

      {bet.horses && bet.horses.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {bet.horses.map((h) => (
            <span
              key={h.post}
              style={{
                fontSize: 12,
                color: COLORS.text,
                background: COLORS.panel2,
                borderLeft: `2px solid ${h.color}`,
                padding: "3px 8px",
                borderRadius: 3,
              }}
            >
              #{h.post} {h.name} <span style={{ color: COLORS.gold, fontWeight: 600 }}>{h.oddsDisplay}</span>
            </span>
          ))}
        </div>
      )}

      {bet.combos !== undefined && (
        <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6 }}>
          {bet.combos} combos × ${bet.perCombo} = ${bet.amount}
        </div>
      )}

      <div style={{ fontSize: 12, color: COLORS.text, lineHeight: 1.5 }}>{bet.why}</div>
    </div>
  );
}

function TicketTab({ modeled, isMobile }) {
  const ticket = useMemo(() => generateTicket(modeled), [modeled]);
  const steamHorse = modeled.find((h) => h.mlDec / h.dec >= 2.0);

  return (
    <div style={{ padding: isMobile ? 12 : 24, display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ background: "linear-gradient(180deg, #1a1605 0%, #0d0f08 100%)", borderColor: COLORS.gold }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5 }}>
          $200 BANKROLL → $2,000 TARGET (10×)
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 6, lineHeight: 1.6 }}>
          Longshot-heavy structure. Win bets are split across 4 anchors ($5 each) and 6 longshots ($4 each at 14/1–25/1)
          for cheap lottery coverage. The 10× return path is the trifecta (anchor / anchor / longshot 3rd) or
          superfecta (anchor / anchor / mid / longshot 4th) — that's where Derby payouts live.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <Badge color={COLORS.gold}>4 anchors</Badge>
          <Badge color={COLORS.amber}>5 mid</Badge>
          <Badge color={COLORS.purple}>{ticket.longshots.length} longshots</Badge>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, letterSpacing: 0.5, marginBottom: 10 }}>
          🏗️ TICKET TIERS
        </div>
        {[
          { label: "ANCHORS — keyed 1st in exotics, $5 win each", horses: ticket.anchors, color: COLORS.gold },
          { label: "MID — fill the 3rd slot of superfectas", horses: ticket.mid, color: COLORS.amber },
          { label: "LONGSHOTS — $4 win lottery + 3rd/4th-slot exotic spread", horses: ticket.longshots, color: COLORS.purple },
        ].map((tier) => (
          <div key={tier.label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: COLORS.textDim, fontWeight: 600, marginBottom: 4, letterSpacing: 0.4 }}>
              {tier.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {tier.horses.map((h) => (
                <span
                  key={h.post}
                  style={{
                    fontSize: 11,
                    color: COLORS.text,
                    background: COLORS.panel2,
                    borderLeft: `2px solid ${tier.color}`,
                    padding: "3px 7px",
                    borderRadius: 3,
                  }}
                >
                  #{h.post} {h.name} <span style={{ color: COLORS.gold }}>{h.oddsDisplay}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </Card>

      {steamHorse && (
        <div
          style={{
            background: "linear-gradient(90deg, #2a1245 0%, #1a0a2a 100%)",
            border: `1px solid ${COLORS.purple}`,
            borderRadius: 6,
            padding: 12,
            color: COLORS.text,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          🔥 <strong style={{ color: COLORS.purple }}>Steam Alert: {steamHorse.name}</strong> moved from{" "}
          {(steamHorse.mlDec - 1).toFixed(0)}/1 to {(steamHorse.dec - 1).toFixed(0)}/1 —{" "}
          {(((steamHorse.mlDec - steamHorse.dec) / steamHorse.mlDec) * 100).toFixed(0)}% odds compression. Sharp money signal. Reflected in model via steamF factor.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ticket.bets.map((b, idx) => (
          <BetCard key={idx} bet={b} />
        ))}
      </div>

      <Card style={{ borderColor: COLORS.gold }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.gold,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>TOTAL BANKROLL</span>
          <span>${ticket.total}</span>
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.gold, marginBottom: 10 }}>
          💵 10× PAYOUT PATHS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          {ticket.candidates.map((h) => {
            const isAnchor = ticket.anchors.includes(h);
            const amt = isAnchor ? 5 : 4;
            const ret = amt * h.dec;
            return (
              <div
                key={h.post}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <span>
                  {isAnchor ? "🎯" : "🎟️"} {h.name} WIN @ {h.oddsDisplay}
                </span>
                <span style={{ color: COLORS.gold, fontWeight: 600 }}>
                  ${amt} → ${ret.toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, padding: 10, background: COLORS.panel2, borderLeft: `3px solid ${COLORS.amber}`, fontSize: 12, color: COLORS.text, lineHeight: 1.55 }}>
          <strong style={{ color: COLORS.gold }}>Trifecta hit</strong> (anchor/anchor/longshot 3rd):
          typical $2,000–$5,000 → <strong style={{ color: COLORS.greenLight }}>10–25×</strong> bankroll.<br />
          <strong style={{ color: COLORS.gold }}>Superfecta hit</strong> (anchor/anchor/mid/longshot 4th):
          typical $5,000–$50,000 → <strong style={{ color: COLORS.greenLight }}>25–250×</strong> bankroll. ← primary 10× driver.
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
          Pari-mutuel returns are estimates; final payouts depend on total pool size and number of winning tickets.
        </div>
      </Card>

      <Card>
        <div style={{ fontSize: 11, color: COLORS.textDim, lineHeight: 1.6 }}>
          <strong style={{ color: COLORS.gold }}>Data sources:</strong> FanDuel Racing tote at 5:58 PM ET May 2 2026.
          Beyer Speed Figures from Daily Racing Form. Post position history from Churchill Downs 40-year archive.
          Future live data: theracingapi.com North America add-on (£49.99/mo, entries + results every 5 min).
          Live odds proxy: theOddsAPI.com via Vercel serverless function.
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const w = useWindowWidth();
  const isMobile = w < 768;
  const [tab, setTab] = useState("model");
  const [editMode, setEditMode] = useState(false);
  const { overrides, setOdds, resetAll, updatedAt } = useCustomOdds();

  const modeled = useMemo(() => {
    const adjusted = applyOverrides(FIELD, overrides);
    const built = buildModel(adjusted);
    return monteCarlo(built, 10000);
  }, [overrides]);

  const handleEditToggle = (next) => {
    setEditMode(next);
    if (next) setTab("field");
  };

  return (
    <div
      style={{
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: 'Georgia, "Times New Roman", serif',
        minHeight: "100vh",
        paddingBottom: isMobile ? 72 : 0,
      }}
    >
      <Header
        isMobile={isMobile}
        editMode={editMode}
        setEditMode={handleEditToggle}
        updatedAt={updatedAt}
        resetAll={resetAll}
        overrideCount={Object.keys(overrides).length}
      />
      {!isMobile && <TabBar tab={tab} setTab={setTab} isMobile={isMobile} />}

      {tab === "model" && <ModelTab modeled={modeled} isMobile={isMobile} />}
      {tab === "field" && (
        <FieldTab modeled={modeled} isMobile={isMobile} editMode={editMode} setOdds={setOdds} />
      )}
      {tab === "signals" && <SignalsTab modeled={modeled} isMobile={isMobile} />}
      {tab === "ticket" && <TicketTab modeled={modeled} isMobile={isMobile} />}

      {isMobile && <TabBar tab={tab} setTab={setTab} isMobile={isMobile} />}

      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          color: COLORS.textDim,
          padding: 16,
          letterSpacing: 1,
        }}
      >
        152ND RUN FOR THE ROSES · CHURCHILL DOWNS · MAY 2 2026
      </div>
    </div>
  );
}
