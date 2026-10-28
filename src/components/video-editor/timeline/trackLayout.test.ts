import { describe,expect,it } from 'vitest'
import { layoutTrackLanes, trackNeighbours } from './trackLayout'
describe('timeline track layout',()=>{
  it('puts simultaneous picture, caption and arrows on separately selectable lanes',()=>{
    const items=[{id:'image',span:{start:0,end:10000}},{id:'caption',span:{start:0,end:2000}},{id:'arrow',span:{start:1000,end:1800}},{id:'next',span:{start:2000,end:3000}}]
    const layout=layoutTrackLanes(items)
    expect(layout.count).toBe(3)
    expect(layout.lanes.get('image')).not.toBe(layout.lanes.get('caption'))
    expect(layout.lanes.get('arrow')).not.toBe(layout.lanes.get('caption'))
    expect(layout.lanes.get('next')).toBe(layout.lanes.get('caption'))
    expect(items[0].id).toBe('image')
  })
  it('keeps captions that run a few ms into the next one on the same lane',()=>{
    const layout=layoutTrackLanes([{id:'a',span:{start:2707,end:8930}},{id:'b',span:{start:8930,end:11007}},{id:'c',span:{start:11002,end:15558}},{id:'d',span:{start:15556,end:18812}}])
    expect(layout.count).toBe(1)
  })
  it('only clamps against neighbours from the same track',()=>{
    const tracks=[{id:'zoom-1',rowId:'zoom'},{id:'trim-1',rowId:'trim'},{id:'zoom-2',rowId:'zoom'},{id:'audio-1',rowId:'audio'}]
    expect(trackNeighbours(tracks,'zoom-1').map(item=>item.id)).toEqual(['zoom-2'])
    expect(trackNeighbours(tracks,'missing')).toEqual([])
  })
})
