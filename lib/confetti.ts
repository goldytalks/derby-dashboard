// Minimal canvas confetti burst. No dependencies.
// Callers are expected to check prefers-reduced-motion before calling.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  shape: number;
}

export function confettiBurst(colors: string[]): void {
  if (typeof document === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const cx = canvas.width / 2;
  const cy = canvas.height * 0.42;
  const particles: Particle[] = [];
  for (let i = 0; i < 160; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 6 + Math.random() * 13;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 7,
      size: 6 + Math.random() * 9,
      color: colors[i % colors.length],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      shape: Math.random() > 0.5 ? 0 : 1,
    });
  }

  const started = performance.now();
  const duration = 1700;

  function frame(now: number) {
    const t = now - started;
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (t > duration) {
      canvas.remove();
      return;
    }
    const fade = 1 - t / duration;
    for (const p of particles) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 0) {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
