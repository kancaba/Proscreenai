import { describe,it,expect } from 'vitest';
import { regionFromPoints, validateCaptureRegion, regionCropFilter } from '../utils/captureRegion';
import { VIDEO_FORMAT_PRESETS, getAspectRatioValue } from '../utils/aspectRatioUtils';
describe('capture region',()=>{
 it('normalizes reverse drag and accepts edge aligned selections',()=>{
  const r=regionFromPoints({x:1,y:1},{x:.25,y:.5});
  expect(validateCaptureRegion(r)).toEqual({x:.25,y:.5,width:.75,height:.5});
 });
 it('rejects invalid, tiny and out of monitor regions',()=>{
  for(const r of [null,{}, {x:NaN,y:0,width:1,height:1},{x:-1,y:0,width:1,height:1},{x:.8,y:0,width:.5,height:1},{x:0,y:0,width:.001,height:1}]) expect(validateCaptureRegion(r)).toBeNull();
 });
 it('uses proportional even pixel crop independent of display scale',()=>{
  expect(regionCropFilter({x:.25,y:.25,width:.5,height:.5})).toContain("trunc(iw*0.5/2)*2");
 });
 it('matches every social preset aspect to its displayed dimensions',()=>{
  for(const p of VIDEO_FORMAT_PRESETS){const [w,h]=p.size.split(' × ').map(Number);expect(getAspectRatioValue(p.ratio)).toBeCloseTo(w/h,8);}
 });
});
