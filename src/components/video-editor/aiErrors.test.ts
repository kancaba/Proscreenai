import { expect,it } from 'vitest'
import { aiErrorMessage } from './aiErrors'
it('shows a useful key/access error instead of Electron IPC details',()=>{
  const error = new Error("Error invoking remote method 'modelion-generate-speech': Error: Modelion API key or speech model access was rejected.")
  expect(aiErrorMessage(error,true)).toContain('AI bağlantı')
  expect(aiErrorMessage(error,true)).not.toContain('remote method')
  expect(aiErrorMessage(new Error('Modelion rate limit reached.'),true)).toContain('Kullanım sınırına')
})
