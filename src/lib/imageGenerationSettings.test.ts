import {describe,it,expect} from 'vitest';
import {IMAGE_RESOLUTIONS,isImageResolution,deduplicateSource,imageSkillContext} from './imageGenerationSettings';
import {geminiPayload} from '../../electron/geminiClient';
describe('image resolution and lean context',()=>{
 it('sends each requested native size without changing references or aspect',()=>{for(const imageSize of IMAGE_RESOLUTIONS){const result=geminiPayload({prompt:'Preserve logo and Turkish text: İmzan',references:['data:image/png;base64,YQ=='],width:1080,height:1920,mode:'edit',imageSize});expect(result.generationConfig.imageConfig).toEqual({aspectRatio:'9:16',imageSize});expect(result.contents[0].parts[1]).toEqual({inlineData:{mimeType:'image/png',data:'YQ=='}});expect(result.contents[0].parts[0].text).toContain('İmzan')}});
 it('keeps backwards-compatible 1K and rejects unknown presets',()=>{expect(geminiPayload({prompt:'x',references:[],width:100,height:100,mode:'generate'}).generationConfig.imageConfig.imageSize).toBe('1K');for(const v of ['8K','1k',null,4096])expect(isImageResolution(v)).toBe(false)});
 it('removes repeated source lines while retaining unique product facts',()=>{expect(deduplicateSource('Product A\nWarranty: 3 years\nProduct A\n  Warranty: 3 years \nPrice: 100')).toBe('Product A\nWarranty: 3 years\nPrice: 100')});
 it('retains fidelity, copy and cutout rules in the compact skill guidance',()=>{const guide=imageSkillContext(true);expect(guide.length).toBeLessThan(800);expect(guide).toContain('logos exactly');expect(guide).toContain('Turkish characters');expect(guide).toContain('checkerboard');expect(imageSkillContext(false)).not.toContain('alpha channel')});
});
