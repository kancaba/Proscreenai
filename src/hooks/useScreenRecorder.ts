import { captureLimits, type VideoFps } from '@/lib/video/outputSettings';
import { useState, useRef, useEffect, useCallback } from "react";
import { useScopedT } from "../contexts/I18nContext";

const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const QHD_PIXELS = QHD_WIDTH * QHD_HEIGHT;
const BITRATE_4K = 45_000_000;
const BITRATE_QHD = 28_000_000;
const BITRATE_BASE = 18_000_000;
const HIGH_FRAME_RATE_THRESHOLD = 60;
const HIGH_FRAME_RATE_BOOST = 1.7;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const CODEC_ALIGNMENT = 2;
const RECORDER_TIMESLICE_MS = 1000;
const BITS_PER_MEGABIT = 1_000_000;
const MIN_FRAME_RATE = 30;
const CHROME_MEDIA_SOURCE = "desktop";
const AUDIO_BITRATE_VOICE = 128_000;
const AUDIO_BITRATE_SYSTEM = 192_000;
const MIC_GAIN_BOOST = 1.4;

type UseScreenRecorderReturn = {
  recording: boolean;
  paused: boolean;
  pauseSupported: boolean;
  pausePending: boolean;
  elapsedSeconds: number;
  busy: boolean;
  finishing: boolean;
  togglePause: () => Promise<void>;
  countdownActive: boolean;
  toggleRecording: () => void;
  preparePermissions: (options?: { startup?: boolean }) => Promise<boolean>;
  isMacOS: boolean;
  microphoneEnabled: boolean;
  setMicrophoneEnabled: (enabled: boolean) => void;
  microphoneDeviceId: string | undefined;
  setMicrophoneDeviceId: (deviceId: string | undefined) => void;
  systemAudioEnabled: boolean;
  setSystemAudioEnabled: (enabled: boolean) => void;
  captureResolution: string;
  setCaptureResolution: (value: string) => void;
  captureFps: VideoFps;
  setCaptureFps: (value: VideoFps) => void;
  captureFormat: string;
  countdownDelay: number;
  setCountdownDelay: (delay: number) => void;
};


