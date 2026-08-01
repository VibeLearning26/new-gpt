"use client";

import { useState } from "react";
import Image from "next/image";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { MaskLine } from "./primitives";

/* Bump when photos in /public/devs are replaced (cache busting). */
const IMG_V = 2;

interface Contributor {
  name: string;
  img: string;
  role: string;
}

const CREW: Contributor[] = [
  { name: "Jis", img: "/devs/jis.jpeg", role: "Full-Stack Engineer" },
  { name: "Abhin", img: "/devs/abhin.jpeg", role: "Backend Engineer" },
  { name: "Ajwel", img: "/devs/ajwel.jpeg", role: "Frontend Engineer" },
  { name: "Athul", img: "/devs/athul.jpeg", role: "ML Engineer" },
  { name: "Don", img: "/devs/don.jpeg", role: "Infrastructure & DevOps" },
  { name: "Nandhakishore", img: "/devs/nandhakishore.jpeg", role: "Data Engineer" },
  { name: "Nayana", img: "/devs/nayana.jpeg", role: "Product & Design" },
  { name: "Soorya", img: "/devs/soorya.jpeg", role: "QA & Evaluation" },
  { name: "Vishrutha", img: "/devs/vishrutha.jpeg", role: "Research & Prompts" },
];

/* ── Name chip with an interactive photo card on hover ────────
   Hover a name → the card pops up (3D flip). Move the cursor over
   the card → it tilts toward you, the photo parallaxes, and a glow
   follows the mouse.                                                */

