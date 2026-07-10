export interface CountryTheme {
  code: string;
  name: string;
  flag: string;
  bg: string;
  ink: string;
  accent: string;
  seed: string;
  costume: string;
}

// Supported national teams and college-football test themes.
export const COUNTRIES: CountryTheme[] = [
  {
    code: "USC", name: "USC", flag: "⚔️", bg: "#990000", ink: "#FFCC00", accent: "#FFCC00", seed: "TROJAN-26",
    costume: "an unmistakable classical Trojan football champion look in deep cardinal and antique gold: a sculpted bronze cuirass, layered leather shoulder guards, a flowing cardinal cape, and a crestless bronze Trojan helmet tucked under one arm so the real face remains fully visible; cinematic Coliseum tunnel light, no weapons, logos, or readable text",
  },
  {
    code: "ALA", name: "Alabama", flag: "🌊", bg: "#9E1B32", ink: "#FFFFFF", accent: "#FFFFFF", seed: "TIDE-26",
    costume: "a premium human rolling-crimson-tide mascot look: the person emerging from a sculptural curling wave costume made of glossy crimson fabric and translucent white foam, face fully visible and arms free, with restrained stadium lighting; whimsical, editorial, and unmistakably tide-inspired, with no logos or readable text",
  },
  {
    code: "UGA", name: "Georgia", flag: "🐶", bg: "#BA0C2F", ink: "#FFFFFF", accent: "#000000", seed: "BULLDOG-26",
    costume: "a premium human bulldog mascot look in red, black, and white: an oversized sculptural bulldog body suit with the person's real face visible through a generous opening, broad padded shoulders, floppy ears above the head opening, and arms free; powerful rather than cartoonish, with no logos or readable text",
  },
  {
    code: "UF", name: "Florida", flag: "🐊", bg: "#0021A5", ink: "#FFFFFF", accent: "#FA4616", seed: "GATOR-26",
    costume: "a premium human alligator mascot look in deep blue and vivid orange: a textured sculptural gator body suit with the person's real face visible inside an open friendly gator-mouth frame, arms free, athletic stadium pose, and refined natural scale texture; playful rather than frightening, with no logos or readable text",
  },
  {
    code: "LSU", name: "LSU", flag: "🐯", bg: "#461D7C", ink: "#FFFFFF", accent: "#FDD023", seed: "TIGER-26",
    costume: "a premium human tiger mascot look in purple and gold: a sculptural tiger body suit with realistic striped faux-fur texture, the person's real face fully visible through a broad mane opening, arms free, and dramatic Saturday-night stadium light; fierce but celebratory, with no logos or readable text",
  },
  {
    code: "ALG", name: "Algeria", flag: "🇩🇿", bg: "#0B6B3A", ink: "#FFFFFF", accent: "#E63546", seed: "DESERT-FOX",
    costume: "an elegant white and green football jacket with geometric embroidery, a red crescent scarf, and silver desert-light accents",
  },
  {
    code: "ARG", name: "Argentina", flag: "🇦🇷", bg: "#75BDEB", ink: "#092640", accent: "#FFFFFF", seed: "MATE-10",
    costume: "an unmistakably Argentine champion look: a tailored sky-blue and white striped unbranded football jacket, a mate gourd in one hand and silver thermos raised like a trophy in the other, with pale ticker tape and a dramatic number 10-shaped tunnel light; celebratory Argentine football energy without depicting a real athlete",
  },
  {
    code: "AUS", name: "Australia", flag: "🇦🇺", bg: "#F5B335", ink: "#123B26", accent: "#FFFFFF", seed: "GOLDEN-HOUR",
    costume: "a sharp gold and deep green football jacket with a playful oversized pouch detail and sunlit stadium styling",
  },
  {
    code: "AUT", name: "Austria", flag: "🇦🇹", bg: "#D51E32", ink: "#FFFFFF", accent: "#F4E7D0", seed: "ALPINE-08",
    costume: "a tailored red and white football jacket with subtle alpine braid, a modern felt hat, and clean editorial styling",
  },
  {
    code: "BEL", name: "Belgium", flag: "🇧🇪", bg: "#161616", ink: "#FFD84D", accent: "#E3333E", seed: "WAFFLE-11",
    costume: "an unmistakable human Belgian waffle mascot look: a sculptural oversized golden square-waffle costume worn as the body with the person's real face clearly visible through a generous central opening, arms and hands free, dark-chocolate piping and curls, and tasteful black, red, and gold champion details; premium editorial styling, whimsical rather than cartoonish, with no brand marks or readable text",
  },
  {
    code: "BIH", name: "Bosnia and Herzegovina", flag: "🇧🇦", bg: "#174A99", ink: "#FFFFFF", accent: "#F3D34A", seed: "LILY-11",
    costume: "a cobalt and gold football jacket with a clean diagonal star pattern and a blue lily pin with no crest or text",
  },
  {
    code: "BRA", name: "Brazil", flag: "🇧🇷", bg: "#F1C928", ink: "#0B3D2E", accent: "#2E74C9", seed: "SAMBA-09",
    costume: "a canary yellow and green unbranded football jacket with a refined carnival feather collar and a small hand drum",
  },
  {
    code: "CAN", name: "Canada", flag: "🇨🇦", bg: "#D72535", ink: "#FFFFFF", accent: "#F1E8DA", seed: "MAPLE-19",
    costume: "a crisp red football jacket with a graphic maple-leaf shaped quilted collar and a playful maple syrup bottle raised in celebration",
  },
  {
    code: "CPV", name: "Cabo Verde", flag: "🇨🇻", bg: "#0758C7", ink: "#FFFFFF", accent: "#F5C942", seed: "ISLAND-24",
    costume: "a deep blue football jacket with a playful shark-fin hood detail, a fresh coconut, and warm island light",
  },
  {
    code: "COL", name: "Colombia", flag: "🇨🇴", bg: "#F3D339", ink: "#153579", accent: "#D62C43", seed: "CAFETERO-10",
    costume: "a yellow, blue, and red football jacket with a woven sombrero vueltiao, a restrained feather boa, and Colombian coffee raised like a trophy",
  },
  {
    code: "COD", name: "Congo DR", flag: "🇨🇩", bg: "#1B78C8", ink: "#FFFFFF", accent: "#F1D54B", seed: "LEOPARD-07",
    costume: "a sky blue football jacket with a red diagonal sash, gold trim, and a tasteful leopard-pattern collar with no animal fur",
  },
  {
    code: "CIV", name: "Côte d’Ivoire", flag: "🇨🇮", bg: "#F17A2C", ink: "#FFFFFF", accent: "#1A7A4C", seed: "ELEPHANT-12",
    costume: "an orange, white, and green football jacket with a sculptural elephant-ear shoulder silhouette and polished editorial styling",
  },
  {
    code: "CRO", name: "Croatia", flag: "🇭🇷", bg: "#E63A48", ink: "#FFFFFF", accent: "#174A99", seed: "CHECKER-98",
    costume: "a red and white checker-inspired football jacket with navy tailoring and a dramatic checkered scarf",
  },
  {
    code: "CUW", name: "Curaçao", flag: "🇨🇼", bg: "#155BC1", ink: "#FFFFFF", accent: "#F3D547", seed: "BLUE-WAVE",
    costume: "a saturated blue football jacket with two gold star pins, sea-glass details, and bright Caribbean daylight",
  },
  {
    code: "CZE", name: "Czechia", flag: "🇨🇿", bg: "#C92D3A", ink: "#FFFFFF", accent: "#2455A5", seed: "BOHEMIA-06",
    costume: "a red, white, and blue football jacket with crisp modern tailoring and subtle Bohemian crystal-like shoulder details",
  },
  {
    code: "ECU", name: "Ecuador", flag: "🇪🇨", bg: "#F4D13B", ink: "#173A72", accent: "#D7303F", seed: "CONDOR-13",
    costume: "a yellow football jacket with navy and red panels, a dramatic condor-wing cape silhouette, and high-altitude stadium light",
  },
  {
    code: "EGY", name: "Egypt", flag: "🇪🇬", bg: "#B51E31", ink: "#FFFFFF", accent: "#E6B954", seed: "PHARAOH-01",
    costume: "a red and gold football jacket with a theatrical pharaoh-inspired collar and geometric gold headpiece with no symbols or text",
  },
  {
    code: "ENG", name: "England", flag: "🏴", bg: "#E8EDF2", ink: "#16213A", accent: "#C92D3A", seed: "KNIGHT-66",
    costume: "an unmistakable English knight champion look: a tailored white football jacket and short cape with bold red-cross color blocking, a polished theatrical knight helmet tucked under one arm, and a porcelain cup of tea raised in celebration; no weapons or royal insignia",
  },
  {
    code: "FRA", name: "France", flag: "🇫🇷", bg: "#172D67", ink: "#FFFFFF", accent: "#E5364B", seed: "LE-PRESIDENT",
    costume: "an unmistakable French football-emperor portrait: an oversized midnight-blue ceremonial jacket with extravagant gold epaulettes, a vivid tricolor sash, rows of obviously theatrical medals, and a tiny comic crown; playful superstar-football meme energy without depicting a real athlete, real-world military insignia, or authoritarian symbols",
  },
  {
    code: "GER", name: "Germany", flag: "🇩🇪", bg: "#E9E8E2", ink: "#161616", accent: "#D9A928", seed: "ENGINE-54",
    costume: "a precise black, red, and gold football jacket with engineered panel lines and a sleek silver stopwatch prop",
  },
  {
    code: "GHA", name: "Ghana", flag: "🇬🇭", bg: "#E1B52D", ink: "#151512", accent: "#B32235", seed: "KENTE-08",
    costume: "a white football jacket with a vivid kente sash, a sculptural gold crown, a beaded calabash rattle, and black star confetti",
  },
  {
    code: "HAI", name: "Haiti", flag: "🇭🇹", bg: "#1D4EA2", ink: "#FFFFFF", accent: "#D42F43", seed: "KOMPA-04",
    costume: "a royal blue and red football jacket with hand-painted carnival ribbon details and a small polished drum",
  },
  {
    code: "IRN", name: "IR Iran", flag: "🇮🇷", bg: "#17724A", ink: "#FFFFFF", accent: "#D33A45", seed: "PERSIA-14",
    costume: "a white, green, and red football jacket with refined Persian geometric embroidery and a silver ceremonial cup",
  },
  {
    code: "IRQ", name: "Iraq", flag: "🇮🇶", bg: "#1D6B43", ink: "#FFFFFF", accent: "#D33542", seed: "LION-27",
    costume: "a green and white football jacket with red accents, Mesopotamian-inspired geometric trim, and a sculptural golden lion pin",
  },
  {
    code: "JPN", name: "Japan", flag: "🇯🇵", bg: "#142C67", ink: "#FFFFFF", accent: "#E33549", seed: "RONIN-11",
    costume: "a deep blue football jacket with modern samurai-inspired shoulder armor and a circular red light flare behind them",
  },
  {
    code: "JOR", name: "Jordan", flag: "🇯🇴", bg: "#B42332", ink: "#FFFFFF", accent: "#1D6C47", seed: "PETRA-23",
    costume: "a red, white, and green football jacket with sandstone-textured trim and a black-and-white keffiyeh styled as a clean scarf",
  },
  {
    code: "KOR", name: "Korea Republic", flag: "🇰🇷", bg: "#E9EDF4", ink: "#142F67", accent: "#D73545", seed: "TIGER-02",
    costume: "a red and navy football jacket with a graphic white tiger shoulder motif and a modern black gat-inspired hat",
  },
  {
    code: "MAR", name: "Morocco", flag: "🇲🇦", bg: "#B51F35", ink: "#FFFFFF", accent: "#1D7B4D", seed: "ATLAS-22",
    costume: "an unmistakably Moroccan champion look: a deep-crimson and emerald football djellaba-inspired outfit with ornate Atlas embroidery, a respectfully draped desert headscarf and hood, a small leather satchel, patterned tile accents, and warm Moroccan lantern light",
  },
  {
    code: "MEX", name: "Mexico", flag: "🇲🇽", bg: "#0D7543", ink: "#FFFFFF", accent: "#D53742", seed: "LUCHA-13",
    costume: "a green football jacket with a matching bucket hat and a jewel-toned luchador mask pushed up on the forehead",
  },
  {
    code: "NED", name: "Netherlands", flag: "🇳🇱", bg: "#F07828", ink: "#132750", accent: "#FFFFFF", seed: "ORANGE-74",
    costume: "a bold orange football jacket with navy tailoring, a modern tulip-shaped collar, and clean studio lighting",
  },
  {
    code: "NZL", name: "New Zealand", flag: "🇳🇿", bg: "#181A1D", ink: "#FFFFFF", accent: "#BFC8D4", seed: "FERN-05",
    costume: "a black football jacket with silver fern-like stitching, a sculptural koru shoulder pin, and misty stadium light",
  },
  {
    code: "NOR", name: "Norway", flag: "🇳🇴", bg: "#C42A3B", ink: "#FFFFFF", accent: "#183B73", seed: "FJORD-09",
    costume: "an unmistakable Norwegian Viking football champion look: a hornless brushed-metal Viking helmet, a rich red and navy tunic-jacket, a dramatic faux-fur-trimmed cape, and a carved round shield held like a trophy against a misty fjord-stadium backdrop; theatrical and celebratory, with no weapons",
  },
  {
    code: "PAN", name: "Panama", flag: "🇵🇦", bg: "#D73343", ink: "#FFFFFF", accent: "#204D9A", seed: "CANAL-16",
    costume: "a red, white, and blue football jacket with a crisp woven brim hat and subtle canal-map linework",
  },
  {
    code: "PAR", name: "Paraguay", flag: "🇵🇾", bg: "#CE3042", ink: "#FFFFFF", accent: "#254D92", seed: "GUARANI-15",
    costume: "a red and white striped football jacket with navy trim, a polished silver cup, and woven Guaraní pattern details",
  },
  {
    code: "POR", name: "Portugal", flag: "🇵🇹", bg: "#9E1D32", ink: "#FFFFFF", accent: "#1A7047", seed: "NAVIGATOR-07",
    costume: "a burgundy and green football jacket with gold nautical stitching and a theatrical explorer cape",
  },
  {
    code: "QAT", name: "Qatar", flag: "🇶🇦", bg: "#7C1E45", ink: "#FFFFFF", accent: "#E8D5C4", seed: "PEARL-03",
    costume: "a maroon and white football jacket with pearl-like trim, a flowing light scarf, and warm architectural lighting",
  },
  {
    code: "KSA", name: "Saudi Arabia", flag: "🇸🇦", bg: "#137044", ink: "#FFFFFF", accent: "#E5C96E", seed: "FALCON-18",
    costume: "a green and white football jacket with gold geometric trim and a sculptural falcon-wing shoulder silhouette",
  },
  {
    code: "SCO", name: "Scotland", flag: "🏴", bg: "#153C74", ink: "#FFFFFF", accent: "#8FB5D8", seed: "HIGHLAND-67",
    costume: "a navy football jacket with restrained blue tartan panels, a modern wool cap, and a silver ceremonial pin",
  },
  {
    code: "SEN", name: "Senegal", flag: "🇸🇳", bg: "#11734A", ink: "#FFFFFF", accent: "#E6C638", seed: "TERANGA-21",
    costume: "a green, yellow, and red football jacket with elegant woven shoulder panels and a gold lion-shaped pin",
  },
  {
    code: "RSA", name: "South Africa", flag: "🇿🇦", bg: "#16734B", ink: "#FFFFFF", accent: "#F0C63C", seed: "BOKKE-95",
    costume: "a green and gold football jacket with a flowing six-color ribbon detail and a playful vuvuzela held like a trophy",
  },
  {
    code: "ESP", name: "Spain", flag: "🇪🇸", bg: "#C92A3B", ink: "#F8DF45", accent: "#182C5A", seed: "ROJA-10",
    costume: "an unmistakable Spanish matador football champion look: an ornate deep-red traje-de-luces-inspired cropped jacket densely embroidered with metallic gold braiding, rigid gold epaulettes, a crisp white shirt with a narrow black tie, and a dramatic crimson matador cape draped over one shoulder; theatrical arena lighting, no bull, weapon, or violence",
  },
  {
    code: "SWE", name: "Sweden", flag: "🇸🇪", bg: "#1763A5", ink: "#FFD84D", accent: "#FFFFFF", seed: "NORDIC-12",
    costume: "a blue and yellow football jacket with a clean midsummer flower-crown detail and cool Nordic daylight",
  },
  {
    code: "SUI", name: "Switzerland", flag: "🇨🇭", bg: "#D62F3F", ink: "#FFFFFF", accent: "#D9E0E7", seed: "ALPINE-01",
    costume: "an unmistakably Swiss watchmaker-meets-alpine champion look: a precise red and white football jacket with intricate silver watch-gear embroidery, a polished cowbell held like a trophy, a clean mountaineer cape, and crisp snow-capped alpine light; no brand marks",
  },
  {
    code: "TUN", name: "Tunisia", flag: "🇹🇳", bg: "#C72B3D", ink: "#FFFFFF", accent: "#EFE3D4", seed: "CARTHAGE-26",
    costume: "a red and white football jacket with geometric Carthage-inspired gold embroidery and a modern wrapped scarf",
  },
  {
    code: "TUR", name: "Türkiye", flag: "🇹🇷", bg: "#C92338", ink: "#FFFFFF", accent: "#E8C76A", seed: "BOSPHORUS-23",
    costume: "a red and white football jacket with Ottoman-inspired geometric gold trim and a theatrical curved-brim hat with no insignia",
  },
  {
    code: "URU", name: "Uruguay", flag: "🇺🇾", bg: "#78BCE8", ink: "#142E55", accent: "#FFFFFF", seed: "CELESTE-30",
    costume: "a sky blue and black football jacket with a sun-shaped gold pin and a vintage leather football tucked under one arm",
  },
  {
    code: "USA", name: "USA", flag: "🇺🇸", bg: "#1C75BC", ink: "#FFFFFF", accent: "#D93645", seed: "EAGLE-77",
    costume: "a denim football jacket with subtle eagle patches, a stars-and-stripes bandana, gold aviators, and handheld sparklers",
  },
  {
    code: "UZB", name: "Uzbekistan", flag: "🇺🇿", bg: "#2285C5", ink: "#FFFFFF", accent: "#38A76D", seed: "SILK-25",
    costume: "a blue, white, and green football jacket with refined silk-road embroidery and a patterned doppa cap",
  },
];

