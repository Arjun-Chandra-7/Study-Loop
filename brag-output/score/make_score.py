"""Original score for the StudyLoop product film.

Authored to picture at 120 BPM (beat = 0.5 s, bar = 2 s). Every section boundary is a
picture event:
  0.0-4.4   desk chaos      tense drone, accelerating clock + heartbeat, dissonant plucks, riser
  4.4       collapse        hard cut, sub impact, silence -> warm pad (the musical shift)
  6.9       band reveal     bell
  7.5-16.5  product         groove: kick, hats, bass, pluck arp (D - Bm - G - A)
  16.5-22.5 hero (Insights) fullest arrangement, impact on the land
  22.5-25.5 "not a mind reader"  breakdown, riser
  25.6      logo            resolution chord + bell, clean tail to 28.5

Run: python make_score.py <out.wav>
"""

import sys

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt
from scipy.io import wavfile

SR = 48000
DUR = 28.5
N = int(SR * DUR)
rng = np.random.default_rng(20260929)

L = np.zeros(N)
R = np.zeros(N)
# separate buses so the pad/bass can be sidechained by the kick
bus_pad = np.zeros((2, N))
bus_verb = np.zeros((2, N))


def t_of(n):
    return np.arange(n) / SR


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, "low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def place(sig, start, gain=1.0, pan=0.0, bus=None, verb=0.0):
    """Mix a mono signal in at `start` seconds with constant-power pan."""
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    a = (pan + 1) * np.pi / 4
    gl, gr = np.cos(a), np.sin(a)
    tgt = bus if bus is not None else (L, R)
    tgt[0][i : i + len(sig)] += sig * gl
    tgt[1][i : i + len(sig)] += sig * gr
    if verb:
        bus_verb[0][i : i + len(sig)] += sig * gl * verb
        bus_verb[1][i : i + len(sig)] += sig * gr * verb


def env_adsr(n, a=0.005, d=0.1, s=0.6, r=0.2, hold=None):
    t = t_of(n)
    hold = hold if hold is not None else max(0.0, n / SR - a - d - r)
    e = np.interp(
        t,
        [0, a, a + d, a + d + hold, a + d + hold + r],
        [0, 1, s, s, 0],
        right=0,
    )
    return e


def saw(f, n, detune=0.0):
    t = t_of(n)
    ph = (f * (1 + detune) * t + rng.random()) % 1.0
    return 2 * ph - 1


# ─── instruments ──────────────────────────────────────────────


def kick(g=1.0):
    n = int(0.45 * SR)
    t = t_of(n)
    f = 45 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(n), 2500) * np.exp(-t * 180) * 0.25
    return (body + click) * g


def hat(g=1.0, open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = t_of(n)
    x = hp(rng.standard_normal(n), 7000, 4)
    return x * np.exp(-t * (14 if open_ else 90)) * g


def clap(g=1.0):
    n = int(0.3 * SR)
    t = t_of(n)
    x = bp(rng.standard_normal(n), 900, 4200)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        k = int(off * SR)
        e[k:] += np.exp(-t[: n - k] * 38)
    return x * e * 0.5 * g


def tick(g=1.0, f=2600):
    """Clock tick: short resonant wood-ish click."""
    n = int(0.06 * SR)
    t = t_of(n)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 160) + 0.4 * bp(rng.standard_normal(n), 1800, 6000) * np.exp(-t * 300)
    return x * g


def heartbeat(g=1.0):
    """Lub-dub: two low thumps."""
    def thump(f0, dec):
        n = int(0.25 * SR)
        t = t_of(n)
        f = f0 * (1 + 0.6 * np.exp(-t * 40))
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * dec)
    a = thump(62, 22)
    b = thump(55, 26) * 0.7
    out = np.zeros(int(0.45 * SR))
    out[: len(a)] += a
    k = int(0.16 * SR)
    out[k : k + len(b)] += b
    return lp(out, 400) * g


