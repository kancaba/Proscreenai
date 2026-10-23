import { describe, expect, it } from 'vitest'
import { buildCaptionSlots } from './aiCaptionTiming'

describe('buildCaptionSlots', () => {
  it('fills the visible video without crossing trimmed regions', () => {
    const slots = buildCaptionSlots(20000, [
      { id: 'late', startMs: 12000, endMs: 15000 },
      { id: 'early', startMs: 4000, endMs: 7000 },
    ])
    expect(slots[0].startMs).toBe(0)
    expect(slots.at(-1)?.endMs).toBe(20000)
    expect(slots.every((slot) => slot.endMs <= 4000 || slot.startMs >= 7000 && slot.endMs <= 12000 || slot.startMs >= 15000)).toBe(true)
    expect(slots.reduce((sum, slot) => sum + slot.endMs - slot.startMs, 0)).toBe(14000)
  })

  it('returns no captions when the entire video is cut', () => {
    expect(buildCaptionSlots(5000, [{ id: 'all', startMs: 0, endMs: 5000 }])).toEqual([])
  })
})
