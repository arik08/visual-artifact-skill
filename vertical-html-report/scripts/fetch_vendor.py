#!/usr/bin/env python3
"""
fetch_vendor.py — 인터넷이 차단된 환경(사내망)용 오프라인 빌드를 위해 라이브러리를 한 번 내려받는다.
인터넷이 되는 PC에서 1회 실행 → assets/vendor/ 에 저장 → 이후 build_report.py --offline 사용.

  python scripts/fetch_vendor.py            # ECharts + Mermaid(UMD)
  python scripts/fetch_vendor.py --no-mermaid

받는 파일 (공식 npm 패키지를 jsDelivr CDN에서):
  echarts.min.js  (Apache-2.0, 약 1.1MB)
  mermaid.min.js  (MIT, 약 3~6MB — 다이어그램을 쓸 때만 보고서에 포함됨)
폰트는 내려받지 않는다: 오프라인 빌드는 시스템 글꼴(맑은 고딕/Apple SD 고딕)을 사용.
"""
import argparse
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_report import ECHARTS_VERSION, MERMAID_VERSION  # noqa: E402

VENDOR = os.path.join(HERE, "..", "assets", "vendor")
FILES = {
    "echarts.min.js": f"https://cdn.jsdelivr.net/npm/echarts@{ECHARTS_VERSION}/dist/echarts.min.js",
    "mermaid.min.js": f"https://cdn.jsdelivr.net/npm/mermaid@{MERMAID_VERSION}/dist/mermaid.min.js",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-mermaid", action="store_true")
    a = ap.parse_args()
    os.makedirs(VENDOR, exist_ok=True)
    for name, url in FILES.items():
        if a.no_mermaid and name.startswith("mermaid"):
            continue
        dest = os.path.join(VENDOR, name)
        print(f"[GET] {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "report-kit-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            data = r.read()
        if len(data) < 10000:
            print(f"[ERROR] {name} 크기가 비정상({len(data)} bytes)")
            return 1
        with open(dest, "wb") as f:
            f.write(data)
        print(f"[OK] {dest} ({len(data) / 1024 / 1024:.1f} MB)")
    print("이제 오프라인 빌드: python scripts/build_report.py 보고서.body.html --offline")
    return 0


if __name__ == "__main__":
    sys.exit(main())
