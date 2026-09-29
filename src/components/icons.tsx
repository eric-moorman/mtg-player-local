type IconProps = { size?: number };

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function IconLobby({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="7.2" cy="7.5" r="2.7" />
      <circle cx="14" cy="9.2" r="2.2" />
      <path d="M2.6 17c.6-2.8 2.3-4.4 4.6-4.4s4 1.6 4.6 4.4" />
      <path d="M12.4 17c.4-2 1.6-3.3 3.4-3.3s3 1.3 3.4 3.3" />
    </svg>
  );
}

export function IconDeck({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="4.3" y="5.6" width="10.4" height="13" rx="1.6" transform="rotate(-9 9.5 12)" />
      <rect x="5.6" y="3.4" width="10.4" height="13" rx="1.6" />
    </svg>
  );
}

export function IconTable({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <rect x="2.8" y="2.8" width="14.4" height="14.4" rx="2.2" />
      <path d="M10 2.8v14.4M2.8 10h14.4" />
    </svg>
  );
}

export function IconSettings({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <circle cx="10" cy="10" r="2.7" />
      <path d="M10 2.6v2.1M10 15.3v2.1M17.4 10h-2.1M4.7 10H2.6M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5M15.2 15.2l-1.5-1.5M6.3 6.3L4.8 4.8" />
    </svg>
  );
}

export function IconFlag({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base}>
      <path d="M4.5 2.5v15" />
      <path d="M4.5 3.3c2-.9 3.6-.9 5.4 0 1.8.9 3.4.9 5.4 0v7.4c-2 .9-3.6.9-5.4 0-1.8-.9-3.4-.9-5.4 0Z" />
    </svg>
  );
}

export function IconChevron({ size = 14, direction = "left" }: IconProps & { direction?: "left" | "right" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base} style={{ transform: direction === "right" ? "scaleX(-1)" : undefined }}>
      <path d="M12.5 4.5l-6 5.5 6 5.5" />
    </svg>
  );
}
