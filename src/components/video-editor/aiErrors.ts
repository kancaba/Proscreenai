const dative: Record<string, string> = { Modelion: 'Modelion’a', 'Fish Audio': 'Fish Audio’ya', ElevenLabs: 'ElevenLabs’e' }
type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string
export function aiErrorMessage(cause: unknown, t: Translate, provider = 'Modelion'): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  const vars = { provider, providerDative: dative[provider] ?? provider }
  if (/missing a required permission/i.test(raw)) return t('editor.aiErrors.missingPermission', 'This {{provider}} key lacks a permission for this action. Allow voice read and text-to-speech for the key in {{provider}}, or create a new key.', vars)
  if (/API key.*rejected|model access.*rejected|speech model access|denied speech/i.test(raw)) return t('editor.aiErrors.accessDenied', '{{provider}} denied access. Check the API key and model permissions in AI settings.', vars)
  if (/Add your (Modelion|Fish Audio|ElevenLabs) API key/.test(raw)) return t('editor.aiErrors.addKey', 'Add a {{provider}} key in AI settings first.', vars)
  if (/balance is insufficient/i.test(raw)) return provider === 'Fish Audio' ? t('editor.aiErrors.fishBalance', 'Your Fish Audio balance is too low for this model. Choose the free S2.1 Pro Free model or add API credit.') : t('editor.aiErrors.quota', 'Your {{provider}} quota is too low for this request. Check your plan or remaining characters.', vars)
  if (/rejected this voice or model/i.test(raw)) return t('editor.aiErrors.voiceRejected', '{{provider}} rejected this voice or model. Try another voice or model.', vars)
  if (/rate limit/i.test(raw)) return t('editor.aiErrors.rateLimit', 'Rate limit reached. Try again shortly.')
  if (/is busy/i.test(raw)) return t('editor.aiErrors.busy', '{{provider}} is busy. Try again shortly.', vars)
  if (/cancelled|timed out|too long/i.test(raw)) return t('editor.aiErrors.timeout', 'The request was cancelled or timed out. You can try again.')
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(raw)) return t('editor.aiErrors.unreachable', 'Could not reach {{provider}}. Check your internet connection.', vars)
  if (/audio.*(decode|duration)|metadata timed out/i.test(raw)) return t('editor.aiErrors.audioUnreadable', 'The generated audio could not be read. Try generating it again.')
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').slice(0,300)
}
