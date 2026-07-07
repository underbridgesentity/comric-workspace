/**
 * COMRiC logo lockup: geometric wordmark with the WiFi-signal mark
 * radiating from the dot of the "i" toward the upper right.
 * Per brand guide the logo renders only in black or white — driven by
 * currentColor so it inherits ink colour in both themes.
 */
export function ComricLogo({
  className = "",
  size = 20,
}: {
  className?: string;
  /** wordmark cap height in px */
  size?: number;
}) {
  const fs = size;
  return (
    <span
      className={`relative inline-flex items-baseline select-none ${className}`}
      style={{
        fontFamily: "var(--font-archivo)",
        fontWeight: 900,
        fontSize: fs,
        letterSpacing: "-0.02em",
        lineHeight: 1,
        // headroom for the wifi arcs
        paddingTop: fs * 0.55,
      }}
      aria-label="COMRiC"
    >
      <span>COMR</span>
      <span className="relative">
        i
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          style={{
            position: "absolute",
            width: fs * 1.45,
            height: fs * 1.45,
            left: "-2%",
            top: -fs * 1.3,
            overflow: "visible",
          }}
        >
          {/* three wifi arcs centred on the i-dot, opening up-right */}
          <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="13">
            <path d="M 25.2 50.5 A 30 30 0 0 1 49.5 74.8" />
            <path d="M 29.6 25.8 A 55 55 0 0 1 74.2 70.5" />
            <path d="M 33.9 1.2 A 80 80 0 0 1 98.8 66.1" />
          </g>
        </svg>
      </span>
      <span>C</span>
    </span>
  );
}
