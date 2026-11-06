"""모션그래픽용 배경음악 합성(외부 음원 없음). 180초, 100 BPM, A단조 진행, 챕터 전환마다 라이저+임팩트."""
import wave
import numpy as np

SR, DUR, BPM = 44100, 180.0, 100
BEAT = 60 / BPM
BAR = BEAT * 4
N = int(SR * DUR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)
CHAPTERS = [9, 19, 50, 68, 90, 116, 134, 152, 166, 174]


def note(m):  # MIDI → Hz
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, t0, pan=0.0, gain=1.0):
    i0 = int(t0 * SR)
    if i0 >= N:
        return
    sig = sig[: N - i0] * gain
    L[i0:i0 + len(sig)] += sig * (1 - pan) * 0.5 * 2 ** 0.5
    R[i0:i0 + len(sig)] += sig * (1 + pan) * 0.5 * 2 ** 0.5


def env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def intensity(t):  # 구간별 에너지
    if t < 19: return 0.0
    if t < 50: return 0.55
    if t < 68: return 0.7
    if t < 134: return 1.0
    if t < 166: return 0.85
    if t < 174: return 0.5
    return 0.0


# 화음 진행: Am - F - C - G (각 2마디)
PROG = [(57, [57, 60, 64, 69]), (53, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (55, [55, 59, 62, 67])]
seg = BAR * 2
t = 0.0
k = 0
while t < DUR:
    root, tones = PROG[k % 4]
    n = int(seg * SR) + int(0.6 * SR)
    tt = np.arange(n) / SR
    # 패드: 디튠된 부가 합성 + 느린 트레몰로
    pad = np.zeros(n)
    for m in tones:
        for det in (-0.08, 0.08):
            f = note(m + det)
            pad += np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.12 * np.sin(2 * np.pi * 3 * f * tt)
    pad *= (0.85 + 0.15 * np.sin(2 * np.pi * 0.25 * tt)) * env(n, 0.9, 0.9) * 0.018
    add(pad, t, pan=-0.15)
    add(pad * 0.8, t + 0.013, pan=0.15)
    # 서브 베이스: 마디마다 근음, 에너지 구간에서만
    if intensity(t + 0.1) > 0:
        for b in range(2):
            nb = int(BAR * SR)
            tb = np.arange(nb) / SR
            f = note(root - 12)
            bass = (np.sin(2 * np.pi * f * tb) + 0.25 * np.sin(2 * np.pi * 2 * f * tb)) * env(nb, 0.02, 0.4) * 0.16 * intensity(t + 0.1)
            add(bass, t + b * BAR)
    # 아르페지오(68초 이후): 8분음표 플럭
    if t >= 68 and t < 166:
        seq = tones + tones[::-1][1:3]
        for j in range(16):
            m = seq[j % len(seq)] + 12
            npk = int(0.35 * SR)
            tp = np.arange(npk) / SR
            f = note(m)
            pl = (np.sin(2 * np.pi * f * tp) + 0.3 * np.sin(2 * np.pi * 2 * f * tp)) * np.exp(-tp * 9) * 0.05 * intensity(t)
            add(pl, t + j * BEAT / 2, pan=0.35 if j % 2 else -0.35)
    t += seg
    k += 1

# 킥(4박) · 하이햇(엇박)
nb = int(DUR / BEAT)
for i in range(nb):
    tb = i * BEAT
    e = intensity(tb)
    if e <= 0:
        continue
    nk = int(0.32 * SR)
    tk = np.arange(nk) / SR
    freq = 45 + 85 * np.exp(-tk * 30)
    kick = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-tk * 11) * 0.42 * e
    add(kick, tb)
    if tb >= 50 and tb < 166:
        nh = int(0.06 * SR)
        hat = np.diff(rng.standard_normal(nh + 1)) * np.exp(-np.arange(nh) / SR * 70) * 0.035 * e
        add(hat, tb + BEAT / 2, pan=0.25)
        if i % 4 == 2:  # 스네어 대용 클랩
            nc = int(0.18 * SR)
            clap = rng.standard_normal(nc) * np.exp(-np.arange(nc) / SR * 22) * 0.06 * e
            add(np.convolve(clap, np.ones(6) / 6, 'same'), tb, pan=-0.1)

# 챕터 전환: 라이저(1.4초) + 임팩트
for c in CHAPTERS:
    nr = int(1.4 * SR)
    tr = np.arange(nr) / SR
    noise = rng.standard_normal(nr)
    noise = np.convolve(noise, np.ones(4) / 4, 'same')
    riser = noise * (tr / 1.4) ** 2.2 * 0.09
    add(riser, c - 1.4, pan=-0.2)
    add(riser * 0.9, c - 1.4, pan=0.2)
    ni = int(1.6 * SR)
    ti = np.arange(ni) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-ti * 8)) / SR) * np.exp(-ti * 2.6) * 0.5
    hit = rng.standard_normal(ni) * np.exp(-ti * 14) * 0.08
    add(boom + hit, c)

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
fade_in, fade_out = int(1.0 * SR), int(3.5 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('music.wav', DUR, 's')
