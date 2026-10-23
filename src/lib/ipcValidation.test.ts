import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isAllowedExternalUrl,
  resolveReadableMediaPath,
  resolveRecordingFilePath,
} from '../../electron/ipcValidation'

describe('IPC input validation', () => {
  it('keeps recording file names inside the recordings folder', () => {
    const dir = path.join(os.tmpdir(), 'recordings')
    expect(resolveRecordingFilePath(dir, 'recording-1.webm')).toBe(path.join(dir, 'recording-1.webm'))
    for (const name of ['../escape.webm', '../../etc/passwd', 'sub/clip.mp4', 'notes.txt', '', '..', 42]) {
      expect(() => resolveRecordingFilePath(dir, name)).toThrow()
    }
  })

  it('only opens web and mail links externally', () => {
    expect(isAllowedExternalUrl('https://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:team@example.com')).toBe(true)
    for (const url of ['file:///etc/passwd', 'smb://host/share', 'javascript:alert(1)', 'not a url', undefined]) {
      expect(isAllowedExternalUrl(url)).toBe(false)
    }
  })

  it('reads media files but not other files, even through a media-named symlink', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'screenmovie-read-'))
    try {
      const video = path.join(dir, 'clip.mp4')
      const secret = path.join(dir, 'id_rsa')
      await writeFile(video, 'video')
      await writeFile(secret, 'secret')
      await symlink(secret, path.join(dir, 'disguised.png'))

      await expect(resolveReadableMediaPath(video)).resolves.toMatch(/clip\.mp4$/)
      await expect(resolveReadableMediaPath(secret)).rejects.toThrow()
      await expect(resolveReadableMediaPath(path.join(dir, 'disguised.png'))).rejects.toThrow()
      await expect(resolveReadableMediaPath(path.join(dir, 'missing.mp4'))).rejects.toThrow()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
