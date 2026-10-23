import { describe, it, expect } from 'vitest'
import { outputDimensions, validDimensions, captureLimits, exportBitrate, fitCustomSizeToRatio, matchesRatio } from './outputSettings'
import { normalizeProjectEditor } from '@/components/video-editor/projectPersistence'
describe('video output settings', () => {
  it('exports explicit landscape, portrait and square sizes independent of compression', () => {
    expect(outputDimensions(1280,720,16/9,'1080')).toEqual({width:1920,height:1080})
    expect(outputDimensions(1280,720,9/16,'1080')).toEqual({width:1080,height:1920})
    expect(outputDimensions(3840,2160,1,'1080')).toEqual({width:1080,height:1080})
    expect(outputDimensions(3840,2160,16/9,'2160',1920,1080,'medium')).toEqual({width:3840,height:2160})
  })
  it('retains source dimensions and legacy scaling for older projects', () => {
    expect(outputDimensions(1280,720,16/9,'source')).toEqual({width:1280,height:720})
    expect(outputDimensions(1280,720,16/9,'legacy',1920,1080,'medium')).toEqual({width:768,height:432})
    expect(normalizeProjectEditor({}).exportResolution).toBe('legacy')
  })
  it('validates custom dimensions and restores corrupted saved settings safely', () => {
    expect(validDimensions(1080,1920)).toBe(true)
    expect(validDimensions(1081,1920)).toBe(false)
    expect(validDimensions(9000,720)).toBe(false)
    expect(()=>outputDimensions(1280,720,1,'custom',1001,500)).toThrow()
    const restored = normalizeProjectEditor({exportResolution:'custom',exportCustomWidth:9000,exportCustomHeight:721,exportFps:30})
    expect(restored.exportCustomWidth).toBe(1920); expect(restored.exportCustomHeight).toBe(1080); expect(restored.exportFps).toBe(30)
  })
  it('keeps resolution and compression separate and scales bitrate with fps', () => {
    expect(exportBitrate(1920,1080,60,'high')).toBeGreaterThan(exportBitrate(1920,1080,30,'high'))
    expect(exportBitrate(1920,1080,60,'source')).toBeGreaterThan(exportBitrate(1920,1080,60,'medium'))
    expect(captureLimits('source')).toEqual({maxWidth:0,maxHeight:0})
    expect(captureLimits('1080')).toEqual({maxWidth:1920,maxHeight:1080})
  })
  it('reshapes a custom size to the chosen aspect ratio, keeping the long side', () => {
    expect(fitCustomSizeToRatio(1920,1080,9/16)).toEqual({width:1080,height:1920})
    expect(fitCustomSizeToRatio(1920,1080,1)).toEqual({width:1920,height:1920})
    expect(fitCustomSizeToRatio(1080,1920,16/9)).toEqual({width:1920,height:1080})
    expect(fitCustomSizeToRatio(1920,1080,16/9)).toEqual({width:1920,height:1080})
    expect(fitCustomSizeToRatio(4096,64,1/8)).toEqual({width:512,height:4096})
    const tall = fitCustomSizeToRatio(200,200,1/10)
    expect(validDimensions(tall.width,tall.height) && matchesRatio(tall.width,tall.height,1/10)).toBe(true)
  })
})
