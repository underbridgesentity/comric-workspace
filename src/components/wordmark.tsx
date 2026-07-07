export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const scale = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  return (
    <div className="flex items-baseline gap-2 select-none">
      <span
        className={`font-display font-black tracking-tight text-ink ${scale}`}
        style={{ fontWeight: 900 }}
      >
        COMRiC
      </span>
      <span className="font-display text-[10px] font-bold tracking-[0.25em] text-cyber">
        WORKSPACE
      </span>
    </div>
  );
}
