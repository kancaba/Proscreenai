import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  geminiKeyStatus: () => ipcRenderer.invoke('gemini-key-status'),
  geminiSaveKey: (key: string) => ipcRenderer.invoke('gemini-save-key', key),
  geminiClearKey: () => ipcRenderer.invoke('gemini-clear-key'),
  imageStudioBrandWebsite: (url: string) => ipcRenderer.invoke("image-studio-brand-website", url),
  imageStudioReferencePage: (url: string) => ipcRenderer.invoke('image-studio-reference-page', url),
  imageStudioCapabilities: () => ipcRenderer.invoke('image-studio-capabilities'),
  imageStudioRun: (input: unknown) => ipcRenderer.invoke('image-studio-run', input),
  imageStudioCancel: (id: string) => ipcRenderer.invoke('image-studio-cancel', id),
  onImageStudioProgress: (callback: (event: {requestId:string;stage:string;detail?:string}) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: {requestId:string;stage:string;detail?:string}) => callback(payload);
    ipcRenderer.on('image-studio-progress', listener);
    return () => ipcRenderer.removeListener('image-studio-progress', listener);
  },
  modelionGenerateSpeech: (input: { text: string; language: string; requestId: string }) => ipcRenderer.invoke('modelion-generate-speech', input),
  modelionCancelSpeech: (requestId: string) => ipcRenderer.invoke('modelion-cancel-speech', requestId),
  transcribeVideo: (input: { videoPath: string; language: string; requestId: string }) => ipcRenderer.invoke('transcribe-video', input),
  cancelTranscription: (requestId: string) => ipcRenderer.invoke('cancel-transcription', requestId),
  getAudioWaveform: (audioPath: string) => ipcRenderer.invoke('audio-waveform', audioPath),
  agentDetectTools: (force?: boolean) => ipcRenderer.invoke('agent-detect-tools', force === true),
  agentStart: (input: unknown) => ipcRenderer.invoke('agent-start', input),
  agentCancel: (runId: string) => ipcRenderer.invoke('agent-cancel', runId),
  onAgentEvent: (callback: (payload: { runId: string; event: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { runId: string; event: unknown }) => callback(payload)
    ipcRenderer.on('agent-event', listener)
    return () => ipcRenderer.removeListener('agent-event', listener)
  },
  onTranscriptionProgress: (callback: (progress: { requestId: string; stage: string; done?: number; total?: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: { requestId: string; stage: string; done?: number; total?: number }) => callback(progress)
    ipcRenderer.on('transcription-progress', listener)
    return () => ipcRenderer.removeListener('transcription-progress', listener)
  },
  modelionKeyStatus: () => ipcRenderer.invoke('modelion-key-status'),
  modelionSaveKey: (key: string) => ipcRenderer.invoke('modelion-save-key', key),
  modelionClearKey: () => ipcRenderer.invoke('modelion-clear-key'),
  modelionGenerateCaptions: (input: { topic: string; tone: string; language: string; count: number; durationSeconds: number }) => ipcRenderer.invoke('modelion-generate-captions', input),
  fishAudioKeyStatus: () => ipcRenderer.invoke('fish-audio-key-status'),
  fishAudioSaveKey: (key: string) => ipcRenderer.invoke('fish-audio-save-key', key),
  fishAudioClearKey: () => ipcRenderer.invoke('fish-audio-clear-key'),
  fishAudioSearchVoices: (input: { query: string; language: string; mine?: boolean }) => ipcRenderer.invoke('fish-audio-search-voices', input),
  fishAudioGenerateSpeech: (input: { text: string; voiceId: string; model: string; requestId: string }) => ipcRenderer.invoke('fish-audio-generate-speech', input),
  fishAudioCancelSpeech: (requestId: string) => ipcRenderer.invoke('fish-audio-cancel-speech', requestId),
  elevenLabsKeyStatus: () => ipcRenderer.invoke('elevenlabs-key-status'),
  elevenLabsSaveKey: (key: string) => ipcRenderer.invoke('elevenlabs-save-key', key),
  elevenLabsClearKey: () => ipcRenderer.invoke('elevenlabs-clear-key'),
  elevenLabsSearchVoices: (input: { query: string; mine?: boolean }) => ipcRenderer.invoke('elevenlabs-search-voices', input),
  elevenLabsGenerateSpeech: (input: { text: string; voiceId: string; model: string; language: string; requestId: string }) => ipcRenderer.invoke('elevenlabs-generate-speech', input),
  elevenLabsCancelSpeech: (requestId: string) => ipcRenderer.invoke('elevenlabs-cancel-speech', requestId),
    showHudMenu: (items: unknown) => ipcRenderer.invoke('hud-show-menu', items),
    hudOverlayHide: () => {
      ipcRenderer.send('hud-overlay-hide');
    },
    hudOverlayClose: () => {
      ipcRenderer.send('hud-overlay-close');
    },
  getAssetBasePath: async () => {
    // ask main process for the correct base path (production vs dev)
    return await ipcRenderer.invoke('get-asset-base-path')
  },
  readLocalFile: (filePath: string) => {
    return ipcRenderer.invoke('read-local-file', filePath)
  },
  getSources: async (opts: Electron.SourcesOptions) => {
    return await ipcRenderer.invoke('get-sources', opts)
  },
  showRecorder: () => ipcRenderer.invoke('show-recorder'),
  autosaveProjectDraft: (project: unknown, projectPath?: string) => ipcRenderer.invoke('autosave-project-draft', project, projectPath),
  getRecordingStatus: () => ipcRenderer.invoke('get-recording-status'),
  setRecordingPaused: (paused: boolean) => ipcRenderer.invoke('set-recording-paused', paused),
  beginRecordingStream: () => ipcRenderer.invoke('begin-recording-stream'),
  appendRecordingStream: (id: string, sequence: number, data: ArrayBuffer) => ipcRenderer.invoke('append-recording-stream', id, sequence, data),
  finishRecordingStream: (id: string) => ipcRenderer.invoke('finish-recording-stream', id),
  listRecordingRecovery: () => ipcRenderer.invoke('list-recording-recovery'),
  recoverRecording: (id: string) => ipcRenderer.invoke('recover-recording', id),
  listProjectRecovery: () => ipcRenderer.invoke('list-project-recovery'),
  openProjectRecovery: (id: string) => ipcRenderer.invoke('open-project-recovery', id),
  listRecentProjects: () => ipcRenderer.invoke('list-recent-projects'),
  openRecentProject: (projectPath: string) => ipcRenderer.invoke('open-recent-project', projectPath),
  switchToEditor: () => {
    return ipcRenderer.invoke('switch-to-editor')
  },
  showHome: () => ipcRenderer.invoke('show-home'),
  openSourceSelector: () => {
    return ipcRenderer.invoke('open-source-selector')
  },
  selectSource: (source: any) => {
    return ipcRenderer.invoke('select-source', source)
  },
  getSelectedSource: () => {
    return ipcRenderer.invoke('get-selected-source')
  },
  openRegionSelector: (source?: unknown) => ipcRenderer.invoke('open-region-selector', source ?? null),
  getRegionSelectorContext: () => ipcRenderer.invoke('get-region-selector-context'),
  finishRegionSelection: (region: unknown) => ipcRenderer.invoke('finish-region-selection', region),
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
    },
  ) => {
    return ipcRenderer.invoke('start-native-screen-recording', source, options)
  },
  stopNativeScreenRecording: () => {
    return ipcRenderer.invoke('stop-native-screen-recording')
  },
  startFfmpegRecording: (source: any) => {
    return ipcRenderer.invoke('start-ffmpeg-recording', source)
  },
  stopFfmpegRecording: () => {
    return ipcRenderer.invoke('stop-ffmpeg-recording')
  },

  storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
    return ipcRenderer.invoke('store-recorded-video', videoData, fileName)
  },

  getRecordedVideoPath: () => {
    return ipcRenderer.invoke('get-recorded-video-path')
  },
  setRecordingState: (recording: boolean) => {
    return ipcRenderer.invoke('set-recording-state', recording)
  },
  setCursorScale: (scale: number) => {
    return ipcRenderer.invoke('set-cursor-scale', scale)
  },
  getCursorTelemetry: (videoPath?: string) => {
    return ipcRenderer.invoke('get-cursor-telemetry', videoPath)
  },
  getSystemCursorAssets: () => {
    return ipcRenderer.invoke('get-system-cursor-assets')
  },
  onStopRecordingFromTray: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('stop-recording-from-tray', listener)
    return () => ipcRenderer.removeListener('stop-recording-from-tray', listener)
  },
  onRecordingStateChanged: (callback: (state: { recording: boolean; sourceName: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { recording: boolean; sourceName: string }) => callback(payload)
    ipcRenderer.on('recording-state-changed', listener)
    return () => ipcRenderer.removeListener('recording-state-changed', listener)
  },
  onRecordingInterrupted: (callback: (state: { reason: string; message: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { reason: string; message: string }) => callback(payload)
    ipcRenderer.on('recording-interrupted', listener)
    return () => ipcRenderer.removeListener('recording-interrupted', listener)
  },
  onCursorStateChanged: (callback: (state: { cursorType: CursorTelemetryPoint['cursorType'] }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { cursorType: CursorTelemetryPoint['cursorType'] }) => callback(payload)
    ipcRenderer.on('cursor-state-changed', listener)
    return () => ipcRenderer.removeListener('cursor-state-changed', listener)
  },
  openExternalUrl: (url: string) => {
    return ipcRenderer.invoke('open-external-url', url)
  },
  getAccessibilityPermissionStatus: () => {
    return ipcRenderer.invoke('get-accessibility-permission-status')
  },
  confirmRecordingWithoutClickTracking: (texts: Record<string, string>) => {
    return ipcRenderer.invoke('confirm-recording-without-click-tracking', texts)
  },
  requestAccessibilityPermission: () => {
    return ipcRenderer.invoke('request-accessibility-permission')
  },
  getScreenRecordingPermissionStatus: () => {
    return ipcRenderer.invoke('get-screen-recording-permission-status')
  },
  openScreenRecordingPreferences: () => {
    return ipcRenderer.invoke('open-screen-recording-preferences')
  },
  openAccessibilityPreferences: () => {
    return ipcRenderer.invoke('open-accessibility-preferences')
  },
  saveExportedVideo: (videoData: ArrayBuffer, fileName: string, options?: { chooseLocation?: boolean }) => {
    return ipcRenderer.invoke('save-exported-video', videoData, fileName, options)
  },
  openVideoFilePicker: () => {
    return ipcRenderer.invoke('open-video-file-picker')
  },
  openAudioFilePicker: () => {
    return ipcRenderer.invoke('open-audio-file-picker')
  },
  setCurrentVideoPath: (path: string) => {
    return ipcRenderer.invoke('set-current-video-path', path)
  },
  getCurrentVideoPath: () => {
    return ipcRenderer.invoke('get-current-video-path')
  },
  clearCurrentVideoPath: () => {
    return ipcRenderer.invoke('clear-current-video-path')
  },
  saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
    return ipcRenderer.invoke('save-project-file', projectData, suggestedName, existingProjectPath)
  },
  loadProjectFile: () => {
    return ipcRenderer.invoke('load-project-file')
  },
  loadCurrentProjectFile: () => {
    return ipcRenderer.invoke('load-current-project-file')
  },
  onMenuLoadProject: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu-load-project', listener)
    return () => ipcRenderer.removeListener('menu-load-project', listener)
  },
  onMenuSaveProject: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu-save-project', listener)
    return () => ipcRenderer.removeListener('menu-save-project', listener)
  },
  onMenuSaveProjectAs: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('menu-save-project-as', listener)
    return () => ipcRenderer.removeListener('menu-save-project-as', listener)
  },
  getPlatform: () => {
    return ipcRenderer.invoke('get-platform')
  },
  revealInFolder: (filePath: string) => {
    return ipcRenderer.invoke('reveal-in-folder', filePath)
  },
  openRecordingsFolder: () => {
    return ipcRenderer.invoke('open-recordings-folder')
  },
  getRecordingsDirectory: () => {
    return ipcRenderer.invoke('get-recordings-directory')
  },
  chooseRecordingsDirectory: () => {
    return ipcRenderer.invoke('choose-recordings-directory')
  },
  getShortcuts: () => {
    return ipcRenderer.invoke('get-shortcuts')
  },
  saveShortcuts: (shortcuts: unknown) => {
    return ipcRenderer.invoke('save-shortcuts', shortcuts)
  },
  setHasUnsavedChanges: (hasChanges: boolean) => {
    ipcRenderer.send('set-has-unsaved-changes', hasChanges)
  },
  onRequestSaveBeforeClose: (callback: () => Promise<boolean>) => {
    const listener = async () => {
      try {
        const saved = await callback()
        ipcRenderer.send('save-before-close-done', saved === true)
      } catch {
        ipcRenderer.send('save-before-close-done', false)
      }
    }
    ipcRenderer.on('request-save-before-close', listener)
    return () => ipcRenderer.removeListener('request-save-before-close', listener)
  },
  isWgcAvailable: () => ipcRenderer.invoke('is-wgc-available'),
  muxWgcRecording: () => ipcRenderer.invoke('mux-wgc-recording'),
  // Cursor visibility control for cursor-free browser capture fallback
  hideOsCursor: () => ipcRenderer.invoke('hide-cursor'),
  // Countdown timer before recording
  getCountdownDelay: () => ipcRenderer.invoke('get-countdown-delay'),
  setCountdownDelay: (delay: number) => ipcRenderer.invoke('set-countdown-delay', delay),
  startCountdown: (seconds: number) => ipcRenderer.invoke('start-countdown', seconds),
  cancelCountdown: () => ipcRenderer.invoke('cancel-countdown'),
  onCountdownTick: (callback: (seconds: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, seconds: number) => callback(seconds)
    ipcRenderer.on('countdown-tick', listener)
    return () => ipcRenderer.removeListener('countdown-tick', listener)
  },
})

