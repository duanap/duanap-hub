import path from 'node:path'
export function dataDirectory() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.HUB_DATA_DIR || path.join(process.cwd(), 'data'),
  )
}