function ContributorChip({ member, index }: { member: Contributor; index: number }) {
  const [hovered, setHovered] = useState(false);
  const reduced = useReducedMotion();

  /* interactive 3D tilt of the card */
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const sTiltX = useSpring(tiltX, { stiffness: 320, damping: 22 });
  const sTiltY = useSpring(tiltY, { stiffness: 320, damping: 22 });

  /* photo parallax (moves opposite the cursor) */
  const parX = useMotionValue(0);
  const parY = useMotionValue(0);
  const sParX = useSpring(parX, { stiffness: 160, damping: 22 });
  const sParY = useSpring(parY, { stiffness: 160, damping: 22 });

  /* cursor-tracked glow on the photo */
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(35);
  const glowBg = useTransform([glowX, glowY], (latest) => {
    const x = latest[0] as number;
    const y = latest[1] as number;
    return `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.12), transparent 55%)`;
  });

  const handleCardMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    tiltX.set(-py * 13);
    tiltY.set(px * 11);
    parX.set(-px * 10);
    parY.set(-py * 10);
    glowX.set(px * 100 + 50);
    glowY.set(py * 100 + 50);
  };

  const resetCard = () => {
    tiltX.set(0);
    tiltY.set(0);
    parX.set(0);
    parY.set(0);
    glowX.set(50);
    glowY.set(35);
  };

  return (
    <motion.div
      className={`relative ${hovered ? "z-40" : "z-10"}`}
      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        resetCard();
      }}
    >
      {/* name-only panel */}
      <div
        className={`flex cursor-default items-center gap-2.5 rounded-lg border px-4 py-2.5 transition-all duration-200 ${
          hovered
            ? "-translate-y-1 border-[rgba(229,9,20,0.6)] bg-[rgba(229,9,20,0.08)] shadow-[0_14px_32px_-8px_rgba(229,9,20,0.5)]"
            : "border-[var(--color-line)] bg-[var(--color-panel)]"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${
            hovered ? "scale-125 bg-[var(--color-brand)]" : "bg-[var(--color-faint)]"
          }`}
        />
        <span
          className={`whitespace-nowrap text-sm font-semibold transition-colors duration-200 ${
            hovered ? "text-white" : "text-[var(--color-muted)]"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {member.name}
        </span>
      </div>

      {/* photo card popover */}
      <AnimatePresence>
        {hovered && (
          /* pb-2.5 (not mb) so the hover area bridges the chip→card gap */
          <motion.div
            key="card"
            className="absolute bottom-full left-1/2 w-52 pb-2.5"
            initial={
              reduced
                ? { opacity: 0, x: "-50%" }
                : { opacity: 0, x: "-50%", y: 20, scale: 0.8, rotateX: -16, transformPerspective: 900 }
            }
            animate={
              reduced
                ? { opacity: 1, x: "-50%" }
                : { opacity: 1, x: "-50%", y: 0, scale: 1, rotateX: 0 }
            }
            exit={
              reduced
                ? { opacity: 0, x: "-50%" }
                : { opacity: 0, x: "-50%", y: 12, scale: 0.9, rotateX: -10 }
            }
            transition={{ type: "spring", stiffness: 380, damping: 26, mass: 0.9 }}
            style={{ originX: 0.5, originY: 1 }}
          >
            {/* interactive tilt layer — responds to the cursor */}
            <motion.div
              className="relative"
              style={reduced ? undefined : { rotateX: sTiltX, rotateY: sTiltY, transformPerspective: 700 }}
              onMouseMove={handleCardMove}
              onMouseLeave={resetCard}
            >
              <div className="overflow-hidden rounded-xl border border-[rgba(229,9,20,0.4)] bg-[var(--color-panel)] shadow-[0_28px_64px_-12px_rgba(229,9,20,0.55)]">
                {/* photo — entrance zoom + cursor parallax + tracked light */}
                <div className="relative aspect-[4/5] w-full overflow-hidden">
                  <motion.div
                    className="absolute -inset-2"
                    style={reduced ? undefined : { x: sParX, y: sParY }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      initial={reduced ? { scale: 1 } : { scale: 1.18 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Image
                        src={`${member.img}?v=${IMG_V}`}
                        alt={member.name}
                        fill
                        sizes="208px"
                        className="object-cover object-top saturate-[1.12] contrast-[1.05]"
                      />
                    </motion.div>
                  </motion.div>

                  {/* entrance glint — a crisp light sweep across the photo */}
                  {!reduced && (
                    <motion.div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.2) 50%, transparent 58%)",
                      }}
                      initial={{ x: "-135%" }}
                      animate={{ x: "135%" }}
                      transition={{ duration: 0.85, delay: 0.22, ease: "easeOut" }}
                    />
                  )}

                  {/* cursor-tracked light (subtle, not a haze) */}
                  {!reduced && (
                    <motion.div
                      className="pointer-events-none absolute inset-0"
                      style={{ background: glowBg }}
                    />
                  )}
                </div>

                {/* name + role — fade up after the card lands */}
                <motion.div
                  className="px-4 pb-4 pt-1.5"
                  initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div
                    className="text-[15px] font-bold text-white"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {member.name}
                  </div>
                  <div className="mono-label mt-1 text-[var(--color-brand-accent)]">{member.role}</div>
                </motion.div>
              </div>

              {/* pointer arrow */}
              <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-[rgba(229,9,20,0.4)] bg-[var(--color-panel)]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── End-credits section ────────────────────────────────────── */

export function ContributorsAct() {
  const reduced = useReducedMotion();

  return (
    <section
      id="contributors-act"
      className="relative px-6 pb-24 md:px-8"
      style={{
        background:
          "linear-gradient(to bottom, rgba(229,9,20,0.07), transparent 24%), radial-gradient(55% 45% at 50% 32%, rgba(229,9,20,0.06), transparent 70%)",
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        {/* connecting thread — stitches the credits to the finale above */}
        <motion.div
          className="mx-auto w-px origin-top bg-gradient-to-b from-[rgba(229,9,20,0.25)] via-[rgba(229,9,20,0.45)] to-[rgba(229,9,20,0.65)]"
          style={{ height: 72 }}
          initial={reduced ? { scaleY: 1, opacity: 1 } : { scaleY: 0, opacity: 0 }}
          whileInView={{ scaleY: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />

        {/* label */}
        <motion.div
          className="mono-label mb-6 flex items-center justify-center gap-3 text-[var(--color-brand-accent)]"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="inline-block h-px w-10 bg-[var(--color-brand-accent)]" />
          The build crew
          <span className="inline-block h-px w-10 bg-[var(--color-brand-accent)]" />
        </motion.div>

        {/* heading */}
        <h2 className="text-center font-bold">
          <MaskLine>The people behind</MaskLine>
          <MaskLine delay={0.12}>
            every <span className="text-[var(--color-brand-accent)]">answer.</span>
          </MaskLine>
        </h2>

        <motion.p
          className="mx-auto mt-6 max-w-md text-center text-[15px] leading-relaxed text-[var(--color-muted)]"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          Nine engineers from Vimal Jyothi Engineering College. Hover a name — then
          move your cursor over their photo.
        </motion.p>

        {/* name chips — one continuous line on desktop, wraps on smaller screens */}
        <div className="mt-14 flex flex-wrap justify-center gap-3 lg:flex-nowrap">
          {CREW.map((member, i) => (
            <ContributorChip key={member.name} member={member} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
