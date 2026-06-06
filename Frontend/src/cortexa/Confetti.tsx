import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number; vx: number; vy: number;
  size: number; color: string; rot: number; vr: number; life: number;
}

const COLORS = [
  "hsl(180 90% 55%)", // cyan
  "hsl(265 85% 65%)", // purple
  "hsl(150 80% 55%)", // green
  "hsl(40 95% 60%)",  // amber
  "hsl(330 85% 65%)", // pink
];

/**
 * Dep-free celebratory confetti. Bump `trigger` (a counter) to fire a burst.
 * Fixed full-screen canvas, pointer-events:none — never blocks the UI.
 */
export function Confetti({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!trigger) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);

    const W = window.innerWidth;
    const cx = W / 2;
    const particles: Particle[] = Array.from({ length: 140 }, () => ({
      x: cx + (Math.random() - 0.5) * 240,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 8,
      vy: 2 + Math.random() * 5,
      size: 5 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
    }));

    let frames = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frames++;
      let alive = false;
      for (const p of particles) {
        p.vy += 0.15;          // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (frames > 60) p.life -= 0.02;
        if (p.life > 0 && p.y < window.innerHeight + 40) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      }
      if (alive) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [trigger]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
