import type { ReactNode } from "react";

export type IconName =
  | "search"
  | "pin"
  | "shield"
  | "clock"
  | "star"
  | "laptop"
  | "wifi"
  | "printer"
  | "database"
  | "bug"
  | "home"
  | "building"
  | "headset"
  | "check"
  | "menu"
  | "close"
  | "bell"
  | "user"
  | "calendar"
  | "alert"
  | "tool";

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

const paths: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </>
  ),
  shield: (
    <path d="M12 3l7 3v6c0 4.5-2.8 7.2-7 9-4.2-1.8-7-4.5-7-9V6l7-3z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5L15 15" />
    </>
  ),
  star: <path d="M12 3.5l2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.8 7.5 17.4l.9-5.1L4.8 8.8l5-.7L12 3.5z" />,
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2.5 18.5h19" />
    </>
  ),
  wifi: (
    <>
      <path d="M5 10a9 9 0 0 1 14 0" />
      <path d="M8 13a5 5 0 0 1 8 0" />
      <path d="M12 17h.01" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V4h10v4" />
      <rect x="5" y="8" width="14" height="8" rx="1.5" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  bug: (
    <>
      <path d="M8 9a4 4 0 0 1 8 0v5a4 4 0 0 1-8 0V9z" />
      <path d="M4 10l4 1M20 10l-4 1M4 16l4-1M20 16l-4-1M12 5V3" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10.5V20h12v-9.5" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 7h2M12 7h2M8 11h2M12 11h2M8 15h2M12 15h2" />
    </>
  ),
  headset: (
    <>
      <path d="M4 13a8 8 0 0 1 16 0" />
      <rect x="3" y="13" width="4" height="6" rx="1" />
      <rect x="17" y="13" width="4" height="6" rx="1" />
      <path d="M20 16v2a3 3 0 0 1-3 3h-3" />
    </>
  ),
  check: <path d="M5 12.5l4.2 4.2L19 7.5" />,
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3 3.8-4.5 7-4.5S17.6 16 19 19" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4l8 14H4L12 4z" />
      <path d="M12 10v4M12 16.5h.01" />
    </>
  ),
  tool: (
    <>
      <path d="M14 7a3 3 0 0 0-4 4L4 17l3 3 6-6a3 3 0 0 0 4-4l-2.5 2.5L13 11l1.5-1.5L17 7" />
    </>
  ),
};

const categoryIcons: Record<string, IconName> = {
  repair: "laptop",
  network: "wifi",
  print: "printer",
  data: "database",
  security: "bug",
  smart: "home",
  business: "building",
  support: "headset",
};

export function CategoryMark({ id }: { id: string }) {
  return (
    <span className={`mark mark-${id}`}>
      <Icon name={categoryIcons[id] ?? "tool"} />
    </span>
  );
}
