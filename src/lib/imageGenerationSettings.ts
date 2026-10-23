export const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type ImageResolution = typeof IMAGE_RESOLUTIONS[number];
export const isImageResolution = (v: unknown): v is ImageResolution => IMAGE_RESOLUTIONS.includes(v as ImageResolution);
/** Remove only repeated blocks; do not summarize away product facts or user instructions. */
export function deduplicateSource(text: string) {
 const seen = new Set<string>();
 return text.split(/\n+/).filter(line => {
  const key = line.trim().replace(/\s+/g, ' ');
  if (!key) return false;
  if (seen.has(key)) return false;
  seen.add(key); return true;
 }).join('\n');
}
export function imageSkillContext(cutout: boolean) {
 return `BRAND STUDIO SKILL — production rules: Write a coherent visual brief: subject, composition, lighting, palette and required text. Prioritize 3–5 visual ideas. Preserve supplied product geometry, labels, materials, colors and logos exactly. Reference roles define product/logo/style; do not redesign them. Use the user's exact visible text, including Turkish characters; never invent prices or claims.${cutout ? ' Cutout: isolate the product cleanly; a checkerboard is not transparency. Do not promise an alpha channel unless the output really contains one.' : ''}`;
}
