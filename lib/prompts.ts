export interface CountryTheme {
  code: string;
  name: string;
  flag: string;
  bg: string;
  ink: string;
  seed: string;
  costume: string;
}

export const COUNTRIES: CountryTheme[] = [
  {
    code: "USA",
    name: "USA",
    flag: "\u{1F1FA}\u{1F1F8}",
    bg: "#1CA3F5",
    ink: "#FFFFFF",
    seed: "EAGLE-77",
    costume:
      "a denim cutoff jacket covered in eagle patches, a stars and stripes bandana, gold aviators, holding lit sparklers",
  },
  {
    code: "MEX",
    name: "Mexico",
    flag: "\u{1F1F2}\u{1F1FD}",
    bg: "#0B7A3B",
    ink: "#FFFFFF",
    seed: "LUCHA-13",
    costume:
      "a green kit with a matching green bucket hat and a luchador mask pushed up on the forehead",
  },
  {
    code: "ARG",
    name: "Argentina",
    flag: "\u{1F1E6}\u{1F1F7}",
    bg: "#7CC0F0",
    ink: "#0B2545",
    seed: "MATE-10",
    costume:
      "a sky blue and white striped kit, raising a mate gourd like a trophy, ticker tape falling around them",
  },
  {
    code: "BRA",
    name: "Brazil",
    flag: "\u{1F1E7}\u{1F1F7}",
    bg: "#F3C500",
    ink: "#0B3D1E",
    seed: "SAMBA-09",
    costume:
      "a canary yellow kit with a carnival feather collar, holding a samba drum",
  },
  {
    code: "ENG",
    name: "England",
    flag: "\u{1F1EC}\u{1F1E7}",
    bg: "#C8102E",
    ink: "#FFFFFF",
    seed: "KNIGHT-66",
    costume:
      "a white kit with a knight helmet tucked under one arm, holding a cup of tea",
  },
  {
    code: "FRA",
    name: "France",
    flag: "\u{1F1EB}\u{1F1F7}",
    bg: "#002F87",
    ink: "#FFFFFF",
    seed: "BAGT-98",
    costume:
      "a navy kit with a beret, holding a baguette like a royal scepter",
  },
  {
    code: "JPN",
    name: "Japan",
    flag: "\u{1F1EF}\u{1F1F5}",
    bg: "#10265F",
    ink: "#FFFFFF",
    seed: "RONIN-11",
    costume:
      "a deep blue kit with samurai shoulder armor, a dramatic rising sun light flare behind them",
  },
  {
    code: "EGY",
    name: "Egypt",
    flag: "\u{1F1EA}\u{1F1EC}",
    bg: "#B01827",
    ink: "#FFFFFF",
    seed: "PHARAOH-01",
    costume:
      "a red kit with a gold pharaoh headdress, hieroglyph shaped confetti falling around them",
  },
  {
    code: "AUS",
    name: "Australia",
    flag: "\u{1F1E6}\u{1F1FA}",
    bg: "#FFB301",
    ink: "#123B26",
    seed: "ROO-05",
    costume:
      "a gold kit, playfully peeking out of a giant kangaroo pouch",
  },
  {
    code: "CAN",
    name: "Canada",
    flag: "\u{1F1E8}\u{1F1E6}",
    bg: "#D80621",
    ink: "#FFFFFF",
    seed: "MAPLE-19",
    costume:
      "a red kit with a mountie hat, raising a bottle of maple syrup in celebration",
  },
  {
    code: "COL",
    name: "Colombia",
    flag: "\u{1F1E8}\u{1F1F4}",
    bg: "#FCD116",
    ink: "#12307B",
    seed: "CAFETERO-10",
    costume:
      "a canary yellow kit with a woven sombrero vueltiao, a red and blue carnival feather boa, raising a cup of Colombian coffee like a trophy",
  },
  {
    code: "GHA",
    name: "Ghana",
    flag: "\u{1F1EC}\u{1F1ED}",
    bg: "#E8B217",
    ink: "#151512",
    seed: "KENTE-08",
    costume:
      "a white kit with a bright kente cloth sash across the chest, a gold Ashanti crown, shaking a beaded calabash rattle, black star confetti",
  },
  {
    code: "CPV",
    name: "Cape Verde",
    flag: "\u{1F1E8}\u{1F1FB}",
    bg: "#0057C8",
    ink: "#FFFFFF",
    seed: "SHARK-24",
    costume:
      "a deep blue kit with a playful shark fin hood, holding up a fresh coconut, golden island beach light and ocean spray",
  },
];

// COOKED status repaints any theme with these colors.
export const COOKED_THEME = { bg: "#1A1A1F", ink: "#FF5060" };

export function getCountry(code: string): CountryTheme | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function buildPrompt(country: CountryTheme): string {
  return (
    "Edit this photo. Keep this exact person's face, expression, and skin tone unchanged. " +
    `Dress them in ${country.costume}. ` +
    "The kit is a generic unbranded sports jersey in national colors with no logos, no crests, no sponsor marks, no text. " +
    "Stadium tunnel background, falling confetti, dramatic sports poster lighting, 35mm photo, hyper real. " +
    "Do not add any text or watermarks. Do not depict any real athlete."
  );
}
