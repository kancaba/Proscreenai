import { RecordingRecoveryPanel } from './RecordingRecoveryPanel'
import { ProjectRecoveryPanel } from './ProjectRecoveryPanel'
import { PermissionSetupPanel } from './PermissionSetupPanel'
import { useEffect, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, Clapperboard, FolderOpen, Languages, Sparkles, Video, Image } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { listRecentCreations } from '../creative-studio/database'
import type { Creation } from '../creative-studio/brand'
import './WelcomeWindow.css'

type RecentProject = { path: string; name: string; updatedAt: string }

export function WelcomeWindow() {
  const { locale, setLocale, t } = useI18n()
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [creations, setCreations] = useState<Creation[]>([])
  const [imageError, setImageError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string) => t(`launch.welcome.${key}`)
  const h = (tr: string, en: string) => locale === 'tr' ? tr : en

  useEffect(() => {
    let active = true
    window.electronAPI?.listRecentProjects().then((entries) => {
      if (active) setProjects(entries)
    }).catch(() => { if (active) setError(w('libraryError')) })
    return () => { active = false }
  }, [t])

  useEffect(() => {
    let active = true;
    listRecentCreations().then(items => { if (active) setCreations(items) }).catch(() => { if (active) setImageError(true) });
    return () => { active = false };
  }, []);
  const openImage = (creationId?: string) => window.dispatchEvent(new CustomEvent('open-image-studio', { detail: { creationId, gallery: true } }));

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try { await action() } catch { setError(w('openError')) } finally { setBusy(false) }
  }

  async function importVideo() {
    const result = await window.electronAPI.openVideoFilePicker()
    if (result.canceled) return
    if (!result.success || !result.path) throw new Error('Import failed')
    await window.electronAPI.setCurrentVideoPath(result.path)
    await window.electronAPI.switchToEditor()
  }

  async function openProject() {
    const result = await window.electronAPI.loadProjectFile()
    if (result.canceled) return
    if (!result.success) throw new Error('Open failed')
    await window.electronAPI.switchToEditor()
  }

  return (
    <main className="studio-home">
      <header className="studio-topbar">
        <a className="studio-wordmark" href="#" aria-label="Pro Screen AI">
          <span className="studio-logo"><Clapperboard size={19} strokeWidth={1.8} /></span>
          Pro Screen AI <span className="studio-version">PREVIEW 0.1</span>
        </a>
        <button className="studio-language" onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}>
          <Languages size={15} /> {locale === 'tr' ? 'Türkçe' : 'English'}
        </button>
      </header>

      <div className="studio-body">
        <section className="home-intro">
          <span className="studio-eyebrow"><span /> {h('YARATICI ÇALIŞMA ALANIN', 'YOUR CREATIVE WORKSPACE')}</span>
          <h1>{h('Bir fikir.', 'One idea.')} <span>{h('İki stüdyo.', 'Two studios.')}</span></h1>
          <p>{h('Hikâyeni hareketle anlat. Ya da tek bir görselle.', 'Tell your story in motion. Or with a single image.')}</p>
        </section>
        <section className="studio-mode-choice" aria-label={h('Çalışma alanı seç', 'Choose a workspace')}>
          <button className="home-workspace home-video" disabled={busy} onClick={() => void run(() => window.electronAPI.showRecorder())}>
            <div className="home-workspace-top"><span><Video size={17} /> VIDEO</span><span className="home-workspace-number">01</span></div>
            <div className="home-art home-video-art" aria-hidden="true">
              <div className="home-video-window"><div className="home-mini-title"><i /><i /><i /><span>pro screen ai / take 01</span></div><div className="home-video-scene"><div className="home-scene-orbit" /><span>Make it<br /><b>move.</b></span><div className="home-scene-cursor"><ArrowRight size={27} /></div></div></div>
              <span className="home-record-pill"><i /> REC <b>00:12</b></span>
              <div className="home-mini-timeline"><span /><span /><span /><span /><span /><span /><span /><span /></div>
            </div>
            <div className="home-workspace-copy"><strong>{h('Video Stüdyo', 'Video Studio')}</strong><span>{h('Ekranını kaydet. Önemli anlara yaklaş. Kendi stilinle paylaş.', 'Record your screen. Zoom into what matters. Share it in your style.')}</span></div>
            <div className="home-workspace-bottom"><span>{h('Ekran kaydı · Kurgu · Dışa aktarım', 'Screen recording · Editing · Export')}</span><b>{h('Kayda başla', 'Start recording')} <ArrowRight size={17} /></b></div>
          </button>
          <button className="home-workspace home-image" disabled={busy} onClick={() => window.dispatchEvent(new Event('open-image-studio'))}>
            <div className="home-workspace-top"><span><Image size={17} /> {h('GÖRSEL', 'IMAGE')}</span><span className="home-workspace-number">02</span></div>
            <div className="home-art home-image-art" aria-hidden="true">
              <div className="home-poster home-poster-back"><span>CREATE<br />YOUR<br />NEXT.</span></div><div className="home-poster home-poster-front"><span>Ideas,<br /><b>in bloom.</b></span><div className="home-glass-orb" /><small>STUDIO / 002</small></div>
              <span className="home-ai-pill"><Sparkles size={13} /> {h('Fikirden görsele', 'From idea to image')}</span>
            </div>
            <div className="home-workspace-copy"><strong>{h('Görsel Stüdyo', 'Image Studio')}</strong><span>{h('İsteğini yaz. Markanı seç. AI ile üret, katmanlarla son dokunuşu yap.', 'Write your idea. Choose your brand. Generate with AI and refine with layers.')}</span></div>
            <div className="home-workspace-bottom"><span>{h('AI üretim · Markalar · Tasarım', 'AI generation · Brands · Design')}</span><b>{h('Oluşturmaya başla', 'Start creating')} <ArrowRight size={17} /></b></div>
          </button>
        </section>
        <section className="home-desk" aria-label={h('Çalışma masan', 'Your workbench')}>
          <div className="home-desk-heading"><div><span className="studio-eyebrow">{h('KALDIĞIN YERDEN', 'PICK UP WHERE YOU LEFT OFF')}</span><h2>{h('Çalışma masan.', 'Your workbench.')}</h2></div><span className="home-local-badge"><Check size={12} /> {h('Bu bilgisayarda', 'On this computer')}</span></div>
          <section className="studio-actions home-shortcuts" aria-label={w('start')}>
            <button disabled={busy} onClick={() => void run(importVideo)}><span className="studio-action-icon peach"><ArrowDownToLine size={19} /></span><span><strong>{w('importTitle')}</strong><small>{w('importDescription')}</small></span><ChevronRight size={16} /></button>
            <button disabled={busy} onClick={() => void run(openProject)}><span className="studio-action-icon mint"><FolderOpen size={19} /></span><span><strong>{w('openTitle')}</strong><small>{w('openDescription')}</small></span><ChevronRight size={16} /></button>
            <button onClick={() => openImage()}><span className="studio-action-icon lilac"><Image size={19} /></span><span><strong>{h('Görsel galerisi', 'Image gallery')}</strong><small>{h('Ürettiklerini keşfet ve düzenle', 'Explore and refine your creations')}</small></span><ChevronRight size={16} /></button>
          </section>
          {error && <div className="studio-error" role="alert">{error}</div>}
          <div className="home-libraries">
            <section className="home-library home-video-library" aria-label={h('Son video projeleri', 'Recent video projects')}>
              <header className="home-library-heading"><span className="home-library-icon"><Video size={17} /></span><div><h3>{h('Video projelerin', 'Your video projects')}</h3><p>{h('Son çalışmalarına geri dön.', 'Return to your recent work.')}</p></div><span className="home-count">{projects.length}</span></header>
              {projects.length ? <div className="home-video-list">{projects.slice(0, 5).map((project, index) => <button key={project.path} disabled={busy} title={project.path} onClick={() => void run(async () => {
                const result = await window.electronAPI.openRecentProject(project.path);
                if (!result.success) { setError(result.message || w('openError')); return; }
                await window.electronAPI.switchToEditor();
              })}><span className={`home-video-file tone-${index % 3}`}><Clapperboard size={19} /></span><span className="home-file-copy"><strong>{project.name}</strong><small>{new Date(project.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</small></span><ArrowRight size={15} /></button>)}</div> : <div className="home-library-empty"><Video size={28} /><strong>{h('İlk hikâyen burada başlayacak.', 'Your first story starts here.')}</strong><p>{h('Bir kayıt al veya bilgisayarından video ekle.', 'Record your screen or import a video.')}</p><button disabled={busy} onClick={() => void run(importVideo)}>{w('chooseVideo')} <ArrowRight size={14} /></button></div>}
            </section>
            <section className="home-library home-image-library" aria-label={h('Son görseller', 'Recent images')}>
              <header className="home-library-heading"><span className="home-library-icon"><Image size={17} /></span><div><h3>{h('Son görsellerin', 'Your latest images')}</h3><p>{h('Bir fikrin bir sonraki versiyonu.', 'The next version of an idea.')}</p></div><button className="home-library-link" onClick={() => openImage()}>{h('Tümü', 'View all')} <ArrowRight size={14} /></button></header>
              {imageError ? <p className="studio-error" role="alert">{h('Görsel kütüphanesi okunamadı.', 'Could not read the image library.')}</p> : creations.length ? <div className="home-image-grid">{creations.map(c => <button key={c.id} onClick={() => openImage(c.id)} aria-label={`${c.name} ${h('görselini aç', 'open image')}`} title={c.prompt || c.name}><img src={c.src} alt={c.prompt || c.name} loading="lazy" /><span><strong>{c.name}</strong><small>{c.width} × {c.height} <ArrowRight size={12} /></small></span></button>)}</div> : <div className="home-library-empty"><Sparkles size={28} /><strong>{h('Bir cümleyle başla.', 'Start with a sentence.')}</strong><p>{h('Ürettiğin görseller burada seni bekleyecek.', 'Your generated images will be waiting here.')}</p><button onClick={() => window.dispatchEvent(new Event('open-image-studio'))}>{h('İlk görselini oluştur', 'Create your first image')} <ArrowRight size={14} /></button></div>}
            </section>
          </div>
          <div className="home-safety"><PermissionSetupPanel /><RecordingRecoveryPanel onOpen={() => window.electronAPI.switchToEditor()} /><ProjectRecoveryPanel initiallyExpanded={false} onOpen={() => window.electronAPI.switchToEditor()} /></div>
        </section>

        <footer className="studio-footer"><span><Check size={13} /> {w('footer')}</span><span>Pro Screen AI <i>·</i> {h('Fikirden üretime.', 'From idea to creation.')}</span></footer>
      </div>
    </main>
  )
}
