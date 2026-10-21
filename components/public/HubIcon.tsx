export type HubIconName = 'home' | 'blog' | 'photos' | 'notes' | 'links' | 'about' | 'projects' | 'games' | 'tools' | 'sun' | 'moon' | 'menu' | 'arrow' | 'code' | 'mail' | 'globe' | 'rss' | 'close' | 'search' | 'reset' | 'music'

export function HubIcon({ name, src }: { name: HubIconName; src?: string }) {
  return <img className={'hub-icon' + (src ? ' hub-custom-icon' : '')} src={src || `/icons/${name}.svg`} alt="" width={20} height={20} aria-hidden="true" />
}
