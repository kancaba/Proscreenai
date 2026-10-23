import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreGraphics

struct CaptureConfig: Codable {
	let fps: Int?
	let maxWidth: Int?
	let maxHeight: Int?
	let displayId: CGDirectDisplayID?
	let windowId: UInt32?
	let outputPath: String?
	let showsCursor: Bool?
	let capturesSystemAudio: Bool?
	let capturesMicrophone: Bool?
	let microphoneDeviceId: String?
	let microphoneOutputPath: String?
	let systemAudioOutputPath: String?
	let excludedProcessIds: [Int32]?
	let excludedWindowIds: [UInt32]?
	/// Display area to record, as fractions of the display (0...1). Cropped by ScreenCaptureKit.
	let regionX: Double?
	let regionY: Double?
	let regionWidth: Double?
	let regionHeight: Double?
}

// CAPTURE_REGION_BEGIN
/// The display area to capture, in display points, or nil for the whole display.
func captureSourceRect(displayWidth: Double, displayHeight: Double, x: Double?, y: Double?, width: Double?, height: Double?) -> CGRect? {
	guard let x, let y, let width, let height, displayWidth > 0, displayHeight > 0,
		  [x, y, width, height].allSatisfy({ $0.isFinite }), x >= 0, y >= 0, width > 0, height > 0,
		  x + width <= 1.000001, y + height <= 1.000001 else { return nil }
	let rect = CGRect(x: x * displayWidth, y: y * displayHeight, width: width * displayWidth, height: height * displayHeight)
		.integral
		.intersection(CGRect(x: 0, y: 0, width: displayWidth, height: displayHeight))
	return rect.width >= 16 && rect.height >= 16 ? rect : nil
}
// CAPTURE_REGION_END

// CAPTURE_RETIME_BEGIN
func retimeCaptureBuffer(_ buffer: CMSampleBuffer, timestamp: CMTime) throws -> CMSampleBuffer {
		var count: CMItemCount = 0
		guard CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count) == noErr, count > 0 else { throw NSError(domain: "ScreenMovieTiming", code: 1) }
		var timings = Array(repeating: CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid), count: count)
		let status = timings.withUnsafeMutableBufferPointer { entries in
			CMSampleBufferGetSampleTimingInfoArray(buffer, entryCount: count, arrayToFill: entries.baseAddress, entriesNeededOut: &count)
		}
		guard status == noErr else { throw NSError(domain: "ScreenMovieTiming", code: 1) }
		let shift = timestamp - buffer.presentationTimeStamp
		for index in timings.indices {
			timings[index].presentationTimeStamp = timings[index].presentationTimeStamp + shift
			if timings[index].decodeTimeStamp.isValid { timings[index].decodeTimeStamp = timings[index].decodeTimeStamp + shift }
		}
		return try CMSampleBuffer(copying: buffer, withNewTiming: timings)
}

// Silent PCM in the same format as `template`, used to fill timeline gaps. AAC in
// MP4/M4A has no per-packet timestamps, so an unfilled gap would collapse and pull
// all later audio earlier than the video.
func makeSilentAudioBuffer(like template: CMSampleBuffer, frameCount: Int, presentationTime: CMTime) throws -> CMSampleBuffer {
		guard frameCount > 0, let format = template.formatDescription,
			  let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
			  asbd.mFormatID == kAudioFormatLinearPCM, asbd.mBytesPerFrame > 0 else {
			throw NSError(domain: "ScreenMovieTiming", code: 2)
		}
		let planes = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0 ? Int(asbd.mChannelsPerFrame) : 1
		let length = frameCount * Int(asbd.mBytesPerFrame) * planes
		var block: CMBlockBuffer?
		guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: length, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: length, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block) == noErr,
			  let block, CMBlockBufferFillDataBytes(with: 0, blockBuffer: block, offsetIntoDestination: 0, dataLength: length) == noErr else {
			throw NSError(domain: "ScreenMovieTiming", code: 3)
		}
		var silent: CMSampleBuffer?
		guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: block, formatDescription: format, sampleCount: frameCount, presentationTimeStamp: presentationTime, packetDescriptions: nil, sampleBufferOut: &silent) == noErr, let silent else {
			throw NSError(domain: "ScreenMovieTiming", code: 4)
		}
		return silent
}

