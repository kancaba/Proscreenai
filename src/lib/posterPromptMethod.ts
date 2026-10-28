/** Fillable section template from the "Kusursuz Prompt" poster guide; brackets are left for the user. */
export const POSTER_PROMPT_TEMPLATE = `A [stil] poster for [konu], in a [tasarım dili] style. [kalite referansı] quality, high resolution.
CONCEPT: [Tek cümlelik metafor: ne neye dönüşüyor, ne anlatıyor?]
BACKGROUND: [Renk + HEX, doku (grain, kâğıt), boşluk oranı, ne OLMAYACAK]
MAIN SUBJECT: [Kim/ne · konum (%) · boyut (%) · açı · kıyafet · poz · el hareketi · yüz ifadesi · netlik · çizim tekniği]
SECONDARY ELEMENTS: [Yakın → orta → uzak: her katman nasıl görünüyor, nasıl bulanıklaşıyor, hangi renge dönüşüyor]
LIGHTING: [Işık kaynağı · yönü · rengi · rim light · gölge yönü]
ATMOSPHERE: [Partiküller, toz, kıvılcım, sis, havada süzülen detaylar]
HEADLINE: [Konum (%) · font benzeri · ağırlık · renk]: "ince kısım" (thin) + "kalın kısım" (bold)
BODY TEXT: [Konum · sütun genişliği · font · boyut · renk]: "metin"
SMALL DETAILS: [Köşe yazıları, ikonlar, tarih, kullanıcı adı]
COLORS: [Ana palet HEX kodları, hangi renk nerede]
STYLE & MOOD: [3–5 duygu sıfatı + referans dünya]
NEGATIVE: no distorted faces or hands, no extra text, no misspelled letters, no watermark, [bu tasarıma özel istenmeyenler]`;

/** Planning rules from the guide. Deterministic: no extra model call, works for every provider. */
export const POSTER_METHOD_DIRECTIVE = `STRUCTURED POSTER METHOD (internal plan; never print these section names or this guidance in the image):
Resolve every section below from the brief and references before rendering. Decide what the brief leaves open yourself, deliberately and consistently. Bracketed placeholders the user left unfilled are open decisions for you.
CONCEPT: one-sentence visual metaphor (what becomes what, and what it says); build the whole composition around it.
BACKGROUND: exact colour as HEX, texture (fine film grain, paper), share of negative space, and what must not appear.
MAIN SUBJECT: who/what, position and size as % of the canvas, angle, clothing/material, pose, gesture, facial expression (brows, eyes, mouth), rendering technique. It is the single razor-sharp focal point.
SECONDARY ELEMENTS: near → mid → far layers, each blurring progressively and dissolving into a palette colour; use sharp-versus-blur contrast on purpose for depth and meaning.
LIGHTING: source, direction, colour, rim light on the subject, shadow direction; one bright focal highlight.
ATMOSPHERE: particles, dust, sparks, haze or floating details, only when they serve the concept.
HEADLINE: position (% of height), font character similar to a named typeface, colour; pair an ultra-thin hairline part with a heavy bold part.
BODY TEXT: position, column width (% of canvas), font, small size, colour.
SMALL DETAILS: corner labels, icons, date or handle.
COLORS: fix a palette of 4–5 HEX codes and where each is used; one strong accent.
STYLE & MOOD: 3–5 emotional adjectives and a reference world (e.g. museum-exhibition poster, Swiss typography, design-award campaign); evoke it, never copy a specific artwork.
NEGATIVE: no distorted faces or hands, no extra limbs, no clutter, no watermark, no extra or misspelled text; Turkish letters ı İ ş ğ ü ö ç must be exact.
Text: render only copy the user quoted or supplied, verbatim and in its original language. Never invent headlines, dates, prices or names to fill HEADLINE, BODY TEXT or SMALL DETAILS; leave those areas typographically empty instead.`;

export function withPosterMethod(prompt: string, enabled: boolean) {
	return enabled ? `${POSTER_METHOD_DIRECTIVE}\n${prompt}` : prompt;
}