def pluck(m, dur=0.5, g=1.0, bright=3500):
    """Karplus-ish pluck via filtered decaying saw+square."""
    n = int(dur * SR)
    t = t_of(n)
    f = midi(m)
    x = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.25
    cutoff_env = bright * np.exp(-t * 9) + 300
    # approximate time-varying LP by crossfading two static LPs
    a = lp(x, float(bright), 2)
    b = lp(x, 500.0, 2)
    w = (cutoff_env - 300) / bright
    y = a * w + b * (1 - w)
    return y * np.exp(-t * 7.0) * env_adsr(n, 0.002, 0.05, 1, 0.02, hold=dur - 0.08) * g


def bell(m, dur=3.0, g=1.0):
    """2-op FM bell."""
    n = int(dur * SR)
    t = t_of(n)
    fc = midi(m)
    idx = 3.2 * np.exp(-t * 2.2)
    y = np.sin(2 * np.pi * fc * t + idx * np.sin(2 * np.pi * fc * 3.5 * t))
    y += 0.35 * np.sin(2 * np.pi * fc * 2.001 * t) * np.exp(-t * 3)
    return y * np.exp(-t * 1.25) * env_adsr(n, 0.002, 0.02, 1, 0.3, hold=dur - 0.35) * g


def pad(notes, dur, g=1.0, cutoff=1400, attack=0.8, release=0.9):
    n = int(dur * SR)
    y = np.zeros(n)
    for m in notes:
        f = midi(m)
        for d in (-0.006, 0.0, 0.0065):
            y += saw(f, n, d)
    y = lp(y / (len(notes) * 3), cutoff, 2)
    return y * env_adsr(n, attack, 0.3, 0.85, release, hold=max(0, dur - attack - 0.3 - release)) * g


def bass(m, dur, g=1.0):
    n = int(dur * SR)
    t = t_of(n)
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.35 * lp(saw(f, n), 420)
    return y * env_adsr(n, 0.004, 0.08, 0.8, 0.06, hold=max(0, dur - 0.16)) * g


def sub_impact(g=1.0, dur=2.2):
    n = int(dur * SR)
    t = t_of(n)
    f = 30 + 60 * np.exp(-t * 5)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.9)
    air = lp(rng.standard_normal(n), 1800) * np.exp(-t * 6) * 0.35
    return (body + air) * g


def riser(dur, g=1.0, f0=300, f1=6000):
    n = int(dur * SR)
    t = t_of(n)
    x = rng.standard_normal(n)
    # sweep via block-wise bandpass
    y = np.zeros(n)
    blocks = 40
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for b in range(blocks):
        fc = f0 * (f1 / f0) ** (b / blocks)
        seg = x[edges[b] : edges[b + 1]]
        y[edges[b] : edges[b + 1]] = bp(seg, fc * 0.7, min(fc * 1.4, SR / 2 - 100))
    return y * (t / (dur)) ** 2.2 * g


def whoosh(dur=0.7, g=1.0):
    n = int(dur * SR)
    t = t_of(n)
    y = lp(rng.standard_normal(n), 2200) * np.sin(np.pi * t / dur) ** 2
    return y * g


# ─── ACT A: desk chaos 0 - 4.4 ────────────────────────────────
A_END = 4.4
n = int(A_END * SR)
t = t_of(n)
# tense drone: D2 + Eb2 detuned saws with accelerating tremolo
drone = (saw(midi(38), n) + saw(midi(39), n, 0.003) + 0.6 * saw(midi(50), n, -0.004)) / 2.6
drone = lp(drone, 700)
trem_rate = 2 + 7 * (t / A_END) ** 1.6
trem = 0.62 + 0.38 * np.sin(2 * np.pi * np.cumsum(trem_rate) / SR)
drone *= trem * np.interp(t, [0, 0.4, A_END], [0, 0.55, 1.0])
place(drone, 0.0, 0.34, pan=-0.1)
place(drone[::-1][::-1], 0.0, 0.20, pan=0.35)

# clock ticks accelerate
tk = 0.12
iv = 0.5
k = 0
while tk < A_END - 0.05:
    place(tick(1.0, 2600 if k % 2 == 0 else 2200), tk, 0.23, pan=0.5 if k % 2 else 0.3)
    iv = max(0.11, iv * 0.9)
    tk += iv
    k += 1

# heartbeat accelerates 72 -> ~140 bpm
hb = 0.35
while hb < A_END - 0.3:
    frac = hb / A_END
    place(heartbeat(), hb, 0.62 + 0.25 * frac)
    hb += 60 / (72 + 70 * frac ** 1.3)

