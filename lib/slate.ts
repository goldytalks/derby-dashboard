// Today's slate for the demo: hardcoded games and odds, $100 stake.
// TODO phase two: pull the live slate and odds from the Novig API.

export interface SlateSide {
  side: string;
  countryCode: string;
  odds: string;
}

export interface SlateGame {
  id: string;
  matchup: string;
  live?: boolean;
  sides: [SlateSide, SlateSide];
}

export const DEMO_STAKE = "100";

export const TODAYS_SLATE: SlateGame[] = [
  {
    id: "aus-egy",
    matchup: "Australia vs Egypt",
    live: true,
    sides: [
      { side: "Australia", countryCode: "AUS", odds: "+120" },
      { side: "Egypt", countryCode: "EGY", odds: "-140" },
    ],
  },
  {
    id: "col-gha",
    matchup: "Colombia vs Ghana",
    sides: [
      { side: "Colombia", countryCode: "COL", odds: "-145" },
      { side: "Ghana", countryCode: "GHA", odds: "+160" },
    ],
  },
  {
    id: "arg-cpv",
    matchup: "Argentina vs Cape Verde",
    sides: [
      { side: "Argentina", countryCode: "ARG", odds: "-450" },
      { side: "Cape Verde", countryCode: "CPV", odds: "+650" },
    ],
  },
];
