import json, re, sys
truth = json.load(open(sys.argv[2]))
result = json.load(open(sys.argv[1]))
def norm(s):
    s = s.replace('I', 'ı').replace('İ', 'i').lower()
    return re.findall(r"[\wçğıöşü']+", s)
ref = norm(' '.join(x['sentence'] for x in truth['sentences']))
# words with times; split multi-word runs evenly is not needed if runs are words
words = []
for w in result['words']:
    for token in norm(w['text']):
        words.append({'t': token, 's': w.get('startMs'), 'e': w.get('endMs')})
hyp = [w['t'] for w in words]
# word error rate
d = [[0]*(len(hyp)+1) for _ in range(len(ref)+1)]
for i in range(len(ref)+1): d[i][0] = i
for j in range(len(hyp)+1): d[0][j] = j
for i in range(1, len(ref)+1):
    for j in range(1, len(hyp)+1):
        d[i][j] = min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1]+(ref[i-1] != hyp[j-1]))
print(f"WER {d[len(ref)][len(hyp)]/len(ref):.1%} ({d[len(ref)][len(hyp)]} edits / {len(ref)} words), {len(hyp)} words out, elapsed {result.get('elapsedMs')} ms")
print('HYP:', ' '.join(hyp))
# sentence boundary timing: the recognised first/last word nearest (within 2 s) to the true boundary
errors = []
missing = 0
for sent in truth['sentences']:
    first, last = norm(sent['firstWord'])[0], norm(sent['lastWord'])[0]
    starts = [w['s'] - sent['startMs'] for w in words if w['t'] == first and w['s'] is not None and abs(w['s'] - sent['startMs']) < 2000]
    ends = [w['e'] - sent['endMs'] for w in words if w['t'] == last and w['e'] is not None and abs(w['e'] - sent['endMs']) < 2000]
    for found in (starts, ends):
        if found: errors.append(min(found, key=abs))
        else: missing += 1
if errors:
    starts_only = errors
    print(f"boundary error: mean {sum(abs(e) for e in errors)/len(errors):.0f} ms, max {max(abs(e) for e in errors)} ms, within 150 ms: {sum(abs(e) <= 150 for e in errors)}/{len(errors)}, unmatched (misrecognised) {missing}")
