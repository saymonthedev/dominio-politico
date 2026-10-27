/** Ícones de traço (24×24), desenhados para o projeto. */
const PATHS: Record<string, string> = {
  ballot: "M4 10h16v10H4z M8 10V4h8v6 M10 7h4 M9 15h6",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 20v-2a4 4 0 0 0-3-3.9 M16 2.1a4 4 0 0 1 0 7.8",
  landmark: "M3 21h18 M5 21V11 M9 21V11 M15 21V11 M19 21V11 M2 11l10-7 10 7z",
  chart: "M3 3v18h18 M7 15l4-4 3 3 6-7",
  scale: "M12 3v18 M5 7h14 M5 7l-3 7a3 3 0 0 0 6 0z M19 7l-3 7a3 3 0 0 0 6 0z M8 21h8",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  map: "M9 3l6 3 6-3v15l-6 3-6-3-6 3V6z M9 3v15 M15 6v15",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z M17 8a5 5 0 0 1 0 8 M20 5a9 9 0 0 1 0 14",
  gavel: "M14 13l-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10 M16 16l6-6 M8 8l6-6 M9 7l8 8 M7 9l8 8",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z M14 3v6h6 M8 13h8 M8 17h5",
  flag: "M4 22V4 M4 4h13l-2 4 2 4H4",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3",
  coins: "M9 9a6 3 0 1 0 12 0 6 3 0 1 0-12 0 M3 15a6 3 0 0 0 12 0 M3 15V9a6 3 0 0 1 6-3 M15 15v4a6 3 0 0 1-12 0v-4",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  check: "M5 12l5 5L20 7",
  chevron: "M6 9l6 6 6-6",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5 M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2",
  alert: "M12 3l10 18H2z M12 10v4 M12 17.5v.5",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 11v6 M12 7.5v.5",
  mail: "M3 5h18v14H3z M3 6l9 7 9-7",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  x: "M6 6l12 12 M18 6L6 18",
  download: "M12 3v12 M7 10l5 5 5-5 M4 21h16",
  trash: "M3 6h18 M8 6V4h8v2 M6 6l1 15h10l1-15 M10 11v6 M14 11v6",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
  database: "M4 6a8 3 0 1 0 16 0 8 3 0 1 0-16 0 M4 6v12a8 3 0 0 0 16 0V6 M4 12a8 3 0 0 0 16 0",
  key: "M15 7a4 4 0 1 1-3.5 6L4 20.5 M7 17.5l2 2 M10 14.5l2 2",
  cookie: "M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5z M8.5 10.5v.5 M15.5 15.5v.5 M10.5 16v.5",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  briefcase: "M3 7h18v13H3z M8 7V4h8v3 M3 13h18",
  pin: "M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  star: "M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21.1l1.5-7L2 9.3l7-.8z",
  home: "M3 11l9-8 9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  play: "M6 4l14 8-14 8z",
  plus: "M12 5v14 M5 12h14",
  calendar: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  newspaper: "M4 4h13v16H6a2 2 0 0 1-2-2z M17 8h3v10a2 2 0 0 1-2 2 M8 8h5 M8 12h5 M8 16h5",
};

export function Icon({ name, size = 20, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(PATHS[name] ?? "").split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}
