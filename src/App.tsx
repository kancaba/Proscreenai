import { lazy, Suspense, useEffect, useState } from "react";
import { CountdownOverlay } from "./components/countdown/CountdownOverlay";
import { WelcomeWindow } from "./components/launch/WelcomeWindow";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { RegionSelectorOverlay } from "./components/launch/RegionSelectorOverlay";
const ImageStudio = lazy(() => import("./components/creative-studio/CreativeStudio"));
const VideoEditor = lazy(() => import("./components/video-editor/VideoEditor"));
import { loadAllCustomFonts } from "./lib/customFonts";
import { ShortcutsProvider } from "./contexts/ShortcutsContext";
import { ShortcutsConfigDialog } from "./components/video-editor/ShortcutsConfigDialog";
import { useI18n } from "./contexts/I18nContext";

export default function App() {
  const [windowType] = useState(() => new URLSearchParams(window.location.search).get('windowType') || 'welcome');
  const [imageStudio, setImageStudio] = useState(false);
  const [initialCreationId, setInitialCreationId] = useState<string>();
  const [initialGallery, setInitialGallery] = useState(false);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ creationId?: string; gallery?: boolean }>).detail;
      const id = detail?.creationId;
      setInitialCreationId(typeof id === 'string' ? id : undefined);
      setInitialGallery(detail?.gallery === true);
      setImageStudio(true);
    };
    window.addEventListener("open-image-studio", open);
    return () => window.removeEventListener("open-image-studio", open);
  }, []);
  const { locale, t } = useI18n();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('windowType') || '';

    if (type === 'hud-overlay' || type === 'source-selector' || type === 'countdown' || type === 'region-selector') {
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      document.getElementById('root')?.style.setProperty('background', 'transparent');
    }

    // Load custom fonts on app initialization
    loadAllCustomFonts().catch((error) => {
      console.error('Failed to load custom fonts:', error);
    });
  }, []);

  useEffect(() => {
    document.title = windowType === 'editor'
      ? t('app.editorTitle', 'Pro Screen AI Editor')
      : t('app.name', 'Pro Screen AI');
  }, [windowType, locale, t]);

  if (imageStudio) return <Suspense fallback={<div>Görsel Stüdyo açılıyor…</div>}><ImageStudio initialCreationId={initialCreationId} initialGallery={initialGallery} onHome={() => setImageStudio(false)} /></Suspense>;

  switch (windowType) {
    case 'welcome':
      return <WelcomeWindow />;
    case 'hud-overlay':
      return <LaunchWindow />;
    case 'region-selector':
      return <RegionSelectorOverlay />;
    case 'source-selector':
      return <SourceSelector />;
    case 'countdown':
      return <CountdownOverlay />;
    case 'editor':
      return (
        <ShortcutsProvider>
          <Suspense fallback={<div className="flex h-screen items-center justify-center bg-[#101014] text-white/60">{t("launch.sourceSelector.loadingSources")}</div>}>
            <VideoEditor />
          </Suspense>
          <ShortcutsConfigDialog />
        </ShortcutsProvider>
      );
    default:
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 text-white">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <img src="/app-icons/screenmovie-128.png" alt={t('app.name', 'Pro Screen AI')} className="h-12 w-12 rounded-xl" />
            <div>
                <h1 className="text-xl font-semibold tracking-tight">{t('app.name', 'Pro Screen AI')}</h1>
                <p className="text-sm text-white/65">{t('app.subtitle', 'Screen recording and editing')}</p>
            </div>
          </div>
        </div>
      );
  }
}

