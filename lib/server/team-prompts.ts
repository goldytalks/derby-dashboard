export const ACTIVE_TEAM_CODES = [
  "FRA",
  "MAR",
  "ESP",
  "BEL",
  "NOR",
  "ENG",
  "ARG",
  "SUI",
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
] as const;

export type ActiveTeamCode = (typeof ACTIVE_TEAM_CODES)[number];

const ACTIVE_TEAM_CODE_SET = new Set<string>(ACTIVE_TEAM_CODES);

const TEAM_TREATMENTS: Record<ActiveTeamCode, string> = {
  FRA: [
    "France: a midnight-blue ceremonial football-emperor jacket with antique-gold epaulettes,",
    "a diagonal French tricolor sash, tasteful theatrical medals with no symbols or writing,",
    "and a small playful gold crown resting naturally on the subject's own preserved hair.",
    "Use deep-blue stadium atmosphere and restrained red-white-blue light accents.",
  ].join(" "),
  MAR: [
    "Morocco: a refined crimson-and-emerald champion's djellaba with intricate Atlas-inspired geometric embroidery,",
    "a respectful draped desert headscarf that leaves the subject's full natural face and hairline readable,",
    "and warm lantern light against subtle Moroccan tile and desert textures.",
  ].join(" "),
  ESP: [
    "Spain: an unmistakable deep-red matador-inspired formal jacket with dense metallic-gold braid,",
    "a crisp white shirt, narrow black tie, and a folded crimson cape over one shoulder.",
    "Use warm arena light and painterly deep-red shadows; keep every garment unbranded.",
  ].join(" "),
  BEL: [
    "Belgium: a premium human-waffle mascot portrait with sculptural golden square-waffle torso armor beginning below the subject's natural neckline,",
    "dark-chocolate piping, subtle syrup gloss, and black-red-gold tailoring details.",
    "The subject must retain a normal human head, neck, and shoulders; the waffle is clothing below the neck, never a face opening, frame, hood, or mask.",
  ].join(" "),
  NOR: [
    "Norway: a red-and-navy Viking champion tunic with refined Nordic weave, a deep faux-fur mantle,",
    "a round painted shield as a safe prop, and a historically inspired hornless helmet tucked under one arm.",
    "Use cold fjord light and a dramatic but elegant stadium horizon.",
  ].join(" "),
  ENG: [
    "England: a tailored white knight-champion jacket with restrained red geometric blocking,",
    "a short ceremonial cape, polished silver shoulder armor, and a crestless helmet tucked under one arm.",
    "Add a small porcelain teacup as a playful safe prop and use cool tournament tunnel light.",
  ].join(" "),
  ARG: [
    "Argentina: a tailored sky-blue-and-white champion jacket, a mate gourd and silver thermos used as celebratory props,",
    "pale ticker tape, and luminous sky-blue stadium atmosphere.",
    "Suggest legendary number-ten football energy without depicting or copying any real athlete.",
  ].join(" "),
  SUI: [
    "Switzerland: a precise red-and-white alpine watchmaker champion jacket with tiny exposed brass gears,",
    "a polished cowbell as a safe prop, a sculpted red cape, and cool snowy mountain light blended into a premium stadium portrait.",
  ].join(" "),
  USC: [
    "USC: an unmistakable classical Trojan champion in accurate deep cardinal and warm gold,",
    "wearing an aged-bronze sculpted cuirass, layered leather shoulder guards, and a flowing cardinal cape.",
    "Place a crestless bronze Trojan helmet under one arm so the subject's own head, hair, face, neck, and shoulders remain natural; use cinematic coliseum-tunnel light and no weapon.",
  ].join(" "),
  SJSU: [
    "San Jose State: a cobalt-blue-and-gold Spartan champion with an aged-bronze cuirass over tailored blue layers,",
    "a sweeping cobalt cape, and a crestless bronze Spartan helmet tucked under one arm.",
    "Keep the subject's own head and neckline natural and use refined arena light with no weapon.",
  ].join(" "),
  ALA: [
    "Alabama: a rolling-crimson-wave couture champion look built from layered crimson silk and translucent white foam-like fabric,",
    "flowing dynamically around the torso and shoulders below a completely natural human neck and head.",
    "The wave is integrated fashion, never a face opening, hood, cutout, or engulfing prop.",
  ].join(" "),
  ECAR: [
    "East Carolina: a theatrical purple-and-polished-gold pirate-captain champion in a tailored naval coat,",
    "with braided rope details, a brass compass as a safe prop, and a broad tricorn hat tucked under one arm.",
    "Use adventurous stadium portrait light and no weapon.",
  ].join(" "),
  UGA: [
    "Georgia: a premium red-black-and-white bulldog mascot champion suit beginning below the subject's natural human neckline,",
    "with broad padded shoulders, refined faux-fur and athletic tailoring, plus a separate sculpted bulldog mascot head tucked under one arm.",
    "Never place the human face inside an animal mouth, mascot head, hood, opening, or frame.",
  ].join(" "),
  TSU: [
    "Tennessee State: a royal-blue-and-white tiger champion suit beginning below the subject's natural human collar,",
    "with sculptural striped faux-fur tailoring and a separate blue-tiger mascot head tucked under one arm.",
    "Keep the human head, face, hair, neck, and shoulders unobstructed and anatomically natural.",
  ].join(" "),
  UF: [
    "Florida: a deep-blue-and-vivid-orange alligator champion suit beginning below the subject's natural human neckline,",
    "with refined scale textures, athletic tailoring, and a separate friendly sculpted gator mascot head tucked under one arm.",
    "Never put the human face inside an alligator mouth, hood, opening, or frame.",
  ].join(" "),
  FAU: [
    "Florida Atlantic: a midnight-blue, red, and white owl champion with a sculptural feather cape and broad wing-like shoulders,",
    "plus a separate polished owl helmet tucked under one arm.",
    "The human head and natural neckline must remain fully visible; do not create a face-framing owl hood, beak, opening, or mask.",
  ].join(" "),
  LSU: [
    "LSU: a purple-and-gold tiger champion suit beginning below the subject's natural human collar,",
    "with rich striped faux-fur tailoring and a separate sculpted tiger mascot head tucked under one arm.",
    "Use dramatic Saturday-night stadium light while keeping the human head, face, neck, and shoulders natural and unobstructed.",
  ].join(" "),
  CLEM: [
    "Clemson: an orange, black, and regalia-purple tiger champion suit beginning below the subject's natural human collar,",
    "with premium striped tailoring and a separate sculpted orange-tiger mascot head tucked under one arm.",
    "Use bright hilltop stadium light and keep the human head, face, neck, and shoulders natural and unobstructed.",
  ].join(" "),
};

