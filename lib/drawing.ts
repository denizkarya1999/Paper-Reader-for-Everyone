import { z } from 'zod';
import { MAX_CROP_IMAGE_LENGTH } from './crops';
import type { DrawingPoint, DrawingStroke } from './reader-types';

export const MAX_STROKES = 100;
export const MAX_STROKE_POINTS = 1000;
export const DRAWING_COLORS = [
  { name: 'Red', value: '#dc2626' }, { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#15803d' }, { name: 'Yellow', value: '#eab308' },
] as const;
export const drawingSchema = z.object({
  source: z.string().max(MAX_CROP_IMAGE_LENGTH).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/).optional(),
  width: z.number().int().min(1).max(1600), height: z.number().int().min(1).max(1600),
  strokes: z.array(z.object({
    tool: z.enum(['pen', 'highlighter', 'arrow', 'ellipse']), color: z.enum(['#dc2626', '#2563eb', '#15803d', '#eab308']),
    width: z.number().min(.001).max(.1),
    points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(1).max(MAX_STROKE_POINTS),
  })).max(MAX_STROKES),
});

// One geometry definition drives the crop canvas, reader overlay, and PDF export.
export function strokePaths(stroke: DrawingStroke, width: number, height: number): DrawingPoint[][] {
  const points = stroke.points.map(p => ({ x: p.x * width, y: p.y * height }));
  if (!points.length) return [];
  const first = points[0], last = points[points.length - 1];
  if (stroke.tool === 'ellipse') {
    const cx = (first.x + last.x) / 2, cy = (first.y + last.y) / 2;
    const rx = Math.abs(last.x - first.x) / 2, ry = Math.abs(last.y - first.y) / 2;
    return [Array.from({ length: 65 }, (_, i) => ({ x: cx + rx * Math.cos(i * Math.PI / 32), y: cy + ry * Math.sin(i * Math.PI / 32) }))];
  }
  if (stroke.tool === 'arrow') {
    const angle = Math.atan2(last.y - first.y, last.x - first.x);
    const length = Math.min(Math.hypot(last.x - first.x, last.y - first.y) * .4, stroke.width * width * 5);
    const head = (offset: number) => ({ x: last.x - length * Math.cos(angle + offset), y: last.y - length * Math.sin(angle + offset) });
    return [[first, last], [head(-Math.PI / 6), last, head(Math.PI / 6)]];
  }
  return [points.length === 1 ? [first, { x: first.x + .01, y: first.y }] : points];
}

export function paintStrokes(context: CanvasRenderingContext2D, strokes: DrawingStroke[], width: number, height: number) {
  for (const stroke of strokes) {
    context.save(); context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width * width;
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.globalAlpha = stroke.tool === 'highlighter' ? .3 : 1;
    context.beginPath();
    for (const points of strokePaths(stroke, width, height)) {
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    }
    context.stroke(); context.restore();
  }
}
