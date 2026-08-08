/**
 * Subtle regional landmark line art for the language cards.
 *
 * Drawn in the same idiom as components/common/Icon — single-weight `currentColor`
 * strokes, round joins — so the cards read as part of the existing icon system
 * rather than as imported clip art. A wide 64×40 viewBox gives each landmark room
 * to stay recognisable at the small size the card uses.
 *
 * Purely decorative: `aria-hidden` throughout, because the card already announces
 * the language by name.
 */

const Wheel = () => (
  <>
    <circle cx="32" cy="20" r="13" />
    <circle cx="32" cy="20" r="4.5" />
    {Array.from({ length: 8 }).map((_, i) => {
      const angle = (Math.PI / 4) * i;
      return (
        <line
          key={i}
          x1={32 + Math.cos(angle) * 4.5}
          y1={20 + Math.sin(angle) * 4.5}
          x2={32 + Math.cos(angle) * 13}
          y2={20 + Math.sin(angle) * 13}
        />
      );
    })}
  </>
);

const LANDMARKS = {
  /* English — a globe, since the language belongs to no single region. */
  globe: (
    <>
      <circle cx="32" cy="20" r="13" />
      <ellipse cx="32" cy="20" rx="5.5" ry="13" />
      <path d="M19 20h26M22.5 12.5h19M22.5 27.5h19" />
    </>
  ),

  /* Hindi — Taj Mahal, Agra. */
  tajMahal: (
    <>
      <path d="M12 34h40M16 34v-4h32v4" />
      <path d="M22 30v-9h20v9" />
      <path d="M24 21c0-5 3.6-8 8-8s8 3 8 8" />
      <path d="M32 13v-3" />
      <path d="M29 30v-4.5a3 3 0 0 1 6 0V30" />
      <path d="M17 30V17h3v13M18.5 17v-2.5" />
      <path d="M44 30V17h3v13M45.5 17v-2.5" />
    </>
  ),

  /* Tamil — Meenakshi temple gopuram, Madurai. */
  gopuram: (
    <>
      <path d="M16 34h32" />
      <path d="M19 34v-4h26v4M21 30v-4h22v4M23 26v-4h18v4M25 22v-4h14v4M27 18v-4h10v4" />
      <path d="M28 14l1.5-3h5L36 14" />
      <path d="M30 34v-6h4v6" />
    </>
  ),

  /* Telugu — Charminar, Hyderabad. */
  charminar: (
    <>
      <path d="M13 34h38" />
      <path d="M20 34V16h24v18M20 21h24" />
      <path d="M23 34v-5.5a3 3 0 0 1 6 0V34M35 34v-5.5a3 3 0 0 1 6 0V34" />
      <path d="M17 16V8h3.5v8M18.75 8V5" />
      <path d="M43.5 16V8H47v8M45.25 8V5" />
    </>
  ),

  /* Kannada — Mysore Palace. */
  mysorePalace: (
    <>
      <path d="M10 34h44" />
      <path d="M14 34V22h36v12" />
      <path d="M26 22v-7h12v7" />
      <path d="M27 15c0-4 2.2-6.5 5-6.5s5 2.5 5 6.5M32 8.5V5.5" />
      <path d="M17 22c0-2.5 1.4-4 3-4s3 1.5 3 4M41 22c0-2.5 1.4-4 3-4s3 1.5 3 4" />
      <path d="M18 34v-6M24 34v-6M40 34v-6M46 34v-6" />
    </>
  ),

  /* Marathi — Gateway of India, Mumbai. */
  gatewayOfIndia: (
    <>
      <path d="M12 34h40" />
      <path d="M16 34V12h32v22M16 12h32" />
      <path d="M25 34V22a7 7 0 0 1 14 0v12" />
      <path d="M18 12V8h4v4M42 12V8h4v4" />
      <path d="M19 8c0-1.6.9-2.5 1-2.5s1 .9 1 2.5M43 8c0-1.6.9-2.5 1-2.5s1 .9 1 2.5" />
    </>
  ),

  /* Bengali — Howrah Bridge, Kolkata. */
  howrahBridge: (
    <>
      <path d="M6 28h52" />
      <path d="M18 28V8M46 28V8M18 8h28" />
      <path d="M18 28l28-20M46 28L18 8" />
      <path d="M6 32h52" />
    </>
  ),

  /* Gujarati — Statue of Unity, Narmada. */
  statueOfUnity: (
    <>
      <path d="M18 36h28M22 36v-5h20v5" />
      <circle cx="32" cy="9" r="3" />
      <path d="M27 31c0-8 1-13 5-13s5 5 5 13" />
      <path d="M28.5 14.5L24 20M35.5 14.5L40 20" />
      <path d="M29 24h6" />
    </>
  ),

  /* Odia — Konark sun-temple chariot wheel. */
  konarkWheel: <Wheel />,

  /* Malayalam — a Kerala houseboat on the backwaters. */
  houseboat: (
    <>
      <path d="M10 28c4 4 36 4 42 0" />
      <path d="M16 26v-3c0-3.5 4.5-6 13-6s13 2.5 13 6v3" />
      <path d="M52 28l5-6" />
      <path d="M20 22h18" />
      <path d="M10 33h14M30 33h12M46 33h8" />
    </>
  ),

  /* Punjabi — the Golden Temple, Amritsar. */
  goldenTemple: (
    <>
      <path d="M8 32h48M12 36h12M32 36h14" />
      <path d="M20 32v-7h24v7" />
      <path d="M25 25V16h14v9" />
      <path d="M26 16c0-5 2.7-8 6-8s6 3 6 8M32 8V5" />
      <path d="M21 25v-4.5M43 25v-4.5" />
      <path d="M19 20.5c0-2 1.3-3 2-3s2 1 2 3M41 20.5c0-2 1.3-3 2-3s2 1 2 3" />
    </>
  ),

  /* Assamese — the one-horned rhino of Kaziranga. */
  rhino: (
    <>
      <path d="M14 29c-2-6 1-11 8-12.5 5-1 11-1 14.5 1C40 19 42 22 42 26" />
      <path d="M42 27c2.5-1 4.5-3.5 4.5-6.5 0-2.5-1.5-3.5-3.5-3.5" />
      <path d="M45.5 18.5c0-3 1-4.5 2.5-4.5" />
      <path d="M38 17c0-2 1-3.5 2.5-3.5" />
      <path d="M18 29v4M25 30v3M34 30v3M40 28v4" />
      <path d="M26 18.5c1 6 1 9.5 0 12.5" />
      <circle cx="41.5" cy="21" r=".9" />
    </>
  ),
};

export default function LandmarkArt({ name, className = '' }) {
  const art = LANDMARKS[name] || LANDMARKS.globe;

  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}
