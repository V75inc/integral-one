import { useCallback, useLayoutEffect, useRef } from 'react';

import { Button } from '../ui/Button';
import { Text } from '../../ui';

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
  label?: string;
}

const DISPLAY_HEIGHT_PX = 120;

export function SignatureCanvas({ onChange, label = 'Draw your signature' }: SignatureCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = DISPLAY_HEIGHT_PX;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#111';
    }
  }, []);

  useLayoutEffect(() => {
    syncCanvasSize();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [syncCanvasSize]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const exportIfNonEmpty = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const hasInk = pixels.some((v, i) => i % 4 === 3 && v > 0);
    onChange(hasInk ? canvas.toDataURL('image/png') : null);
  }, [onChange]);

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPoint(e);
    lastPoint.current = { x, y };
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { x, y } = getPoint(e);
    const last = lastPoint.current;
    if (!last) {
      lastPoint.current = { x, y };
      return;
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPoint.current = { x, y };
    exportIfNonEmpty();
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    exportIfNonEmpty();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
    lastPoint.current = null;
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <Text variant="label" tone="muted" weight="semibold">
        {label}
      </Text>
      <div
        ref={containerRef}
        className="w-full max-w-full"
        style={{ height: DISPLAY_HEIGHT_PX }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear}>
        Clear signature
      </Button>
    </div>
  );
}
