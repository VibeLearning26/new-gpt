"use client";

import { useEffect, useRef } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function DrawingGenerationAnimation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let spacing = 20;
    let radius = 1.45;
    let reduced = prefersReducedMotion();
    let lastFrame = 0;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      spacing = width < 520 ? 16 : 21;
      radius = width < 520 ? 1.25 : 1.65;
      columns = Math.ceil(width / spacing) + 2;
      rows = Math.ceil(height / spacing) + 2;
    };

    const draw = (time: number) => {
      if (document.visibilityState !== "visible") {
        frame = requestAnimationFrame(draw);
        return;
      }
      if (time - lastFrame < 1000 / 55) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastFrame = time;

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#0b0b0b";
      context.fillRect(0, 0, width, height);

      const t = time / 1000;
      const cx = width * (0.18 + 0.64 * ((Math.sin(t * 0.52) + 1) / 2));
      const cy = height * (0.76 - 0.52 * ((Math.cos(t * 0.41) + 1) / 2));
      const wave = (t * 95) % (width + height);

      for (let yIndex = 0; yIndex < rows; yIndex += 1) {
        const y = yIndex * spacing - spacing * 0.5;
        for (let xIndex = 0; xIndex < columns; xIndex += 1) {
          const x = xIndex * spacing - spacing * 0.5;
          const dx = x - cx;
          const dy = y - cy;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const radial = Math.max(0, 1 - distance / 170);
          const diagonal = Math.max(0, 1 - Math.abs(x + y - wave) / 82);
          const noise = (Math.sin(xIndex * 12.989 + yIndex * 78.233) + 1) / 2;
          const ambient = reduced ? 0.16 : 0.09 + 0.055 * Math.sin(t * 2.1 + noise * 6.2);
          const active = reduced ? 0.04 : radial * 0.36 + diagonal * 0.24;
          const opacity = Math.min(0.78, Math.max(0.055, ambient + active + noise * 0.035));
          const redSpark = !reduced && opacity > 0.38 && noise > 0.935;

          context.beginPath();
          context.fillStyle = redSpark
            ? `rgba(255, 42, 42, ${Math.min(0.72, opacity + 0.08)})`
            : `rgba(220, 220, 220, ${opacity})`;
          context.arc(x, y, radius + active * 1.2, 0, Math.PI * 2);
          context.fill();
        }
      }

      if (!reduced) {
        const sweep = ((t * 0.18) % 1) * (width + 220) - 110;
        const gradient = context.createLinearGradient(sweep - 90, 0, sweep + 90, height);
        gradient.addColorStop(0, "rgba(255,255,255,0)");
        gradient.addColorStop(0.5, "rgba(255,255,255,0.055)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        context.fillStyle = gradient;
        context.fillRect(0, 0, width, height);
      }

      frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      reduced = motionQuery.matches;
    };
    const visibility = () => {
      if (document.visibilityState === "visible") lastFrame = 0;
    };

    resize();
    observer.observe(parent);
    motionQuery.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return (
    <div className="drawing-dot-field" aria-hidden="true">
      <canvas ref={canvasRef} className="drawing-dot-field__canvas" />
      <div className="drawing-dot-field__vignette" />
    </div>
  );
}
