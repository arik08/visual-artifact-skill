#!/usr/bin/env python3
"""
check_palette.py - 차트 팔레트를 '눈대중' 대신 '계산'으로 검증한다. (표준 라이브러리만 사용)

검사 항목
  1) 대비(contrast)   : 각 색 vs 배경. 막대/선 같은 마크는 3:1 이상 권장 (WCAG 1.4.11)
  2) 정상시각 ΔE      : 인접한 색 쌍의 OKLab 거리(x100). 15 미만이면 FAIL (구분 안 됨)
  3) 색각이상 ΔE      : 적색맹(protan)/녹색맹(deutan)/청색맹(tritan) 시뮬레이션 후 거리.
                        8 이상 PASS, 6~8 WARN(라벨 등 보조 인코딩 필요), 6 미만 FAIL
  4) 채도(chroma)     : OKLCH C < 0.06 이면 회색처럼 보여 범주색 역할을 못 함 (WARN)

사용법
  python check_palette.py "#1f4e79,#e07b39,#2a9d8f,#d4a72c"
  python check_palette.py "#1f4e79,#e07b39,#2a9d8f" --pairs all        # 산점도/버블 등 모든 쌍 비교
  python check_palette.py --theme navy                                   # report-kit.css 내장 테마 검사
  python check_palette.py --all-themes
  python check_palette.py "#..." --bg "#ffffff"

종료코드: FAIL이 하나라도 있으면 1, 아니면 0
색각이상 시뮬레이션: Machado, Oliveira & Fernandes (2009), severity 1.0, linear RGB 공간.
"""
import argparse
import itertools
import math
import os
import re
import sys

MACHADO = {
    "protan": [[0.152286, 1.052583, -0.204868],
               [0.114503, 0.786281, 0.099216],
               [-0.003882, -0.048116, 1.051998]],
    "deutan": [[0.367322, 0.860646, -0.227968],
               [0.280085, 0.672501, 0.047413],
               [-0.011820, 0.042940, 0.968881]],
    "tritan": [[1.255528, -0.076749, -0.178779],
               [-0.078411, 0.930809, 0.147602],
               [0.004733, 0.691367, 0.303900]],
}


def hex_to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        raise ValueError(f"잘못된 HEX 색상: #{h}")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    c = min(max(c, 0.0), 1.0)
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rel_luminance(rgb):
    r, g, b = (srgb_to_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = rel_luminance(a), rel_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def linear_to_oklab(r, g, b):
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = (math.copysign(abs(v) ** (1 / 3), v) for v in (l, m, s))
    return (
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    )


def oklab(rgb, cvd=None):
    lin = [srgb_to_linear(c) for c in rgb]
    if cvd:
        M = MACHADO[cvd]
        lin = [min(max(sum(M[i][j] * lin[j] for j in range(3)), 0.0), 1.0) for i in range(3)]
    return linear_to_oklab(*lin)


def delta_e(a, b):
    return 100 * math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def read_theme_palettes():
    """report-kit.css 에서 [data-theme="x"] 블록의 --rk-c1..c8 을 읽는다."""
    css_path = os.path.join(os.path.dirname(__file__), "..", "assets", "report-kit.css")
    with open(css_path, encoding="utf-8") as f:
        css = f.read()
    themes = {}
    for m in re.finditer(r'(:root[^{]*|\[data-theme="([a-z0-9-]+)"\][^{]*)\{([^}]*)\}', css):
        name = m.group(2) or "navy"
        body = m.group(3)
        cols = dict(re.findall(r"--rk-c(\d)\s*:\s*(#[0-9a-fA-F]{3,6})", body))
        if len(cols) >= 4:
            themes.setdefault(name, [cols[k] for k in sorted(cols, key=int)])
    return themes


def check(colors, bg="#ffffff", pairs="adjacent", label=""):
    rgbs = [hex_to_rgb(c) for c in colors]
    bg_rgb = hex_to_rgb(bg)
    fails, warns = 0, 0
    print(f"\n=== {label or '팔레트'} ({len(colors)}색, 배경 {bg}, 쌍={pairs}) ===")
    print(f"{'#':>2}  {'HEX':8} {'대비':>6}  {'L':>5} {'C':>5}  판정")
    for i, (hx, rgb) in enumerate(zip(colors, rgbs), 1):
        cr = contrast(rgb, bg_rgb)
        L, a, b = oklab(rgb)
        C = math.hypot(a, b)
        notes = []
        if cr < 3.0:
            notes.append("WARN 대비<3:1 → 직접 라벨/데이터표 필요")
            warns += 1
        if C < 0.06:
            notes.append("WARN 채도 낮음(회색처럼 보임)")
            warns += 1
        print(f"{i:>2}  {hx:8} {cr:6.2f}  {L:5.2f} {C:5.3f}  {'; '.join(notes) or 'PASS'}")

    idx_pairs = list(itertools.combinations(range(len(colors)), 2)) if pairs == "all" \
        else [(i, i + 1) for i in range(len(colors) - 1)]
    worst = {}
    for kind in (None, "protan", "deutan", "tritan"):
        labs = [oklab(c, kind) for c in rgbs]
        w = min(((delta_e(labs[i], labs[j]), i, j) for i, j in idx_pairs), default=(999, 0, 0))
        worst[kind or "normal"] = w
    print("최악 쌍 ΔE (OKLab x100):")
    for kind, (d, i, j) in worst.items():
        if kind == "normal":
            verdict = "PASS" if d >= 15 else "FAIL(<15)"
        elif kind == "tritan":  # 매우 드묾 → 경고만
            verdict = "PASS" if d >= 8 else "WARN"
        else:
            verdict = "PASS" if d >= 8 else ("WARN(6~8: 보조 인코딩 필요)" if d >= 6 else "FAIL(<6)")
        if verdict.startswith("FAIL"):
            fails += 1
        elif verdict.startswith("WARN"):
            warns += 1
        print(f"  {kind:7} {d:6.1f}  ({colors[i]} vs {colors[j]})  {verdict}")
    print(f"결과: FAIL {fails}, WARN {warns}")
    return fails


def main():
    ap = argparse.ArgumentParser(description="차트 팔레트 대비/색각이상 검증")
    ap.add_argument("colors", nargs="?", help='쉼표로 구분한 HEX 목록 "#aaa,#bbb"')
    ap.add_argument("--bg", default="#ffffff", help="차트 배경색 (기본 #ffffff)")
    ap.add_argument("--pairs", choices=["adjacent", "all"], default="adjacent",
                    help="adjacent=막대/선/누적(인접 쌍), all=산점도/버블/소형다중(모든 쌍)")
    ap.add_argument("--theme", help="report-kit.css 내장 테마 이름")
    ap.add_argument("--all-themes", action="store_true")
    ap.add_argument("-n", type=int, default=0, help="앞에서부터 n개 색만 검사")
    args = ap.parse_args()

    total_fail = 0
    if args.theme or args.all_themes:
        themes = read_theme_palettes()
        names = list(themes) if args.all_themes else [args.theme]
        for name in names:
            if name not in themes:
                sys.exit(f"테마 '{name}' 없음. 사용 가능: {', '.join(themes)}")
            cols = themes[name][: args.n or None]
            total_fail += check(cols, args.bg, args.pairs, f"테마 {name}")
    elif args.colors:
        cols = [c for c in re.split(r"[,\s]+", args.colors) if c]
        total_fail += check(cols[: args.n or None], args.bg, args.pairs)
    else:
        ap.print_help()
        return 2
    return 1 if total_fail else 0


if __name__ == "__main__":
    sys.exit(main())
