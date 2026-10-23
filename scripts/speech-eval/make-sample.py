# Builds tr-sentences.wav (16 kHz mono) from script-tr.txt with the macOS Yelda voice,
# one sentence per clip with 0.8 s pauses, and truth.json with each sentence's speech start/end.
import json, re, struct, subprocess, wave

text = open('script-tr.txt').read().strip()
sentences = [s.strip() for s in re.split(r'(?<=\.)\s+', text) if s.strip()]
RATE, GAP, THRESHOLD = 16000, 0.8, 500
silence = lambda sec: b'\x00\x00' * int(round(sec * RATE))
pcm, t, truth = silence(0.5), 0.5, []
for i, sentence in enumerate(sentences):
    subprocess.run(['say', '-v', 'Yelda', '-r', '175', '-o', f's{i}.aiff', sentence], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f's{i}.aiff', '-ac', '1', '-ar', str(RATE), '-f', 's16le', f's{i}.raw'], check=True)
    data = open(f's{i}.raw', 'rb').read()
    samples = struct.unpack('<%dh' % (len(data) // 2), data)
    first = next(k for k, v in enumerate(samples) if abs(v) > THRESHOLD)
    last = len(samples) - next(k for k, v in enumerate(reversed(samples)) if abs(v) > THRESHOLD)
    words = sentence.split()
    truth.append({'sentence': sentence, 'startMs': round((t + first / RATE) * 1000), 'endMs': round((t + last / RATE) * 1000),
                  'firstWord': words[0].strip(',.'), 'lastWord': words[-1].strip(',.')})
    pcm += data + silence(GAP)
    t += len(samples) / RATE + GAP
with wave.open('tr-sentences.wav', 'wb') as out:
    out.setnchannels(1); out.setsampwidth(2); out.setframerate(RATE); out.writeframes(pcm)
json.dump({'durationMs': round(t * 1000), 'sentences': truth}, open('truth.json', 'w'), ensure_ascii=False, indent=1)
