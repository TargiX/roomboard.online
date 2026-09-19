"use client";

import { useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from "motion/react";
import { Lock, MessageSquare, MousePointer2 } from "lucide-react";
import type { StarterId } from "./LandingPage";
import { roomboardSupportMailto } from "@/lib/support";

type StartRoomOptions = { name?: string; source: string; starter?: StarterId };

type LandingLowerProps = {
  isCreating: boolean;
  startRoom: (options: StartRoomOptions) => void;
};

/* ------------------------------------------------------------------ */
/* data                                                                */
/* ------------------------------------------------------------------ */

const useCases = [
  {
    id: "landing-review",
    starterId: "landing-review" as StarterId,
    roomName: "Launch approval",
    label: "Founders & marketers",
    title: "Get the final call before the launch.",
    body: "Put the real page or campaign in one private room, invite one reviewer, and close with a record of exactly what ships.",
    cta: "Start launch approval",
    tint: "teal",
    meta: "material · reviewer · decision record",
  },
  {
    id: "moodboard",
    starterId: "moodboard" as StarterId,
    roomName: "Moodboard decision",
    label: "Brand & creative",
    title: "Choose a visual direction without a messy thread.",
    body: "Put references, notes, and decision criteria in one private room so the conversation stays attached to the material.",
    cta: "Start moodboard",
    tint: "violet",
    meta: "references · criteria · next step",
  },
  {
    id: "blank",
    starterId: "blank" as StarterId,
    roomName: "Untitled review",
    label: "Any visual decision",
    title: "Open a clean room when the material is ready.",
    body: "Use a blank canvas for screenshots, product states, campaign ideas, or design critique that does not need a starter board.",
    cta: "Start blank room",
    tint: "amber",
    meta: "clean canvas · invite links · lock",
  },
];

const faqItems = [
  {
    q: "How do I get back to a room?",
    a: "Rooms you create are remembered in this browser with a creator token. Rooms you join from an invite link are remembered too, and you can copy an owner link for your own backup.",
  },
  {
    q: "Who can see my room?",
    a: "New rooms are private and locked by default. Access comes from the creator token or role-specific invite links, so private rooms are not exposed as an open public directory.",
  },
  {
    q: "How long do rooms stick around?",
    a: "Active rooms are saved durably and can be reopened from this browser or an invite link. When the creator closes a room, it leaves the active flow and stops accepting edits.",
  },
  {
    q: "What can I drop in?",
    a: "Notes, image URLs, file uploads (PNG/JPG/GIF/WebP, up to 10MB each), comments, statuses, and connector lines between cards. It stays focused on visual review, not project management.",
  },
];

const howPanels = [
  {
    num: "01",
    label: "Open",
    title: "Start a private room in one keystroke.",
    body: "Type a name, hit enter. The room opens locked and strictly creator-controlled — no sign-up wall, no onboarding tour.",
    meta: "Locked & private by default",
    img: "/landing/board.jpg",
    alt: "A Roomboard canvas with cards, comments and live cursors",
    chip: { icon: "cursor", text: "Live cursors" },
    tint: "teal",
  },
  {
    num: "02",
    label: "Drop & review",
    title: "Material, comments and status on one canvas.",
    body: "Paste image URLs, upload screenshots, drop sticky notes. Cards snap to a perfect grid and connect with lines.",
    meta: "Images, notes, comments & links",
    img: "/landing/inspect.png",
    alt: "Inspecting a card on the Roomboard canvas",
    chip: { icon: "comment", text: "Comments in context" },
    tint: "violet",
  },
  {
    num: "03",
    label: "Invite & align",
    title: "Realtime presence, then a locked decision.",
    body: "Share an editor or viewer link. Watch cursors move live, agree on the call, and lock the room as the record.",
    meta: "Editor & viewer roles, then lock",
    img: "/landing/dashboard.png",
    alt: "The Roomboard dashboard listing rooms",
    chip: { icon: "lock", text: "Decision locked" },
    tint: "amber",
  },
];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as const;

function wrapRange(min: number, max: number, v: number) {
  const range = max - min;
  return min + ((((v - min) % range) + range) % range);
}

/** Section header: number + growing line + label. */
function SectionHead({ num, label }: { num: string; label: string }) {
  return (
    <motion.div
      className="lx-shead"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.8 }}
      transition={{ staggerChildren: 0.1 }}
    >
      <motion.span
        className="lx-shead__num"
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
        }}
      >
        {num}
      </motion.span>
      <motion.span
        className="lx-shead__line"
        variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.9, ease: EASE } } }}
      />
      <motion.span
        className="lx-shead__label"
        variants={{
          hidden: { opacity: 0, y: 12 },
          show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
        }}
      >
        {label}
      </motion.span>
    </motion.div>
  );
}