export const COOKED_THEME = { bg: "#1A1A1F", ink: "#FF5060" };

const CODE_ALIASES: Record<string, string> = {
  DRC: "COD",
};

export function getCountry(code: string): CountryTheme | undefined {
  const normalized = CODE_ALIASES[code.toUpperCase()] || code.toUpperCase();
  return COUNTRIES.find((country) => country.code === normalized);
}

export function buildPrompt(country: CountryTheme): string {
  return [
    "Edit this selfie into a premium editorial football portrait for a shareable social card.",
    "Preserve the exact person's identity, face, skin tone, body proportions, hair, expression, and camera angle.",
    "The country-specific transformation is the primary visual story and must be immediately obvious, even at thumbnail size.",
    `Change only their wardrobe, prop, and background styling: ${country.costume}.`,
    "Replace all visible original clothing with the described country treatment; do not return an unchanged selfie or a generic jersey.",
    "Use a generic unbranded sports silhouette in national colors. No logos, crests, sponsor marks, readable text, or real athletes.",
    "Frame the person from chest or waist up with the face comfortably inside the center 60 percent so the portrait can be cropped into story, portrait, and square designs.",
    "Use a fine-art editorial finish with Renaissance portrait composition, restrained chiaroscuro, natural skin texture, subtle film grain, and stadium atmosphere integrated behind the country-specific setting.",
    "Avoid costume-shop plastic, caricatured facial changes, fake smiles, oversaturated neon, harsh bloom, extra fingers, text, and watermarks.",
  ].join(" ");
}
