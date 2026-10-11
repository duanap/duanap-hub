'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
const names = ['项目介绍', '项目截图', '更新日志', '开发计划']
export function ProjectTabs({ panels }: { panels: ReactNode[] }) {
  const [active, setActive] = useState(0),
    [target, setTarget] = useState(''),
    root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function resolveHash() {
      let id: string
      try {
        id = decodeURIComponent(location.hash.slice(1))
      } catch {
        return
      }
      const node = document.getElementById(id),
        panel = node?.closest<HTMLElement>('[data-project-panel]')
      if (!node || !panel || !root.current?.contains(panel)) return
      const index = Number(panel.dataset.projectPanel)
      if (!Number.isInteger(index) || index < 0 || index >= names.length) return
      setActive(index)
      setTarget(id)
    }
    resolveHash()
    window.addEventListener('hashchange', resolveHash)
    return () => window.removeEventListener('hashchange', resolveHash)
  }, [])
  useEffect(() => {
    if (!target) return
    const node = document.getElementById(target),
      panel = node?.closest<HTMLElement>('[data-project-panel]')
    if (!node || panel?.hidden) return
    const frame = requestAnimationFrame(() =>
      node.scrollIntoView({ block: 'start', behavior: 'auto' }),
    )
    return () => cancelAnimationFrame(frame)
  }, [active, target])
  return (
    <div ref={root} className="project-content-tabs">
      <div className="detail-tabs" role="tablist" aria-label="项目内容">
        {names.map((name, i) => (
          <button
            key={name}
            id={'project-tab-' + i}
            type="button"
            role="tab"
            aria-selected={active === i}
            aria-controls={'project-panel-' + i}
            tabIndex={active === i ? 0 : -1}
            className={active === i ? 'active' : ''}
            onClick={() => setActive(i)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                const next = (active + (event.key === 'ArrowRight' ? 1 : 3)) % 4
                setActive(next)
                document.getElementById('project-tab-' + next)?.focus()
              }
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <section
          key={i}
          role="tabpanel"
          id={'project-panel-' + i}
          data-project-panel={i}
          aria-labelledby={'project-tab-' + i}
          hidden={active !== i}
          className="detail-long-panel"
        >
          {panel}
        </section>
      ))}
      <noscript>
        <style>{'.project-content-tabs .detail-long-panel[hidden]{display:block!important}'}</style>
      </noscript>
    </div>
  )
}
