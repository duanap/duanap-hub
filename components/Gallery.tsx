'use client'
import { useRef, useState } from 'react'
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const [selected, setSelected] = useState<number | null>(null),
    trigger = useRef<HTMLButtonElement | null>(null)
  function close() {
    setSelected(null)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  return (
    <>
      <div className="screens-grid">
        {images.map((src, i) => (
          <button
            className="screenshot-button"
            key={src + '-' + i}
            onClick={(e) => {
              trigger.current = e.currentTarget
              setSelected(i)
            }}
            aria-label={'查看截图 ' + (i + 1)}
          >
            <img src={src} alt={title + ' 截图 ' + (i + 1)} loading="lazy" />
          </button>
        ))}
      </div>
      {selected !== null && (
        <div className="image-lightbox" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="项目截图预览"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'Tab') {
                e.preventDefault()
              }
            }}
          >
            <button autoFocus className="button button-outline" onClick={close}>
              关闭预览
            </button>
            <img src={images[selected]} alt={title + ' 截图 ' + (selected + 1)} />
          </div>
        </div>
      )}
    </>
  )
}
