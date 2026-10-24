"""
Collect synthetic faces from thispersondoesnotexist.com and label them automatically.

Each download is a new StyleGAN2 face (1024 px, FFHQ-aligned). For each image:
  - SCRFD (InsightFace det_500m) finds the face; images with no face or several faces are dropped;
  - InsightFace genderage gives sex and age;
  - the hair colour comes from the pixels above the forehead, baldness from comparing them to the cheeks,
    a beard from the chin against the cheeks (men only, conservative);
  - the skin tone is the ITA angle of the cheek skin (light / medium / dark), so the game can keep the same
    mostly-Northern-European mix the drawn avatars use.
Kept as a 256 px WebP; the original is not stored. Results append to labels.jsonl, so the run can resume.

Setup (once, outside the repo's own tooling):
  python3 -m venv .venv && .venv/bin/pip install -r scripts/faces/requirements.txt
  curl -L -o /tmp/buffalo_s.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip
  unzip -j /tmp/buffalo_s.zip det_500m.onnx genderage.onnx -d scripts/faces/models
Usage: .venv/bin/python scripts/faces/collect.py OUT_DIR COUNT   (then build.py OUT_DIR .)
"""
import hashlib
import json
import math
import os
import subprocess
import sys
import time

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, 'models')
URL = 'https://thispersondoesnotexist.com/'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

det = ort.InferenceSession(os.path.join(MODELS, 'det_500m.onnx'), providers=['CPUExecutionProvider'])
ga = ort.InferenceSession(os.path.join(MODELS, 'genderage.onnx'), providers=['CPUExecutionProvider'])
GA_MEAN, GA_STD = float(os.environ.get('GA_MEAN', 0.0)), float(os.environ.get('GA_STD', 1.0))


def detect(img):
    """SCRFD 500m at 640x640: list of (x1, y1, x2, y2, score)."""
    h, w = img.shape[:2]
    scale = 640 / max(h, w)
    rs = cv2.resize(img, (int(w * scale), int(h * scale)))
    pad = np.zeros((640, 640, 3), dtype=np.uint8)
    pad[: rs.shape[0], : rs.shape[1]] = rs
    blob = cv2.dnn.blobFromImage(pad, 1.0 / 128, (640, 640), (127.5, 127.5, 127.5), swapRB=True)
    outs = det.run(None, {det.get_inputs()[0].name: blob})
    fmc, strides, na = 3, [8, 16, 32], 2
    boxes, scores = [], []
    for i, s in enumerate(strides):
        sc = outs[i].reshape(-1)
        bb = outs[i + fmc].reshape(-1, 4) * s
        gh = gw = 640 // s
        centers = np.stack(np.mgrid[:gh, :gw][::-1], axis=-1).astype(np.float32).reshape(-1, 2) * s
        centers = np.repeat(centers, na, axis=0)
        keep = np.where(sc >= 0.5)[0]
        for k in keep:
            cx, cy = centers[k]
            l, t, r, b = bb[k]
            boxes.append([cx - l, cy - t, cx + r, cy + b])
            scores.append(sc[k])
    if not boxes:
        return []
    boxes = np.array(boxes) / scale
    scores = np.array(scores)
    idx = cv2.dnn.NMSBoxes([[float(b[0]), float(b[1]), float(b[2] - b[0]), float(b[3] - b[1])] for b in boxes], scores.tolist(), 0.5, 0.4)
    idx = np.array(idx).reshape(-1)
    return [(*boxes[i], float(scores[i])) for i in idx]


def gender_age(img, box):
    x1, y1, x2, y2 = box[:4]
    w, h = x2 - x1, y2 - y1
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    s = 96 / (max(w, h) * 1.5)
    M = np.array([[s, 0, 48 - cx * s], [0, s, 48 - cy * s]], dtype=np.float32)
    crop = cv2.warpAffine(img, M, (96, 96), borderValue=0.0)
    blob = cv2.dnn.blobFromImage(crop, 1.0 / GA_STD, (96, 96), (GA_MEAN, GA_MEAN, GA_MEAN), swapRB=True)
    p = ga.run(None, {ga.get_inputs()[0].name: blob})[0][0]
    return ('M' if int(np.argmax(p[:2])) == 1 else 'F'), int(round(float(p[2]) * 100))


