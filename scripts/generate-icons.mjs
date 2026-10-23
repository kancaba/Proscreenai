import { spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

await mkdir('.cache/swift-modules', { recursive: true })
const result = spawnSync('swift', ['-module-cache-path', '.cache/swift-modules', 'scripts/generate-icon.swift'], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)
const entries = []
for (const [type, filename] of [
  ['icp4', 'icon_16x16.png'], ['icp5', 'icon_32x32.png'], ['icp6', 'icon_32x32@2x.png'],
  ['ic07', 'icon_128x128.png'], ['ic08', 'icon_256x256.png'], ['ic09', 'icon_512x512.png'], ['ic10', 'icon_512x512@2x.png'],
]) {
  const png = await readFile(path.join('icons/screenmovie.iconset', filename))
  const header = Buffer.alloc(8)
  header.write(type); header.writeUInt32BE(png.length + 8, 4)
  entries.push(header, png)
}
const payload = Buffer.concat(entries)
const header = Buffer.alloc(8)
header.write('icns'); header.writeUInt32BE(payload.length + 8, 4)
await writeFile('icons/screenmovie.icns', Buffer.concat([header, payload]))
console.log('ScreenMovie icons generated')
