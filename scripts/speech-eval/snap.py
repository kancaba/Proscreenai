# Snaps phrase boundaries to the audio: the first word after a pause starts at the nearest
# speech onset, the last word before a pause ends at the nearest speech offset (ffmpeg silencedetect).
# usage: snap.py <audio> <transcript.json> <out.json>
import json, re, subprocess, sys

src, inp, out = sys.argv[1:4]
log = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', 'silencedetect=noise=-40dB:d=0.25', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
onsets = [float(x) * 1000 for x in re.findall(r'silence_end: ([\d.]+)', log)]
offsets = [float(x) * 1000 for x in re.findall(r'silence_start: ([\d.]+)', log)]
result = json.load(open(inp))
words = [w for w in result['words'] if 'startMs' in w]

moved_starts = 0
prev_end = None
for w in words:
    near = [o for o in onsets if abs(o - w['startMs']) <= 700 and (prev_end is None or o - prev_end > 100)]
    if near:
        onset = round(min(near, key=lambda o: abs(o - w['startMs'])))
        moved_starts += onset != w['startMs']
        w['startMs'] = onset
    prev_end = w['endMs']

moved_ends = 0
for i, w in enumerate(words):
    following = words[i + 1]['startMs'] if i + 1 < len(words) else None
    near = [o for o in offsets if abs(o - w['endMs']) <= 500 and o > w['startMs'] and (following is None or o <= following)]
    if near:
        offset = round(min(near, key=lambda o: abs(o - w['endMs'])))
        moved_ends += offset != w['endMs']
        w['endMs'] = offset

json.dump(result, open(out, 'w'), ensure_ascii=False)
print('starts moved', moved_starts, 'ends moved', moved_ends)
