export type HubIconName = 'home' | 'blog' | 'photos' | 'notes' | 'links' | 'about' | 'projects' | 'games' | 'tools' | 'sun' | 'moon' | 'menu' | 'arrow' | 'code' | 'mail' | 'globe' | 'rss' | 'close' | 'search' | 'reset'

export function HubIcon({ name }: { name: HubIconName }) {
  return <img className="hub-icon" src={`/icons/${name}.svg`} alt="" width={20} height={20} aria-hidden="true" />
}
