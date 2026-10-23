import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeExportFile } from '../../electron/exportFile'

describe('export file persistence', () => {
  it('saves the rendered MP4 as is if compatibility conversion fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'screenmovie-export-'))
    try {
      const destination = path.join(directory, 'finished.mp4')
      await writeFile(destination, 'original video')
      const result = await writeExportFile(destination, Buffer.from('rendered'), 'mp4', path.join(directory, 'missing-ffmpeg'))
      expect(result).toEqual({ converted: false })
      expect(await readFile(destination, 'utf8')).toBe('rendered')
      expect(await readdir(directory)).toEqual(['finished.mp4'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('preserves an existing destination if the export cannot be staged', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'screenmovie-export-'))
    try {
      const destination = path.join(directory, 'finished.mp4')
      await writeFile(destination, 'original video')
      await expect(writeExportFile(path.join(directory, 'missing-dir', 'out.mp4'), Buffer.from('rendered'), 'mp4')).rejects.toThrow()
      expect(await readFile(destination, 'utf8')).toBe('original video')
      expect(await readdir(directory)).toEqual(['finished.mp4'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('writes GIF data without attempting audio conversion', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'screenmovie-export-'))
    try {
      const destination = path.join(directory, 'finished.gif')
      await writeExportFile(destination, Buffer.from('GIF89a'), 'gif')
      expect(await readFile(destination, 'utf8')).toBe('GIF89a')
      expect(await readdir(directory)).toEqual(['finished.gif'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
