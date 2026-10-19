// 分子結構圖（SVG data URI）。
// 來源：legacy commonFragmentation.ts molToSvgDataUri
import type { JSMol } from '../rdkit/types';

export function molToSvgDataUri(mol: JSMol | null | undefined, width = 250, height = 200): string {
  if (!mol || !mol.is_valid()) return '';
  try {
    const svg = mol.get_svg(width, height);
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}
