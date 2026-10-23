from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parent.parent
source=(root/'electron/native/ScreenCaptureKitRecorder.swift').read_text()
production=source.split('// CAPTURE_RETIME_BEGIN\n',1)[1].split('// CAPTURE_RETIME_END',1)[0]
production+=source.split('// CAPTURE_REGION_BEGIN\n',1)[1].split('// CAPTURE_REGION_END',1)[0]
with tempfile.TemporaryDirectory(prefix='screenmovie-audio-timing-') as tmp:
    directory=Path(tmp)
    main=directory/'main.swift'
    main.write_text('import Foundation\nimport CoreGraphics\nimport CoreMedia\nimport AVFoundation\nimport AudioToolbox\n'+production+'\n'+(root/'scripts/native-audio-timing-test.swift').read_text()+'\n'+(root/'scripts/native-capture-region-test.swift').read_text())
    binary=directory/'test'
    subprocess.run(['swiftc','-module-cache-path',str(directory/'modules'),str(main),'-o',str(binary)],check=True)
    subprocess.run([str(binary)],check=True)
