import { describe, expect, it } from 'vitest'
import { findAvailableSpan, validRegionSpan } from './editingTools'

describe('editor tool placement', () => {
  it('adds a region around the playhead and keeps it inside the video', () => {
    expect(findAvailableSpan(6000, 5800, [])).toEqual({ startMs: 4500, endMs: 6000 })
  })
  it('starts exactly at the playhead and shortens the edit when the next one is close', () => {
    expect(findAvailableSpan(20000, 9000, [{ startMs: 10000, endMs: 12000 }], 2000)).toEqual({ startMs: 9000, endMs: 10000 })
    expect(findAvailableSpan(20000, 4321, [], 2000)).toEqual({ startMs: 4321, endMs: 6321 })
  })
  it('finds the next free gap when the playhead is occupied', () => {
    expect(findAvailableSpan(6000, 1500, [{ startMs: 1000, endMs: 3000 }])).toEqual({ startMs: 3000, endMs: 4500 })
  })
  it('merges overlapping occupied spans and reports full tracks', () => {
    expect(findAvailableSpan(6000, 1000, [{ startMs: 0, endMs: 4000 }, { startMs: 3000, endMs: 6000 }])).toBeNull()
  })
  it('allows adjacent edits but rejects overlaps and reversed/out-of-bounds timing', () => {
    const occupied = [{ startMs: 1000, endMs: 2000 }]
    expect(validRegionSpan({ startMs: 0, endMs: 1000 }, 6000, occupied)).toBe(true)
    expect(validRegionSpan({ startMs: 900, endMs: 1500 }, 6000, occupied)).toBe(false)
    expect(validRegionSpan({ startMs: 2000, endMs: 1500 }, 6000, [])).toBe(false)
    expect(validRegionSpan({ startMs: -100, endMs: 1000 }, 6000, [])).toBe(false)
    expect(validRegionSpan({ startMs: 5500, endMs: 6100 }, 6000, [])).toBe(false)
    expect(validRegionSpan({ startMs: NaN, endMs: 1000 }, 6000, [])).toBe(false)
  })
})
