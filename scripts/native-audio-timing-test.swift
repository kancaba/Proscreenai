var description = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
var format: CMAudioFormatDescription?
precondition(CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &description, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format) == noErr)
var block: CMBlockBuffer?
precondition(CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: 960 * 8, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: 960 * 8, flags: 0, blockBufferOut: &block) == noErr)
var original: CMSampleBuffer?
precondition(CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: block!, formatDescription: format!, sampleCount: 960, presentationTimeStamp: CMTime(seconds: 100, preferredTimescale: 48000), packetDescriptions: nil, sampleBufferOut: &original) == noErr)
let source = original!
precondition(abs(source.duration.seconds - 0.02) < 0.000001)
for index in 0..<10 {
    let target = CMTime(seconds: Double(index) + 2, preferredTimescale: 48000)
    let retimed = try retimeCaptureBuffer(source, timestamp: target)
    precondition(retimed.numSamples == 960)
    precondition(abs(retimed.duration.seconds - 0.02) < 0.000001)
    precondition(abs(retimed.presentationTimeStamp.seconds - target.seconds) < 0.000001)
    var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid)
    precondition(CMSampleBufferGetSampleTimingInfo(retimed, at: 0, timingInfoOut: &timing) == noErr)
    precondition(abs(timing.duration.seconds - 1.0 / 48000) < 0.000000001)
}
precondition(source.presentationTimeStamp.seconds == 100)
print("PASS production PCM retiming preserves 960 frames and 20 ms duration across 10 shifts")

// Gap filling: silence matches the template format and covers exactly the gap.
var planar = AudioStreamBasicDescription(mSampleRate: 48000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagIsNonInterleaved, mBytesPerPacket: 4, mFramesPerPacket: 1, mBytesPerFrame: 4, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
var planarFormat: CMAudioFormatDescription?
precondition(CMAudioFormatDescriptionCreate(allocator: kCFAllocatorDefault, asbd: &planar, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &planarFormat) == noErr)
var planarBlock: CMBlockBuffer?
precondition(CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: 480 * 4 * 2, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: 480 * 4 * 2, flags: 0, blockBufferOut: &planarBlock) == noErr)
var planarTemplate: CMSampleBuffer?
precondition(CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: planarBlock!, formatDescription: planarFormat!, sampleCount: 480, presentationTimeStamp: CMTime(seconds: 50, preferredTimescale: 48000), packetDescriptions: nil, sampleBufferOut: &planarTemplate) == noErr)
for template in [source, planarTemplate!] {
    let start = CMTime(seconds: 3, preferredTimescale: 48000)
    let silence = try makeSilentAudioBuffer(like: template, frameCount: 1440, presentationTime: start)
    precondition(silence.numSamples == 1440)
    precondition(abs(silence.duration.seconds - 0.03) < 0.000001)
    precondition(silence.presentationTimeStamp == start)
    precondition(CMFormatDescriptionEqual(silence.formatDescription, otherFormatDescription: template.formatDescription))
    let bytes = try silence.dataBuffer!.dataBytes()
    precondition(!bytes.isEmpty && bytes.allSatisfy { $0 == 0 })
}
let expected = CMTime(seconds: 10, preferredTimescale: 48000)
precondition(silentFramesBefore(start: CMTime(seconds: 10.033, preferredTimescale: 48000), expectedStart: expected, sampleRate: 48000) == 1584)
precondition(silentFramesBefore(start: CMTime(value: 480_001, timescale: 48000), expectedStart: expected, sampleRate: 48000) == 0)
precondition(silentFramesBefore(start: CMTime(seconds: 9.9, preferredTimescale: 48000), expectedStart: expected, sampleRate: 48000) == 0)
precondition(silentFramesBefore(start: CMTime(seconds: 30, preferredTimescale: 48000), expectedStart: expected, sampleRate: 48000) == 0)
print("PASS silence fills audio gaps exactly, in interleaved and planar formats")
