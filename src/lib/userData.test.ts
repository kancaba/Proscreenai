import { beforeEach, describe, expect, it, vi } from 'vitest'
const paths = vi.hoisted(() => ({ appData: '/Users/test/Library/Application Support', userData: '' }))
vi.mock('electron', () => ({ app: {
 getPath: (name: 'userData' | 'appData') => paths[name],
 setPath: (_name: string, value: string) => { paths.userData = value },
} }))
beforeEach(() => vi.resetModules())
describe('Product rename storage compatibility', () => {
 for (const name of ['Pro Screen AI', 'pro-screen-ai']) {
  it(`reuses legacy storage for ${name}`, async () => {
   paths.userData = `${paths.appData}/${name}`
   const { userDataDirectory } = await import('../../electron/userData')
   expect(userDataDirectory).toBe(`${paths.appData}/screenmovie`)
  })
 }
 it('preserves an explicitly isolated test profile', async () => {
  paths.userData = '/private/tmp/pro-screen-ai-test'
  const { userDataDirectory } = await import('../../electron/userData')
  expect(userDataDirectory).toBe('/private/tmp/pro-screen-ai-test')
 })
 it('preserves an existing legacy profile', async () => {
  paths.userData = `${paths.appData}/screenmovie`
  const { userDataDirectory } = await import('../../electron/userData')
  expect(userDataDirectory).toBe(`${paths.appData}/screenmovie`)
 })
})
