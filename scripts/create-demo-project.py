import base64, copy, json, math
from pathlib import Path
root=Path.cwd()
demo=root/'projects/Studio-Demo'; assets=demo/'assets'; demo.mkdir(parents=True,exist_ok=True)
state=json.loads((root/'artifacts/smoke.screenmovie').read_text())['editor']
state.update(wallpaper=(assets/'studio-background.png').as_uri(),shadowIntensity=.6,backgroundBlur=7,zoomMotionBlur=.55,connectZooms=True,showCursor=True,loopCursor=True,cursorSize=2.3,cursorSmoothing=.85,cursorMotionBlur=.45,cursorClickBounce=2.2,borderRadius=20,padding=38,cropRegion={'x':.015,'y':.015,'width':.97,'height':.97},aspectRatio='16:9',exportQuality='source',exportFormat='mp4',gifFrameRate=15,gifLoop=True,gifSizePreset='medium')
state['zoomRegions']=[
 {'id':'zoom-1','startMs':1300,'endMs':2900,'depth':2,'focus':{'cx':.86,'cy':.18}},
 {'id':'zoom-2','startMs':4400,'endMs':6200,'depth':3,'focus':{'cx':.79,'cy':.64}},
 {'id':'zoom-3','startMs':8100,'endMs':9700,'depth':2,'focus':{'cx':.5,'cy':.65}}]
state['trimRegions']=[{'id':'trim-1','startMs':7000,'endMs':7600}]
state['speedRegions']=[{'id':'speed-1','startMs':3200,'endMs':4200,'speed':2},{'id':'speed-2','startMs':10000,'endMs':11000,'speed':.5}]
style={'color':'#ffffff','backgroundColor':'#241d3e','fontSize':30,'fontFamily':'Arial, sans-serif','fontWeight':'bold','fontStyle':'normal','textDecoration':'none','textAlign':'center'}
def text(id,start,end,content,x,y,w,h,**overrides):
 return {'id':id,'type':'text','startMs':start,'endMs':end,'content':content,'textContent':content,'position':{'x':x,'y':y},'size':{'width':w,'height':h},'style':dict(style,**overrides),'zIndex':3}
icon='data:image/png;base64,'+base64.b64encode((root/'public/app-icons/screenmovie-128.png').read_bytes()).decode()
state['annotationRegions']=[
 text('annotation-1',0,2200,'Fikrinden ilk paylaşımına.',17.5,6,65,12),
 text('annotation-2',4300,6800,'Her detay kontrolünüzde.',17.5,85,65,10,fontSize=24,fontStyle='italic'),
 text('annotation-3',9600,12000,'Hazır. Kaydet. Paylaş.',20,84,60,11,fontSize=28),
 {'id':'annotation-4','type':'image','content':icon,'imageContent':icon,'startMs':0,'endMs':12000,'position':{'x':7,'y':11},'size':{'width':5,'height':8},'style':style,'zIndex':4},
 {'id':'annotation-5','type':'figure','content':'','startMs':1800,'endMs':2900,'position':{'x':84,'y':33},'size':{'width':12,'height':19},'style':style,'zIndex':5,'figureData':{'arrowDirection':'up-right','color':'#bca6ee','strokeWidth':5}},
 {'id':'annotation-6','type':'figure','content':'','startMs':8300,'endMs':9600,'position':{'x':53,'y':44},'size':{'width':12,'height':16},'style':style,'zIndex':6,'figureData':{'arrowDirection':'down','color':'#f3b7cf','strokeWidth':4}}]
state['audioRegions']=[{'id':'audio-1','startMs':1200,'endMs':11200,'audioPath':str(assets/'demo-audio.m4a'),'volume':.45}]
project={'version':1,'videoPath':str(assets/'launchboard.mp4'),'editor':state}
(demo/'Studio-Demo.screenmovie').write_text(json.dumps(project,ensure_ascii=False,indent=2)+'\n')
for name,ratio,wallpaper in [('Kare','1:1','linear-gradient(135deg, #33244e, #a386bc)'),('Dikey','9:16','linear-gradient(135deg, #c6def0, #e8b8cb)')]:
 p=copy.deepcopy(project);p['editor'].update(aspectRatio=ratio,wallpaper=wallpaper,backgroundBlur=0)
 (demo/f'Studio-Demo-{name}.screenmovie').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
keyframes=[(0,.15,.15),(900,.9,.135),(2400,.9,.135),(3400,.08,.33),(4700,.8,.6),(6400,.8,.6),(7900,.08,.4),(8500,.53,.64),(10300,.53,.64),(12000,.15,.15)]
samples=[]
for i in range(361):
 t=i*1000/30
 left,right=keyframes[-2:]
 for a,b in zip(keyframes,keyframes[1:]):
  if a[0]<=t<=b[0]: left,right=a,b;break
 u=max(0,min(1,(t-left[0])/(right[0]-left[0])));u=u*u*(3-2*u)
 x=left[1]+(right[1]-left[1])*u;y=left[2]+(right[2]-left[2])*u
 click=i in [42,108,159,240,273]
 samples.append({'timeMs':round(t),'cx':x+math.sin(i*.8)*.0007,'cy':y+math.cos(i*.7)*.0007,'interactionType':'click' if click else 'mouseup' if i in [44,110,161,242,275] else 'move','cursorType':'pointer' if click else 'arrow'})
(assets/'launchboard.mp4.cursor.json').write_text(json.dumps({'version':2,'samples':samples},indent=2))
print('Created 3 feature-filled demo projects')
