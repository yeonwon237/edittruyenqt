import { PORTRAIT_VARIANTS, pickPortraitVariant } from "@/lib/roleplay/assets/portraits";

function Eyes({ style, outline }) {
  if (style === "sparkle") return <>
    <path d="M22 27 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2Z" fill={outline} />
    <path d="M38 27 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2Z" fill={outline} />
  </>;
  if (style === "sharp") return <>
    <rect x="18" y="28" width="10" height="5" rx="2.5" fill={outline} transform="rotate(-6 23 30)" />
    <rect x="36" y="28" width="10" height="5" rx="2.5" fill={outline} transform="rotate(6 41 30)" />
  </>;
  return <>
    <circle cx="23" cy="30" r="4.5" fill={outline} />
    <circle cx="24.5" cy="28.5" r="1.4" fill="#fff" />
    <circle cx="41" cy="30" r="4.5" fill={outline} />
    <circle cx="42.5" cy="28.5" r="1.4" fill="#fff" />
  </>;
}

function Mouth({ style, outline }) {
  if (style === "smile") return <path d="M24 40 Q32 47 40 40" stroke={outline} strokeWidth="3" fill="none" strokeLinecap="round" />;
  if (style === "smirk") return <path d="M24 41 Q32 44 40 38" stroke={outline} strokeWidth="3" fill="none" strokeLinecap="round" />;
  return <line x1="25" y1="41" x2="39" y2="41" stroke={outline} strokeWidth="3" strokeLinecap="round" />;
}

export default function PortraitSvg({ seed, variantId = null, size = 56, className = "" }) {
  const variant = (variantId && PORTRAIT_VARIANTS.find((item) => item.id === variantId)) || pickPortraitVariant(seed);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label="portrait">
      <circle cx="32" cy="34" r="24" fill={variant.outline} />
      <circle cx="32" cy="33" r="21" fill={variant.fill} stroke={variant.outline} strokeWidth="3" />
      <path d="M14 20 Q32 4 50 20 Q46 12 32 10 Q18 12 14 20Z" fill={variant.outline} />
      <circle cx="32" cy="12" r="4" fill={variant.accent} stroke={variant.outline} strokeWidth="2" />
      <Eyes style={variant.eyeStyle} outline={variant.outline} />
      <Mouth style={variant.mouthStyle} outline={variant.outline} />
    </svg>
  );
}
