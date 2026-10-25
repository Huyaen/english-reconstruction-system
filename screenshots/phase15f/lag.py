import subprocess, numpy as np, sys, json

path = sys.argv[1] if len(sys.argv) > 1 else 'recording/idle-dark.mp4'
W, H, FPS = 1440, 900, 10
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-vf', f'fps={FPS},scale={W}:{H}',
                      '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
n = len(raw) // (W * H)
frames = np.frombuffer(raw[:n * W * H], dtype=np.uint8).reshape(n, H, W).astype(np.float32)
print(f'frames={n} fps={FPS} dur={n/FPS:.1f}s')

BANDS = {
    'key   ': (60, 130, 420, 1340),    # 页面顶部环境光
    'spine ': (135, 440, 362, 590),    # 金属立柱
    'glass ': (135, 440, 636, 1340),   # 玻璃板
    'route ': (472, 612, 362, 1340),   # 哑光路线
    'row1  ': (628, 720, 362, 1340),   # 第一条任务行
}
sig = {}
for k, (y0, y1, x0, x1) in BANDS.items():
    s = frames[:, y0:y1, x0:x1].mean(axis=(1, 2))
    sig[k] = s
    # 去掉静态基线与线性漂移，只看随时间的变化
    t = np.arange(len(s))
    coef = np.polyfit(t, s, 1)
    d = s - np.polyval(coef, t)
    print(f'{k} mean={s.mean():6.2f} p05={np.percentile(s,5):6.2f} p95={np.percentile(s,95):6.2f} '
          f'amp(p95-p05)={np.percentile(s,95)-np.percentile(s,5):5.2f} std(detrend)={d.std():5.3f}')

def lag(a, b, maxlag=60):
    """b 相对 a 的滞后（帧）。正数 = b 晚于 a。"""
    best, bl = 1e9, 0
    for L in range(0, maxlag):
        x = a[:len(a) - L]
        y = b[L:]
        s = np.corrcoef(x, y)[0, 1]
        if s > best:  # 用最大正相关判断相位
            pass
    # 用最大相关求滞后
    cors = [(np.corrcoef(a[:len(a)-L], b[L:])[0, 1], L) for L in range(0, maxlag)]
    c, L = max(cors)
    return L, c

det = {k: (lambda s: s - np.polyval(np.polyfit(np.arange(len(s)), s, 1), np.arange(len(s))))(v) for k, v in sig.items()}
print('\n相位滞后（相对 key，帧 / 秒）：')
for k in ['spine ', 'glass ', 'route ', 'row1  ']:
    L, c = lag(det['key   '], det[k])
    print(f'  key → {k}: {L:3d} 帧 = {L/FPS:4.2f}s   相关 {c:+.2f}')

# 主导周期（自相关）
d = det['glass ']
ac = [np.corrcoef(d[:len(d)-L], d[L:])[0, 1] for L in range(1, 120)]
pk = int(np.argmax(ac)) + 1
print(f'\nglass 主导周期 ≈ {pk/FPS:.2f}s（自相关峰值 {ac[pk-1]:+.2f}）')
