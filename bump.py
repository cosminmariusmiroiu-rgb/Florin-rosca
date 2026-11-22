# Adds/refreshes ?v=<stamp> on CSS, JS, audio and video links so browsers load the newest files.
import re, glob, time, sys
stamp = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d%H%M')
pat = re.compile(r'((?:css|js|assets/audio|assets/video)/[\w./-]+\.(?:css|js|mp3|mp4))(\?v=\w+)?')
for p in glob.glob('*.html') + ['js/transform.js']:
    s = open(p, encoding='utf-8').read()
    n = pat.sub(lambda m: m.group(1) + '?v=' + stamp, s)
    if n != s: open(p, 'w', encoding='utf-8').write(n); print('updated', p)