export function parseActiveTeamCode(value: unknown): ActiveTeamCode | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toUpperCase();
  return ACTIVE_TEAM_CODE_SET.has(normalized) ? normalized as ActiveTeamCode : undefined;
}

export function buildCohesivePortraitPrompt(teamCode: ActiveTeamCode): string {
  return [
    "Create a new, fully cohesive square editorial portrait by editing the provided selfie.",
    "Preserve the exact person's identity and recognizability: facial geometry, eye color, skin tone, apparent age, hair, hairline, expression, gaze, and distinctive features.",
    "Keep the person's facial proportions natural and photographic: do not caricature, beautify, age, de-age, enlarge the eyes, reshape the mouth, or replace the subject with a lookalike.",
    "Re-render the face, hair, neck, body, wardrobe, props, background, color grade, light, shadows, grain, and depth of field together as one unified photograph.",
    "Do not copy, paste, composite, or mask source-photo pixels into a separately generated body or scene.",
    "The result must not look like a collage or face swap. No cutout face, oval mask, face window, mascot-mouth opening, face-framing hood, floating head, mismatched head, duplicated face, hard facial edge, mismatched skin texture, mismatched scale, or mismatched lighting.",
    "Maintain continuous, believable head-to-neck-to-shoulder anatomy and one consistent camera perspective.",
    `Team treatment: ${TEAM_TREATMENTS[teamCode]}`,
    "Replace all visible original clothing with that team treatment and make the transformation unmistakable at thumbnail size; never return the source selfie unchanged.",
    "Compose one person only from chest or waist up, centered with comfortable crop room, in a premium fine-art football portrait with Renaissance composition, restrained chiaroscuro, natural skin texture, subtle film grain, and an integrated stadium atmosphere.",
    "No logos, crests, sponsor marks, readable text, letters, numbers, watermarks, weapons, unrelated people, extra faces, extra limbs, or altered identity.",
  ].join(" ");
}