const SKIP_CLICK_PROMPT_KEY = "screenmovie.clickTracking.skipPrompt";
/** The user chose "record without it, do not ask again". */
function skipClickTrackingPrompt() {
  try {
    return localStorage.getItem(SKIP_CLICK_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}
function rememberSkipClickTrackingPrompt() {
  try {
    localStorage.setItem(SKIP_CLICK_PROMPT_KEY, "1");
  } catch {
    // A preference only.
  }
}

export function useScreenRecorder(): UseScreenRecorderReturn {
  const t = useScopedT("launch");
  const [captureResolution, setCaptureResolution] = useState(() => { try { const value = localStorage.getItem('screenmovie.captureResolution'); return ['source','720','1080','1440','2160'].includes(value ?? '') ? value! : 'source' } catch { return 'source' } });
  const [captureFps, setCaptureFps] = useState<VideoFps>(() => { try { return localStorage.getItem('screenmovie.captureFps') === '30' ? 30 : 60 } catch { return 60 } });
  const [captureFormat, setCaptureFormat] = useState('');
  useEffect(() => { try { localStorage.setItem('screenmovie.captureResolution', captureResolution); localStorage.setItem('screenmovie.captureFps', String(captureFps)) } catch { /* settings are optional */ } }, [captureResolution, captureFps]);
  const limits = captureLimits(captureResolution);
  const TARGET_FRAME_RATE = captureFps;
  const TARGET_WIDTH = limits.maxWidth;
  const TARGET_HEIGHT = limits.maxHeight;

  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseSupported, setPauseSupported] = useState(true);
  const [pausePending, setPausePending] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const pauseInFlight = useRef(false);
  const pauseRevision = useRef(0);
  const [countdownActive, setCountdownActive] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState<string | undefined>(undefined);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(false);
  const [countdownDelay, setCountdownDelayState] = useState(3);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const mixingContext = useRef<AudioContext | null>(null);
  const nativeScreenRecording = useRef(false);
  const wgcRecording = useRef(false);
  const startInFlight = useRef(false);
  const hasPromptedForReselect = useRef(false);
  const countdownDelayLoaded = useRef(false);

  const preparePermissions = useCallback(async (options: { startup?: boolean } = {}) => {
    const platform = await window.electronAPI.getPlatform();
    if (platform !== "darwin") {
      return true;
    }

    const screenPermission = await window.electronAPI.getScreenRecordingPermissionStatus();
    if (!screenPermission.success || screenPermission.status !== "granted") {
      await window.electronAPI.openScreenRecordingPreferences();
      alert(
        options.startup
          ? t("permissions.screenRecordingNeeded")
          : t("permissions.screenRecordingMissing"),
      );
      return false;
    }

    // Clicks are tracked only when Accessibility is granted before the recording starts.
    // Ask, but never block recording: the user may record without it.
    if (!options.startup && !skipClickTrackingPrompt()) {
      const access = await window.electronAPI.getAccessibilityPermissionStatus();
      if (access.success && !access.trusted) {
        const answer = await window.electronAPI.confirmRecordingWithoutClickTracking({
          message: t("permissions.clickTrackingPrompt.message"),
          detail: t("permissions.clickTrackingPrompt.detail"),
          allow: t("permissions.clickTrackingPrompt.allow"),
          recordAnyway: t("permissions.clickTrackingPrompt.recordAnyway"),
          cancel: t("permissions.clickTrackingPrompt.cancel"),
          dontAsk: t("permissions.clickTrackingPrompt.dontAsk"),
        });
        if (answer.dontAskAgain) rememberSkipClickTrackingPrompt();
        if (answer.choice !== "record") return false;
      }
    }
    return true;
  }, [t]);

  const selectMimeType = () => {
    const preferred = [
      "video/webm;codecs=av1",
      "video/webm;codecs=h264",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];

    return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
  };

  const computeBitrate = (width: number, height: number) => {
    const pixels = width * height;
    const highFrameRateBoost =
      TARGET_FRAME_RATE >= HIGH_FRAME_RATE_THRESHOLD ? HIGH_FRAME_RATE_BOOST : 1;

    if (pixels >= FOUR_K_PIXELS) {
      return Math.round(BITRATE_4K * highFrameRateBoost);
    }

    if (pixels >= QHD_PIXELS) {
      return Math.round(BITRATE_QHD * highFrameRateBoost);
    }

    return Math.round(BITRATE_BASE * highFrameRateBoost);
  };

  const cleanupCapturedMedia = useCallback(() => {
    if (stream.current) {
      stream.current.getTracks().forEach((track) => track.stop());
      stream.current = null;
    }

    if (screenStream.current) {
      screenStream.current.getTracks().forEach((track) => track.stop());
      screenStream.current = null;
    }

    if (microphoneStream.current) {
      microphoneStream.current.getTracks().forEach((track) => track.stop());
      microphoneStream.current = null;
    }

    if (mixingContext.current) {
      mixingContext.current.close().catch(() => {});
      mixingContext.current = null;
    }
  }, []);

  const stopRecording = useRef(() => {
    if (nativeScreenRecording.current) {
      nativeScreenRecording.current = false;
      setRecording(false);

      setFinishing(true);
      void window.electronAPI.setRecordingState(false);
      void (async () => {
        try {
        const isWgc = wgcRecording.current;
        wgcRecording.current = false;

        const result = await window.electronAPI.stopNativeScreenRecording();
        window.electronAPI?.setRecordingState(false);

        if (!result.success || !result.path) {
          console.error("Failed to stop native screen recording:", result.error ?? result.message);
          alert(result.message || "Kayıt tamamlanamadı. Yarım kalan kayıtlar bölümünden kurtarmayı deneyin.");
          return;
        }

        let finalPath = result.path;

        if (isWgc) {
          const muxResult = await window.electronAPI.muxWgcRecording();
          finalPath = muxResult?.path ?? result.path;
        }

        await window.electronAPI.setCurrentVideoPath(finalPath);
        await window.electronAPI.switchToEditor();
        } catch (error) {
          console.error("Kayıt tamamlanamadı:", error);
          void window.electronAPI.setRecordingState(false);
          alert("Kayıt tamamlanamadı. Yarım kalan kayıtlar bölümünden kurtarmayı deneyin.");
        } finally { setFinishing(false); setPaused(false); }
      })();
      return;
    }

    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      cleanupCapturedMedia();
      mediaRecorder.current.stop();
      setRecording(false);
      window.electronAPI?.setRecordingState(false);
    }
  });

  useEffect(() => {
    void (async () => {
      const platform = await window.electronAPI.getPlatform();
      setIsMacOS(platform === "darwin");
    })();
  }, []);

  useEffect(() => {
    if (countdownDelayLoaded.current) return;
    countdownDelayLoaded.current = true;

    void (async () => {
      const result = await window.electronAPI.getCountdownDelay();
      if (result.success && typeof result.delay === "number") {
        setCountdownDelayState(result.delay);
      }
    })();
  }, []);

  const setCountdownDelay = useCallback((delay: number) => {
    setCountdownDelayState(delay);
    void window.electronAPI.setCountdownDelay(delay);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (window.electronAPI?.onStopRecordingFromTray) {
      cleanup = window.electronAPI.onStopRecordingFromTray(() => {
        stopRecording.current();
      });
    }

    const removeRecordingStateListener = window.electronAPI?.onRecordingStateChanged?.((state) => {
      setRecording(state.recording);
    });

    const removeRecordingInterruptedListener = window.electronAPI?.onRecordingInterrupted?.((state) => {
      setRecording(false);
      nativeScreenRecording.current = false;
      cleanupCapturedMedia();
      void window.electronAPI.setRecordingState(false);

      if (state.reason === "window-unavailable" && !hasPromptedForReselect.current) {
        hasPromptedForReselect.current = true;
        alert(state.message);
        void window.electronAPI.openSourceSelector();
      } else {
        console.error(state.message);
      }
    });

    return () => {
      cleanup?.();
      removeRecordingStateListener?.();
      removeRecordingInterruptedListener?.();

      if (nativeScreenRecording.current) {
        nativeScreenRecording.current = false;
        void window.electronAPI.stopNativeScreenRecording();
      }

      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stop();
      }

      cleanupCapturedMedia();
    };
  }, [cleanupCapturedMedia]);

  const startRecording = async () => {
    if (startInFlight.current) {
      return;
    }

    hasPromptedForReselect.current = false;
    startInFlight.current = true;
    setStarting(true);

    try {
      const selectedSource = await window.electronAPI.getSelectedSource();
      if (!selectedSource) {
        alert(t("permissions.selectSource"));
        return;
      }

      const permissionsReady = await preparePermissions();
      if (!permissionsReady) {
        return;
      }

      const platform = await window.electronAPI.getPlatform();
      const useNativeMacScreenCapture =
        platform === "darwin" &&
        (selectedSource.id?.startsWith("screen:") || selectedSource.id?.startsWith("window:")) &&
        typeof window.electronAPI.startNativeScreenRecording === "function";

      let useWgcCapture = false;
      if (
        platform === "win32" && captureResolution === "source" &&
        (selectedSource.id?.startsWith("screen:") || selectedSource.id?.startsWith("window:")) &&
        typeof window.electronAPI.isWgcAvailable === "function"
      ) {
        try {
          const wgcResult = await window.electronAPI.isWgcAvailable();
          useWgcCapture = wgcResult.available;
        } catch {
          useWgcCapture = false;
        }
      }

      if (useNativeMacScreenCapture || useWgcCapture) {
        // WGC: resolve mic device label for native WASAPI capture
        let micLabel: string | undefined;
        if (useWgcCapture && microphoneEnabled) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mic = devices.find(
              (d) => d.deviceId === microphoneDeviceId && d.kind === "audioinput",
            );
            micLabel = mic?.label || undefined;
          } catch {
            // Fall through — native process will use default mic
          }
        }

        const nativeResult = await window.electronAPI.startNativeScreenRecording(selectedSource, {
          capturesSystemAudio: systemAudioEnabled,
          capturesMicrophone: microphoneEnabled,
          microphoneDeviceId,
          microphoneLabel: micLabel,
          fps: captureFps, maxWidth: limits.maxWidth, maxHeight: limits.maxHeight,
        });
        if (!nativeResult.success) {
          if (useWgcCapture) {
            console.warn("WGC capture failed, falling back to browser capture:", nativeResult.error ?? nativeResult.message);
          } else {
            throw new Error(
              nativeResult.error ?? nativeResult.message ?? "Failed to start native screen recording",
            );
          }
        }

        if (nativeResult.success) {
          const format = nativeResult.captureFormat;
          setCaptureFormat(format ? `${format.width} × ${format.height} px · ${format.fps} FPS` : `${captureResolution === 'source' ? 'Orijinal' : captureResolution + 'p'} · ${captureFps} FPS (hedef)`);
          nativeScreenRecording.current = true;
          wgcRecording.current = useWgcCapture;
          setPauseSupported(!useWgcCapture);
          setRecording(true);
          window.electronAPI?.setRecordingState(true);

          return;
        }
      }

      const wantsAudioCapture = microphoneEnabled || systemAudioEnabled;

      try {
        await window.electronAPI.hideOsCursor?.();
      } catch {
        console.warn("Could not hide OS cursor before recording.");
      }

      let videoTrack: MediaStreamTrack | undefined;
      let systemAudioIncluded = false;

      if (wantsAudioCapture) {
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: CHROME_MEDIA_SOURCE,
            chromeMediaSourceId: selectedSource.id,
            ...(TARGET_WIDTH ? { maxWidth: TARGET_WIDTH, maxHeight: TARGET_WIDTH } : {}),
            maxFrameRate: TARGET_FRAME_RATE,
            minFrameRate: MIN_FRAME_RATE,
          },
        };

        let screenMediaStream: MediaStream;

        if (systemAudioEnabled) {
          try {
            screenMediaStream = await (navigator.mediaDevices as any).getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: CHROME_MEDIA_SOURCE,
                  chromeMediaSourceId: selectedSource.id,
                },
              },
              video: videoConstraints,
            });
          } catch (audioError) {
            console.warn("System audio capture failed, falling back to video-only:", audioError);
            alert(t("permissions.systemAudioUnavailable"));
            screenMediaStream = await (navigator.mediaDevices as any).getUserMedia({
              audio: false,
              video: videoConstraints,
            });
          }
        } else {
          screenMediaStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: videoConstraints,
          });
        }

        screenStream.current = screenMediaStream;
        stream.current = new MediaStream();

        videoTrack = screenMediaStream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error("Video track is not available.");
        }

        stream.current.addTrack(videoTrack);

        if (microphoneEnabled) {
          try {
            microphoneStream.current = await navigator.mediaDevices.getUserMedia({
              audio: microphoneDeviceId
                ? {
                    deviceId: { exact: microphoneDeviceId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                  }
                : {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                  },
              video: false,
            });
          } catch (audioError) {
            console.warn("Failed to get microphone access:", audioError);
            alert(t("permissions.microphoneDenied"));
            setMicrophoneEnabled(false);
          }
        }

        const systemAudioTrack = screenMediaStream.getAudioTracks()[0];
        const micAudioTrack = microphoneStream.current?.getAudioTracks()[0];

        if (systemAudioTrack && micAudioTrack) {
          const context = new AudioContext();
          mixingContext.current = context;
          const systemSource = context.createMediaStreamSource(new MediaStream([systemAudioTrack]));
          const micSource = context.createMediaStreamSource(new MediaStream([micAudioTrack]));
          const micGain = context.createGain();
          micGain.gain.value = MIC_GAIN_BOOST;
          const destination = context.createMediaStreamDestination();

          systemSource.connect(destination);
          micSource.connect(micGain).connect(destination);

          const mixedTrack = destination.stream.getAudioTracks()[0];
          if (mixedTrack) {
            stream.current.addTrack(mixedTrack);
            systemAudioIncluded = true;
          }
        } else if (systemAudioTrack) {
          stream.current.addTrack(systemAudioTrack);
          systemAudioIncluded = true;
        } else if (micAudioTrack) {
          stream.current.addTrack(micAudioTrack);
        }
      } else {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: {
            displaySurface: selectedSource.id?.startsWith("window:") ? "window" : "monitor",
            ...(TARGET_WIDTH ? { width: { max: TARGET_WIDTH }, height: { max: TARGET_WIDTH } } : {}),
            frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
            cursor: "never",
          },
          selfBrowserSurface: "exclude",
          surfaceSwitching: "exclude",
        } as any);

        stream.current = mediaStream;
        videoTrack = mediaStream.getVideoTracks()[0];
      }

      if (!stream.current || !videoTrack) {
        throw new Error("Media stream is not available.");
      }

      try {
        const initialSize = videoTrack.getSettings();
        const portrait = (initialSize.height ?? 0) > (initialSize.width ?? 0);
        await videoTrack.applyConstraints({
          frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
          ...(TARGET_WIDTH ? { width: { max: portrait ? TARGET_HEIGHT : TARGET_WIDTH }, height: { max: portrait ? TARGET_WIDTH : TARGET_HEIGHT } } : {}),
        } as MediaTrackConstraints);
      } catch (error) {
        console.warn(
          "Capture settings could not be applied; using the reported track format.",
          error,
        );
      }

      let {
        width = DEFAULT_WIDTH,
        height = DEFAULT_HEIGHT,
        frameRate = TARGET_FRAME_RATE,
      } = videoTrack.getSettings();

      setCaptureFormat(`${width} × ${height} px · ${frameRate ?? captureFps} FPS`);
      width = Math.floor(width / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;
      height = Math.floor(height / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;

      const videoBitsPerSecond = computeBitrate(width, height);
      const mimeType = selectMimeType();

      console.log(
        `Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
          videoBitsPerSecond / BITS_PER_MEGABIT,
        )} Mbps`,
      );

      const hasAudio = stream.current.getAudioTracks().length > 0;
      const recorder = new MediaRecorder(stream.current, {
        mimeType,
        videoBitsPerSecond,
        ...(hasAudio
          ? { audioBitsPerSecond: systemAudioIncluded ? AUDIO_BITRATE_SYSTEM : AUDIO_BITRATE_VOICE }
          : {}),
      });

      const session = await window.electronAPI.beginRecordingStream();
      if (!session.success || !session.id) throw Error(session.message || 'Kayıt dosyası açılamadı');
      const id = session.id;
      let pending = Promise.resolve();
      let sequence = 0;
      let bufferedBytes = 0;
      let writeError = '';
      const fail = (message: string) => {
        writeError ||= message;
        if (recorder.state !== 'inactive') recorder.stop();
        cleanupCapturedMedia();
        setRecording(false);
        window.electronAPI.setRecordingState(false);
      };
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data?.size || writeError) return;
        if (bufferedBytes + event.data.size > 32 * 1024 * 1024) {
          fail('Disk kayda yetişemedi. Kayıt durduruldu; diske ulaşan görüntü korunuyor.');
          return;
        }
        const blob = event.data;
        const index = sequence++;
        bufferedBytes += blob.size;
        pending = pending.then(async () => {
          try {
            if (writeError) return;
            const result = await window.electronAPI.appendRecordingStream(id, index, await blob.arrayBuffer());
            if (!result.success) fail(result.message || 'Kayıt diske yazılamadı.');
          } catch { fail('Kayıt diske yazılamadı. Yazılmış parçalar korunuyor.'); }
          finally { bufferedBytes -= blob.size; }
        });
      };
      recorder.onstop = async () => {
        setFinishing(true);
        cleanupCapturedMedia();
        setRecording(false);
        window.electronAPI.setRecordingState(false);
        await pending;
        try {
          const result = await window.electronAPI.finishRecordingStream(id);
          if (!result.success || !result.path) throw Error(result.message);
          if (writeError) alert(writeError);
          await window.electronAPI.switchToEditor();
        } catch (error) {
          alert(error instanceof Error ? error.message : 'Kayıt tamamlanamadı. Ham parçalar korunuyor.');
        } finally { setFinishing(false); setPaused(false); }
      };
      recorder.onerror = () => fail('Kayıt kaynağı kesildi. Diske yazılan görüntü korunuyor.');
      setPauseSupported(true);
      try { recorder.start(RECORDER_TIMESLICE_MS); }
      catch (error) { await window.electronAPI.finishRecordingStream(id); throw error; }
      setRecording(true);
      window.electronAPI?.setRecordingState(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert(error instanceof Error ? t("permissions.failedToStart", undefined, { error: error.message }) : t("permissions.failedToStartGeneric"));
      setRecording(false);
      cleanupCapturedMedia();
    } finally {
      startInFlight.current = false;
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!recording) { setElapsedSeconds(0); setPaused(false); return; }
    let active = true;
    const update = () => { const revision = pauseRevision.current; void window.electronAPI.getRecordingStatus().then(status => {
      if (!active || pauseInFlight.current || revision !== pauseRevision.current) return;
      setPaused(status.paused); setPauseSupported(status.pauseSupported);
      setElapsedSeconds(Math.floor(status.elapsedMs / 1000));
    }).catch(() => {}); };
    update(); const interval = window.setInterval(update, 200);
    return () => { active = false; window.clearInterval(interval); };
  }, [recording]);

  const togglePause = async () => {
    if (!recording || !pauseSupported || pauseInFlight.current) return;
    pauseInFlight.current = true; pauseRevision.current++; setPausePending(true);
    const next = !paused;
    const recorder = mediaRecorder.current;
    try {
      if (!nativeScreenRecording.current && recorder && recorder.state !== 'inactive') {
        await new Promise<void>((resolve, reject) => {
          const event = next ? 'pause' : 'resume';
          const done = () => { cleanup(); resolve(); };
          const stopped = () => { cleanup(); reject(Error('Kayıt sonlandı')); };
          const cleanup = () => { clearTimeout(timer); recorder.removeEventListener(event, done); recorder.removeEventListener('stop', stopped); };
          const timer = window.setTimeout(() => { cleanup(); reject(Error('Kayıt motoru yanıt vermedi')); }, 5000);
          recorder.addEventListener(event, done, {once:true}); recorder.addEventListener('stop', stopped, {once:true});
          try { if (next) recorder.pause(); else recorder.resume(); } catch(e) { cleanup(); reject(e); }
        });
      }
      const result = await window.electronAPI.setRecordingPaused(next);
      if (!result.success) throw Error(result.message);
      setPaused(Boolean(result.paused));
      if (result.elapsedMs !== undefined) setElapsedSeconds(Math.floor(result.elapsedMs / 1000));
    } catch(e) {
      // Stop rather than write video and telemetry on two different timelines.
      stopRecording.current();
      alert(e instanceof Error ? e.message : 'Kayıt durumu değiştirilemedi.');
    } finally { pauseInFlight.current = false; setPausePending(false); }
  };

  const toggleRecording = async () => {
    if (starting || finishing || countdownActive || pauseInFlight.current) {
      return;
    }

    if (recording) {
      stopRecording.current();
      return;
    }

    // Start recording with optional countdown
    if (countdownDelay > 0) {
      setCountdownActive(true);
      try {
        const result = await window.electronAPI.startCountdown(countdownDelay);
        if (!result.success || result.cancelled) {
          return;
        }
      } finally {
        setCountdownActive(false);
      }
    }

    startRecording();
  };

  return {
    recording, paused, pauseSupported, pausePending, elapsedSeconds, busy: starting || finishing, finishing, togglePause,
    countdownActive,
    toggleRecording,
    preparePermissions,
    isMacOS,
    microphoneEnabled,
    setMicrophoneEnabled,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    systemAudioEnabled,
    setSystemAudioEnabled,
    captureResolution, setCaptureResolution, captureFps, setCaptureFps, captureFormat,
    countdownDelay,
    setCountdownDelay,
  };
}