/// Frames of silence needed before a buffer at `start` so audio continues from `expectedStart`.
func silentFramesBefore(start: CMTime, expectedStart: CMTime, sampleRate: Double) -> Int {
		let gap = (start - expectedStart).seconds
		// Ignore sub-sample rounding; never fill absurd gaps from a broken clock.
		guard gap.isFinite, gap > 1.5 / sampleRate, gap < 10 else { return 0 }
		return Int((gap * sampleRate).rounded())
}
// CAPTURE_RETIME_END

let targetCaptureFPS = 60

final class ScreenCaptureRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
	private let queue = DispatchQueue(label: "openscreen.screencapturekit.video")
	private var assetWriter: AVAssetWriter?
	private var videoInput: AVAssetWriterInput?
	private var videoAdaptor: AVAssetWriterInputPixelBufferAdaptor?
	private var audioInput: AVAssetWriterInput?
	private var systemAudioWriter: AVAssetWriter?
	private var microphoneOnlyWriter: AVAssetWriter?
	private var microphoneOnlyInput: AVAssetWriterInput?
	private var stream: SCStream?
	private var firstSampleTime: CMTime = .zero
	private var pausedAt: CMTime?
	private var pausedDuration = CMTime.zero
	private var minimumSampleTime = CMTime.zero
	private var heartbeat: DispatchSourceTimer?
	private var lastVideoTime = CMTime.zero
	private var lastAudioTimes: [ObjectIdentifier: CMTime] = [:]
	/// Where the next audio buffer of each input should start, on the zero-based timeline.
	private var nextAudioTimes: [ObjectIdentifier: CMTime] = [:]
	private var silentAudioSeconds = 0.0
	private var firstVideoHost: CMTime?
	private var firstAudioHost: CMTime?
	private var lastSampleBuffer: CMSampleBuffer?
	private var isRecording = false
	private var sessionStarted = false
	private var frameCount = 0
	private var outputURL: URL?
	private var microphoneOutputURL: URL?
	private var trackedWindowId: UInt32?
	private var windowValidationTask: Task<Void, Never>?
	private var capturesSystemAudio = false
	private var capturesMicrophone = false
	private var writesMicrophoneToSeparateTrack = false

	private enum PrimaryAudioSource {
		case system
		case microphone
	}

	private let microphoneOutputTypeRawValue = 2

	private var primaryAudioSource: PrimaryAudioSource?

	func startCapture(configJSON: String) async throws {
		guard !isRecording else {
			throw NSError(domain: "RecordlyCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "Recording is already in progress"])
		}

		guard let data = configJSON.data(using: .utf8) else {
			throw NSError(domain: "RecordlyCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid JSON input"])
		}

		let config = try JSONDecoder().decode(CaptureConfig.self, from: data)
		let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
		let streamConfig = SCStreamConfiguration()
		capturesSystemAudio = config.capturesSystemAudio ?? false
		capturesMicrophone = config.capturesMicrophone ?? false
		if capturesMicrophone && !supportsNativeMicrophoneCapture(streamConfig: streamConfig) {
			throw NSError(
				domain: "RecordlyCapture",
				code: 10,
				userInfo: [NSLocalizedDescriptionKey: "Native microphone capture is unavailable on this macOS/Xcode runtime"]
			)
		}
		writesMicrophoneToSeparateTrack = capturesMicrophone
		primaryAudioSource = capturesSystemAudio ? .system : (capturesMicrophone ? .microphone : nil)
		let requestedFPS = (config.fps == 30 ? 30 : targetCaptureFPS)
		streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(requestedFPS))
		streamConfig.queueDepth = 6
		streamConfig.pixelFormat = kCVPixelFormatType_32BGRA
		streamConfig.showsCursor = config.showsCursor ?? false
		streamConfig.capturesAudio = capturesSystemAudio
		streamConfig.sampleRate = 48000
		streamConfig.channelCount = 2
		streamConfig.excludesCurrentProcessAudio = true

		if capturesMicrophone {
			streamConfig.setValue(true, forKey: "captureMicrophone")
			if let microphoneDeviceId = config.microphoneDeviceId, !microphoneDeviceId.isEmpty {
				streamConfig.setValue(microphoneDeviceId, forKey: "microphoneCaptureDeviceID")
			}
		}

		let filter: SCContentFilter
		var outputWidth: Int
		var outputHeight: Int

		if let windowId = config.windowId {
			trackedWindowId = windowId
			guard let window = availableContent.windows.first(where: { $0.windowID == windowId }) else {
				throw NSError(domain: "RecordlyCapture", code: 3, userInfo: [NSLocalizedDescriptionKey: "Window not found"])
			}

			filter = SCContentFilter(desktopIndependentWindow: window)

			let candidateDisplay = availableContent.displays.first(where: {
				$0.frame.intersects(window.frame) || $0.frame.contains(CGPoint(x: window.frame.midX, y: window.frame.midY))
			})
			let scaleFactor = ScreenCaptureRecorder.scaleFactor(for: candidateDisplay?.displayID ?? CGMainDisplayID())
			outputWidth = max(2, Int(window.frame.width) * scaleFactor)
			outputHeight = max(2, Int(window.frame.height) * scaleFactor)
			streamConfig.ignoreShadowsSingleWindow = true
			streamConfig.width = outputWidth
			streamConfig.height = outputHeight
		} else {
			trackedWindowId = nil
			let displayId = config.displayId ?? CGMainDisplayID()
			guard let display = availableContent.displays.first(where: { $0.displayID == displayId }) else {
				throw NSError(domain: "RecordlyCapture", code: 4, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
			}

			let excludedPids = Set(config.excludedProcessIds ?? [])
			let excludedIds = Set(config.excludedWindowIds ?? [])
			let excludedWindows = availableContent.windows.filter { window in
				excludedIds.contains(window.windowID)
					|| window.owningApplication.map { excludedPids.contains($0.processID) } == true
			}
			filter = SCContentFilter(display: display, excludingWindows: excludedWindows)
			let displayBounds = CGDisplayBounds(display.displayID)
			let scaleFactor = ScreenCaptureRecorder.scaleFactor(for: display.displayID)
			outputWidth = max(2, Int(displayBounds.width) * scaleFactor)
			outputHeight = max(2, Int(displayBounds.height) * scaleFactor)
			if let sourceRect = captureSourceRect(
				displayWidth: displayBounds.width, displayHeight: displayBounds.height,
				x: config.regionX, y: config.regionY, width: config.regionWidth, height: config.regionHeight
			) {
				// Crop at capture time: no full-screen frames, no re-encode afterwards.
				streamConfig.sourceRect = sourceRect
				outputWidth = max(2, Int(sourceRect.width) * scaleFactor)
				outputHeight = max(2, Int(sourceRect.height) * scaleFactor)
				print("CAPTURE_REGION \(Int(sourceRect.minX)) \(Int(sourceRect.minY)) \(Int(sourceRect.width)) \(Int(sourceRect.height))")
			}
			streamConfig.width = outputWidth
			streamConfig.height = outputHeight
		}

        if let maxWidth = config.maxWidth, let maxHeight = config.maxHeight, maxWidth > 0 && maxHeight > 0 {
            let portrait = outputHeight > outputWidth
            let limitW = portrait ? maxHeight : maxWidth
            let limitH = portrait ? maxWidth : maxHeight
            let scale = min(1.0, min(Double(limitW) / Double(outputWidth), Double(limitH) / Double(outputHeight)))
            outputWidth = max(2, Int(Double(outputWidth) * scale) / 2 * 2)
            outputHeight = max(2, Int(Double(outputHeight) * scale) / 2 * 2)
        }
        outputWidth = outputWidth / 2 * 2
        outputHeight = outputHeight / 2 * 2
        streamConfig.width = outputWidth
        streamConfig.height = outputHeight
        print("CAPTURE_FORMAT \(outputWidth) \(outputHeight) \(requestedFPS)")

		let destinationURL: URL
		if let outputPath = config.outputPath, !outputPath.isEmpty {
			destinationURL = URL(fileURLWithPath: outputPath)
		} else {
			destinationURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
				.appendingPathComponent("output_\(Int(Date().timeIntervalSince1970)).mp4")
		}

		outputURL = destinationURL
		let outputFileType: AVFileType = destinationURL.pathExtension.lowercased() == "mp4" ? .mp4 : .mov
		assetWriter = try AVAssetWriter(url: destinationURL, fileType: outputFileType)
		// Preserve completed fragments when capture or the parent application terminates.
		assetWriter?.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
		microphoneOutputURL = nil

		guard let assistant = AVOutputSettingsAssistant(preset: .preset3840x2160) else {
			throw NSError(domain: "RecordlyCapture", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unable to create output settings assistant"])
		}

		assistant.sourceVideoFormat = try CMVideoFormatDescription(
			videoCodecType: .h264,
			width: outputWidth,
			height: outputHeight
		)

		guard var outputSettings = assistant.videoSettings else {
			throw NSError(domain: "RecordlyCapture", code: 6, userInfo: [NSLocalizedDescriptionKey: "Output settings unavailable"])
		}

		outputSettings[AVVideoWidthKey] = outputWidth
		outputSettings[AVVideoHeightKey] = outputHeight
		outputSettings[AVVideoCodecKey] = AVVideoCodecType.h264
		outputSettings[AVVideoCompressionPropertiesKey] = [
			AVVideoAverageBitRateKey: min(60_000_000, max(8_000_000, outputWidth * outputHeight * requestedFPS / 8)),
			AVVideoExpectedSourceFrameRateKey: requestedFPS,
			AVVideoMaxKeyFrameIntervalKey: requestedFPS,
			AVVideoAllowFrameReorderingKey: false,
			AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
		]

		let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
		videoInput.expectsMediaDataInRealTime = true

		guard let assetWriter = assetWriter, assetWriter.canAdd(videoInput) else {
			throw NSError(domain: "RecordlyCapture", code: 7, userInfo: [NSLocalizedDescriptionKey: "Unable to add video writer input"])
		}

		assetWriter.add(videoInput)
		self.videoInput = videoInput
		videoAdaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: videoInput, sourcePixelBufferAttributes: nil)

		if capturesSystemAudio {
			let audioURL = URL(fileURLWithPath: config.systemAudioOutputPath ?? destinationURL.path + ".system.m4a")
			let writer = try AVAssetWriter(url: audioURL, fileType: .m4a)
			writer.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
			let input = AVAssetWriterInput(mediaType: .audio, outputSettings: Self.audioOutputSettings(bitRate: 160_000))
			input.expectsMediaDataInRealTime = true
			guard writer.canAdd(input) else { throw NSError(domain: "ScreenMovieCapture", code: 11) }
			writer.add(input)
			guard writer.startWriting() else { throw writer.error ?? NSError(domain: "ScreenMovieCapture", code: 12) }
			writer.startSession(atSourceTime: .zero)
			systemAudioWriter = writer
			audioInput = input
		}

		if writesMicrophoneToSeparateTrack {
			guard let microphoneOutputPath = config.microphoneOutputPath, !microphoneOutputPath.isEmpty else {
				throw NSError(domain: "RecordlyCapture", code: 12, userInfo: [NSLocalizedDescriptionKey: "Missing microphone output path for dual-audio capture"])
			}

			let microphoneURL = URL(fileURLWithPath: microphoneOutputPath)
			microphoneOutputURL = microphoneURL
			let microphoneWriter = try AVAssetWriter(url: microphoneURL, fileType: .m4a)
			microphoneWriter.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
			let microphoneInput = AVAssetWriterInput(mediaType: .audio, outputSettings: Self.audioOutputSettings(bitRate: 128_000))
			microphoneInput.expectsMediaDataInRealTime = true

			guard microphoneWriter.canAdd(microphoneInput) else {
				throw NSError(domain: "RecordlyCapture", code: 13, userInfo: [NSLocalizedDescriptionKey: "Unable to add microphone writer input"])
			}

			microphoneWriter.add(microphoneInput)
			self.microphoneOnlyWriter = microphoneWriter
			self.microphoneOnlyInput = microphoneInput

			guard microphoneWriter.startWriting() else {
				throw NSError(domain: "RecordlyCapture", code: 14, userInfo: [NSLocalizedDescriptionKey: microphoneWriter.error?.localizedDescription ?? "Unable to start microphone audio writing"])
			}

			microphoneWriter.startSession(atSourceTime: .zero)
		}

		let stream = SCStream(filter: filter, configuration: streamConfig, delegate: self)
		self.stream = stream
		try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
		if capturesSystemAudio {
			try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
		}
		if capturesMicrophone {
			guard let microphoneOutputType = SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) else {
				throw NSError(
					domain: "RecordlyCapture",
					code: 15,
					userInfo: [NSLocalizedDescriptionKey: "Microphone stream output type is unavailable"]
				)
			}
			try stream.addStreamOutput(self, type: microphoneOutputType, sampleHandlerQueue: queue)
		}
		try await stream.startCapture()

		guard assetWriter.startWriting() else {
			throw NSError(domain: "RecordlyCapture", code: 8, userInfo: [NSLocalizedDescriptionKey: assetWriter.error?.localizedDescription ?? "Unable to start video writing"])
		}

		assetWriter.startSession(atSourceTime: .zero)
		// Set the clock origin before samples are accepted, on the sample queue, so no
		// buffer is ever timed against an unset origin.
		queue.sync {
			frameCount = 0
			firstSampleTime = CMClockGetTime(CMClockGetHostTimeClock())
			minimumSampleTime = firstSampleTime
			pausedDuration = .zero
			pausedAt = nil
			lastVideoTime = .zero
			lastAudioTimes = [:]
			nextAudioTimes = [:]
			silentAudioSeconds = 0
			sessionStarted = true
			isRecording = true
		}
		startWindowValidationIfNeeded()
		let timer = DispatchSource.makeTimerSource(queue: queue)
		timer.schedule(deadline: .now() + .milliseconds(500), repeating: .milliseconds(500))
		timer.setEventHandler { [weak self] in self?.appendHeldFrame() }
		heartbeat = timer
		timer.resume()
		print("Recording started")
		fflush(stdout)
	}

	func stopCapture() async throws -> String {
		guard isRecording else {
			throw NSError(domain: "RecordlyCapture", code: 9, userInfo: [NSLocalizedDescriptionKey: "No recording in progress"])
		}

		return try await finishCapture()
	}

	func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
		guard sessionStarted, sampleBuffer.isValid, isRecording, pausedAt == nil, sampleBuffer.presentationTimeStamp >= minimumSampleTime else { return }

		if outputType == .screen {
			guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
					  let attachment = attachments.first,
					  let statusRawValue = attachment[SCStreamFrameInfo.status] as? Int,
					  let status = SCFrameStatus(rawValue: statusRawValue),
					  status == .complete else {
				return
			}

			guard let videoInput = videoInput, videoInput.isReadyForMoreMediaData else { return }

			if firstVideoHost == nil { firstVideoHost = sampleBuffer.presentationTimeStamp }
			let presentationTime = sampleBuffer.presentationTimeStamp - firstSampleTime - pausedDuration
			guard presentationTime > lastVideoTime else { return }
			lastSampleBuffer = sampleBuffer
			if let image = sampleBuffer.imageBuffer, videoAdaptor?.append(image, withPresentationTime: presentationTime) == true {
				lastVideoTime = presentationTime
				frameCount += 1
			}
			return
		}

		if outputType == .audio {
			guard primaryAudioSource == .system, let audioInput else { return }
			appendAudioSampleBuffer(sampleBuffer, to: audioInput)
			return
		}

		if outputType.rawValue == microphoneOutputTypeRawValue {
			if writesMicrophoneToSeparateTrack, let microphoneOnlyInput {
				appendAudioSampleBuffer(sampleBuffer, to: microphoneOnlyInput)
			} else if primaryAudioSource == .microphone, let audioInput {
				appendAudioSampleBuffer(sampleBuffer, to: audioInput)
			}
			return
		}

		return
	}

	func stream(_ stream: SCStream, didStopWithError error: Error) {
		fputs("Error: \(error.localizedDescription)\n", stderr)
		fflush(stderr)
	}

	func setPaused(_ pause: Bool, requestId: String) {
		queue.async {
			guard self.isRecording else { print("CAPTURE_STATE_ERROR \(requestId)"); fflush(stdout); return }
			let now = CMClockGetTime(CMClockGetHostTimeClock())
			if pause && self.pausedAt == nil {
				self.appendHeldFrame()
				self.pausedAt = now
			} else if !pause, let heldAt = self.pausedAt {
				self.pausedDuration = self.pausedDuration + now - heldAt
				self.pausedAt = nil
				self.minimumSampleTime = now
			}
			let elapsed = ((self.pausedAt ?? now) - self.firstSampleTime - self.pausedDuration).seconds * 1000
			print("CAPTURE_STATE \(requestId) \(self.pausedAt != nil ? "paused" : "recording") \(max(0, elapsed))")
			fflush(stdout)
		}
	}

	// SCK emits no complete frames while content is static. Persist the held image
	// on a monotonic clock so fragments and the final duration continue advancing.
	private func appendHeldFrame() {
		guard isRecording, pausedAt == nil, let sample = lastSampleBuffer, let input = videoInput,
			input.isReadyForMoreMediaData, firstSampleTime != .zero else { return }
		let now = CMClockGetTime(CMClockGetHostTimeClock()) - firstSampleTime - pausedDuration
		guard now > lastVideoTime else { return }
		if let image = sample.imageBuffer, videoAdaptor?.append(image, withPresentationTime: now) == true {
			lastVideoTime = now
		}
	}

	private func finishCapture() async throws -> String {
		windowValidationTask?.cancel()
		windowValidationTask = nil
		trackedWindowId = nil

		heartbeat?.cancel()
		heartbeat = nil
		queue.sync {
			appendHeldFrame()
			isRecording = false
		}
		if let activeStream = stream {
			do {
				try await activeStream.stopCapture()
			} catch {
				// Stream may have already been stopped by the system — continue with file finalization
			}
		}
		stream = nil

		// Every appended buffer uses a zero-based timestamp; endSession must use
		// the same domain, never the original host-clock timestamp from SCK.
		if let writer = assetWriter, writer.status == .writing {
			writer.endSession(atSourceTime: lastVideoTime + CMTime(value: 1, timescale: 60))
			videoInput?.markAsFinished()
			await writer.finishWriting()
		}
		if let writer = systemAudioWriter, writer.status == .writing {
			audioInput?.markAsFinished()
			await writer.finishWriting()
		}
		if let writer = microphoneOnlyWriter, writer.status == .writing {
			microphoneOnlyInput?.markAsFinished()
			await writer.finishWriting()
		}

		let path = outputURL?.path ?? ""
		let diagnostics: [String: Any] = [
			"origin": firstSampleTime.seconds,
			"firstVideoHost": firstVideoHost?.seconds ?? -1,
			"firstAudioHost": firstAudioHost?.seconds ?? -1,
			"lastVideoSeconds": lastVideoTime.seconds,
			"lastAudioSeconds": lastAudioTimes.values.map { $0.seconds },
			"audioEndSeconds": nextAudioTimes.values.map { $0.seconds },
			"silentAudioSeconds": silentAudioSeconds,
			"pausedSeconds": pausedDuration.seconds,
			"activeSeconds": ((pausedAt ?? CMClockGetTime(CMClockGetHostTimeClock())) - firstSampleTime - pausedDuration).seconds,
			"videoFrames": frameCount,
			"writerStatus": assetWriter?.status.rawValue ?? -1,
			"writerError": assetWriter?.error.map { String(describing: $0 as NSError) } ?? "",
			"systemAudioWriterStatus": systemAudioWriter?.status.rawValue ?? -1,
			"systemAudioWriterError": systemAudioWriter?.error.map { String(describing: $0 as NSError) } ?? ""
		]
		if let data = try? JSONSerialization.data(withJSONObject: diagnostics, options: [.prettyPrinted]) {
			try? data.write(to: URL(fileURLWithPath: path + ".capture.json"), options: .atomic)
		}
		let failure = [assetWriter, systemAudioWriter, microphoneOnlyWriter].compactMap { $0 }.first { $0.status != .completed }
		if let failure { throw failure.error ?? NSError(domain: "ScreenMovieCapture", code: 20, userInfo: [NSLocalizedDescriptionKey: "Recording writer did not complete"]) }
		// A "completed" writer with no video frames leaves an unplayable file; never report it as a recording.
		if frameCount == 0 && lastVideoTime == .zero {
			throw NSError(domain: "ScreenMovieCapture", code: 21, userInfo: [NSLocalizedDescriptionKey: "No video frames were captured"])
		}
		assetWriter = nil
		systemAudioWriter = nil
		videoInput = nil
		videoAdaptor = nil
		audioInput = nil
		microphoneOnlyWriter = nil
		microphoneOnlyInput = nil
		outputURL = nil
		microphoneOutputURL = nil
		sessionStarted = false
		firstSampleTime = .zero
		lastSampleBuffer = nil
		frameCount = 0
		capturesSystemAudio = false
		capturesMicrophone = false
		writesMicrophoneToSeparateTrack = false
		primaryAudioSource = nil
		return path
	}

	private func appendAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer, to input: AVAssetWriterInput) {
		guard input.isReadyForMoreMediaData else { return }
		if firstAudioHost == nil { firstAudioHost = sampleBuffer.presentationTimeStamp }
		let presentationTime = sampleBuffer.presentationTimeStamp - firstSampleTime - pausedDuration
		let key = ObjectIdentifier(input)
		if let previous = lastAudioTimes[key], presentationTime <= previous { return }
		let expectedStart = nextAudioTimes[key] ?? .zero
		// Drops at pause boundaries or while the writer is busy leave gaps; keep the
		// audio timeline continuous so it stays in sync with the video.
		if let asbd = sampleBuffer.formatDescription.flatMap({ CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee }), asbd.mSampleRate > 0 {
			let frames = silentFramesBefore(start: presentationTime, expectedStart: expectedStart, sampleRate: asbd.mSampleRate)
			if frames > 0, let silence = try? makeSilentAudioBuffer(like: sampleBuffer, frameCount: frames, presentationTime: expectedStart) {
				guard input.append(silence) else { return }
				silentAudioSeconds += Double(frames) / asbd.mSampleRate
			}
		}
		// Preserve per-sample PCM durations; changing the entire buffer duration
		// into a single sample duration makes the audio timeline grow incorrectly.
		if let retimedSampleBuffer = try? retimeCaptureBuffer(sampleBuffer, timestamp: presentationTime), input.append(retimedSampleBuffer) {
			lastAudioTimes[key] = presentationTime
			nextAudioTimes[key] = presentationTime + retimedSampleBuffer.duration
		}
	}

	private static func audioOutputSettings(bitRate: Int) -> [String: Any] {
		[
			AVFormatIDKey: kAudioFormatMPEG4AAC,
			AVSampleRateKey: 48_000,
			AVNumberOfChannelsKey: 2,
			AVEncoderBitRateKey: bitRate,
		]
	}

	private func supportsNativeMicrophoneCapture(streamConfig: SCStreamConfiguration) -> Bool {
		let supportsConfigSelector = streamConfig.responds(to: Selector(("setCaptureMicrophone:")))
		let supportsDeviceSelector = streamConfig.responds(to: Selector(("setMicrophoneCaptureDeviceID:")))
		let supportsOutputType = SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) != nil
		return supportsConfigSelector && supportsDeviceSelector && supportsOutputType
	}

	private func startWindowValidationIfNeeded() {
		guard let trackedWindowId else {
			windowValidationTask?.cancel()
			windowValidationTask = nil
			return
		}

		windowValidationTask?.cancel()
		windowValidationTask = Task.detached(priority: .utility) { [weak self] in
			guard let self else { return }
			// The shareable-content list can briefly omit a live window, so a single miss
			// must not end the recording. Minimised or off-Space windows still exist and
			// keep recording (the last frame is held); only a closed window stops it.
			var consecutiveMisses = 0
			while !Task.isCancelled {
				try? await Task.sleep(nanoseconds: 500_000_000)
				if Task.isCancelled { return }
				guard self.isRecording else { return }

				do {
					let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
					let windowStillAvailable = availableContent.windows.contains(where: { $0.windowID == trackedWindowId })
					consecutiveMisses = windowStillAvailable ? 0 : consecutiveMisses + 1
					if consecutiveMisses >= 3 {
						print("WINDOW_UNAVAILABLE")
						fflush(stdout)
						let outputPath = try await self.finishCapture()
						print("Recording stopped. Output path: \(outputPath)")
						fflush(stdout)
						exit(0)
					}
				} catch {
					continue
				}
			}
		}
	}

	private static func scaleFactor(for displayId: CGDirectDisplayID) -> Int {
		guard let mode = CGDisplayCopyDisplayMode(displayId) else {
			return 1
		}
		return max(1, mode.pixelWidth / max(1, mode.width))
	}
}