def region(img, x1, y1, x2, y2):
    h, w = img.shape[:2]
    x1, x2 = max(0, int(x1)), min(w, int(x2))
    y1, y2 = max(0, int(y1)), min(h, int(y2))
    if x2 - x1 < 4 or y2 - y1 < 4:
        return None
    return img[y1:y2, x1:x2].reshape(-1, 3)


def lab_median(px):
    lab = cv2.cvtColor(px.reshape(-1, 1, 3), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    L, a, b = np.median(lab, axis=0)
    return L * 100 / 255, a - 128, b - 128


def traits(img, box):
    x1, y1, x2, y2 = box[:4]
    w, h = x2 - x1, y2 - y1
    cheek = np.concatenate([p for p in (region(img, x1 + 0.18 * w, y1 + 0.5 * h, x1 + 0.36 * w, y1 + 0.68 * h), region(img, x2 - 0.36 * w, y1 + 0.5 * h, x2 - 0.18 * w, y1 + 0.68 * h)) if p is not None])
    hairpx = region(img, x1 + 0.25 * w, y1 - 0.22 * h, x2 - 0.25 * w, y1 - 0.04 * h)
    chin = region(img, x1 + 0.35 * w, y1 + 0.88 * h, x2 - 0.35 * w, y1 + 1.0 * h)
    sL, sa, sb = lab_median(cheek)
    ita = math.degrees(math.atan2(sL - 50, sb if abs(sb) > 1e-3 else 1e-3))
    tone = 'light' if ita > 28 else 'medium' if ita > 10 else 'dark'
    hair, bald = 'brown', False
    if hairpx is not None:
        L, a, b = lab_median(hairpx)
        chroma = math.hypot(a, b)
        hue = math.degrees(math.atan2(b, a)) % 360
        if math.dist((L, a, b), (sL, sa, sb)) < 12:
            bald = True
        if L < 22:
            hair = 'black'
        elif chroma < 9 and L > 70:
            hair = 'white'
        elif chroma < 9 and L > 45:
            hair = 'grey'
        elif chroma > 22 and hue < 55 and L < 62:
            hair = 'red'
        elif L > 58 and 55 <= hue <= 100:
            hair = 'blond'
        else:
            hair = 'brown'
    beard = False
    if chin is not None:
        cL, ca, cb = lab_median(chin)
        beard = (sL - cL) > 18 and math.hypot(ca, cb) < math.hypot(sa, sb) * 0.8
    return {'tone': tone, 'ita': round(ita, 1), 'hair': hair, 'bald': bald, 'beard': beard}


def fetch(path):
    r = subprocess.run(['curl', '-sS', '-m', '30', '-A', UA, '-o', path, '-w', '%{http_code}', URL], capture_output=True, text=True)
    return r.stdout.strip() == '200' and os.path.exists(path) and os.path.getsize(path) > 20_000


def main():
    out, count = sys.argv[1], int(sys.argv[2])
    os.makedirs(os.path.join(out, 'img'), exist_ok=True)
    labels = os.path.join(out, 'labels.jsonl')
    seen, n = set(), 0
    if os.path.exists(labels):
        for line in open(labels):
            r = json.loads(line)
            seen.add(r['md5'])
            n += 1
    tmp = os.path.join(out, 'tmp.jpg')
    fails = 0
    while n < count:
        time.sleep(1.2)
        if not fetch(tmp):
            fails += 1
            if fails > 20:
                print('too many download failures, stopping', flush=True)
                break
            time.sleep(5)
            continue
        fails = 0
        md5 = hashlib.md5(open(tmp, 'rb').read()).hexdigest()
        if md5 in seen:
            continue
        seen.add(md5)
        img = cv2.imread(tmp)
        if img is None:
            continue
        faces = detect(img)
        rec = {'md5': md5}
        if len(faces) != 1 or faces[0][4] < 0.6:
            rec['drop'] = f'faces={len(faces)}'
        else:
            g, age = gender_age(img, faces[0])
            rec.update({'id': md5[:10], 'gender': g, 'age': age, 'score': round(faces[0][4], 3), **traits(img, faces[0])})
            Image.open(tmp).convert('RGB').resize((256, 256), Image.LANCZOS).save(os.path.join(out, 'img', f"{rec['id']}.webp"), 'WEBP', quality=80, method=6)
        with open(labels, 'a') as f:
            f.write(json.dumps(rec) + '\n')
        n += 1
        if n % 25 == 0:
            print(f'{n}/{count}', flush=True)
    if os.path.exists(tmp):
        os.remove(tmp)


if __name__ == '__main__':
    main()