/** Magnetic wrapper — element gently follows the pointer, springs back. */
function Magnetic({ children, strength = 0.32 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 160, damping: 16, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 160, damping: 16, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      className="lx-magnetic"
      style={{ x, y }}
      onPointerMove={(event) => {
        const bounds = ref.current?.getBoundingClientRect();
        if (!bounds) return;
        x.set((event.clientX - bounds.left - bounds.width / 2) * strength);
        y.set((event.clientY - bounds.top - bounds.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* 0. scroll progress hairline                                         */
/* ------------------------------------------------------------------ */

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 28, restDelta: 0.001 });
  return <motion.div className="lx-progress" style={{ scaleX }} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* 1. velocity marquee                                                 */
/* ------------------------------------------------------------------ */

const marqueeItems = [
  "Private by default",
  "Invite-only",
  "Realtime cursors",
  "No account needed",
  "Decision lock",
  "Snap-to-grid",
];

function MarqueeContent() {
  return (
    <span className="lx-marquee__chunk" aria-hidden="true">
      {marqueeItems.map((item) => (
        <span className="lx-marquee__item" key={item}>
          {item}
          <span className="lx-marquee__star">✦</span>
        </span>
      ))}
    </span>
  );
}

function VelocityMarquee() {
  const reduced = useReducedMotion();
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const rawVelocity = useVelocity(scrollY);
  const scrollVelocity = useSpring(rawVelocity, { damping: 50, stiffness: 380 });
  const velocityFactor = useTransform(scrollVelocity, [0, 1200], [0, 4.5], { clamp: false });
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduced) return;
    const factor = velocityFactor.get();
    if (factor < 0) direction.current = -1;
    else if (factor > 0) direction.current = 1;
    let moveBy = direction.current * 2.4 * (delta / 1000);
    moveBy += moveBy * Math.abs(factor);
    baseX.set(baseX.get() + moveBy);
  });

  const x = useTransform(baseX, (v) => `${wrapRange(-25, 0, v)}%`);

  return (
    <div className="lx-marquee" aria-hidden="true">
      <motion.div className="lx-marquee__track" style={{ x }}>
        <MarqueeContent />
        <MarqueeContent />
        <MarqueeContent />
        <MarqueeContent />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. statement — scroll-fill kinetic type                             */
/* ------------------------------------------------------------------ */

type StatementWord = { t: string; accent?: boolean; strike?: boolean };

const statementWords: StatementWord[] = [
  { t: "Feedback" },
  { t: "scattered" },
  { t: "across" },
  { t: "threads,", strike: true },
  { t: "DMs", strike: true },
  { t: "and" },
  { t: "screenshots", strike: true },
  { t: "never" },
  { t: "becomes" },
  { t: "a" },
  { t: "decision." },
  { t: "Roomboard" },
  { t: "puts" },
  { t: "the" },
  { t: "material," },
  { t: "the" },
  { t: "people" },
  { t: "and" },
  { t: "the" },
  { t: "call" },
  { t: "in" },
  { t: "one", accent: true },
  { t: "room.", accent: true },
];

function FillWord({
  progress,
  range,
  word,
}: {
  progress: MotionValue<number>;
  range: [number, number];
  word: StatementWord;
}) {
  const opacity = useTransform(progress, range, [0.13, 1]);
  const strike = useTransform(progress, [range[0], range[1] + 0.08], ["0%", "104%"]);

  return (
    <motion.span
      className={`lx-word ${word.accent ? "lx-word--accent" : ""} ${word.strike ? "lx-word--strike" : ""}`}
      style={{ opacity }}
    >
      {word.t}
      {word.strike ? <motion.i className="lx-word__line" style={{ width: strike }} aria-hidden="true" /> : null}{" "}
    </motion.span>
  );
}

function Statement() {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.82", "end 0.52"] });
  const { scrollYProgress: sectionProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const chipAY = useTransform(sectionProgress, [0, 1], [90, -110]);
  const chipBY = useTransform(sectionProgress, [0, 1], [140, -60]);
  const chipCY = useTransform(sectionProgress, [0, 1], [40, -150]);
  const chipARot = useTransform(sectionProgress, [0, 1], [-9, -2]);
  const chipBRot = useTransform(sectionProgress, [0, 1], [7, 12]);

  const total = statementWords.length;

  return (
    <section className="lx-statement" ref={ref}>
      <motion.div
        className="lx-statement__chip lx-statement__chip--a"
        style={{ y: chipAY, rotate: chipARot }}
        aria-hidden="true"
      >
        <div className="bar">
          <i />
          <i />
          <i />
        </div>
        <div className="img">
          <span className="nav">
            <b />
            <em />
            <em />
            <em />
          </span>
          <span className="hero" />
          <span className="ln ln--a" />
          <span className="ln ln--b" />
          <span className="cta" />
        </div>
        <span className="cap">final_v2_REAL.png</span>
      </motion.div>
      <motion.div
        className="lx-statement__chip lx-statement__chip--b"
        style={{ y: chipBY, rotate: chipBRot }}
        aria-hidden="true"
      >
        <b>#design-feedback</b>
        <span>“which version are we shipping??”</span>
        <em>47 replies · unresolved</em>
      </motion.div>
      <motion.div className="lx-statement__chip lx-statement__chip--c" style={{ y: chipCY }} aria-hidden="true">
        <span className="dot" />
        sent 3 weeks ago · no decision
      </motion.div>

      <SectionHead num="01" label="The problem" />
      <h2 className="lx-statement__text">
        {statementWords.map((word, index) => (
          <FillWord
            key={`${word.t}-${index}`}
            progress={scrollYProgress}
            range={[(index / total) * 0.85, (index / total) * 0.85 + 0.16]}
            word={word}
          />
        ))}
      </h2>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. how it works — pinned horizontal gallery                         */
/* ------------------------------------------------------------------ */

function HowPanel({
  panel,
  index,
  progress,
}: {
  panel: (typeof howPanels)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const slice = 1 / howPanels.length;
  const imgY = useTransform(progress, [index * slice, (index + 1) * slice], [36, -36]);
  const ghostX = useTransform(progress, [index * slice, (index + 1) * slice], [60, -60]);

  return (
    <div className={`lx-how__panel lx-how__panel--${panel.tint}`}>
      <div className="lx-how__panel-inner">
        <motion.div className="lx-how__ghost" style={{ x: ghostX }} aria-hidden="true">
          {panel.num}
        </motion.div>
        <div className="lx-how__copy">
          <div className="lx-how__step">
            <span className="lx-how__step-num">{panel.num}</span>
            <span className="lx-how__step-label">{panel.label}</span>
          </div>
          <h3>{panel.title}</h3>
          <p>{panel.body}</p>
          <div className="lx-how__meta">
            <i />
            {panel.meta}
          </div>
        </div>
        <div className="lx-how__shotwrap">
          <motion.div className="lx-how__shot" style={{ y: imgY }}>
            <div className="lx-how__chrome">
              <span />
              <span />
              <span />
              <b>roomboard.online</b>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panel.img} alt={panel.alt} loading="lazy" />
            <div className={`lx-how__chip lx-how__chip--${panel.tint}`}>
              {panel.chip.icon === "cursor" && <MousePointer2 size={13} />}
              {panel.chip.icon === "comment" && <MessageSquare size={13} />}
              {panel.chip.icon === "lock" && <Lock size={13} />}
              {panel.chip.text}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0.04, 0.96], ["0vw", `-${(howPanels.length - 1) * 100}vw`]);
  const barScale = useTransform(scrollYProgress, [0.04, 0.96], [0, 1]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.min(howPanels.length - 1, Math.max(0, Math.round(((v - 0.04) / 0.92) * (howPanels.length - 1))));
    setStep(next);
  });

  return (
    <section className="lx-how" id="how">
      <div className="lx-how__wrap" ref={wrapRef}>
        <div className="lx-how__sticky">
          <div className="lx-how__head">
            <SectionHead num="02" label="How it works" />
            <motion.h2
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              Three steps. One decision.
            </motion.h2>
          </div>

          <motion.div className="lx-how__track" style={{ x }}>
            {howPanels.map((panel, index) => (
              <HowPanel key={panel.num} panel={panel} index={index} progress={scrollYProgress} />
            ))}
          </motion.div>

          <div className="lx-how__rail" aria-hidden="true">
            <span className="lx-how__counter">
              <b>{howPanels[step].num}</b> / 03
            </span>
            <span className="lx-how__bar">
              <motion.i style={{ scaleX: barScale }} />
            </span>
            <span className="lx-how__railhint">scroll</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. features — editorial rows with tilt stages                       */
/* ------------------------------------------------------------------ */

function TiltStage({ children, tint }: { children: React.ReactNode; tint: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 140, damping: 18 });
  const glowX = useSpring(useMotionValue(50), { stiffness: 120, damping: 20 });
  const glowY = useSpring(useMotionValue(50), { stiffness: 120, damping: 20 });
  const glow = useTransform(
    [glowX, glowY],
    ([gx, gy]) => `radial-gradient(420px circle at ${gx}% ${gy}%, var(--lx-stage-glow), transparent 70%)`,
  );

  return (
    <motion.div
      ref={ref}
      className={`lx-stage lx-stage--${tint}`}
      style={{ rotateX, rotateY, transformPerspective: 1100 }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.8, ease: EASE }}
      onPointerMove={(event) => {
        const bounds = ref.current?.getBoundingClientRect();
        if (!bounds) return;
        const px = (event.clientX - bounds.left) / bounds.width;
        const py = (event.clientY - bounds.top) / bounds.height;
        rotateY.set((px - 0.5) * 10);
        rotateX.set((0.5 - py) * 8);
        glowX.set(px * 100);
        glowY.set(py * 100);
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
        glowX.set(50);
        glowY.set(50);
      }}
    >
      <motion.div className="lx-stage__glow" style={{ background: glow }} aria-hidden="true" />
      {children}
    </motion.div>
  );
}

function SpecCursors() {
  const paths = [
    { name: "Maya", color: "#bd6a55", x: [12, 130, 64, 12], y: [18, 60, 132, 18], d: 9 },
    { name: "Jules", color: "#7d9c85", x: [180, 60, 210, 180], y: [120, 40, 26, 120], d: 11 },
    { name: "Theo", color: "#8296b8", x: [90, 200, 30, 90], y: [170, 130, 80, 170], d: 13 },
  ];

  return (
    <div className="lx-spec-cursors" aria-hidden="true">
      <div className="lx-spec-cursors__card">
        <div className="head" />
        <div className="body" />
      </div>
      {paths.map((cursor) => (
        <motion.div
          key={cursor.name}
          className="lx-spec-cursor"
          style={{ color: cursor.color }}
          animate={{ x: cursor.x, y: cursor.y }}
          transition={{ duration: cursor.d, repeat: Infinity, ease: "easeInOut" }}
        >
          <MousePointer2 size={15} fill="currentColor" />
          <span style={{ background: cursor.color }}>{cursor.name}</span>
        </motion.div>
      ))}
    </div>
  );
}

function SpecRoles() {
  const roles = [
    {
      initials: "YO",
      name: "You",
      sub: "creator token",
      pill: "Owner",
      cls: "own",
      bg: "linear-gradient(135deg,#c9a158,#8a6a33)",
    },
    { initials: "M", name: "Maya", sub: "editor link", pill: "Editor", cls: "edit", bg: "#bd6a55" },
    { initials: "T", name: "Theo", sub: "viewer link", pill: "Viewer", cls: "view", bg: "#7d9c85" },
  ];

  return (
    <motion.div
      className="lx-spec-roles"
      aria-hidden="true"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      transition={{ staggerChildren: 0.14 }}
    >
      {roles.map((role) => (
        <motion.div
          key={role.name}
          className="lx-spec-role"
          variants={{
            hidden: { opacity: 0, x: 44 },
            show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } },
          }}
        >
          <span className="av" style={{ background: role.bg }}>
            {role.initials}
          </span>
          <span className="who">
            <b>{role.name}</b>
            <i>{role.sub}</i>
          </span>
          <span className={`pill ${role.cls}`}>{role.pill}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

function SpecLock() {
  return (
    <div className="lx-spec-lock" aria-hidden="true">
      <div className="ringwrap">
        <motion.span
          className="pulse"
          animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.span
          className="pulse"
          animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 1.1 }}
        />
        <div className="ring">
          <Lock size={22} />
        </div>
      </div>
      <b>Decision locked</b>
      <span>Landing v2 · 4 approved</span>
    </div>
  );
}

function SpecThread() {
  const comments = [
    { initials: "M", bg: "#bd6a55", name: "Maya", text: "Love the new headline — can we A/B the CTA color?" },
    { initials: "T", bg: "#7d9c85", name: "Theo", text: "Option B feels more scannable on mobile." },
    { initials: "J", bg: "#8296b8", name: "Jules", text: "Approved — shipping B. Locking the room." },
  ];

  return (
    <motion.div
      className="lx-spec-thread"
      aria-hidden="true"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      transition={{ staggerChildren: 0.2 }}
    >
      {comments.map((comment) => (
        <motion.div
          key={comment.name}
          className="lx-spec-comment"
          variants={{
            hidden: { opacity: 0, y: 22, scale: 0.96 },
            show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE } },
          }}
        >
          <span className="av" style={{ background: comment.bg }}>
            {comment.initials}
          </span>
          <span className="tx">
            <b>{comment.name}</b>
            {comment.text}
          </span>
        </motion.div>
      ))}
      <motion.div
        className="lx-spec-typing"
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 0.3 } } }}
      >
        <motion.i animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity }} />
        <motion.i animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity, delay: 0.18 }} />
        <motion.i animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.1, repeat: Infinity, delay: 0.36 }} />
        <span>Sarah is typing</span>
      </motion.div>
    </motion.div>
  );
}