final class RecorderService {
	private let recorder = ScreenCaptureRecorder()
	private let queue = DispatchQueue(label: "screenmovie.capture.commands")
	private let completionGroup = DispatchGroup()
	private var started = false
	private var failed = false

	private func enqueue(_ action: @escaping () async -> Void) {
		queue.async {
			let done = DispatchSemaphore(value: 0)
			Task { await action(); done.signal() }
			done.wait()
		}
	}
	func start(configJSON: String) {
		completionGroup.enter()
		enqueue {
			do { try await self.recorder.startCapture(configJSON: configJSON); self.started = true }
			catch { self.failed = true; fputs("Error starting capture: \(error)\n", stderr); fflush(stderr); self.completionGroup.leave() }
		}
	}
	func stop() {
		enqueue {
			guard self.started else { return }
			self.started = false
			do {
				let output = try await self.recorder.stopCapture()
				print("Recording stopped. Output path: \(output)"); fflush(stdout)
			} catch { self.failed = true; fputs("Error stopping capture: \(error)\n", stderr); fflush(stderr) }
			self.completionGroup.leave()
		}
	}
	func setPaused(_ paused: Bool, requestId: String) { recorder.setPaused(paused, requestId: requestId) }
	func waitUntilFinished() { completionGroup.wait(); if failed { exit(1) } }
}

guard CommandLine.arguments.count >= 2 else {
	fputs("Missing config JSON\n", stderr)
	fflush(stderr)
	exit(1)
}

// Force CoreGraphics Services initialization on the main thread.
// Without this, SCContentFilter(desktopIndependentWindow:) crashes with
// CGS_REQUIRE_INIT because CGS is never initialised in a CLI tool.
let _ = CGMainDisplayID()

let service = RecorderService()
service.start(configJSON: CommandLine.arguments[1])

DispatchQueue.global(qos: .utility).async {
	while let input = readLine(strippingNewline: true)?.lowercased() {
		let command = input.split(separator: " ").map(String.init)
		if command.count == 2 && (command[0] == "pause" || command[0] == "resume") {
			service.setPaused(command[0] == "pause", requestId: command[1])
		} else if input == "stop" {
			service.stop()
			return
		}
	}
	// EOF means the Electron parent exited. Finalize and release capture resources.
	service.stop()
}

service.waitUntilFinished()