# dissonant plucks (land with notifications in picture)
for tt, m in [(0.9, 81), (1.45, 82), (1.95, 76), (2.3, 87), (2.65, 80), (2.95, 86), (3.2, 75), (3.45, 83), (3.7, 88), (3.9, 79), (4.1, 85)]:
    place(pluck(m, 0.35, bright=5000), tt, 0.12, pan=float(rng.uniform(-0.7, 0.7)), verb=0.35)

place(riser(1.9, f0=400, f1=7000), 2.5, 0.22, verb=0.2)

# ─── ACT B: collapse 4.4 - 7.4 ────────────────────────────────
place(sub_impact(), 4.4, 0.95, verb=0.5)
place(whoosh(0.55), 3.9, 0.18, pan=0.0)  # suck-in before the cut
# warm pad D add9, slow bloom
D9 = [50, 57, 62, 66, 69, 76]      # D3 A3 D4 F#4 A4 E5
place(pad(D9, 3.4, cutoff=1100, attack=1.1, release=1.0), 4.65, 0.34, bus=bus_pad, verb=0.5)
# calm heartbeats while the line breathes
place(heartbeat(), 5.25, 0.45)
place(heartbeat(), 6.25, 0.35)
# band reveal / wordmark bell
place(bell(74, 3.2), 6.9, 0.26, pan=-0.15, verb=0.6)
place(bell(81, 3.0), 6.93, 0.14, pan=0.2, verb=0.6)

# ─── ACT C/D: groove 7.5 - 22.5 ───────────────────────────────
BEAT = 0.5
CHORDS = {  # root midi (bass), pad voicing, arp notes
    "D": (38, [50, 57, 62, 66, 69], [62, 66, 69, 74, 76, 74, 69, 66]),
    "Bm": (35, [47, 54, 59, 62, 66], [59, 62, 66, 71, 73, 71, 66, 62]),
    "G": (31, [43, 50, 55, 59, 62, 66], [55, 59, 62, 67, 69, 67, 62, 59]),
    "A": (33, [45, 52, 57, 61, 64, 71], [57, 61, 64, 69, 71, 69, 64, 61]),
}
kick_times = []


def bar(chord, start, hero=False, bars=1.0):
    root, voicing, arp = CHORDS[chord]
    length = 2.0 * bars
    place(pad(voicing, length + 0.2, cutoff=1900 if hero else 1400, attack=0.25, release=0.35), start, 0.24 if hero else 0.2, bus=bus_pad, verb=0.35)
    # bass: root on 1, octave pop on the and-of-2, root on 3
    steps = int(length / BEAT)
    for b in range(steps):
        bt = start + b * BEAT
        kick_times.append(bt)
        place(kick(), bt, 0.62 if hero else 0.52)
        place(hat(), bt + BEAT / 2, 0.16 if hero else 0.12, pan=0.25)
        if hero:
            place(hat(0.6), bt + BEAT / 4, 0.07, pan=-0.3)
            place(hat(0.6), bt + 3 * BEAT / 4, 0.07, pan=-0.3)
        if hero and b % 2 == 1:
            place(clap(), bt, 0.32, verb=0.25)
        m = root if b % 2 == 0 else root + 12
        place(bass(m, BEAT * 0.9), bt, 0.40 if hero else 0.34, bus=bus_pad)
    # pluck arp in 8ths
    for i in range(int(length / (BEAT / 2))):
        at = start + i * BEAT / 2
        note = arp[i % len(arp)] + (12 if hero and i % 4 == 2 else 0)
        place(pluck(note, 0.4, bright=4200 if hero else 3000), at, 0.10 if hero else 0.085, pan=0.35 if i % 2 else -0.35, verb=0.3)
        # dotted-8th echo
        place(pluck(note, 0.4, bright=2000), at + 0.375, 0.035, pan=-0.5 if i % 2 else 0.5, verb=0.3)


# product section: groove fades up from 7.5
bar("D", 7.5)
bar("Bm", 9.5)
bar("G", 11.5)
bar("A", 13.5)
# 15.5 - 16.5: half bar lift into the hero (kick keeps time, snare-ish build)
root, voicing, _ = CHORDS["A"]
place(pad(voicing, 1.1, cutoff=2200, attack=0.1, release=0.2), 15.5, 0.2, bus=bus_pad, verb=0.3)
for i, bt in enumerate(np.arange(15.5, 16.5, 0.125)):
    place(clap(0.5 + 0.5 * i / 8), bt, 0.14 + 0.03 * i, verb=0.2)
