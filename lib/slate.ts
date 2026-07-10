export const DEFAULT_STAKE = 50;

export type GameState = "pre" | "in" | "post";

export interface LiveSide {
  side: string;
  countryCode: string;
  odds: string;
  impliedProbability: number;
  stake: number;
  toWin: number;
  homeAway: "home" | "away";
  score?: string;
  winner?: boolean;
}

export interface LiveGame {
  id: string;
  matchup: string;
  shortName: string;
  startTime: string;
  round: string;
  status: string;
  state: GameState;
  venue: string;
  location: string;
  broadcasts: string[];
  home: LiveSide;
  away: LiveSide;
  drawOdds?: string;
  source: string;
}

export interface SlateResponse {
  games: LiveGame[];
  activeGameId: string;
  eligibleCountryCodes: string[];
  source: string;
  sourceStatus: "live" | "fallback";
  syncedAt: string;
  timezone: string;
  message?: string;
}

export function normalizeAmericanOdds(value: string | number | undefined): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed === 0) return "+100";
  const rounded = Math.round(parsed);
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function impliedProbability(odds: string | number): number {
  const value = typeof odds === "number" ? odds : Number(String(odds).replace("+", ""));
  if (!Number.isFinite(value) || value === 0) return 50;
  const probability = value > 0 ? 100 / (value + 100) : Math.abs(value) / (Math.abs(value) + 100);
  return Math.round(probability * 1000) / 10;
}

export function calculateToWin(odds: string | number, stake = DEFAULT_STAKE): number {
  const value = typeof odds === "number" ? odds : Number(String(odds).replace("+", ""));
  if (!Number.isFinite(value) || value === 0) return stake;
  const profit = value > 0 ? (stake * value) / 100 : (stake * 100) / Math.abs(value);
  return Math.round(profit * 100) / 100;
}

export function makeSide(
  side: string,
  countryCode: string,
  odds: string | number,
  homeAway: "home" | "away",
  score?: string,
  winner?: boolean
): LiveSide {
  const normalizedOdds = normalizeAmericanOdds(odds);
  return {
    side,
    countryCode,
    odds: normalizedOdds,
    impliedProbability: impliedProbability(normalizedOdds),
    stake: DEFAULT_STAKE,
    toWin: calculateToWin(normalizedOdds),
    homeAway,
    score,
    winner,
  };
}

// Verified quarterfinalists for the local fallback on July 9, 2026.
export const FALLBACK_ELIGIBLE_COUNTRY_CODES = [
  "FRA",
  "MAR",
  "ESP",
  "BEL",
  "NOR",
  "ENG",
  "ARG",
  "SUI",
];

export const CFB_TEAM_CODES = [
  "USC",
  "SJSU",
  "ALA",
  "ECAR",
  "UGA",
  "TSU",
  "UF",
  "FAU",
  "LSU",
  "CLEM",
];

type ScheduledGame = Omit<LiveGame, "status" | "state">;

export function deriveScheduledState(
  startTime: string,
  now = new Date(),
  estimatedDurationMinutes = 210
): Pick<LiveGame, "status" | "state"> {
  const start = new Date(startTime).getTime();
  if (!Number.isFinite(start)) return { status: "Scheduled", state: "pre" };

  const current = now.getTime();
  if (current < start) return { status: "Scheduled", state: "pre" };

  const estimatedEnd = start + estimatedDurationMinutes * 60_000;
  if (current < estimatedEnd) return { status: "In progress", state: "in" };

  return { status: "Completed", state: "post" };
}

function materializeSchedule(
  scheduledGames: ScheduledGame[],
  now: Date,
  estimatedDurationMinutes: number
): LiveGame[] {
  return scheduledGames.map((game) => ({
    ...game,
    ...deriveScheduledState(game.startTime, now, estimatedDurationMinutes),
  }));
}

function activeGameId(games: LiveGame[]): string {
  const activeGame =
    games.find((game) => game.state === "in") ??
    games.find((game) => game.state === "pre") ??
    games.at(-1);

  if (!activeGame) throw new Error("Cannot select an active game from an empty slate.");
  return activeGame.id;
}

