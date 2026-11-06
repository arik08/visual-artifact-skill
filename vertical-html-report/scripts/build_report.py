#!/usr/bin/env python3
"""
build_report.py — 본문 조각(*.body.html)을 단일 HTML 보고서 파일로 조립한다. (표준 라이브러리만 사용)

  python scripts/build_report.py report.body.html                 # → report.html
  python scripts/build_report.py report.body.html -o out/보고서.html
  python scripts/build_report.py report.body.html --theme teal --offline
  python scripts/build_report.py report.body.html --strict        # lint 오류 시 실패(exit 1)

본문 파일 맨 위의 HTML 주석(front matter)으로 설정한다 (CLI 옵션이 우선):
  <!--
  title: 2026년 10월 월간 실적 보고
  theme: navy            # navy | blue | teal | slate | wine | forest
  palette: theme         # theme | okabe-ito | tableau | observable | carbon
  brand: #0055A4         # (선택) 회사 대표색 → 테마 색·차트 1번색 대체
  delta: semantic        # semantic(좋음=초록,나쁨=빨강) | market(상승=빨강,하락=파랑)
  numbering: decimal     # decimal | roman | none
  font: pretendard       # pretendard | noto | system
  cover: dark            # dark(기본: 주색 밴드 + 흰 글씨) | light(밝은 표지)
  style: rich            # rich(기본: 그라데이션·깊이·질감) | flat(평면형, 보수적 문서용)
  toolbar: print         # (선택) 사용자가 요청한 경우에만 '인쇄/PDF 저장' 버튼 표시. 기본: 없음
  fullscreen: off        # (선택) 우클릭=전체화면 전환 기능 끄기. 기본: 켜짐
  -->

출력물: CSS·JS가 인라인된 단일 HTML. 차트 라이브러리는 CDN(기본) 또는 --offline 시 assets/vendor/ 에서 인라인.
"""
import argparse
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
ASSETS = os.path.join(SKILL, "assets")
sys.path.insert(0, HERE)

ECHARTS_VERSION = "6.1.0"
MERMAID_VERSION = "12.3.0"
CDN = {
    "echarts": f"https://cdn.jsdelivr.net/npm/echarts@{ECHARTS_VERSION}/dist/echarts.min.js",
    "echarts_fallback": f"https://cdnjs.cloudflare.com/ajax/libs/echarts/{ECHARTS_VERSION}/echarts.min.js",
    "mermaid_esm": f"https://cdn.jsdelivr.net/npm/mermaid@{MERMAID_VERSION}/dist/mermaid.esm.min.mjs",
}
FONTS = {
    "pretendard": '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">',
    "noto": '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap">',
    "system": "",
}
THEMES = ["navy", "blue", "teal", "slate", "wine", "forest"]
PALETTES = ["theme", "okabe-ito", "tableau", "observable", "carbon"]


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def parse_front_matter(src):
    """맨 앞 HTML 주석의 key: value 줄을 읽는다. (주석은 본문에서 제거)"""
    m = re.match(r"\s*<!--(.*?)-->", src, re.S)
    meta = {}
    if not m:
        return meta, src
    block = m.group(1)
    lines = [ln for ln in block.splitlines() if ln.strip()]
    kv = [re.match(r"\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*(?:#(?![0-9a-fA-F]{3,6}\b).*)?$", ln) for ln in lines]
    if not kv or not all(kv):
        return meta, src  # 일반 주석이면 건드리지 않음
    for k in kv:
        meta[k.group(1).lower()] = k.group(2).strip().strip('"').strip("'")
    return meta, src[m.end():]


def extract_body(src):
    """완전한 HTML 문서가 들어오면 <main class=rk-page> 또는 <body> 내부만 추출."""
    meta = {}
    t = re.search(r"<title>(.*?)</title>", src, re.S | re.I)
    if t:
        meta["title"] = html.unescape(t.group(1).strip())
    m = re.search(r'<main[^>]*class="[^"]*rk-page[^"]*"[^>]*>(.*)</main>', src, re.S | re.I)
    if m:
        return meta, m.group(1)
    b = re.search(r"<body[^>]*>(.*)</body>", src, re.S | re.I)
    if b:
        body = re.sub(r"<script\b[^>]*\bsrc=[^>]*>\s*</script>", "", b.group(1), flags=re.I)
        return meta, body
    return meta, src


