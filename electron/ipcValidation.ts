import fs from 'node:fs/promises'
import path from 'node:path'

const READABLE_MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi',
  '.wav', '.m4a', '.mp3', '.aac', '.ogg', '.opus',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.avif',
])

/** The renderer may only read media files; this keeps a compromised page away from keys and documents. */
export async function resolveReadableMediaPath(filePath: unknown): Promise<string> {
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) {
    throw new Error('Invalid file path')
  }
  const resolved = await fs.realpath(path.resolve(filePath))
  if (!READABLE_MEDIA_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
    throw new Error('Only media files can be read')
  }
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) {
    throw new Error('Not a file')
  }
  return resolved
}

/** Recording file names come from the renderer; keep them as plain names inside the recordings folder. */
export function resolveRecordingFilePath(recordingsDir: string, fileName: unknown): string {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\0')) {
    throw new Error('Invalid recording file name')
  }
  const baseName = path.basename(fileName)
  if (baseName !== fileName || baseName === '.' || baseName === '..' || !/\.(webm|mov|mp4)$/i.test(baseName)) {
    throw new Error('Invalid recording file name')
  }
  return path.join(recordingsDir, baseName)
}

const EXTERNAL_URL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    return EXTERNAL_URL_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
