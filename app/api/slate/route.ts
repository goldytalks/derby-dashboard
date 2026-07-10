import { NextResponse } from "next/server";
import {
  cfbOpenersSlate,
  fallbackSlate,
  makeSide,
  normalizeAmericanOdds,
  type GameState,
  type LiveGame,
  type SlateResponse,
} from "@/lib/slate";
import { getCountry } from "@/lib/prompts";

export const runtime = "nodejs";

const SCOREBOARD_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const TIMEZONE = "America/New_York";

interface ScoreboardTeam {
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
}

interface ScoreboardCompetitor {
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean;
  team?: ScoreboardTeam;
}

interface ScoreboardOddsValue {
  odds?: string | number;
}

interface ScoreboardMoneylineSide {
  open?: ScoreboardOddsValue;
  close?: ScoreboardOddsValue;
}

interface ScoreboardOffer {
  provider?: { displayName?: string; name?: string };
  moneyline?: {
    home?: ScoreboardMoneylineSide;
    away?: ScoreboardMoneylineSide;
    draw?: ScoreboardMoneylineSide;
  };
  drawOdds?: { moneyLine?: string | number };
}

interface ScoreboardCompetition {
  competitors?: ScoreboardCompetitor[];
  odds?: ScoreboardOffer[];
  venue?: {
    fullName?: string;
    address?: { city?: string; state?: string; country?: string };
  };
  broadcasts?: Array<{ names?: string[] }>;
}

interface ScoreboardEvent {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  season?: { slug?: string };
  status?: {
    type?: {
      state?: GameState;
      description?: string;
      shortDetail?: string;
    };
  };
  competitions?: ScoreboardCompetition[];
}

interface ScoreboardPayload {
  events?: ScoreboardEvent[];
}

function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}${month}${day}`;
}

function titleCaseSlug(value?: string): string {
  if (!value) return "World Cup";
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function offerOdds(side?: ScoreboardMoneylineSide): string | number | undefined {
  return side?.close?.odds ?? side?.open?.odds;
}

function parseGame(event: ScoreboardEvent): LiveGame | null {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors || [];
  const home = competitors.find((entry) => entry.homeAway === "home");
  const away = competitors.find((entry) => entry.homeAway === "away");
  const homeName = home?.team?.displayName || home?.team?.shortDisplayName;
  const awayName = away?.team?.displayName || away?.team?.shortDisplayName;
  const homeCode = home?.team?.abbreviation;
  const awayCode = away?.team?.abbreviation;
  if (!event.id || !event.date || !homeName || !awayName || !homeCode || !awayCode) {
    return null;
  }

  const offer = competition?.odds?.[0];
  const homeOdds = offerOdds(offer?.moneyline?.home) ?? -110;
  const awayOdds = offerOdds(offer?.moneyline?.away) ?? -110;
  const drawOdds = offerOdds(offer?.moneyline?.draw) ?? offer?.drawOdds?.moneyLine;
  const state = event.status?.type?.state || "pre";
  const address = competition?.venue?.address;
  const location = [address?.city, address?.state, address?.country]
    .filter(Boolean)
    .join(", ");
  const provider = offer?.provider?.displayName || offer?.provider?.name;

  return {
    id: event.id,
    matchup: `${homeName} vs ${awayName}`,
    shortName: event.shortName || `${homeCode} vs ${awayCode}`,
    startTime: event.date,
    round: titleCaseSlug(event.season?.slug),
    status:
      event.status?.type?.shortDetail ||
      event.status?.type?.description ||
      "Scheduled",
    state,
    venue: competition?.venue?.fullName || "Tournament venue",
    location,
    broadcasts: (competition?.broadcasts || []).flatMap((entry) => entry.names || []),
    home: makeSide(homeName, homeCode, homeOdds, "home", home?.score, home?.winner),
    away: makeSide(awayName, awayCode, awayOdds, "away", away?.score, away?.winner),
    drawOdds: drawOdds === undefined ? undefined : normalizeAmericanOdds(drawOdds),
    source: provider ? `ESPN scoreboard / ${provider}` : "ESPN scoreboard",
  };
}

async function fetchScoreboard(dates: string): Promise<ScoreboardPayload> {
  const configured = process.env.WORLD_CUP_SCOREBOARD_URL;
  const url = configured || `${SCOREBOARD_BASE}?dates=${dates}&limit=100`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`scoreboard_${response.status}`);
  return (await response.json()) as ScoreboardPayload;
}

function pickActiveGame(games: LiveGame[], now: Date): LiveGame {
  const live = games.find((game) => game.state === "in");
  if (live) return live;
  const upcoming = games
    .filter((game) => game.state === "pre")
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  if (upcoming.length) return upcoming[0];
  return [...games].sort(
    (a, b) => Math.abs(Date.parse(a.startTime) - now.getTime()) - Math.abs(Date.parse(b.startTime) - now.getTime())
  )[0];
}

function hasKnownTeams(game: LiveGame): boolean {
  return Boolean(getCountry(game.home.countryCode) && getCountry(game.away.countryCode));
}

function eligibleCountryCodes(games: LiveGame[]): string[] {
  const codes = games.flatMap((game) => {
    const sides = [game.home, game.away];
    if (game.state !== "post") return sides.map((side) => side.countryCode);
    return sides.filter((side) => side.winner).map((side) => side.countryCode);
  });

  return Array.from(new Set(codes.filter((code) => Boolean(getCountry(code)))));
}

export async function GET(request: Request) {
  const now = new Date();
  if (new URL(request.url).searchParams.get("mode") === "cfb") {
    return NextResponse.json(cfbOpenersSlate(now), {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  }
  try {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const payload = await fetchScoreboard(`${dateKey(start)}-${dateKey(end)}`);
    const games = (payload.events || [])
      .map(parseGame)
      .filter((game): game is LiveGame => Boolean(game));

    if (!games.length) throw new Error("scoreboard_empty");
    const playableGames = games.filter(hasKnownTeams);
    const active = pickActiveGame(playableGames.length ? playableGames : games, now);
    const activeRoundGames = playableGames.filter((game) => game.round === active.round);
    const roundGames = activeRoundGames.length ? activeRoundGames : [active];
    const eligibleCodes = eligibleCountryCodes(roundGames);
    if (!eligibleCodes.length) throw new Error("eligible_teams_empty");
    const response: SlateResponse = {
      games: roundGames,
      activeGameId: active.id,
      eligibleCountryCodes: eligibleCodes,
      source: active.source,
      sourceStatus: "live",
      syncedAt: now.toISOString(),
      timezone: TIMEZONE,
    };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return NextResponse.json(fallbackSlate(now), {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    });
  }
}
