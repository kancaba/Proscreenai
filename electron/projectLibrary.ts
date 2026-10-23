import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export interface RecentProject {
  path: string
  name: string
  updatedAt: string
}

export async function atomicWrite(filePath: string, content: string) {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    const handle = await fs.open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally { await handle.close() }
    await fs.rename(temporaryPath, filePath)
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export class ProjectLibrary {
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async list(): Promise<RecentProject[]> {
    await this.pending
    return this.read()
  }

  private async read(): Promise<RecentProject[]> {
    try {
      const data: unknown = JSON.parse(await fs.readFile(this.filePath, 'utf8'))
      if (!Array.isArray(data)) return []
      const candidates = data.filter((entry): entry is RecentProject =>
        entry && typeof entry.path === 'string' && path.isAbsolute(entry.path)
        && typeof entry.name === 'string' && typeof entry.updatedAt === 'string',
      )
      const present = await Promise.all(candidates.map(async (entry) => {
        const stat = await fs.stat(entry.path).catch(() => null)
        return stat?.isFile() ? entry : null
      }))
      return present.filter((entry): entry is RecentProject => entry !== null).slice(0, 12)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('Unable to read recent projects:', error)
      }
      return []
    }
  }

  remember(projectPath: string) {
    const operation = this.pending.then(async () => {
      const entries = await this.read()
      const resolvedPath = path.resolve(projectPath)
      const next: RecentProject[] = [{
        path: resolvedPath,
        name: path.basename(resolvedPath, path.extname(resolvedPath)),
        updatedAt: new Date().toISOString(),
      }, ...entries.filter((entry) => entry.path !== resolvedPath)].slice(0, 12)
      await fs.mkdir(path.dirname(this.filePath), { recursive: true })
      await atomicWrite(this.filePath, JSON.stringify(next, null, 2))
    })
    // A library failure must never turn a successful project save into a failure.
    this.pending = operation.catch((error) => console.warn('Unable to update library:', error))
    return this.pending
  }
}
