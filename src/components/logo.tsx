/* eslint-disable @next/next/no-img-element */
/**
 * Official COMRiC logo (wordmark + WiFi mark). Per brand guide the logo
 * renders only in black or white: the white asset serves the dark theme,
 * the black asset the light theme.
 * Source PNGs: /public/logo/comric-{black,white}.png (1818x649).
 */
export function ComricLogo({
  className = "",
  size = 20,
}: {
  className?: string;
  /** rendered logo height in px */
  size?: number;
}) {
  const ratio = 1818 / 649;
  const style = { height: size, width: size * ratio };
  return (
    <span className={`inline-flex select-none ${className}`} aria-label="COMRiC">
      <img
        src="/logo/comric-black.png"
        alt="COMRiC"
        style={style}
        className="block dark:hidden"
      />
      <img
        src="/logo/comric-white.png"
        alt=""
        aria-hidden
        style={style}
        className="hidden dark:block"
      />
    </span>
  );
}
