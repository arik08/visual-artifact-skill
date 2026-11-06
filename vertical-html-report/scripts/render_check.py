#!/usr/bin/env python3
"""
render_check.py — 빌드된 보고서를 헤드리스 Chrome/Edge로 실제 렌더링해서 검증하고 스크린샷을 남긴다.
(추가 설치 불필요: PC에 설치된 Chrome 또는 Edge 사용. 표준 라이브러리만 사용)

  python scripts/render_check.py report.html                  # QA 결과 출력 + report.png 저장
  python scripts/render_check.py report.html --width 500      # 모바일 레이아웃 확인(헤드리스 최소 폭)
  python scripts/render_check.py report.html --pdf            # report.pdf 도 생성(A4)
  python scripts/render_check.py report.html --split 2400     # 긴 화면을 2400px 단위로 잘라 report-1.png, -2.png ...

동작: report-kit.js 가 렌더링을 끝내면 <html data-rk-qa='{...}'> 에 결과(차트 수, 오류, 경고, 페이지 높이)를 기록한다.
      이 스크립트는 --dump-dom 으로 그 값을 읽고, 페이지 높이에 맞춰 전체 화면 스크린샷을 찍는다.
종료코드: 렌더링 오류(차트 실패 등)가 있으면 1
"""
import argparse
import glob
import html as htmlmod
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

CANDIDATES = [
    os.environ.get("CHROME_PATH", ""),
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]


def find_browser():
    for c in CANDIDATES:
        if c and os.path.exists(c):
            return c
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    pw = glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-*/chrome*"))
    return pw[0] if pw else None


def run(browser, args, timeout=90):
    prof = tempfile.mkdtemp(prefix="rkchk-")
    cmd = [browser, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
           "--allow-file-access-from-files", f"--user-data-dir={prof}", "--run-all-compositor-stages-before-draw"] + args
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
        return r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")
    finally:
        shutil.rmtree(prof, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description="헤드리스 브라우저 렌더링 검증 + 스크린샷")
    ap.add_argument("html")
    ap.add_argument("--width", type=int, default=1100, help="뷰포트 폭(px). 모바일 확인은 500 (헤드리스 최소값)")
    ap.add_argument("--out", help="스크린샷 경로 (기본: 같은 이름 .png)")
    ap.add_argument("--pdf", action="store_true", help="A4 PDF도 생성")
    ap.add_argument("--split", type=int, default=0, help="스크린샷을 N px 높이로 분할 저장(긴 보고서 확인용)")
    ap.add_argument("--wait", type=int, default=12000, help="렌더링 대기(ms, virtual time)")
    a = ap.parse_args()

    if a.width < 500:
        print("[INFO] 헤드리스 Chrome의 최소 창 폭은 500px → 500px로 렌더링 (모바일 레이아웃은 760px 이하에서 동일하게 적용됨)")
        a.width = 500
    browser = find_browser()
    if not browser:
        print("[SKIP] Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.")
        return 0
    path = pathlib.Path(a.html).resolve()
    url = path.as_uri()
    budget = f"--virtual-time-budget={a.wait}"

    # 1) DOM 덤프로 QA 결과 읽기
    out, err = run(browser, [budget, f"--window-size={a.width},1200", "--dump-dom", url])
    m = re.search(r'data-rk-qa="([^"]*)"', out)
    if not m:
        print("[ERROR] QA 결과를 읽지 못했습니다 — report-kit.js가 실행되지 않았거나 시간이 부족합니다(--wait 늘리기).")
        if err.strip():
            print(err.strip()[-800:])
        return 1
    qa = json.loads(htmlmod.unescape(m.group(1)))
    height = max(800, int(qa.get("pageHeight", 3000)) + 160)
    print(f"[QA] 차트 {qa.get('rendered')}/{qa.get('charts')} 렌더링, 다이어그램 {qa.get('diagrams')}, 섹션 {qa.get('sections')}, KPI {qa.get('kpis')}, 표 {qa.get('tables')}, 페이지 높이 {qa.get('pageHeight')}px")
    for e in qa.get("errors", []):
        print(f"  [ERROR] {e}")
    for w in qa.get("warnings", []):
        print(f"  [WARN] {w}")

    # 2) 전체 페이지 스크린샷
    png = a.out or str(path.with_suffix(".png"))
    if not a.split and height > 2400:
        a.split = 1800   # 긴 보고서는 1800px 단위로 잘라 저장 → 조각별로 열어 라벨 겹침·잘림 확인
    run(browser, [budget, f"--window-size={a.width},{height}", f"--screenshot={png}", url], timeout=120)
    if os.path.exists(png):
        print(f"[PNG] {png} ({a.width}x{height})")
        if a.split:
            try:
                split_png(png, a.split)
            except Exception as ex:  # noqa
                print(f"  (분할 실패: {ex})")
    else:
        print("[WARN] 스크린샷 생성 실패")

    # 3) PDF
    if a.pdf:
        pdf = str(path.with_suffix(".pdf"))
        run(browser, [budget, "--no-pdf-header-footer", f"--print-to-pdf={pdf}", url], timeout=120)
        print(f"[PDF] {pdf}" if os.path.exists(pdf) else "[WARN] PDF 생성 실패")
    return 1 if qa.get("errors") else 0