place(riser(1.0, f0=800, f1=9000), 15.5, 0.25)
place(kick(), 15.5, 0.5)
place(kick(), 16.0, 0.5)

# hero: Insights 16.5 - 22.5
place(sub_impact(dur=1.6), 16.5, 0.7, verb=0.4)
place(hat(1.0, open_=True), 16.5, 0.22, verb=0.4)
place(bell(78, 2.0), 16.5, 0.12, verb=0.5)
bar("D", 16.5, hero=True)
bar("Bm", 18.5, hero=True)
bar("G", 20.5, hero=True)

# ─── ACT E: breakdown 22.5 - 25.5 ─────────────────────────────
place(whoosh(0.8), 22.2, 0.2)
place(pad(CHORDS["G"][1] + [71], 1.6, cutoff=900, attack=0.1, release=0.6), 22.5, 0.46, bus=bus_pad, verb=0.6)
place(pad([45, 52, 57, 62, 64, 69], 1.6, cutoff=1000, attack=0.2, release=0.5), 24.0, 0.46, bus=bus_pad, verb=0.6)  # Asus
for i, m in enumerate([74, 69, 66, 62, 69, 74]):
    place(pluck(m, 0.6, bright=1900), 22.6 + i * 0.5, 0.15, pan=0.3 if i % 2 else -0.3, verb=0.55)
place(riser(1.0, f0=500, f1=5000), 24.55, 0.24, verb=0.2)

# ─── ACT F: resolution 25.6 -> end ────────────────────────────
place(sub_impact(dur=2.6), 25.6, 0.55, verb=0.5)
place(pad([38, 50, 57, 62, 66, 69, 74, 76], 2.9, cutoff=2000, attack=0.05, release=1.4), 25.6, 0.36, bus=bus_pad, verb=0.7)
place(bell(74, 2.9), 25.6, 0.30, pan=-0.1, verb=0.7)
place(bell(81, 2.9), 25.63, 0.16, pan=0.2, verb=0.7)
place(bell(86, 2.7), 25.9, 0.08, pan=0.35, verb=0.7)

# ─── sidechain the pad/bass bus off the kick ─────────────────
duck = np.ones(N)
dn = int(0.22 * SR)
curve = 1 - 0.55 * np.exp(-t_of(dn) * 16)
for kt in kick_times:
    i = int(kt * SR)
    seg = duck[i : i + dn]
    duck[i : i + dn] = np.minimum(seg, curve[: len(seg)])
L += bus_pad[0] * duck
R += bus_pad[1] * duck
bus_verb[0] += bus_pad[0] * 0.25
bus_verb[1] += bus_pad[1] * 0.25

# ─── reverb: synthetic stereo IR ─────────────────────────────
irn = int(2.2 * SR)
irt = t_of(irn)
ir_l = rng.standard_normal(irn) * np.exp(-irt * 2.6)
ir_r = rng.standard_normal(irn) * np.exp(-irt * 2.6)
ir_l = lp(ir_l, 5000)
ir_r = lp(ir_r, 5000)
ir_l /= np.sqrt(np.sum(ir_l ** 2))
ir_r /= np.sqrt(np.sum(ir_r ** 2))
wet_l = fftconvolve(hp(bus_verb[0], 200), ir_l)[:N]
wet_r = fftconvolve(hp(bus_verb[1], 200), ir_r)[:N]
L += wet_l * 0.55
R += wet_r * 0.55

# ─── master ──────────────────────────────────────────────────
mix = np.stack([L, R])
mix = hp(mix, 28)
# fade in first 30 ms, fade out last 1.2 s
fade = np.ones(N)
fade[: int(0.03 * SR)] = np.linspace(0, 1, int(0.03 * SR))
fo = int(1.2 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= 0.89  # ≈ -1 dBFS
out = sys.argv[1] if len(sys.argv) > 1 else "studyloop-score.wav"
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print("wrote", out, f"{DUR}s")
