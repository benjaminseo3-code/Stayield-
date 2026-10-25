/**
 * Placeholder logo mark. TODO(brand): replace with logo-horizontal.png / icon.png from the landing
 * project in /public/brand when they are provided.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#0B1C30" />
      <path
        d="M7 16.5 16 8l9 8.5"
        fill="none"
        stroke="#17B77F"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 15.5V24h11v-8.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
    </svg>
  );
}
