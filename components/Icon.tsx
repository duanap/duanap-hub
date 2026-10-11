export type IconName =
  | 'home'
  | 'folder'
  | 'gamepad'
  | 'grid'
  | 'user'
  | 'moon'
  | 'sun'
  | 'arrow'
  | 'github'
  | 'mail'
  | 'book'
  | 'shield'
  | 'building'
  | 'settings'
  | 'image'
  | 'chart'
  | 'lock'
  | 'code'
  | 'clock'
  | 'more'
  | 'close'
  | 'search'
  | 'save'
  | 'download'
const paths: Record<IconName, string> = {
  home: 'm3 10 9-7 9 7v10h-6v-7H9v7H3z',
  folder: 'M3 7V5h7l2 2h9v13H3z',
  gamepad:
    'M6 12h4m-2-2v4m7-2h.01M18 10h.01M7 5h10a5 5 0 0 1 5 4l1 8a3 3 0 0 1-5 3l-3-3H9l-3 3a3 3 0 0 1-5-3l1-8a5 5 0 0 1 5-4z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  moon: 'M21 12.5A9 9 0 0 1 11.5 3 9 9 0 1 0 21 12.5Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  github:
    'M9 19c-5 1.5-5-2.5-7-3m14 6v-4a3 3 0 0 0-1-2.5c3-.4 6.5-1.5 6.5-7A5 5 0 0 0 20 5c.2-1-.1-3-1-4-2 0-3 1-3 1-3-1-5-1-8 0-1-1-3-1-3-1-1 1-1.2 3-1 4a5 5 0 0 0-1.5 3.5c0 5.5 3.5 6.6 6.5 7V22',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13M4 19.5A2.5 2.5 0 0 0 6.5 22H20',
  shield: 'm12 2 9 4v6c0 5-3 8-9 10-6-2-9-5-9-10V6zM9 12l2 2 4-4',
  building: 'M3 20h18M5 20V9l7-4 7 4v11M9 20v-5h6v5',
  settings:
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2m10-10 2-2',
  image: 'M3 3h18v18H3zM3 18l6-6 4 4 4-6 4 5M9 8h.01',
  chart: 'M4 19V9m6 10V5m6 14v-7m4 7V3',
  lock: 'M4 10h16v12H4zM8 10V7a4 4 0 1 1 8 0v3m-4 5v2',
  code: 'm8 4-6 8 6 8m8-16 6 8-6 8m-3-17-2 18',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 5 5',
  save: 'M3 3h14l4 4v14H3zM7 3v5h8M7 21v-8h10v8',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
}
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={'icon ' + className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