export function cfbOpenersSlate(now = new Date()): SlateResponse {
  const scheduledGames: ScheduledGame[] = [
    {
      id: "usc-san-jose-state-2026-08-29",
      matchup: "USC vs San José State",
      shortName: "USC vs SJSU",
      startTime: "2026-08-29T19:00:00.000Z",
      round: "Season Opener",
      venue: "United Airlines Field at Los Angeles Memorial Coliseum",
      location: "Los Angeles, California",
      broadcasts: ["NBC"],
      home: makeSide("USC", "USC", -450, "home"),
      away: makeSide("San José State", "SJSU", 325, "away"),
      source: "USC Athletics schedule / demo line",
    },
    {
      id: "alabama-east-carolina-2026-09-05",
      matchup: "Alabama vs East Carolina",
      shortName: "ALA vs ECAR",
      startTime: "2026-09-05T16:00:00.000Z",
      round: "Season Opener",
      venue: "Saban Field at Bryant-Denny Stadium",
      location: "Tuscaloosa, Alabama",
      broadcasts: ["ABC"],
      home: makeSide("Alabama", "ALA", -550, "home"),
      away: makeSide("East Carolina", "ECAR", 375, "away"),
      source: "Alabama Athletics schedule / demo line",
    },
    {
      id: "georgia-tennessee-state-2026-09-05",
      matchup: "Georgia vs Tennessee State",
      shortName: "UGA vs TSU",
      startTime: "2026-09-05T19:00:00.000Z",
      round: "Season Opener",
      venue: "Dooley Field at Sanford Stadium",
      location: "Athens, Georgia",
      broadcasts: ["SECN+"],
      home: makeSide("Georgia", "UGA", -900, "home"),
      away: makeSide("Tennessee State", "TSU", 550, "away"),
      source: "Georgia Athletics schedule / demo line",
    },
    {
      id: "florida-florida-atlantic-2026-09-05",
      matchup: "Florida vs Florida Atlantic",
      shortName: "UF vs FAU",
      startTime: "2026-09-05T23:45:00.000Z",
      round: "Season Opener",
      venue: "Steve Spurrier-Florida Field at Ben Hill Griffin Stadium",
      location: "Gainesville, Florida",
      broadcasts: ["SEC Network"],
      home: makeSide("Florida", "UF", -320, "home"),
      away: makeSide("Florida Atlantic", "FAU", 240, "away"),
      source: "Florida Athletics schedule / demo line",
    },
    {
      id: "lsu-clemson-2026-09-05",
      matchup: "LSU vs Clemson",
      shortName: "LSU vs CLEM",
      startTime: "2026-09-05T23:30:00.000Z",
      round: "Season Opener",
      venue: "Tiger Stadium",
      location: "Baton Rouge, Louisiana",
      broadcasts: ["ABC"],
      home: makeSide("LSU", "LSU", -130, "home"),
      away: makeSide("Clemson", "CLEM", 110, "away"),
      source: "LSU Athletics schedule / demo line",
    },
  ];
  const games = materializeSchedule(scheduledGames, now, 270);

  return {
    games,
    activeGameId: activeGameId(games),
    eligibleCountryCodes: CFB_TEAM_CODES,
    source: "Official 2026 team schedules / demo lines",
    sourceStatus: "fallback",
    syncedAt: now.toISOString(),
    timezone: "America/New_York",
    message: "Opening matchups and kickoff times are schedule-verified. Lines are for booth testing only.",
  };
}

export function fallbackSlate(now = new Date()): SlateResponse {
  const scheduledGames: ScheduledGame[] = [
    {
      id: "france-morocco-2026-07-09",
      matchup: "France vs Morocco",
      shortName: "FRA vs MAR",
      startTime: "2026-07-09T20:00:00.000Z",
      round: "Quarterfinals",
      venue: "Boston Stadium",
      location: "Foxborough, Massachusetts",
      broadcasts: ["FOX", "FOX One"],
      home: makeSide("France", "FRA", -170, "home"),
      away: makeSide("Morocco", "MAR", 500, "away"),
      drawOdds: "+280",
      source: "FIFA schedule / demo line",
    },
    {
      id: "spain-belgium-2026-07-10",
      matchup: "Spain vs Belgium",
      shortName: "ESP vs BEL",
      startTime: "2026-07-10T22:00:00.000Z",
      round: "Quarterfinals",
      venue: "Los Angeles Stadium",
      location: "Inglewood, California",
      broadcasts: ["FOX", "FOX One"],
      home: makeSide("Spain", "ESP", -155, "home"),
      away: makeSide("Belgium", "BEL", 425, "away"),
      drawOdds: "+300",
      source: "FIFA schedule / demo line",
    },
    {
      id: "norway-england-2026-07-11",
      matchup: "Norway vs England",
      shortName: "NOR vs ENG",
      startTime: "2026-07-11T21:00:00.000Z",
      round: "Quarterfinals",
      venue: "Miami Stadium",
      location: "Miami Gardens, Florida",
      broadcasts: ["FOX", "FOX One"],
      home: makeSide("Norway", "NOR", 145, "home"),
      away: makeSide("England", "ENG", 175, "away"),
      drawOdds: "+225",
      source: "FIFA schedule / demo line",
    },
    {
      id: "argentina-switzerland-2026-07-11",
      matchup: "Argentina vs Switzerland",
      shortName: "ARG vs SUI",
      startTime: "2026-07-12T02:00:00.000Z",
      round: "Quarterfinals",
      venue: "Kansas City Stadium",
      location: "Kansas City, Missouri",
      broadcasts: ["FOX", "FOX One"],
      home: makeSide("Argentina", "ARG", -190, "home"),
      away: makeSide("Switzerland", "SUI", 525, "away"),
      drawOdds: "+310",
      source: "FIFA schedule / demo line",
    },
  ];
  const games = materializeSchedule(scheduledGames, now, 210);

  return {
    games,
    activeGameId: activeGameId(games),
    eligibleCountryCodes: FALLBACK_ELIGIBLE_COUNTRY_CODES,
    source: "FIFA quarterfinal schedule / demo lines",
    sourceStatus: "fallback",
    syncedAt: now.toISOString(),
    timezone: "America/New_York",
    message: "Quarterfinal dates and venues are schedule-verified. Lines are for booth testing only.",
  };
}