const featureRows = [
  {
    idx: "(01)",
    kicker: "Presence",
    title: "See exactly who’s looking where.",
    body: "Realtime cursors and selections make feedback feel like a room, not email. You watch the click happen.",
    tags: ["live cursors", "selections", "presence"],
    tint: "teal",
    spec: <SpecCursors />,
  },
  {
    idx: "(02)",
    kicker: "Access",
    title: "Invite by role, not by account.",
    body: "Send an editor or viewer link. No sign-up wall, no leaked access — the creator token always stays with you.",
    tags: ["editor link", "viewer link", "creator token"],
    tint: "violet",
    spec: <SpecRoles />,
  },
  {
    idx: "(03)",
    kicker: "Decision",
    title: "Lock the room. That’s the record.",
    body: "When the call is made, lock it. The board becomes the artifact everyone agreed on — not a buried thread.",
    tags: ["lock", "statuses", "approved"],
    tint: "amber",
    spec: <SpecLock />,
  },
  {
    idx: "(04)",
    kicker: "Context",
    title: "Comments stay on the card.",
    body: "No parallel threads. Every note lives next to the material it’s about, so nothing gets lost in translation.",
    tags: ["inline comments", "@mentions", "history"],
    tint: "rose",
    spec: <SpecThread />,
  },
];

