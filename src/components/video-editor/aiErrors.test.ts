import { expect,it } from 'vitest'
import { aiErrorMessage } from './aiErrors'
const t = (_key: string, fallback = '', vars: Record<string, string | number> = {}) => fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name] ?? ''))
it('shows a useful key/access error instead of Electron IPC details',()=>{
  const error = new Error("Error invoking remote method 'modelion-generate-speech': Error: Modelion API key or speech model access was rejected.")
  expect(aiErrorMessage(error,t)).toContain('Modelion denied access. Check the API key')
  expect(aiErrorMessage(error,t)).not.toContain('remote method')
  expect(aiErrorMessage(new Error('Modelion rate limit reached.'),t)).toContain('Rate limit reached')
})
