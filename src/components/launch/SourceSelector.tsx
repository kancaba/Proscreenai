import { useState, useEffect, useRef } from "react";
import { Button } from "../ui/button";
import { MdCheck } from "react-icons/md";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useScopedT } from "../../contexts/I18nContext";
import styles from "./SourceSelector.module.css";

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string | null;
  display_id: string;
  appIcon: string | null;
  originalName: string;
  sourceType: 'screen' | 'window';
  appName?: string;
  windowTitle?: string;
}

function parseSourceMetadata(source: ProcessedDesktopSource) {
  if (source.sourceType === 'window' && (source.appName || source.windowTitle)) {
    return {
      sourceType: 'window' as const,
      appName: source.appName,
      windowTitle: source.windowTitle ?? source.name,
      displayName: source.windowTitle ?? source.name,
    };
  }

  const sourceType: 'screen' | 'window' = source.id.startsWith('window:') ? 'window' : 'screen';
  if (sourceType === 'window') {
    const [appNamePart, ...windowTitleParts] = source.name.split(' — ');
    const appName = appNamePart?.trim() || undefined;
    const windowTitle = windowTitleParts.join(' — ').trim() || source.name.trim();

    return {
      sourceType,
      appName,
      windowTitle,
      displayName: windowTitle,
    };
  }

  return {
    sourceType,
    appName: undefined,
    windowTitle: undefined,
    displayName: source.name,
  };
}

