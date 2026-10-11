'use client'
import { useEffect, useRef, useState } from 'react'

function matchesShape(value: unknown, template: unknown): boolean {
  if (Array.isArray(template))
    return (
      Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === 'string')
    )
  if (template && typeof template === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const keys = Object.keys(template)
    return (
      Object.keys(value).length === keys.length &&
      keys.every(
        (key) =>
          Object.hasOwn(value, key) &&
          matchesShape(
            (value as Record<string, unknown>)[key],
            (template as Record<string, unknown>)[key],
          ),
      )
    )
  }
  return typeof value === typeof template && (typeof value !== 'number' || Number.isFinite(value))
}

export function useUnsaved<T>(
  value: T,
  onDirty: (dirty: boolean) => void,
  cache?: { key: string; restore: (value: T) => void },
) {
  const serialized = JSON.stringify(value)
  const [baseline, setBaseline] = useState(serialized),
    [restored, setRestored] = useState(false),
    [cacheError, setCacheError] = useState(false)
  const callback = useRef(onDirty),
    options = useRef(cache),
    current = useRef(value),
    seenKey = useRef<string | null>(null)
  callback.current = onDirty
  options.current = cache
  current.current = value
  const cacheKey = cache ? 'hub-draft:' + cache.key : '',
    dirty = serialized !== baseline

  useEffect(() => {
    setRestored(false)
    if (!cacheKey) return
    try {
      const saved = sessionStorage.getItem(cacheKey)
      if (!saved) return
      if (saved.length > 300000) {
        sessionStorage.removeItem(cacheKey)
        return
      }
      const draft: unknown = JSON.parse(saved)
      if (!matchesShape(draft, current.current)) {
        sessionStorage.removeItem(cacheKey)
        return
      }
      if (JSON.stringify(draft) === baseline) {
        sessionStorage.removeItem(cacheKey)
        return
      }
      setRestored(true)
      if (JSON.stringify(draft) !== JSON.stringify(current.current))
        options.current?.restore(draft as T)
    } catch {
      setCacheError(true)
    }
    // Restore only when this editor identity mounts; baseline remains the server-saved value.
  }, [cacheKey])

  useEffect(() => {
    if (!cacheKey) return
    if (seenKey.current !== cacheKey) {
      seenKey.current = cacheKey
      return
    }
    try {
      if (dirty) {
        if (serialized.length > 300000) throw new Error('Draft exceeds cache limit')
        sessionStorage.setItem(cacheKey, serialized)
      } else sessionStorage.removeItem(cacheKey)
      setCacheError(false)
    } catch {
      setCacheError(true)
    }
  }, [cacheKey, serialized, dirty])

  useEffect(() => {
    callback.current(dirty)
  }, [dirty])
  useEffect(() => () => callback.current(false), [])
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function markSaved(saved: T = value) {
    setBaseline(JSON.stringify(saved))
    setRestored(false)
    try {
      if (cacheKey) sessionStorage.removeItem(cacheKey)
    } catch {}
  }
  return { dirty, restored, cacheError, markSaved }
}
