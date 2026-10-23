import { Check, MonitorUp, MousePointerClick } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'

type Status = { screen: boolean; clicks: boolean }

/**
 * First-run setup on macOS: screen recording and click tracking (Accessibility) must be
 * allowed before recording, because clicks cannot be added to a recording afterwards.
 * Hidden once both are granted.
 */
export function PermissionSetupPanel() {
  const { t } = useI18n()
  const p = (key: string, vars?: Record<string, string>) => t(`launch.permissionSetup.${key}`, undefined, vars)
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let active = true
    const check = async () => {
      const api = window.electronAPI
      if (!api || (await api.getPlatform()) !== 'darwin') return
      const [screen, access] = await Promise.all([api.getScreenRecordingPermissionStatus(), api.getAccessibilityPermissionStatus()])
      if (active) setStatus({ screen: screen.success && screen.status === 'granted', clicks: access.success && access.trusted })
    }
    void check()
    const timer = setInterval(() => void check(), 2000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  if (!status || (status.screen && status.clicks)) return null

  const allowClicks = async () => {
    const result = await window.electronAPI.requestAccessibilityPermission()
    if (!result.trusted) await window.electronAPI.openAccessibilityPreferences()
  }

  const rows = [
    { id: 'screen', icon: <MonitorUp size={17} />, granted: status.screen, onAllow: () => void window.electronAPI.openScreenRecordingPreferences() },
    { id: 'clicks', icon: <MousePointerClick size={17} />, granted: status.clicks, onAllow: () => void allowClicks() },
  ]

  return (
    <section className="studio-permissions" data-testid="permission-setup" aria-label={p('title')}>
      <div className="studio-permissions-heading">
        <strong>{p('title')}</strong>
        <span>{p('description')}</span>
      </div>
      {rows.map((row) => (
        <div key={row.id} className="studio-permission-row" data-testid={`permission-${row.id}`} data-granted={row.granted}>
          <span className="studio-permission-icon">{row.icon}</span>
          <div>
            <strong>{p(`${row.id}.title`)}</strong>
            <small>{p(`${row.id}.description`)}</small>
          </div>
          {row.granted ? (
            <span className="studio-permission-done"><Check size={14} /> {p('granted')}</span>
          ) : (
            <button type="button" onClick={row.onAllow}>{p('allow')}</button>
          )}
        </div>
      ))}
      <p className="studio-permissions-note">{p('restartNote')}</p>
    </section>
  )
}
