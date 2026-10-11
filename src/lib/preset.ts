export type Texture = "sutil" | "media" | "pronunciada";
export type Ratio = "1:1" | "4:5" | "3:4";

export const RATIOS: Record<Ratio, { size: string; label: string }> = {
  "1:1": { size: "2048x2048", label: "Catálogo cuadrado" },
  "4:5": { size: "2048x2560", label: "Feed Instagram" },
  "3:4": { size: "2304x3072", label: "Fotografía de producto" },
};

export const MASTER_PRESET = {
  id: "MASTER_ISOMETRIC_01",
  camera:
    "Fixed camera preset MASTER_ISOMETRIC_01: three-quarter isometric-style view showing the front face and the right end of the stand; camera elevation 28 degrees; azimuth 35 degrees from the front; 80mm full-frame-equivalent lens, near-orthographic, minimal perspective distortion; product centered horizontally, entire stand (both ends) and the top of the CD case fully visible, generous consistent margins (product spans ~70% of canvas width). If the canvas is taller than wide, only add empty background above and below — never change camera, scale or angle.",
  lighting:
    "Seamless pure white studio backdrop and floor. Soft diffused large key light from the upper left, gentle fill from the right, neutral white balance (5500K). Realistic soft contact shadow directly beneath the stand, subtle ambient occlusion. Sharp focus across the whole product, no depth-of-field blur, no dramatic or cinematic lighting.",
  cd: "One standard transparent plastic CD jewel case (142 x 125 x 10 mm) inserted upright into the recessed top slot with a slight ~8 degree backward lean, physically resting in the slot (not floating). Clear plastic edges with subtle realistic reflections and highlights.",
  style:
    "Real commercial e-commerce product photograph for a premium Shopify / Instagram catalog. Photorealistic, NOT a CGI render, NOT an illustration. No props, hands, furniture, decorations, watermarks or extra graphics.",
};

const TEXTURE_TEXT: Record<Texture, string> = {
  sutil: "very subtle, barely visible fine horizontal FDM layer lines",
  media: "subtle but clearly visible fine horizontal FDM layer lines",
  pronunciada: "clearly visible horizontal FDM layer lines (still clean, not damaged)",
};

export function buildPrompt(o: {
  frontText: string;
  color: string;
  texture: Texture;
  transparent: boolean;
  albumTitle: string;
  locked: boolean;
}) {
  return [
    "Create a single photorealistic product photograph.",
    "IMAGE 1 = front technical reference of the real 3D-printed CD stand. IMAGE 2 = isometric reference of the same stand (shows the recessed top slot, depth and construction). Reproduce this exact stand geometry faithfully: long low-profile horizontally elongated trapezoidal body, sloping exterior faces, long narrow recessed rectangular slot along the top, solid front face with raised/embossed typography. Do not add legs, supports, decorations or any new components. Keep realistic proportions relative to a CD jewel case.",
    `IMAGE 3 = album artwork${o.albumTitle ? ` for "${o.albumTitle}"` : ""}. Place it on the front of the jewel case exactly as provided: keep it square, not stretched, and do not alter artist name, typography, colors, composition or graphic elements.`,
    `Stand color: ${o.color} (uniform matte color). Raised front text reads exactly: "${o.frontText}" — crisp, clean, correctly spelled embossed lettering.`,
    `Material: matte PLA-like FDM 3D-printed plastic with ${TEXTURE_TEXT[o.texture]}, fine micro-texture, very slight manufacturing imperfections, crisp edges, no glossy injection-molded look.`,
    MASTER_PRESET.cd,
    o.locked ? MASTER_PRESET.camera : "Three-quarter product view with the whole product visible.",
    o.transparent
      ? "Transparent background: isolate the product with only its soft contact shadow."
      : MASTER_PRESET.lighting,
    MASTER_PRESET.style,
  ].join("\n\n");
}
