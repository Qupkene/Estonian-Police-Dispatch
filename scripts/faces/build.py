"""
Pick a balanced pool from the collected faces and write it into the game.

Buckets: sex x age band. Each bucket keeps up to CAP light-toned faces plus up to CAP_OTHER medium and dark ones
(the game weights tones itself). Copies the WebP files to public/faces/ and writes the rows into src/data/faces.ts.

Usage: python build.py COLLECT_DIR REPO_DIR
"""
import json
import os
import re
import shutil
import sys

BANDS = [(0, 12), (13, 17), (18, 24), (25, 34), (35, 44), (45, 54), (55, 64), (65, 74), (75, 120)]
CAP, CAP_OTHER = 48, 8


def main():
    src, repo = sys.argv[1], sys.argv[2]
    rows = [json.loads(l) for l in open(os.path.join(src, 'labels.jsonl'))]
    rows = [r for r in rows if 'id' in r and os.path.exists(os.path.join(src, 'img', f"{r['id']}.webp"))]
    picked = []
    for g in ('M', 'F'):
        for lo, hi in BANDS:
            band = [r for r in rows if r['gender'] == g and lo <= r['age'] <= hi]
            light = [r for r in band if r['tone'] == 'light']
            other = [r for r in band if r['tone'] != 'light']
            picked += sorted(light, key=lambda r: -r['score'])[:CAP] + sorted(other, key=lambda r: -r['score'])[:CAP_OTHER]
            print(f'{g} {lo:>2}-{hi:<3} light {min(len(light), CAP):>3}/{len(light):<4} other {min(len(other), CAP_OTHER):>2}/{len(other)}')
    out = os.path.join(repo, 'public', 'faces')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith('.webp'):
            os.remove(os.path.join(out, f))
    for r in picked:
        shutil.copy(os.path.join(src, 'img', f"{r['id']}.webp"), os.path.join(out, f"{r['id']}.webp"))
    picked.sort(key=lambda r: (r['gender'], r['age'], r['id']))
    body = '\n'.join(
        f"  ['{r['id']}', '{r['gender']}', {r['age']}, '{r['hair']}', {int(r['bald'])}, {int(r['beard'])}, '{r['tone'][0]}'],"
        for r in picked
    )
    path = os.path.join(repo, 'src', 'data', 'faces.ts')
    ts = open(path).read()
    ts = re.sub(r'const ROWS: Row\[\] = \[[^\]]*?\];|const ROWS: Row\[\] = \[\n(?:.*\n)*?\];', f'const ROWS: Row[] = [\n{body}\n];', ts, count=1)
    open(path, 'w').write(ts)
    size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'{len(picked)} faces, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
