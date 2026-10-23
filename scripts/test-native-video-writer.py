from pathlib import Path
import subprocess,tempfile,sys
root=Path(__file__).resolve().parent.parent
source=(root/'electron/native/ScreenCaptureKitRecorder.swift').read_text()
settings=source.split('\t\toutputSettings[AVVideoCodecKey]',1)[1].split('\n\n\t\tlet videoInput',1)[0]
settings='outputSettings[AVVideoCodecKey]'+settings
with tempfile.TemporaryDirectory(prefix='screenmovie-video-writer-') as tmp:
 d=Path(tmp);code='''import Foundation
import AVFoundation
import CoreVideo
let outputWidth=WIDTH_VALUE, outputHeight=HEIGHT_VALUE, requestedFPS=FPS_VALUE
var outputSettings: [String:Any] = [AVVideoWidthKey:outputWidth,AVVideoHeightKey:outputHeight]
'''+settings+'''
let writer=try AVAssetWriter(outputURL:URL(fileURLWithPath:CommandLine.arguments[1]),fileType:.mp4)
writer.movieFragmentInterval=CMTime(seconds:1,preferredTimescale:600)
let input=AVAssetWriterInput(mediaType:.video,outputSettings:outputSettings)
input.expectsMediaDataInRealTime=true
writer.add(input)
let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:nil)
guard writer.startWriting() else {fatalError("Start failed: \\(String(describing:writer.error))")};writer.startSession(atSourceTime:.zero)
var pixel:CVPixelBuffer?
let attrs=[kCVPixelBufferIOSurfacePropertiesKey as String: [:]] as CFDictionary
precondition(CVPixelBufferCreate(kCFAllocatorDefault,outputWidth,outputHeight,kCVPixelFormatType_32BGRA,attrs,&pixel)==kCVReturnSuccess)
CVPixelBufferLockBaseAddress(pixel!,[]);memset(CVPixelBufferGetBaseAddress(pixel!),0,CVPixelBufferGetDataSize(pixel!));CVPixelBufferUnlockBaseAddress(pixel!,[])
for frame in 0..<240 {
 let deadline=Date().addingTimeInterval(10)
 while !input.isReadyForMoreMediaData && writer.status == .writing && Date()<deadline {Thread.sleep(forTimeInterval:0.001)}
 guard writer.status == .writing && input.isReadyForMoreMediaData else {fatalError("Writer failed: \\(String(describing:writer.error))")}
 precondition(adaptor.append(pixel!,withPresentationTime:CMTime(value:Int64(frame),timescale:20)))
}
input.markAsFinished()
let done=DispatchSemaphore(value:0);writer.finishWriting {done.signal()};done.wait()
precondition(writer.status == .completed,"Writer failed: \\(String(describing:writer.error))")
print("PASS production 3600x2338 H264 settings encode 12 seconds with fragmented MP4")
'''
 code=code.replace('WIDTH_VALUE',sys.argv[1] if len(sys.argv)>1 else '3600').replace('HEIGHT_VALUE',sys.argv[2] if len(sys.argv)>2 else '2338').replace('FPS_VALUE',sys.argv[3] if len(sys.argv)>3 else '60')
 (d/'main.swift').write_text(code)
 (root/'artifacts/native-video-writer-fixture.swift').write_text(code)
 subprocess.run(['swiftc','-module-cache-path',str(d/'modules'),str(d/'main.swift'),'-o',str(d/'test')],check=True)
 subprocess.run([str(d/'test'),str(d/'video.mp4')],check=True,timeout=60)
