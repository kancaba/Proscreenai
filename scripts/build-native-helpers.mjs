import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const nativeRoot = path.join(projectRoot, 'electron', 'native');

if (process.platform !== 'darwin') {
  console.log('[build-native-helpers] Skipping: host platform is not macOS.');
  process.exit(0);
}

const archTag = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
const outputDir = path.join(nativeRoot, 'bin', archTag);
const moduleCache = path.join(projectRoot, '.cache', 'swift-modules');

const helpers = [
  {
    source: 'ScreenCaptureKitRecorder.swift',
    output: 'openscreen-screencapturekit-helper',
  },
  {
    source: 'ScreenCaptureKitWindowList.swift',
    output: 'openscreen-window-list',
  },
  {
    source: 'SystemCursorAssets.swift',
    output: 'openscreen-system-cursors',
  },
  {
    source: 'NativeCursorMonitor.swift',
    output: 'openscreen-native-cursor-monitor',
  },
  {
    source: 'SpeechTranscriberHelper.swift',
    output: 'openscreen-speech-transcriber',
  },
  {
    source: 'TextRecognizer.swift',
    output: 'openscreen-text-recognizer',
  },
];

const swiftcCheck = spawnSync('swiftc', ['--version'], { encoding: 'utf8' });
if (swiftcCheck.status !== 0) {
  const details = [swiftcCheck.stderr, swiftcCheck.stdout].filter(Boolean).join('\n').trim();
  throw new Error(details || 'swiftc is unavailable; install Xcode Command Line Tools.');
}

await mkdir(outputDir, { recursive: true });
await mkdir(moduleCache, { recursive: true });

/*
 * Some Command Line Tools releases ship two module maps that both define SwiftBridging
 * (usr/include/swift/module.modulemap and bridging.modulemap), and every Swift build then fails
 * with "redefinition of module 'SwiftBridging'". When that is the case, hide the older file from
 * the compiler with a virtual file system overlay; nothing on disk is changed.
 */
async function swiftBridgingWorkaround() {
  const swiftc = spawnSync('xcrun', ['--find', 'swiftc'], { encoding: 'utf8' }).stdout.trim();
  if (!swiftc) return [];
  const includeDir = path.join(path.dirname(path.dirname(swiftc)), 'include', 'swift');
  const moduleMap = path.join(includeDir, 'module.modulemap');
  const bridgingMap = path.join(includeDir, 'bridging.modulemap');
  if (!existsSync(moduleMap) || !existsSync(bridgingMap)) return [];
  const defines = (file) => /module\s+SwiftBridging\b/.test(readFileSync(file, 'utf8'));
  if (!defines(moduleMap) || !defines(bridgingMap)) return [];
  const overlayDir = path.join(projectRoot, '.cache', 'swift-overlay');
  await mkdir(overlayDir, { recursive: true });
  const empty = path.join(overlayDir, 'empty.modulemap');
  const overlay = path.join(overlayDir, 'overlay.yaml');
  await writeFile(empty, '');
  await writeFile(overlay, JSON.stringify({
    version: 0,
    'case-sensitive': 'false',
    roots: [{ type: 'file', name: moduleMap, 'external-contents': empty }],
  }));
  console.log('[build-native-helpers] Working around the duplicate SwiftBridging module map in', includeDir);
  return ['-vfsoverlay', overlay, '-Xcc', '-ivfsoverlay', '-Xcc', overlay];
}

const workaround = await swiftBridgingWorkaround();

for (const helper of helpers) {
  const sourcePath = path.join(nativeRoot, helper.source);
  const outputPath = path.join(outputDir, helper.output);

  // Built helpers are checked in; rebuild one only when its source changed, so a working
  // binary is not replaced by one built with an older SDK. FORCE_NATIVE_HELPERS=1 rebuilds all.
  const [sourceStat, outputStat] = await Promise.all([stat(sourcePath), stat(outputPath).catch(() => null)]);
  if (process.env.FORCE_NATIVE_HELPERS !== '1' && outputStat && outputStat.mtimeMs >= sourceStat.mtimeMs) {
    console.log(`[build-native-helpers] Up to date: ${helper.output}`);
    continue;
  }

  const result = spawnSync('swiftc', [
    '-O',
    '-module-cache-path', moduleCache,
    '-target', process.arch === 'arm64' ? 'arm64-apple-macos14.0' : 'x86_64-apple-macos14.0',
    ...workaround,
    sourcePath,
    '-o', outputPath
  ], {
    encoding: 'utf8',
    timeout: 120000,
  });

  if (result.status !== 0) {
    const details = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(details || `Failed to compile ${helper.source}`);
  }

  await chmod(outputPath, 0o755);
  console.log(`[build-native-helpers] Built ${helper.output} -> ${outputPath}`);
}

