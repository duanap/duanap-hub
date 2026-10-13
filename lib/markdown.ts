import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const parser = unified().use(remarkParse).use(remarkGfm)

// Compare parsed meaning, not whitespace or list-marker style. A visual editor
// must not silently discard syntax its schema cannot represent.
export function hasSameMarkdownContent(source: string, serialized: string) {
  const fingerprint = (value: string) => JSON.stringify(parser.parse(value), (key, item) =>
    key === 'position' || key === 'spread' ? undefined : item)
  return fingerprint(source) === fingerprint(serialized)
}
