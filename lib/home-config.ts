import type { HomeWidget, HomeWidgetId } from '@/lib/types'

export const HOME_WIDGETS: { id: HomeWidgetId; label: string }[] = [
  { id: 'intro', label: '个人介绍' }, { id: 'clock', label: '时钟' }, { id: 'garden', label: '作品概览' },
  { id: 'photos', label: '相册' }, { id: 'tags', label: '项目标签' }, { id: 'globe', label: '昼夜地球' },
  { id: 'console', label: '终端文字' }, { id: 'blog', label: '博客入口' }, { id: 'notes', label: '随记入口' },
  { id: 'quote', label: '一句话' }, { id: 'music', label: '音乐播放器' }, { id: 'info', label: '版权与订阅' },
  { id: 'reading', label: '最近记录' },
]
export const DEFAULT_HOME_WIDGETS: HomeWidget[] = HOME_WIDGETS.map(({ id }) => ({ id, enabled: true, width: 'auto' }))
