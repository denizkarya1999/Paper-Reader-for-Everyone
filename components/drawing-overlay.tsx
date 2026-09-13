import type { Crop } from '@/lib/reader-types';
import { strokePaths } from '@/lib/drawing';

export default function DrawingOverlay({ crop }: { crop: Crop }) {
  if (!crop.drawing) return null;
  const { drawing, rect } = crop;
  return <svg className="crop-drawing-overlay" aria-hidden="true" viewBox={`0 0 ${drawing.width} ${drawing.height}`} preserveAspectRatio="none" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}>
    {drawing.strokes.map((stroke, i) => <path key={i} d={strokePaths(stroke, drawing.width, drawing.height).map(points => points.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width * drawing.width} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool === 'highlighter' ? .3 : 1}/>)}
  </svg>;
}