def split_png(png, step):
    """PNG를 세로로 분할(표준 라이브러리만: zlib로 직접 디코드/인코드)."""
    import struct
    import zlib
    with open(png, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, chunks = 8, []
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        chunks.append((typ, data[pos + 8:pos + 8 + ln]))
        pos += 12 + ln
    ihdr = dict(chunks)[b"IHDR"]
    w, h, depth, ctype = struct.unpack(">IIBB", ihdr[:10])
    if depth != 8 or ctype not in (2, 6):
        raise ValueError("지원하지 않는 PNG 형식")
    bpp = 3 if ctype == 2 else 4
    raw = zlib.decompress(b"".join(c for t, c in chunks if t == b"IDAT"))
    stride = w * bpp
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        ft = raw[i]; line = bytearray(raw[i + 1:i + 1 + stride]); i += 1 + stride
        for x in range(stride):
            a_ = line[x - bpp] if x >= bpp else 0
            b_ = prev[x]; c_ = prev[x - bpp] if x >= bpp else 0
            if ft == 1: line[x] = (line[x] + a_) & 255
            elif ft == 2: line[x] = (line[x] + b_) & 255
            elif ft == 3: line[x] = (line[x] + ((a_ + b_) >> 1)) & 255
            elif ft == 4:
                p = a_ + b_ - c_; pa, pb, pc = abs(p - a_), abs(p - b_), abs(p - c_)
                line[x] = (line[x] + (a_ if pa <= pb and pa <= pc else b_ if pb <= pc else c_)) & 255
        rows.append(bytes(line)); prev = line

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    base = os.path.splitext(png)[0]
    for old in glob.glob(f"{base}-*.png"):   # 이전 실행의 분할 파일 정리
        if re.fullmatch(r".*-\d+\.png", old):
            os.remove(old)
    # 끝부분의 빈 배경(단색) 행은 잘라냄 — 높이 측정 오차로 생기는 빈 조각 방지
    bg = rows[-1]
    while len(rows) > 1 and rows[-1] == bg and len(set(bg[i:i + bpp] for i in range(0, len(bg), bpp * 50))) == 1:
        rows.pop()
    h = len(rows)
    n = 0
    for k in range(0, h, step):
        part = rows[k:k + step]
        if len(part) < 40:
            continue
        body = b"".join(b"\x00" + r for r in part)
        hdr = struct.pack(">IIBBBBB", w, len(part), 8, ctype, 0, 0, 0)
        n += 1
        with open(f"{base}-{n}.png", "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", hdr) + chunk(b"IDAT", zlib.compress(body, 6)) + chunk(b"IEND", b""))
    print(f"  분할 저장: {base}-1.png ~ -{n}.png")


if __name__ == "__main__":
    sys.exit(main())
