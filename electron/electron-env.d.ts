/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  electronAPI: {
    geminiKeyStatus: () => Promise<{configured:boolean;persistent:boolean}>;
    geminiSaveKey: (key:string) => Promise<{configured:boolean;persistent:boolean}>;
    geminiClearKey: () => Promise<{configured:boolean;persistent:boolean}>;
    imageStudioBrandWebsite: (url:string) => Promise<{success:boolean;data?:import("../src/lib/brandWebsiteTypes").WebsiteBrand;error?:string}>;
    imageStudioReferencePage: (url:string) => Promise<{success:boolean;url?:string;text?:string;error?:string}>;
    imageStudioCapabilities: () => Promise<{tools:{id:string;name:string;status:string}[];imageGeneration:boolean;note:string}>;
    imageStudioRun: (input: {requestId:string;mode:string;purpose?:"brand";prompt:string;tool:string;references:string[];width?:number;height?:number;imageSize?:"1K"|"2K"|"4K";auto?:boolean}) => Promise<{success:boolean;error?:string;cancelled?:boolean;prompt?:string;image?:string;jobId?:string;usage?:import("../src/lib/imageUsage").ImageUsage;durationMs?:number;provider?:"codex"|"gemini";requestedResolution?:"1K"|"2K"|"4K"}>;
    imageStudioCancel: (id:string) => Promise<void>;
    onImageStudioProgress: (callback:(event:{requestId:string;stage:string;detail?:string;usage?:import("../src/lib/imageUsage").ImageUsage;durationMs?:number})=>void) => () => void;
    modelionGenerateSpeech: (input: { text: string; language: string; requestId: string }) => Promise<{ path: string }>
    modelionCancelSpeech: (requestId: string) => Promise<void>
    transcribeVideo: (input: { videoPath: string; language: string; requestId: string }) => Promise<
      | { success: true; words: Array<{ text: string; startMs: number; endMs: number; confidence?: number }>; durationMs: number }
      | { success: false; code: 'unsupported-platform' | 'unsupported-os' | 'unsupported-locale' | 'assets-unavailable' | 'no-audio' | 'no-speech' | 'too-long' | 'cancelled' | 'failed'; message: string }
    >
    cancelTranscription: (requestId: string) => Promise<void>
    getAudioWaveform: (audioPath: string) => Promise<{ durationMs: number; peaksPerSecond: number; peaks: number[] }>
    agentDetectTools: (force?: boolean) => Promise<import('../src/lib/agent/agentApi').AgentToolInfo[]>
    agentStart: (input: import('../src/lib/agent/agentApi').AgentStartInput) => Promise<{ success: true; runId: string } | { success: false; code: string; message: string }>
    agentCancel: (runId: string) => Promise<void>
    onAgentEvent: (callback: (payload: { runId: string; event: import('../src/lib/agent/agentApi').AgentRunEvent }) => void) => () => void
    onTranscriptionProgress: (callback: (progress: { requestId: string; stage: 'audio' | 'model-download' | 'transcribing'; done?: number; total?: number }) => void) => () => void
    modelionKeyStatus: () => Promise<{ configured: boolean; persistent: boolean }>
    modelionSaveKey: (key: string) => Promise<{ configured: boolean; persistent: boolean }>
    modelionClearKey: () => Promise<{ configured: boolean; persistent: boolean }>
    modelionGenerateCaptions: (input: { topic: string; tone: string; language: string; count: number; durationSeconds: number }) => Promise<string[]>
    fishAudioKeyStatus: () => Promise<{ configured: boolean; persistent: boolean }>
    fishAudioSaveKey: (key: string) => Promise<{ configured: boolean; persistent: boolean }>
    fishAudioClearKey: () => Promise<{ configured: boolean; persistent: boolean }>
    fishAudioSearchVoices: (input: { query: string; language: string; mine?: boolean }) => Promise<{ id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }[]>
    fishAudioGenerateSpeech: (input: { text: string; voiceId: string; model: 's2.1-pro-free' | 's2.1-pro' | 'drama-3'; requestId: string }) => Promise<{ path: string }>
    fishAudioCancelSpeech: (requestId: string) => Promise<void>
    elevenLabsKeyStatus: () => Promise<{ configured: boolean; persistent: boolean }>
    elevenLabsSaveKey: (key: string) => Promise<{ configured: boolean; persistent: boolean }>
    elevenLabsClearKey: () => Promise<{ configured: boolean; persistent: boolean }>
    elevenLabsSearchVoices: (input: { query: string; mine?: boolean }) => Promise<{ id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }[]>
    elevenLabsGenerateSpeech: (input: { text: string; voiceId: string; model: 'eleven_v4' | 'eleven_flash_v2_5' | 'eleven_multilingual_v2'; language: string; requestId: string }) => Promise<{ path: string }>
    elevenLabsCancelSpeech: (requestId: string) => Promise<void>
    getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>
    showRecorder: () => Promise<void>
    autosaveProjectDraft: (project: unknown, projectPath?: string) => Promise<{ success: boolean; updatedAt?: string; message?: string }>
    getRecordingStatus: () => Promise<{ recording: boolean; paused: boolean; elapsedMs: number; pauseSupported: boolean }>
    setRecordingPaused: (paused: boolean) => Promise<{ success: boolean; paused?: boolean; elapsedMs?: number; message?: string }>
    beginRecordingStream: () => Promise<{ success: boolean; id?: string; message?: string }>
    appendRecordingStream: (id: string, sequence: number, data: ArrayBuffer) => Promise<{ success: boolean; message?: string }>
    finishRecordingStream: (id: string) => Promise<{ success: boolean; path?: string; message?: string }>
    listRecordingRecovery: () => Promise<{ id: string; name: string; startedAt: string; kind: 'browser' | 'native'; bytes: number }[]>
    recoverRecording: (id: string) => Promise<{ success: boolean; path?: string; message?: string }>
    listProjectRecovery: () => Promise<{ id: string; kind: 'draft' | 'backup'; name: string; updatedAt: string; projectPath: string | null }[]>
    openProjectRecovery: (id: string) => Promise<{ success: boolean; message?: string }>
    listRecentProjects: () => Promise<{ path: string; name: string; updatedAt: string }[]>
    openRecentProject: (projectPath: string) => Promise<{ success: boolean; message?: string }>
    switchToEditor: () => Promise<void>
    showHome: () => Promise<void>
    openSourceSelector: () => Promise<void>
    selectSource: (source: any) => Promise<any>
    getSelectedSource: () => Promise<any>
    openRegionSelector: (source?: unknown) => Promise<void>
    getRegionSelectorContext: () => Promise<{
      width: number
      height: number
      scaleFactor: number
      initialRegion: { x: number; y: number; width: number; height: number } | null
    } | null>
    finishRegionSelection: (region: { x: number; y: number; width: number; height: number } | null) => Promise<unknown>
    startNativeScreenRecording: (
      source: any,
      options?: {
        capturesSystemAudio?: boolean
        capturesMicrophone?: boolean
        microphoneDeviceId?: string
        microphoneLabel?: string
      fps?: number
      maxWidth?: number
      maxHeight?: number
      }
    ) => Promise<{ success: boolean; path?: string; message?: string; error?: string; captureFormat?: { width: number; height: number; fps: number } }>
    stopNativeScreenRecording: () => Promise<{ success: boolean; path?: string; message?: string; error?: string; captureFormat?: { width: number; height: number; fps: number } }>
    startFfmpegRecording: (source: any) => Promise<{ success: boolean; path?: string; message?: string; error?: string; captureFormat?: { width: number; height: number; fps: number } }>
    stopFfmpegRecording: () => Promise<{ success: boolean; path?: string; message?: string; error?: string; captureFormat?: { width: number; height: number; fps: number } }>
    storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => Promise<{ success: boolean; path?: string; message?: string }>
    getRecordedVideoPath: () => Promise<{ success: boolean; path?: string; message?: string }>
    readLocalFile: (filePath: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>
    setRecordingState: (recording: boolean) => Promise<void>
    getCursorTelemetry: (videoPath?: string) => Promise<{ success: boolean; samples: CursorTelemetryPoint[]; message?: string; error?: string }>
    getSystemCursorAssets: () => Promise<{ success: boolean; cursors: Record<string, SystemCursorAsset>; error?: string }>
    onStopRecordingFromTray: (callback: () => void) => () => void
    onRecordingStateChanged: (callback: (state: { recording: boolean; sourceName: string }) => void) => () => void
    onRecordingInterrupted: (callback: (state: { reason: string; message: string }) => void) => () => void
    onCursorStateChanged: (callback: (state: { cursorType: CursorTelemetryPoint['cursorType'] }) => void) => () => void
    openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>
    getAccessibilityPermissionStatus: () => Promise<{ success: boolean; trusted: boolean; prompted: boolean; error?: string }>
    confirmRecordingWithoutClickTracking: (texts: Record<string, string>) => Promise<{ choice: 'allow' | 'record' | 'cancel'; dontAskAgain: boolean }>
    requestAccessibilityPermission: () => Promise<{ success: boolean; trusted: boolean; prompted: boolean; error?: string }>
    getScreenRecordingPermissionStatus: () => Promise<{ success: boolean; status: string; error?: string }>
    openScreenRecordingPreferences: () => Promise<{ success: boolean; error?: string }>
    openAccessibilityPreferences: () => Promise<{ success: boolean; error?: string }>
    saveExportedVideo: (videoData: ArrayBuffer, fileName: string, options?: { chooseLocation?: boolean }) => Promise<{ success: boolean; path?: string; message?: string; canceled?: boolean; warning?: 'audio-conversion-failed' }>
    openVideoFilePicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>
    setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>
    getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>
    clearCurrentVideoPath: () => Promise<{ success: boolean }>
    saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) => Promise<{ success: boolean; path?: string; message?: string; canceled?: boolean; error?: string }>
    loadProjectFile: () => Promise<{ success: boolean; path?: string; project?: unknown; message?: string; canceled?: boolean; error?: string }>
    loadCurrentProjectFile: () => Promise<{ recovered?: boolean; success: boolean; path?: string; project?: unknown; message?: string; canceled?: boolean; error?: string }>
    onMenuLoadProject: (callback: () => void) => () => void
    onMenuSaveProject: (callback: () => void) => () => void
    onMenuSaveProjectAs: (callback: () => void) => () => void
    getPlatform: () => Promise<string>
    revealInFolder: (filePath: string) => Promise<{ success: boolean; error?: string; message?: string }>,
    openRecordingsFolder: () => Promise<{ success: boolean; error?: string; message?: string }>,
    getRecordingsDirectory: () => Promise<{ success: boolean; path: string; isDefault: boolean; error?: string }>
    chooseRecordingsDirectory: () => Promise<{ success: boolean; canceled?: boolean; path?: string; isDefault?: boolean; message?: string; error?: string }>
    getShortcuts: () => Promise<Record<string, unknown> | null>
    saveShortcuts: (shortcuts: unknown) => Promise<{ success: boolean; error?: string }>
    /** Shows a native popup menu for the recorder bar and resolves with the chosen item's id (null when dismissed). */
    showHudMenu: (items: Array<{ id?: string; label: string; type?: 'separator' | 'radio'; checked?: boolean; submenu?: Array<{ id?: string; label: string; type?: 'separator' | 'radio'; checked?: boolean }> } | { type: 'separator'; label?: string }>) => Promise<string | null>;
    hudOverlayHide: () => void;
    hudOverlayClose: () => void;
    setHasUnsavedChanges: (hasChanges: boolean) => void
    onRequestSaveBeforeClose: (callback: () => Promise<boolean>) => () => void
    isWgcAvailable: () => Promise<{ available: boolean }>
    muxWgcRecording: () => Promise<{ success: boolean; path?: string; message?: string; error?: string; captureFormat?: { width: number; height: number; fps: number } }>
    /** Hide the OS cursor before browser capture starts. */
    hideOsCursor: () => Promise<{ success: boolean }>
    /** Countdown timer before recording */
    getCountdownDelay: () => Promise<{ success: boolean; delay: number }>
    setCountdownDelay: (delay: number) => Promise<{ success: boolean; error?: string }>
    startCountdown: (seconds: number) => Promise<{ success: boolean; cancelled?: boolean }>
    cancelCountdown: () => Promise<{ success: boolean }>
    onCountdownTick: (callback: (seconds: number) => void) => () => void
  }
}

interface ProcessedDesktopSource {
  id: string
  name: string
  display_id: string
  thumbnail: string | null
  appIcon: string | null
  originalName?: string
  sourceType?: 'screen' | 'window'
  appName?: string
  windowTitle?: string
}

interface CursorTelemetryPoint {
  timeMs: number
  cx: number
  cy: number
  interactionType?: 'move' | 'click' | 'double-click' | 'right-click' | 'middle-click' | 'mouseup'
  cursorType?: 'arrow' | 'text' | 'pointer' | 'crosshair' | 'open-hand' | 'closed-hand' | 'resize-ew' | 'resize-ns' | 'not-allowed'
}

interface SystemCursorAsset {
  dataUrl: string
  hotspotX: number
  hotspotY: number
  width: number
  height: number
}

