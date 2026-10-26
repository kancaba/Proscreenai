import { useEffect, useRef, useState } from "react";
import { FiMinus, FiX } from "react-icons/fi";
import { MdMic, MdMicOff, MdMonitor, MdVolumeOff, MdVolumeUp } from "react-icons/md";
import { Timer, Square, Pause, Play, LoaderCircle, Scan, MousePointerClick, MoreHorizontal } from "lucide-react";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useAudioLevelMeter } from "../../hooks/useAudioLevelMeter";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useScopedT } from "../../contexts/I18nContext";
import { AudioLevelMeter } from "../ui/audio-level-meter";
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

  const tr = locale === "tr";
  const qualityHint = captureFormat || (tr ? "Oran korunur · küçük kaynak büyütülmez" : "Preserve aspect · no upscaling");
  const noDrag = styles.electronNoDrag;

  // The bar's window is only as tall as the bar, so its menus are native popups.
  const chooseCountdown = async () => {
    const chosen = await window.electronAPI.showHudMenu([0, 3, 5, 10].map((delay) => ({ id: String(delay), label: delay === 0 ? t("recording.noDelay") : `${delay}s`, type: "radio" as const, checked: countdownDelay === delay })));
    if (chosen !== null) setCountdownDelay(Number(chosen));
  };
  const openMoreMenu = async () => {
    const chosen = await window.electronAPI.showHudMenu([
      { id: "open-video", label: t("recording.openVideoFile") },
      { id: "open-project", label: t("recording.openProject") },
      { id: "recordings-folder", label: recordingsDirectory ? t("recording.recordingFolder", undefined, { path: recordingsDirectoryName }) : t("recording.chooseRecordingsFolder") },
      { type: "separator" },
      { label: tr ? "Dil" : "Language", submenu: SUPPORTED_LOCALES.map((code) => ({ id: `locale:${code}`, label: LOCALE_LABELS[code] ?? code, type: "radio" as const, checked: locale === code })) },
    ]);
    if (chosen === "open-video") void openVideoFile();
    else if (chosen === "open-project") void openProjectFile();
    else if (chosen === "recordings-folder") void chooseRecordingsDirectory();
    else if (chosen?.startsWith("locale:")) setLocale(chosen.slice("locale:".length) as AppLocale);
  };

  return (
    <div className={styles.hudRoot}>
      <div className={`${styles.subPill} ${noDrag}`} title={qualityHint}>
        <span className={styles.subLabel}>{tr ? "Kalite" : "Quality"}</span>
        <select aria-label={tr ? "Kayıt çözünürlüğü" : "Capture resolution"} data-testid="capture-resolution" value={captureResolution} onChange={(event) => setCaptureResolution(event.target.value)} disabled={controlsLocked} className={styles.subSelect}>
          <option value="source">{tr ? "Orijinal" : "Source"}</option><option value="720">720p</option><option value="1080">1080p</option><option value="1440">1440p</option><option value="2160">4K</option>
        </select>
        <select aria-label="Capture FPS" data-testid="capture-fps" value={captureFps} disabled={controlsLocked} onChange={(event) => setCaptureFps(Number(event.target.value) as 30 | 60)} className={styles.subSelect}>
          <option value="30">30 FPS</option><option value="60">60 FPS</option>
        </select>
        {!clickTrackingAllowed && (
          <button type="button" data-testid="click-tracking-permission" onClick={() => void allowClickTracking()} disabled={controlsLocked} title={t("permissions.clickTrackingTitle")} className={styles.permissionChip}>
            <MousePointerClick size={11} />
            {t("permissions.clickTrackingOff")}
            <span className={styles.permissionAction}>{t("permissions.clickTrackingAllow")}</span>
          </button>
        )}
      </div>

      {showMicControls && (
        <div className={`${styles.subPill} ${noDrag}`}>
          <MdMic size={13} className={styles.subIcon} />
          <select
            aria-label={tr ? "Mikrofon" : "Microphone"}
            value={microphoneDeviceId || selectedDeviceId}
            onChange={(event) => {
              setSelectedDeviceId(event.target.value);
              setMicrophoneDeviceId(event.target.value);
            }}
            className={`${styles.subSelect} ${styles.micSelect}`}
          >
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || (tr ? "Mikrofon" : "Microphone")}
              </option>
            ))}
          </select>
          <AudioLevelMeter level={level} className="h-4 w-20" />
        </div>
      )}

      <div className={`${styles.bar} ${styles.electronDrag}`} data-testid="recorder-bar">
        <RxDragHandleDots2 size={15} className={styles.grip} />

        <div className={`${styles.group} ${noDrag}`}>
          <button type="button" onClick={openSourceSelector} disabled={controlsLocked} title={selectedSource} className={`${styles.chip} ${hasSelectedSource ? styles.chipSelected : ""}`}>
            <MdMonitor size={14} />
            <span className={styles.chipText}>{selectedSource}</span>
          </button>
          <button
            type="button"
            onClick={() => void window.electronAPI?.openRegionSelector()}
            disabled={controlsLocked}
            title={t("regionSelector.selectAreaTitle", "Select an area of the screen to record")}
            aria-label={t("regionSelector.selectAreaTitle", "Select an area of the screen to record")}
            className={styles.chip}
          >
            <Scan size={14} />
            <span>{t("regionSelector.selectArea", "Area")}</span>
          </button>
        </div>

        <span className={styles.divider} />

        <div className={`${styles.group} ${noDrag}`}>
          <button
            type="button"
            onClick={() => !recording && setSystemAudioEnabled(!systemAudioEnabled)}
            disabled={controlsLocked}
            aria-pressed={systemAudioEnabled}
            title={systemAudioEnabled ? t("recording.disableSystemAudio") : t("recording.enableSystemAudio")}
            aria-label={systemAudioEnabled ? t("recording.disableSystemAudio") : t("recording.enableSystemAudio")}
            className={styles.toggle}
          >
            {systemAudioEnabled ? <MdVolumeUp size={16} /> : <MdVolumeOff size={16} />}
          </button>
          <button
            type="button"
            onClick={toggleMicrophone}
            disabled={controlsLocked}
            aria-pressed={microphoneEnabled}
            title={microphoneEnabled ? t("recording.disableMicrophone") : t("recording.enableMicrophone")}
            aria-label={microphoneEnabled ? t("recording.disableMicrophone") : t("recording.enableMicrophone")}
            className={styles.toggle}
          >
            {microphoneEnabled ? <MdMic size={16} /> : <MdMicOff size={16} />}
          </button>
          <button type="button" onClick={() => void chooseCountdown()} disabled={controlsLocked} title={t("recording.countdownDelay")} className={styles.chip}>
            <Timer size={14} />
            <span className="tabular-nums">{countdownDelay > 0 ? `${countdownDelay}s` : (tr ? "Kapalı" : "Off")}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={hasSelectedSource ? toggleRecording : openSourceSelector}
          disabled={controlsLocked || !hasSelectedSource}
          title={hasSelectedSource ? t("recording.record") : t("permissions.selectSource")}
          className={`${styles.recordButton} ${noDrag}`}
        >
          {busy ? <LoaderCircle size={14} className={styles.spinner} /> : <span className={styles.recordDot} />}
          <span>{busy ? t("recording.starting") : t("recording.record")}</span>
        </button>

        <div className={`${styles.group} ${noDrag}`}>
          <button type="button" onClick={() => void openMoreMenu()} disabled={controlsLocked} title={tr ? "Diğer" : "More"} aria-label={tr ? "Diğer" : "More"} className={styles.iconButton}>
            <MoreHorizontal size={16} />
          </button>
          <span className={styles.divider} />
          <button type="button" onClick={sendHudOverlayHide} title={t("recording.hideHud")} aria-label={t("recording.hideHud")} className={styles.iconButton}>
            <FiMinus size={15} />
          </button>
          <button type="button" onClick={sendHudOverlayClose} title={t("recording.closeApp")} aria-label={t("recording.closeApp")} className={`${styles.iconButton} ${styles.closeButton}`}>
            <FiX size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

