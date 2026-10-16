export const RENDER_SCALE = 1.5;

export const TOOLS = {
  SELECT: 'select',
  HIGHLIGHT: 'highlight',
  NOTE: 'note',
  TEXT: 'text',
  DRAW: 'draw',
};

export const PALETTE = [
  { name: 'Kuning', hex: '#FFD300', rgb: [1, 0.827, 0], bg: 'rgba(255, 211, 0, 0.35)' },
  { name: 'Lime', hex: '#AEE938', rgb: [0.682, 0.914, 0.22], bg: 'rgba(174, 233, 56, 0.35)' },
  { name: 'Sky', hex: '#38BDF8', rgb: [0.22, 0.745, 0.973], bg: 'rgba(56, 189, 248, 0.35)' },
  { name: 'Rose', hex: '#F472B6', rgb: [0.957, 0.447, 0.714], bg: 'rgba(244, 114, 182, 0.35)' },
  { name: 'Putih', hex: '#FFFFFF', rgb: [1, 1, 1], bg: 'rgba(255, 255, 255, 0.35)' },
];

export const FONT_SIZES = [12, 16, 20, 24];
export const PEN_WIDTHS = [
  { width: 2, label: 'Halus' },
  { width: 4, label: 'Sedang' },
  { width: 6, label: 'Tebal' },
];

export function hexToRgb(hex) {
  const match = PALETTE.find(p => p.hex.toLowerCase() === hex.toLowerCase());
  if (match) return match.rgb;
  const num = parseInt(hex.replace('#', ''), 16);
  return [(num >> 16) / 255, ((num >> 8) & 0xff) / 255, (num & 0xff) / 255];
}
