const dative: Record<string, string> = { Modelion: 'Modelion’a', 'Fish Audio': 'Fish Audio’ya' }
export function aiErrorMessage(cause: unknown, tr: boolean, provider = 'Modelion'): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  if (/API key.*rejected|model access.*rejected|speech model access|denied speech/i.test(raw)) return tr ? `${provider} bu anahtarla erişimi reddetti. AI bağlantı ayarlarından anahtarı ve model yetkisini kontrol edin.` : `${provider} denied access. Check the API key and model permissions in AI settings.`
  if (/Add your (Modelion|Fish Audio) API key/.test(raw)) return tr ? `Önce AI bağlantı ayarlarından ${provider} anahtarınızı ekleyin.` : `Add a ${provider} key in AI settings first.`
  if (/balance is insufficient/i.test(raw)) return tr ? 'Fish Audio bakiyesi bu model için yetersiz. Ücretsiz S2.1 Pro Free modelini seçin veya API bakiyesi yükleyin.' : 'Your Fish Audio balance is too low for this model. Choose the free S2.1 Pro Free model or add API credit.'
  if (/rate limit/i.test(raw)) return tr ? 'Kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin.' : 'Rate limit reached. Try again shortly.'
  if (/is busy/i.test(raw)) return tr ? `${provider} şu an yoğun. Biraz sonra tekrar deneyin.` : `${provider} is busy. Try again shortly.`
  if (/cancelled|timed out|too long/i.test(raw)) return tr ? 'İşlem iptal edildi veya yanıt süresi doldu. Tekrar deneyebilirsiniz.' : 'The request was cancelled or timed out. You can try again.'
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(raw)) return tr ? `${dative[provider] ?? provider} bağlanılamadı. İnternet bağlantınızı kontrol edin.` : `Could not reach ${provider}. Check your internet connection.`
  if (/audio.*(decode|duration)|metadata timed out/i.test(raw)) return tr ? 'Oluşturulan ses okunamadı. Yeniden ses oluşturmayı deneyin.' : 'The generated audio could not be read. Try generating it again.'
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').slice(0,300)
}
