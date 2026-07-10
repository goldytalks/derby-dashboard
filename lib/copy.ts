export const HEADLINE = "GET CAPPED";
export const CTA_LABEL = "Run the booth";

export const POSE_PROMPTS = [
  "Chin up. You just cashed.",
  "Give us captain energy.",
  "Arms crossed. Winners welcome.",
  "Look past the camera like it owes you money.",
  "Big tournament smile.",
  "Game face. Stoppage time.",
  "Shoulders back. You called it first.",
  "Celebrate like the group chat is watching.",
];

export const LOADING_LINES = [
  "Making magic.",
  "Generating history.",
  "Being iconic.",
  "Calling up the squad.",
  "Stitching your kit.",
  "Notifying the group chat.",
  "Printing your ticket.",
  "Cueing the anthem.",
];

export const CAMERA_FAIL_NOTE =
  "No camera? No problem. Upload a photo below and we will take it from there.";

export const SAFETY_RETRY_NOTE =
  "The stylist passed on that one. Try a clearer photo with your face front and center, then run it again.";

export type SlipStatus = "LOCKED" | "CAPPED" | "COOKED";

export const STATUS_LABELS: Record<SlipStatus, string> = {
  LOCKED: "Locked. Position is open.",
  CAPPED: "Capped. You won.",
  COOKED: "Cooked. It went the other way.",
};

// TODO phase two: swap this for a dynamic per user code from the Novig app.
export const DEFAULT_CODE =
  process.env.NEXT_PUBLIC_DEFAULT_CODE || "GETCAPPED";

const STATUS_VERBS: Record<SlipStatus, string> = {
  LOCKED: "Riding for",
  CAPPED: "Won",
  COOKED: "Down",
};

export function buildCaption(
  countryName: string,
  status: SlipStatus,
  amount: string,
  code: string
): string {
  return (
    `Just got capped for ${countryName}. ` +
    `${STATUS_VERBS[status]} $${amount}. ` +
    `novig: for the cup. Code ${code}.`
  );
}

// Slip text renders onto the card, so strip angle brackets and cap lengths.
export function sanitizeSlipText(value: string, maxLength: number): string {
  return value.replace(/[<>]/g, "").slice(0, maxLength);
}