function Features() {
  return (
    <section className="lx-feat">
      <div className="lx-feat__head">
        <SectionHead num="03" label="The toolkit" />
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          Four things that turn feedback
          <br />
          <em>into a decision.</em>
        </motion.h2>
      </div>

      {featureRows.map((row, index) => (
        <div className={`lx-feat__row ${index % 2 === 1 ? "lx-feat__row--rev" : ""}`} key={row.kicker}>
          <motion.div
            className="lx-feat__copy"
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="lx-feat__idx">
              <b>{row.idx}</b> — {row.kicker}
            </div>
            <h3>{row.title}</h3>
            <p>{row.body}</p>
            <div className="lx-feat__tags">
              {row.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </motion.div>
          <TiltStage tint={row.tint}>{row.spec}</TiltStage>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. use cases — sticky deck                                          */
/* ------------------------------------------------------------------ */

function DeckCard({
  useCase,
  index,
  total,
  progress,
  isCreating,
  startRoom,
}: {
  useCase: (typeof useCases)[number];
  index: number;
  total: number;
  progress: MotionValue<number>;
  isCreating: boolean;
  startRoom: (options: StartRoomOptions) => void;
}) {
  const targetScale = 1 - (total - 1 - index) * 0.045;
  const scale = useTransform(progress, [index / total, 1], [1, targetScale]);
  const dim = useTransform(
    progress,
    [(index + 0.35) / total, (index + 1) / total],
    [0, index === total - 1 ? 0 : 0.42],
  );

  return (
    <div className="lx-deck__slot" style={{ top: `${104 + index * 26}px` }}>
      <motion.article className={`lx-deck__card lx-deck__card--${useCase.tint}`} style={{ scale }}>
        <motion.div className="lx-deck__dim" style={{ opacity: dim }} aria-hidden="true" />
        <span className="lx-deck__num" aria-hidden="true">
          0{index + 1}
        </span>
        <div className="lx-deck__body">
          <span className="lx-deck__label">{useCase.label}</span>
          <h3>{useCase.title}</h3>
          <p>{useCase.body}</p>
          <span className="lx-deck__meta">{useCase.meta}</span>
        </div>
        <div className="lx-deck__side">
          <Magnetic strength={0.25}>
            <button
              className="lx-deck__btn"
              type="button"
              disabled={isCreating}
              onClick={() =>
                startRoom({ name: useCase.roomName, source: `use_case_${useCase.id}`, starter: useCase.starterId })
              }
            >
              {useCase.cta}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </Magnetic>
        </div>
      </motion.article>
    </div>
  );
}

function UseCaseDeck({ isCreating, startRoom }: LandingLowerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  return (
    <section className="lx-uc" id="use-cases">
      <div className="lx-uc__head">
        <SectionHead num="04" label="Use cases" />
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          Pick the right shape for the job.
        </motion.h2>
      </div>
      <div className="lx-deck" ref={ref}>
        {useCases.map((useCase, index) => (
          <DeckCard
            key={useCase.id}
            useCase={useCase}
            index={index}
            total={useCases.length}
            progress={scrollYProgress}
            isCreating={isCreating}
            startRoom={startRoom}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. FAQ                                                              */
/* ------------------------------------------------------------------ */

function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="lx-faq" id="faq">
      <div className="lx-faq__grid">
        <div className="lx-faq__left">
          <SectionHead num="05" label="Security & access" />
          <motion.h2
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            Private by default.
            <br />
            <em>Yours to reopen.</em>
          </motion.h2>
          <p className="lx-faq__note">No accounts, no public directory. Access lives in links you control.</p>
        </div>
        <div className="lx-faq__list">
          {faqItems.map((item, index) => (
            <motion.div
              className={`lx-faq__item ${open === index ? "is-open" : ""}`}
              key={item.q}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.55, ease: EASE, delay: index * 0.06 }}
            >
              <button type="button" onClick={() => setOpen(open === index ? -1 : index)} aria-expanded={open === index}>
                <span>{item.q}</span>
                <motion.span
                  className="lx-faq__plus"
                  animate={{ rotate: open === index ? 45 : 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  aria-hidden="true"
                >
                  +
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open === index && (
                  <motion.div
                    className="lx-faq__answer"
                    key="answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    <p>{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 7. final CTA                                                        */
/* ------------------------------------------------------------------ */

function StaggerLine({ text, className }: { text: string; className?: string }) {
  return (
    <motion.span
      className={`lx-stagger ${className ?? ""}`}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.7 }}
      transition={{ staggerChildren: 0.032 }}
      aria-label={text}
    >
      {text.split("").map((char, index) => (
        <span className="lx-stagger__mask" key={index} aria-hidden="true">
          <motion.span
            className="lx-stagger__char"
            variants={{
              hidden: { y: "112%", rotate: 5 },
              show: { y: "0%", rotate: 0, transition: { duration: 0.72, ease: EASE } },
            }}
          >
            {char}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

function FinalCta({ isCreating, startRoom }: LandingLowerProps) {
  return (
    <section className="lx-final" id="rooms">
      <div className="lx-final__rule" aria-hidden="true" />

      <div className="lx-final__eyebrow">
        <span className="lx-final__pulse" aria-hidden="true" />
        Ready when you are
      </div>
      <h2 className="lx-final__title">
        <StaggerLine text="Ready to" />
        <br />
        <StaggerLine text="decide?" className="lx-stagger--accent" />
      </h2>

      <motion.div
        initial={{ opacity: 0, y: 26 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.5 }}
      >
        <Magnetic>
          <button
            className="lx-final__btn"
            type="button"
            disabled={isCreating}
            onClick={() => startRoom({ source: "final_cta" })}
          >
            <span>{isCreating ? "Opening…" : "Start launch approval"}</span>
            <span className="arr" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </button>
        </Magnetic>
      </motion.div>

      <motion.div
        className="lx-final__note"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.8 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        Private by default · No account needed · 30 seconds to start
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 8. footer                                                           */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="lx-footer">
      <div className="lx-footer__inner">
        <div className="lx-footer__top">
          <div className="lx-footer__brand">
            <span className="lx-footer__mark">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="2" y="2" width="5" height="5" rx="1" />
                <rect x="9" y="2" width="5" height="5" rx="1" />
                <rect x="2" y="9" width="5" height="5" rx="1" />
                <rect x="9" y="9" width="5" height="5" rx="1" />
              </svg>
            </span>
            Roomboard
          </div>
          <nav className="lx-footer__links">
            <a href="#how">How it works</a>
            <a href="#use-cases">Use cases</a>
            <a href="#faq">FAQ</a>
            <a href="/privacy">Privacy</a>
            <a href={roomboardSupportMailto}>Support</a>
          </nav>
          <span className="lx-footer__meta">© 2026 roomboard.online</span>
        </div>
      </div>
      <motion.div
        className="lx-footer__word"
        aria-hidden="true"
        initial={{ y: "34%", opacity: 0 }}
        whileInView={{ y: "0%", opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1, ease: EASE }}
      >
        Roomboard
      </motion.div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* root                                                                */
/* ------------------------------------------------------------------ */

export function LandingLower({ isCreating, startRoom }: LandingLowerProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.115 });
    return () => lenis.destroy();
  }, [reduced]);

  return (
    <div className="lx-lower">
      <ScrollProgress />
      <VelocityMarquee />
      <Statement />
      <HowItWorks />
      <Features />
      <UseCaseDeck isCreating={isCreating} startRoom={startRoom} />
      <Faq />
      <FinalCta isCreating={isCreating} startRoom={startRoom} />
      <Footer />
    </div>
  );
}
