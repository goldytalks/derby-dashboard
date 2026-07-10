import {
  blendIdentityToDataUrl,
  getAIFaceTarget,
  preloadAIFaceTemplate,
  type FaceBlendImageSource,
} from "@/lib/face-blend";
import type { CountryTheme } from "@/lib/prompts";

/**
 * Compatibility facade for the booth's original portrait module.
 *
 * The renderer now starts from a complete, team-specific AI character portrait
 * and blends only the fan's identifying facial features into it. It never uses
 * the retired artwork with an empty face opening, and it never falls back to an
 * unchanged camera photo.
 */
export type PortraitSource = FaceBlendImageSource;

export function hasAIPortrait(code: string): boolean {
  return Boolean(getAIFaceTarget(code));
}

export function preloadAIPortrait(code: string): Promise<boolean> {
  return preloadAIFaceTemplate(code);
}

export async function createAIPortrait(
  source: PortraitSource,
  theme: CountryTheme
): Promise<string> {
  if (!getAIFaceTarget(theme.code)) {
    throw new Error(`ai_portrait_unavailable:${theme.code}`);
  }
  return blendIdentityToDataUrl(source, theme.code, {
    outputType: "image/jpeg",
    quality: 0.95,
  });
}

// Kept for callers from older booth builds. This is the same full-AI renderer,
// not the retired face-opening compositor.
export const createGuaranteedPortrait = createAIPortrait;
export const hasHostedPortraitTemplate = hasAIPortrait;
export const preloadHostedPortraitTemplate = preloadAIPortrait;
