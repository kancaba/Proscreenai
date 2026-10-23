export function aiErrorMessage(cause: unknown, tr: boolean): string {
  const raw = cause instanceof Error ? cause.message : String(cause)
  if (/API key.*rejected|model access.*rejected|speech model access|denied speech/i.test(raw)) return tr ? 'Modelion bu anahtarla erişimi reddetti. AI bağlantı ayarlarından anahtarı ve model yetkisini kontrol edin.' : 'Modelion denied access. Check the API key and model permissions in AI settings.'
  if (/Add your Modelion API key/.test(raw)) return tr ? 'Önce AI bağlantı ayarlarından Modelion anahtarınızı ekleyin.' : 'Add a Modelion key in AI settings first.'
  if (/rate limit/i.test(raw)) return tr ? 'Kullanım sınırına ulaşıldı. Biraz sonra tekrar deneyin.' : 'Rate limit reached. Try again shortly.'
  if (/cancelled|timed out|too long/i.test(raw)) return tr ? 'İşlem iptal edildi veya yanıt süresi doldu. Tekrar deneyebilirsiniz.' : 'The request was cancelled or timed out. You can try again.'
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(raw)) return tr ? 'Modelion’a bağlanılamadı. İnternet bağlantınızı kontrol edin.' : 'Could not reach Modelion. Check your internet connection.'
  if (/audio.*(decode|duration)|metadata timed out/i.test(raw)) return tr ? 'Oluşturulan ses okunamadı. Yeniden ses oluşturmayı deneyin.' : 'The generated audio could not be read. Try generating it again.'
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '').slice(0,300)
}
