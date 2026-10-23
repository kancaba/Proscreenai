import { useEffect, useRef, useState } from "react";
import { BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { FaFolderOpen } from "react-icons/fa6";
import { FiMinus, FiX } from "react-icons/fi";
import { MdMic, MdMicOff, MdMonitor, MdVideoFile, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { Languages, Timer, Square, Pause, Play, LoaderCircle, Scan, MousePointerClick } from "lucide-react";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useScopedT } from "../../contexts/I18nContext";
import { Button } from "../ui/button";
import { AudioLevelMeter } from "../ui/audio-level-meter";
import { ContentClamp } from "../ui/content-clamp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useI18n } from "@/contexts/I18nContext";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import type { AppLocale } from "@/i18n/config";
import styles from "./LaunchWindow.module.css";

export function LaunchWindow() {
  const { locale, setLocale } = useI18n();
  const t = useScopedT('launch');

  const LOCALE_LABELS: Record<string, string> = { tr: "TR", en: "EN", es: "ES", "zh-CN": "中文" };
  const {
    recording, paused, pauseSupported, pausePending, elapsedSeconds, busy, finishing, togglePause,
    countdownActive,
    toggleRecording,
    microphoneEnabled,
    setMicrophoneEnabled,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    systemAudioEnabled,
    setSystemAudioEnabled,
    captureResolution, setCaptureResolution, captureFps, setCaptureFps, captureFormat,
    countdownDelay,
    setCountdownDelay,
  } = useScreenRecorder();
  const pauseAction = useRef(togglePause);
  pauseAction.current = togglePause;
  useEffect(() => {
    if (!recording || !pauseSupported) return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,textarea,select,[contenteditable="true"]') || target?.closest('button')) return;
      event.preventDefault(); void pauseAction.current();
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [recording, pauseSupported]);
  const elapsed = elapsedSeconds;
  const controlsLocked = recording || countdownActive || busy;
  const showMicControls = microphoneEnabled && !controlsLocked;
  const { devices, selectedDeviceId, setSelectedDeviceId } = useMicrophoneDevices(microphoneEnabled);
  const { level } = useAudioLevelMeter({
    enabled: showMicControls,
    deviceId: microphoneDeviceId,
  });

  useEffect(() => {
    if (selectedDeviceId && selectedDeviceId !== "default") {
      setMicrophoneDeviceId(selectedDeviceId);
    }
  }, [selectedDeviceId, setMicrophoneDeviceId]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const [selectedSource, setSelectedSource] = useState(locale === "tr" ? "Ekran seç" : "Select screen");
  const [hasSelectedSource, setHasSelectedSource] = useState(false);
  const [recordingsDirectory, setRecordingsDirectory] = useState<string | null>(null);
  // Click tracking (and so click zooms) needs Accessibility on macOS; recording works without it.
  const [clickTrackingAllowed, setClickTrackingAllowed] = useState(true);

  useEffect(() => {
    if (recording) return;
    let cancelled = false;
    const check = async () => {
      const status = await window.electronAPI?.getAccessibilityPermissionStatus?.();
      if (!cancelled && status?.success) setClickTrackingAllowed(status.trusted);
    };
    void check();
    const interval = setInterval(check, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [recording]);

  const allowClickTracking = async () => {
    const status = await window.electronAPI.requestAccessibilityPermission();
    if (!status.trusted) await window.electronAPI.openAccessibilityPreferences();
  };

  useEffect(() => {
    if (recording || busy) return;
    const checkSelectedSource = async () => {
      if (window.electronAPI) {
        const source = await window.electronAPI.getSelectedSource();
        if (source) {
          setSelectedSource(source.name);
          setHasSelectedSource(true);
        } else {
          setSelectedSource(locale === "tr" ? "Ekran seç" : "Select screen");
          setHasSelectedSource(false);
        }
      }
    };

    void checkSelectedSource();
    const interval = setInterval(checkSelectedSource, 500);
    return () => clearInterval(interval);
  }, [recording, busy, locale]);

  const openSourceSelector = () => {
    window.electronAPI?.openSourceSelector();
  };

  const openVideoFile = async () => {
    const result = await window.electronAPI.openVideoFilePicker();
    if (result.canceled) {
      return;
    }

    if (result.success && result.path) {
      await window.electronAPI.setCurrentVideoPath(result.path);
      await window.electronAPI.switchToEditor();
    }
  };

  const openProjectFile = async () => {
    const result = await window.electronAPI.loadProjectFile();
    if (result.canceled || !result.success) {
      return;
    }
    await window.electronAPI.switchToEditor();
  };

  const sendHudOverlayHide = () => {
    window.electronAPI?.hudOverlayHide?.();
  };

  const sendHudOverlayClose = () => {
    window.electronAPI?.hudOverlayClose?.();
  };

  const chooseRecordingsDirectory = async () => {
    const result = await window.electronAPI.chooseRecordingsDirectory();
    if (result.canceled) {
      return;
    }
    if (result.success && result.path) {
      setRecordingsDirectory(result.path);
    }
  };

  useEffect(() => {
    const loadRecordingsDirectory = async () => {
      const result = await window.electronAPI.getRecordingsDirectory();
      if (result.success) {
        setRecordingsDirectory(result.path);
      }
    };

    void loadRecordingsDirectory();
  }, []);

  const recordingsDirectoryName = recordingsDirectory
    ? recordingsDirectory.split(/[\\/]/).filter(Boolean).pop() || recordingsDirectory
    : "recordings";
  const dividerClass = "mx-1 h-5 w-px shrink-0 bg-white/35";

  const toggleMicrophone = () => {
    if (!recording) {
      setMicrophoneEnabled(!microphoneEnabled);
    }
  };

  if (finishing) return <div className={styles.processingContainer} role="status" aria-live="polite">
    <LoaderCircle size={20} className={styles.spinner}/><strong>{t('recording.finalizing')}</strong>
    <span>{t('recording.keepOpen')}</span>
  </div>;

  if (recording) {
    return (
      <div className={styles.compactContainer}>
        <div className={`${styles.compactBar} ${styles.electronDrag}`} data-testid="recording-compact">
          <RxDragHandleDots2 size={14} className="text-white/35 shrink-0" />
          <span className={`${styles.recordingLight} ${paused ? styles.pausedLight : ""}`} title={paused ? t("recording.paused") : t("recording.record")} />
          <span className={`${styles.recordingTime} ${paused ? styles.pausedTime : ""}`} data-testid="recording-timer" role="timer">{formatTime(elapsed)}</span>
          <button type="button" onClick={togglePause} disabled={pausePending || !pauseSupported}
            className={`${styles.compactPause} ${styles.electronNoDrag}`} data-testid="recording-pause"
            title={!pauseSupported ? t('recording.pauseUnavailable') : paused ? `${t('recording.resume')} · Space` : `${t('recording.pause')} · Space`}
            aria-label={paused ? t('recording.resume') : t('recording.pause')} aria-pressed={paused}>
            {pausePending ? <LoaderCircle size={13} className={styles.spinner}/> : paused ? <Play size={13} fill="currentColor"/> : <Pause size={13}/>}
          </button>
          <button type="button" onClick={toggleRecording} disabled={pausePending}
            className={`${styles.compactStop} ${styles.electronNoDrag}`}
            title={t('recording.stop')} aria-label={t('recording.stop')}>
            <Square size={12} fill="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-end justify-center bg-transparent overflow-hidden">
      <div className={`flex flex-col items-center gap-2 mx-auto ${styles.electronDrag}`}>
        <div className={`flex items-center gap-2 rounded-full border border-white/15 bg-[#181820] px-3 py-1.5 text-[11px] text-slate-300 ${styles.electronNoDrag}`}>
          <label>{locale === 'tr' ? 'Kayıt' : 'Capture'} <select aria-label={locale === 'tr' ? 'Kayıt çözünürlüğü' : 'Capture resolution'} data-testid="capture-resolution" value={captureResolution} onChange={event => setCaptureResolution(event.target.value)} disabled={controlsLocked} className="ml-1 rounded bg-[#272731] px-1 py-0.5 outline-none">
            <option value="source">{locale === 'tr' ? 'Orijinal' : 'Source'}</option><option value="720">720p</option><option value="1080">1080p</option><option value="1440">1440p</option><option value="2160">4K</option>
          </select></label>
          <select aria-label="Capture FPS" data-testid="capture-fps" value={captureFps} disabled={controlsLocked} onChange={event => setCaptureFps(Number(event.target.value) as 30 | 60)} className="rounded bg-[#272731] px-1 py-0.5 outline-none"><option value="30">30 FPS</option><option value="60">60 FPS</option></select>
          <span className="max-w-[180px] truncate text-[10px] text-slate-500" title={captureFormat}>{captureFormat || (locale === 'tr' ? 'Oran korunur · küçük kaynak büyütülmez' : 'Preserve aspect · no upscaling')}</span>
          {!clickTrackingAllowed && (
            <button
              type="button"
              data-testid="click-tracking-permission"
              onClick={() => void allowClickTracking()}
              disabled={controlsLocked}
              title={t("permissions.clickTrackingTitle")}
              className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-200 hover:bg-amber-400/25"
            >
              <MousePointerClick size={11} />
              {t("permissions.clickTrackingOff")}
              <span className="font-semibold underline underline-offset-2">{t("permissions.clickTrackingAllow")}</span>
            </button>
          )}
        </div>
        {showMicControls && (
          <div
            className={`flex items-center gap-2 rounded-full border border-white/15 bg-[rgba(18,18,26,0.92)] px-3 py-2 shadow-xl backdrop-blur-xl ${styles.electronNoDrag}`}
          >
            <select
              value={microphoneDeviceId || selectedDeviceId}
              onChange={(event) => {
                setSelectedDeviceId(event.target.value);
                setMicrophoneDeviceId(event.target.value);
              }}
              className={`max-w-[230px] rounded-full border border-white/15 bg-[#131722] px-3 py-1 text-xs text-slate-100 outline-none ${styles.micSelect}`}
            >
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
            <AudioLevelMeter level={level} className="w-24" />
          </div>
        )}

        <div
          className={`w-full mx-auto flex items-center gap-1.5 px-3 py-2 ${styles.electronDrag} ${styles.hudBar}`}
          style={{
            borderRadius: 9999,
            background: "linear-gradient(135deg, rgba(28,28,36,0.97) 0%, rgba(18,18,26,0.96) 100%)",
            backdropFilter: "blur(16px) saturate(140%)",
            WebkitBackdropFilter: "blur(16px) saturate(140%)",
            border: "1px solid rgba(80,80,120,0.25)",
            minHeight: 48,
          }}
        >
          <div className={`flex items-center px-1 ${styles.electronDrag}`}>
            <RxDragHandleDots2 size={16} className="text-white/35" />
          </div>

          <Button
            variant="link"
            size="sm"
            className={`gap-1 text-white/80 bg-transparent hover:bg-transparent px-0 text-xs ${styles.electronNoDrag}`}
            onClick={openSourceSelector}
            disabled={controlsLocked}
            title={selectedSource}
          >
            <MdMonitor size={14} className="text-white/80" />
            <ContentClamp truncateLength={12}>{selectedSource}</ContentClamp>
          </Button>

          <Button
            variant="link"
            size="sm"
            className={`gap-1 text-white/80 bg-transparent hover:bg-transparent px-0 text-xs ${styles.electronNoDrag}`}
            onClick={() => void window.electronAPI?.openRegionSelector()}
            disabled={controlsLocked}
            title={t("regionSelector.selectAreaTitle", "Select an area of the screen to record")}
            aria-label={t("regionSelector.selectAreaTitle", "Select an area of the screen to record")}
          >
            <Scan size={14} className="text-white/80" />
            {t("regionSelector.selectArea", "Area")}
          </Button>

          <div className={dividerClass} />

          <div className={`flex items-center gap-1 ${styles.electronNoDrag}`}>
            <Button
              variant="link"
              size="icon"
              onClick={() => !recording && setSystemAudioEnabled(!systemAudioEnabled)}
              disabled={controlsLocked}
              title={systemAudioEnabled ? t('recording.disableSystemAudio') : t('recording.enableSystemAudio')}
              className="text-white/80 hover:bg-transparent"
            >
              {systemAudioEnabled ? <MdVolumeUp size={16} className="text-[#2563EB]" /> : <MdVolumeOff size={16} className="text-white/35" />}
            </Button>
            <Button
              variant="link"
              size="icon"
              onClick={toggleMicrophone}
              disabled={controlsLocked}
              title={microphoneEnabled ? t('recording.disableMicrophone') : t('recording.enableMicrophone')}
              className="text-white/80 hover:bg-transparent"
            >
              {microphoneEnabled ? <MdMic size={16} className="text-[#2563EB]" /> : <MdMicOff size={16} className="text-white/35" />}
            </Button>
          </div>

          <div className={dividerClass} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="link"
                size="sm"
                disabled={controlsLocked}
                title={t('recording.countdownDelay')}
                className={`gap-1 text-white/70 hover:bg-transparent px-1 text-xs ${styles.electronNoDrag}`}
              >
                <Timer size={14} />
                <span>{countdownDelay > 0 ? `${countdownDelay}s` : t('recording.noDelay')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              className="min-w-[80px] max-h-none overflow-visible bg-[rgba(28,28,36,0.97)] border-white/15 text-white/90 backdrop-blur-xl"
            >
              {[0, 3, 5, 10].map((delay) => (
                <DropdownMenuItem
                  key={delay}
                  onSelect={() => setCountdownDelay(delay)}
                  className={`text-xs cursor-pointer ${
                    countdownDelay === delay ? "text-white font-medium" : "text-white/60"
                  }`}
                >
                  {delay === 0 ? t('recording.noDelay') : `${delay}s`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="link"
            size="sm"
            onClick={hasSelectedSource ? toggleRecording : openSourceSelector}
            disabled={controlsLocked || !hasSelectedSource}
            className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 text-xs ${styles.electronNoDrag}`}
          >
            {recording ? (
              <>
                <FaRegStopCircle size={14} className="text-red-400" />
                <span className="text-red-400 font-medium tabular-nums">{formatTime(elapsed)}</span>
              </>
            ) : (
              <>
                <>{busy ? <LoaderCircle size={14} className={styles.spinner}/> : <BsRecordCircle size={14} className={hasSelectedSource ? "text-white/85" : "text-white/35"} />}</>
                <span className={hasSelectedSource ? "text-white/80" : "text-white/35"}>{busy ? t('recording.starting') : t('recording.record')}</span>
              </>
            )}
          </Button>

          <Button
            variant="link"
            size="sm"
            onClick={chooseRecordingsDirectory}
            disabled={controlsLocked}
            title={recordingsDirectory ? t('recording.recordingFolder', undefined, { path: recordingsDirectory }) : t('recording.chooseRecordingsFolder')}
            className={`text-white/75 hover:bg-transparent px-1 text-[11px] underline decoration-white/45 underline-offset-2 ${styles.electronNoDrag}`}
          >
            <ContentClamp truncateLength={18}>{t('recording.folderPath', undefined, { name: recordingsDirectoryName })}</ContentClamp>
          </Button>

          <div className="ml-auto flex items-center gap-0.5">
            <div className={dividerClass} />
            <Button
              variant="link"
              size="icon"
              onClick={openVideoFile}
              disabled={controlsLocked}
              title={t('recording.openVideoFile')}
              className={`text-white/70 hover:bg-transparent ${styles.electronNoDrag}`}
            >
              <MdVideoFile size={15} />
            </Button>
            <Button
              variant="link"
              size="icon"
              onClick={openProjectFile}
              disabled={controlsLocked}
              title={t('recording.openProject')}
              className={`text-white/70 hover:bg-transparent ${styles.electronNoDrag}`}
            >
              <FaFolderOpen size={14} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="link"
                  size="icon"
                  title="Language"
                  className={`text-white/70 hover:bg-transparent ${styles.electronNoDrag}`}
                >
                  <Languages size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                className="min-w-[90px] bg-[rgba(28,28,36,0.97)] border-white/15 text-white/90 backdrop-blur-xl"
              >
                {SUPPORTED_LOCALES.map((code) => (
                  <DropdownMenuItem
                    key={code}
                    onSelect={() => setLocale(code as AppLocale)}
                    className={`text-xs cursor-pointer ${
                      locale === code ? "text-white font-medium" : "text-white/60"
                    }`}
                  >
                    {LOCALE_LABELS[code] ?? code}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className={dividerClass} />
            <Button
              variant="link"
              size="icon"
              onClick={sendHudOverlayHide}
              title={t('recording.hideHud')}
              className={`text-white/70 hover:bg-transparent ${styles.electronNoDrag}`}
            >
              <FiMinus size={16} />
            </Button>
            <Button
              variant="link"
              size="icon"
              onClick={sendHudOverlayClose}
              title={t('recording.closeApp')}
              className={`text-white/70 hover:bg-transparent ${styles.electronNoDrag}`}
            >
              <FiX size={16} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