def hex_mix(a, b, t):
    a = a.lstrip("#"); b = b.lstrip("#")
    ca = [int(a[i:i + 2], 16) for i in (0, 2, 4)]
    cb = [int(b[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(ca, cb))


def _lum(hx):
    c = [int(hx.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def _dark_enough(hx, ratio=5.0):
    """흰 글씨 대비가 ratio 이상이 될 때까지 어둡게 (표지 밴드용)"""
    t = 0.0
    out = hx
    while 1.05 / (_lum(out) + 0.05) < ratio and t < 0.9:
        t += 0.05
        out = hex_mix(hx, '#000000', t)
    return out


def brand_css(brand, accent=None):
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", brand or ""):
        raise SystemExit(f"brand 색상은 #RRGGBB 형식이어야 합니다: {brand}")
    brand = "#" + brand.lstrip("#").upper()
    cover2 = _dark_enough(brand, 4.6)
    cover1 = _dark_enough(hex_mix(cover2, '#000000', .28), 7.0)
    css = (f"html[data-theme]{{--rk-brand:{brand};--rk-brand-strong:{hex_mix(brand, '#000000', .28)};"
           f"--rk-brand-soft:{hex_mix(brand, '#FFFFFF', .93)};--rk-brand-line:{hex_mix(brand, '#FFFFFF', .74)};"
           f"--rk-cover-bg:{cover1};--rk-cover-bg2:{cover2};"
           f"--rk-c1:{brand};--rk-seq:{brand};--rk-div-pos:{brand};")
    if accent and re.fullmatch(r"#?[0-9a-fA-F]{6}", accent):
        accent = "#" + accent.lstrip("#").upper()
        css += f"--rk-accent:{accent};--rk-accent-soft:{hex_mix(accent, '#FFFFFF', .9)};"
    return css + "}"


def script_inline(code):
    # </script> 가 코드 안에 있으면 HTML 파서가 조기 종료하므로 이스케이프
    return code.replace("</script", "<\\/script")


def build(src_path, out_path=None, theme=None, offline=False, font=None, palette=None, quiet=False, strict=False, lint=True):
    raw = read(src_path)
    meta, body = parse_front_matter(raw)
    if re.search(r"<html|<body", body, re.I):
        m2, body = extract_body(body)
        for k, v in m2.items():
            meta.setdefault(k, v)
    title = meta.get("title")
    if not title:
        h1 = re.search(r"<h1[^>]*>(.*?)</h1>", body, re.S | re.I)
        title = re.sub(r"<[^>]+>", "", h1.group(1)).strip() if h1 else os.path.splitext(os.path.basename(src_path))[0]
    theme = (theme or meta.get("theme") or "navy").lower()
    if theme not in THEMES:
        print(f"[WARN] 알 수 없는 theme '{theme}' → navy 사용. (가능: {', '.join(THEMES)})")
        theme = "navy"
    palette = (palette or meta.get("palette") or "theme").lower()
    if palette not in PALETTES:
        print(f"[WARN] 알 수 없는 palette '{palette}' → theme 사용. (가능: {', '.join(PALETTES)})")
        palette = "theme"
    font = (font or meta.get("font") or "pretendard").lower()
    delta = meta.get("delta", "semantic").lower()
    numbering = meta.get("numbering", "decimal").lower()

    attrs = [f'lang="{meta.get("lang", "ko")}"', f'data-theme="{theme}"', f'data-delta="{delta}"', f'data-numbering="{numbering}"']
    if palette != "theme":
        attrs.append(f'data-palette="{palette}"')
    for key in ("animation", "toolbar", "float-toc", "frame", "fullscreen", "cover", "style"):
        if meta.get(key):
            attrs.append(f'data-{key}="{html.escape(meta[key])}"')

    css = read(os.path.join(ASSETS, "report-kit.css"))
    if meta.get("brand"):
        css += "\n/* brand override */\n" + brand_css(meta["brand"], meta.get("accent"))
    js = read(os.path.join(ASSETS, "report-kit.js"))

    needs_charts = "rk-chart" in body
    needs_mermaid = bool(re.search(r"rk-diagram|rk-mermaid|class=\"mermaid\"", body))
    head_libs = []
    config = {"mermaidEsm": CDN["mermaid_esm"]}
    if offline:
        vend = os.path.join(ASSETS, "vendor")
        need = []
        if needs_charts:
            need.append(("echarts.min.js", "ECharts"))
        if needs_mermaid:
            need.append(("mermaid.min.js", "Mermaid"))
        for fn, label in need:
            p = os.path.join(vend, fn)
            if not os.path.exists(p):
                raise SystemExit(f"[ERROR] --offline: {p} 없음. 먼저 `python scripts/fetch_vendor.py` 를 실행하세요.")
            head_libs.append(f"<script>/* {label} (inlined) */\n{script_inline(read(p))}\n</script>")
        font = "system" if font == "pretendard" and not os.path.exists(os.path.join(vend, "pretendard.css")) else font
    else:
        if needs_charts:
            fb = CDN["echarts_fallback"]
            head_libs.append(
                f'<script src="{CDN["echarts"]}" onerror="document.write(\'<script src=&quot;{fb}&quot;><\\/script>\')"></script>')
    import json
    cfg = f"<script>window.RK_CONFIG={json.dumps(config, ensure_ascii=False)};</script>"
    font_link = FONTS.get(font, "")
    if offline and font != "system" and os.path.exists(os.path.join(ASSETS, "vendor", "pretendard.css")):
        font_link = f"<style>{read(os.path.join(ASSETS, 'vendor', 'pretendard.css'))}</style>"

    doc = f"""<!doctype html>
<html {' '.join(attrs)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="vertical-html-report (report-kit)">
<title>{html.escape(title)}</title>
{font_link}
<style>
{css}
</style>
{cfg}
{chr(10).join(head_libs)}
</head>
<body>
<main class="rk-page">
{body.strip()}
</main>
<script>
{script_inline(js)}
</script>
</body>
</html>
"""
    if not out_path:
        if src_path.endswith(".body.html"):
            out_path = src_path[: -len(".body.html")] + ".html"
        else:
            out_path = os.path.splitext(src_path)[0] + ".built.html"
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(doc)

    n_err = 0
    if lint:
        import lint_report
        res = lint_report.lint_text(body, src_path)
        n_err = lint_report.print_report(res, quiet=quiet)
    size = os.path.getsize(out_path)
    print(f"[OK] {out_path}  ({size/1024:.0f} KB, theme={theme}, palette={palette}, {'offline' if offline else 'CDN'})")
    if strict and n_err:
        return 1
    return 0


def main():
    ap = argparse.ArgumentParser(description="본문 조각 → 단일 HTML 보고서")
    ap.add_argument("src", help="본문 파일 (*.body.html)")
    ap.add_argument("-o", "--out", help="출력 경로 (기본: *.body.html → *.html)")
    ap.add_argument("--theme", choices=THEMES)
    ap.add_argument("--palette", choices=PALETTES)
    ap.add_argument("--font", choices=list(FONTS))
    ap.add_argument("--offline", action="store_true", help="assets/vendor 의 라이브러리를 인라인 (인터넷 불가 환경)")
    ap.add_argument("--strict", action="store_true", help="lint 오류가 있으면 exit 1")
    ap.add_argument("--no-lint", action="store_true")
    ap.add_argument("-q", "--quiet", action="store_true", help="경고는 개수만 출력")
    a = ap.parse_args()
    return build(a.src, a.out, a.theme, a.offline, a.font, a.palette, a.quiet, a.strict, not a.no_lint)


if __name__ == "__main__":
    sys.exit(main())
