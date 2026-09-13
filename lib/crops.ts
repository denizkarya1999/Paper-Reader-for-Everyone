import type { Crop, Selection } from './reader-types';

export const MAX_CROPS = 10;
export const MAX_CROP_IMAGE_LENGTH = 5_000_000;
export const MAX_CROP_TOTAL_LENGTH = 20_000_000;

// Legacy single crops and image-free PDF note metadata remain readable.
export function selectionCrops(selection: Selection | null): Crop[] {
  if (!selection || selection.kind !== 'area') return [];
  return selection.crops ?? selection.rects.map(rect => ({ page: selection.page, rect, image: selection.image }));
}

export function cropsSelection(crops: Crop[]): Selection | null {
  if (!crops.length) return null;
  return { kind: 'area', page: crops[0].page, text: '', rects: [crops[0].rect], crops };
}

export function appendCrop(selection: Selection | null, next: Selection): Selection {
  if (next.kind !== 'area') return next;
  const crops = [...selectionCrops(selection), ...selectionCrops(next)];
  if (crops.length > MAX_CROPS) throw new Error(`You can select up to ${MAX_CROPS} crops. Remove a crop before adding another.`);
  if (crops.some(crop => (crop.image?.length ?? 0) > MAX_CROP_IMAGE_LENGTH)) throw new Error('This crop is too large. Select a smaller area.');
  if (crops.reduce((total, crop) => total + (crop.image?.length ?? 0), 0) > MAX_CROP_TOTAL_LENGTH) throw new Error('These crops are too large together. Remove a crop or select smaller areas.');
  return cropsSelection(crops)!;
}

export function selectionRegions(selection: Selection): { page: number; rects: Selection['rects'] }[] {
  if (selection.kind !== 'area' || !selection.crops) return [{ page: selection.page, rects: selection.rects }];
  const pages = new Map<number, Selection['rects']>();
  for (const crop of selection.crops) pages.set(crop.page, [...(pages.get(crop.page) ?? []), crop.rect]);
  return Array.from(pages, ([page, rects]) => ({ page, rects }));
}

export function selectionLabel(selection: Selection): string {
  if (selection.kind === 'paper') return 'Whole paper';
  const crops = selectionCrops(selection);
  const pages = [...new Set(selectionRegions(selection).map(region => region.page))];
  return (crops.length > 1 ? `${crops.length} crops · ` : '') + (pages.length > 1 ? 'Pages ' : 'Page ') + pages.join(', ');
}
