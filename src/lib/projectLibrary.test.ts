import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicWrite, ProjectLibrary } from '../../electron/projectLibrary'

const temporaryDirectories: string[] = []
async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'screenmovie-library-'))
  temporaryDirectories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('project persistence', () => {
  it('replaces a saved project atomically without leaving temporary files', async () => {
    const directory = await temporaryDirectory()
    const project = path.join(directory, 'demo.screenmovie')
    await writeFile(project, 'old')
    await atomicWrite(project, '{"version":1}')
    expect(await readFile(project, 'utf8')).toBe('{"version":1}')
    expect(await readdir(directory)).toEqual(['demo.screenmovie'])
  })

  it('keeps simultaneous saves in the library and moves a reopened entry to the front', async () => {
    const directory = await temporaryDirectory()
    const a = path.join(directory, 'a.screenmovie')
    const b = path.join(directory, 'b.screenmovie')
    await Promise.all([writeFile(a, '{}'), writeFile(b, '{}')])
    const storePath = path.join(directory, 'recent.json')
    const library = new ProjectLibrary(storePath)
    await Promise.all([library.remember(a), library.remember(b)])
    expect((await library.list()).map((entry) => entry.path)).toEqual([b, a])
    await library.remember(a)
    expect((await new ProjectLibrary(storePath).list()).map((entry) => entry.path)).toEqual([a, b])
  })

  it('ignores missing files and invalid records', async () => {
    const directory = await temporaryDirectory()
    const storePath = path.join(directory, 'recent.json')
    await writeFile(storePath, JSON.stringify([{ path: '/missing.screenmovie', name: 'gone', updatedAt: 'today' }, { path: 42 }]))
    expect(await new ProjectLibrary(storePath).list()).toEqual([])
  })
})