export function SourceSelector() {
  const t = useScopedT('launch');
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<DesktopSource | null>(null);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [refreshToken, setRefreshToken] = useState(0);
  const [sourceError, setSourceError] = useState('');
  const [permission, setPermission] = useState('unknown');
  const requestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoaded = useRef(false);
  const inFlight = useRef(false);
  const lastRefresh = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    async function fetchSources() {
      if (!hasLoaded.current) setLoading(true);
      setRefreshing(true);
      inFlight.current = true;
      lastRefresh.current = performance.now();
      setSourceError('');
      const status = await window.electronAPI.getScreenRecordingPermissionStatus().catch(() => ({status:'unknown'}));
      if (id !== requestId.current) return;
      setPermission(status.status);
      try {
        const rawSources = await window.electronAPI.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1280, height: 800 },
          fetchWindowIcons: true
        });
        if (id !== requestId.current) return;
        setSources(
          rawSources.map(source => {
            const metadata = parseSourceMetadata(source);

            return {
              id: source.id,
              name: metadata.displayName,
              thumbnail: source.thumbnail,
              display_id: source.display_id,
              appIcon: source.appIcon,
              originalName: source.name,
              sourceType: metadata.sourceType,
              appName: metadata.appName,
              windowTitle: metadata.windowTitle,
            };
          })
        );
      } catch (error) {
        if (id !== requestId.current) return;
        setSourceError('load');
        console.error('Error loading sources:', error);
      } finally {
        if (id === requestId.current) { hasLoaded.current = true; inFlight.current = false; setLoading(false); setRefreshing(false); }
      }
    }
    void fetchSources();
    return () => { requestId.current++; };
  }, [refreshToken]);

  useEffect(() => {
    const refresh = () => { if (!inFlight.current && performance.now() - lastRefresh.current > 2000) setRefreshToken(n => n + 1); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const screenSources = sources.filter(s => s.id.startsWith('screen:'));
  const windowSources = sources.filter(s => s.id.startsWith('window:'));

  useEffect(() => {
    if (loading) {
      return;
    }

    if (screenSources.length === 0 && windowSources.length > 0) {
      setActiveTab('windows');
      return;
    }

    if (windowSources.length === 0 && screenSources.length > 0) {
      setActiveTab('screens');
    }
  }, [loading, screenSources.length, windowSources.length]);

  const handleSourceSelect = (source: DesktopSource) => { setSelectedSource(source); };
  const shareSource = (source: DesktopSource) => window.electronAPI.selectSource({ ...source, captureRegion: null });
  const handleShare = async () => {
    if (selectedSource) await shareSource(selectedSource);
  };
  const selectedBadge = (
    <div className="absolute -top-1.5 -right-1.5">
      <div className="w-5 h-5 bg-[#c2b6ff] text-[#211a34] rounded-full flex items-center justify-center shadow-md">
        <MdCheck size={13} />
      </div>
    </div>
  );

  const titleBar = <header className={styles.titleBar}>
    <span>{t('sourceSelector.title', 'Choose a screen or window')}</span>
    <button type="button" className={styles.closeButton} aria-label={t('sourceSelector.close', 'Close source selection')} onClick={() => window.close()}>×</button>
  </header>;

  if (loading) {
    return (
      <div className={`h-screen flex flex-col ${styles.glassContainer}`}>
        {titleBar}
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/15 border-t-[#c2b6ff] mx-auto mb-2" />
          <p className="text-xs text-zinc-300">{t('sourceSelector.loadingSources')}</p>
        </div></div>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden flex flex-col items-center ${styles.glassContainer}`}>
      {titleBar}
      <div className="w-full px-3 py-2 flex flex-wrap items-center gap-2 text-xs text-zinc-300 shrink-0">
        <button type="button" disabled={refreshing} aria-busy={refreshing} data-testid="sources-refresh" className="inline-flex h-7 items-center gap-1.5 rounded-md bg-white/10 px-3 hover:bg-white/15 disabled:opacity-50" onClick={() => setRefreshToken(n => n + 1)}>{refreshing && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />}{t('sourceSelector.refresh', 'Refresh sources')}</button>
        <span>{permission === 'granted' ? t('sourceSelector.permissionGranted', 'Screen recording is allowed') : t('sourceSelector.permissionCheck', 'Check the screen recording permission for this app')}</span>
        {permission !== 'granted' && <button type="button" className="rounded text-[#c2b6ff] underline underline-offset-2 hover:text-[#ded6ff]" onClick={() => void window.electronAPI.openScreenRecordingPreferences()}>{t('sourceSelector.openSettings', 'Open System Settings')}</button>}
        {sourceError && <p role="alert" className="w-full text-amber-300">{t('sourceSelector.loadError', 'The source list could not be loaded.')}</p>}
        {!sources.length && !sourceError && <p role="status" className="w-full">{t('sourceSelector.noSources', 'No sources found.')}</p>}
      </div>
      <div className="w-full flex-1 min-h-0 flex flex-col items-center px-3">
      <div className="flex-1 min-h-0 flex flex-col w-full max-w-xl">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'screens' | 'windows')} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid grid-cols-2 mb-2 shrink-0 bg-zinc-900/40 rounded-full">
            <TabsTrigger value="screens" className="data-[state=active]:bg-[#c2b6ff] data-[state=active]:text-[#211a34] text-zinc-200 hover:text-white rounded-full text-xs py-1">
              {t('sourceSelector.screens')} ({screenSources.length})
            </TabsTrigger>
            <TabsTrigger value="windows" className="data-[state=active]:bg-[#c2b6ff] data-[state=active]:text-[#211a34] text-zinc-200 hover:text-white rounded-full text-xs py-1">
              {t('sourceSelector.windows')} ({windowSources.length})
            </TabsTrigger>
          </TabsList>
            <div className="flex-1 min-h-0 flex flex-col">
            <TabsContent value="screens" className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex">
              <div role="radiogroup" aria-label={t('sourceSelector.title', 'Choose a screen or window')} className={`grid grid-cols-2 content-start gap-3 flex-1 min-h-0 overflow-y-auto p-1.5 relative ${styles.sourceGridScroll}`}>
                {screenSources.length === 0 && (
                  <div className="col-span-2 text-center text-xs text-zinc-400 py-8">{t('sourceSelector.noScreens', 'No screens available')}</div>
                )}
                {screenSources.map(source => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedSource?.id === source.id}
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit w-full p-2 text-left`}
                    onClick={() => handleSourceSelect(source)}
                    onDoubleClick={() => void shareSource(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        {source.thumbnail ? <img src={source.thumbnail} alt={source.name} className="w-full aspect-video object-contain rounded border border-zinc-800"/> : <div className="w-full aspect-video rounded border border-zinc-800 bg-zinc-900 flex items-center justify-center text-xs text-zinc-400">{t('sourceSelector.noPreview', 'No preview · The screen can still be selected')}</div>}
                        {selectedSource?.id === source.id && selectedBadge}
                      </div>
                      <div className={styles.name + " truncate"}>{source.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="windows" className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex">
              <p className="text-[11px] text-zinc-400 mb-1.5 px-1 shrink-0">{t('sourceSelector.windowsNote')}</p>
              <div role="radiogroup" aria-label={t('sourceSelector.title', 'Choose a screen or window')} className={`grid grid-cols-2 content-start gap-3 flex-1 min-h-0 overflow-y-auto p-1.5 relative ${styles.sourceGridScroll}`}>
                {windowSources.length === 0 && (
                  <div className="col-span-2 text-center text-xs text-zinc-400 py-8">{t('sourceSelector.noWindows', 'No windows available')}</div>
                )}
                {windowSources.map(source => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedSource?.id === source.id}
                    key={source.id}
                    className={`${styles.sourceCard} ${selectedSource?.id === source.id ? styles.selected : ''} cursor-pointer h-fit w-full p-2 text-left`}
                    onClick={() => handleSourceSelect(source)}
                    onDoubleClick={() => void shareSource(source)}
                  >
                    <div className="p-1">
                      <div className="relative mb-1">
                        {source.thumbnail ? (
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="w-full aspect-video object-cover rounded border border-gray-700"
                          />
                        ) : (
                          <div className="w-full aspect-video rounded border border-gray-700 bg-zinc-900/80 flex flex-col items-center justify-center text-zinc-400 gap-2">
                            {source.appIcon ? (
                              <img
                                src={source.appIcon}
                                alt=""
                                className="w-8 h-8 rounded-md"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-md bg-zinc-800 border border-zinc-700" />
                            )}
                            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{t('sourceSelector.windowPlaceholder')}</div>
                          </div>
                        )}
                        {selectedSource?.id === source.id && selectedBadge}
                      </div>
                      <div className="flex items-center gap-1">
                        {source.appIcon && (
                          <img
                            src={source.appIcon}
                            alt=""
                            className={styles.icon + " flex-shrink-0"}
                          />
                        )}
                        <div className={styles.name + " truncate"}>{source.name}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
      {selectedSource?.sourceType === 'screen' && <div className="w-full max-w-xl shrink-0">
        <button
          type="button"
          className="my-2 rounded-md border border-white/15 px-3 py-1.5 text-xs text-zinc-100 hover:bg-white/10"
          title={t('regionSelector.selectAreaTitle', 'Select an area of the screen to record')}
          onClick={() => void window.electronAPI.openRegionSelector(selectedSource)}
        >
          {t('regionSelector.selectAreaOnScreen', 'Select area on screen')}
        </button>
      </div>}
      </div>
      <div className="shrink-0 bg-zinc-900 border-t border-zinc-800 p-2 w-full max-w-xl">
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => window.close()} className="px-4 py-1 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700">{t('sourceSelector.cancel')}</Button>
          <Button onClick={handleShare} disabled={!selectedSource} className="px-4 py-1 text-xs font-semibold bg-[#c2b6ff] text-[#211a34] hover:bg-[#d3caff] disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-300">{t('sourceSelector.share')}</Button>
        </div>
      </div>
    </div>
  );
}

