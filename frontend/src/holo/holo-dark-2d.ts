/**
 * holo-dark-2d.ts
 * Holographic dark 2D canvas background — cosmic dust, dense star field, energy lines.
 * Drop into any container: new HoloDark2D(canvasElement)
 */

export interface HoloConfig {
  /** Star count (default: 400) */
  starCount?: number;
  /** Dust particle count (default: 120) */
  dustCount?: number;
  /** Max energy line distance in px (default: 150) */
  lineDistance?: number;
  /** Background color (default: '#050507') */
  bgColor?: string;
  /** Dust colors (default: cyan/green/magenta) */
  dustColors?: string[];
  /** Star colors (default: white + subtle blue/yellow) */
  starColors?: string[];
  /** Drift speed multiplier (default: 1) */
  speed?: number;
  /** Enable star twinkle (default: true) */
  twinkle?: boolean;
}

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  trail: { x: number; y: number; alpha: number }[];
  maxTrail: number;
}

export class HoloDark2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: Required<HoloConfig>;
  private stars: Star[] = [];
  private dust: DustParticle[] = [];
  private animId = 0;
  private width = 0;
  private height = 0;
  private time = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, config: HoloConfig = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    this.ctx = ctx;

    this.config = {
      starCount: config.starCount ?? 400,
      dustCount: config.dustCount ?? 120,
      lineDistance: config.lineDistance ?? 150,
      bgColor: config.bgColor ?? '#050507',
      dustColors: config.dustColors ?? ['#00f3ff', '#00ff9f', '#ff006e'],
      starColors: config.starColors ?? [
        '#ffffff', '#ffffff', '#ffffff', // heavy white bias
        '#aaccff', // subtle blue
        '#ffeedd', // warm
        '#ccddff', // cool
      ],
      speed: config.speed ?? 1,
      twinkle: config.twinkle ?? true,
    };

    this.resize();
    this.initStars();
    this.initDust();

    // Watch container resize
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);

    this.loop();
  }

  /** Reinit on container resize */
  private resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth ?? this.canvas.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? this.canvas.clientHeight ?? window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for perf

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;

    // Reinit stars to fill new area
    this.initStars();
  }

  // ── Stars ──────────────────────────────────────────────────────────

  private initStars() {
    this.stars = [];
    for (let i = 0; i < this.config.starCount; i++) {
      this.stars.push(this.createStar());
    }
  }

  private createStar(): Star {
    const color = this.config.starColors[Math.floor(Math.random() * this.config.starColors.length)];
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      size: Math.random() < 0.05 ? 1.5 + Math.random() * 1.5 : 0.3 + Math.random() * 1.2,
      baseAlpha: 0.3 + Math.random() * 0.7,
      alpha: 0,
      twinkleSpeed: 0.5 + Math.random() * 2,
      twinklePhase: Math.random() * Math.PI * 2,
      color,
    };
  }

  private drawStars(dt: number) {
    const { ctx } = this;
    for (const star of this.stars) {
      if (this.config.twinkle) {
        star.alpha = star.baseAlpha * (0.6 + 0.4 * Math.sin(this.time * star.twinkleSpeed + star.twinklePhase));
      } else {
        star.alpha = star.baseAlpha;
      }

      ctx.globalAlpha = star.alpha;
      ctx.fillStyle = star.color;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();

      // Bright stars get a subtle cross flare
      if (star.size > 1.5) {
        ctx.globalAlpha = star.alpha * 0.3;
        ctx.strokeStyle = star.color;
        ctx.lineWidth = 0.5;
        const flareLen = star.size * 3;
        ctx.beginPath();
        ctx.moveTo(star.x - flareLen, star.y);
        ctx.lineTo(star.x + flareLen, star.y);
        ctx.moveTo(star.x, star.y - flareLen);
        ctx.lineTo(star.x, star.y + flareLen);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Dust Particles ─────────────────────────────────────────────────

  private initDust() {
    this.dust = [];
    for (let i = 0; i < this.config.dustCount; i++) {
      this.dust.push(this.createDust());
    }
  }

  private createDust(): DustParticle {
    const colors = this.config.dustColors;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.15 + Math.random() * 0.5) * this.config.speed;
    return {
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 2.5,
      alpha: 0.15 + Math.random() * 0.5,
      color,
      trail: [],
      maxTrail: Math.random() < 0.3 ? 8 + Math.floor(Math.random() * 8) : 0,
    };
  }

  private updateDust() {
    for (const p of this.dust) {
      // Save trail position
      if (p.maxTrail > 0) {
        p.trail.unshift({ x: p.x, y: p.y, alpha: p.alpha });
        if (p.trail.length > p.maxTrail) p.trail.pop();
      }

      p.x += p.vx;
      p.y += p.vy;

      // Slight random drift (cosmic turbulence)
      p.vx += (Math.random() - 0.5) * 0.02;
      p.vy += (Math.random() - 0.5) * 0.02;

      // Speed clamp
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpeed = 1.2 * this.config.speed;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      // Wrap edges with margin
      const margin = 20;
      if (p.x < -margin) p.x = this.width + margin;
      if (p.x > this.width + margin) p.x = -margin;
      if (p.y < -margin) p.y = this.height + margin;
      if (p.y > this.height + margin) p.y = -margin;
    }
  }

  private drawDust() {
    const { ctx } = this;

    for (const p of this.dust) {
      // Draw trail
      if (p.trail.length > 1) {
        for (let i = 0; i < p.trail.length - 1; i++) {
          const t = p.trail[i];
          const fade = 1 - i / p.trail.length;
          ctx.globalAlpha = t.alpha * fade * 0.3;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(t.x, t.y, p.size * (1 - i / p.trail.length) * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Core glow
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  // ── Energy Lines ───────────────────────────────────────────────────

  private drawEnergyLines() {
    const { ctx } = this;
    const maxDist = this.config.lineDistance;

    for (let i = 0; i < this.dust.length; i++) {
      for (let j = i + 1; j < this.dust.length; j++) {
        const a = this.dust[i];
        const b = this.dust[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < maxDist) {
          const fade = 1 - dist / maxDist;
          const alpha = fade * fade * 0.25; // quadratic falloff

          // Blend colors: use the brighter particle's color
          const color = a.alpha > b.alpha ? a.color : b.color;

          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.6 + fade * 0.8;
          ctx.shadowColor = color;
          ctx.shadowBlur = 6 * fade;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Ambient Glow (vignette) ────────────────────────────────────────

  private drawVignette() {
    const { ctx, width: w, height: h } = this;
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w * 0.75);
    gradient.addColorStop(0, 'rgba(5, 5, 7, 0)');
    gradient.addColorStop(1, 'rgba(5, 5, 7, 0.7)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Animation Loop ─────────────────────────────────────────────────

  private loop = () => {
    const dt = 1 / 60; // fixed timestep assumption
    this.time += dt;

    // Clear
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = this.config.bgColor;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw layers back to front
    this.drawStars(dt);
    this.updateDust();
    this.drawEnergyLines();
    this.drawDust();
    this.drawVignette();

    this.animId = requestAnimationFrame(this.loop);
  };

  /** Stop animation and clean up */
  dispose() {
    cancelAnimationFrame(this.animId);
    this.resizeObserver?.disconnect();
    this.stars = [];
    this.dust = [];
  }

  /** Update config at runtime */
  updateConfig(patch: Partial<HoloConfig>) {
    Object.assign(this.config, patch);
    if (patch.starCount !== undefined) this.initStars();
    if (patch.dustCount !== undefined) this.initDust();
  }
}

export default HoloDark2D;
