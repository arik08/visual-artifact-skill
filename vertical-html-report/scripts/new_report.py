#!/usr/bin/env python3
"""
new_report.py — 보고서 유형별 템플릿을 복사해 작성을 시작한다.

  python scripts/new_report.py --type monthly -o out/202611_영업실적.body.html
  python scripts/new_report.py --list

유형:
  monthly   월간·주간·분기 실적 보고 (KPI·불릿·막대·워터폴·사업부 표)
  status    프로젝트 진척·현황 보고 (간트·타임라인·진척률·이슈 표)
  proposal  기획·제안 / 의사결정 요청 (배경·현황·대안 비교·효과·일정)
  incident  이슈·사고 보고 (경과 타임라인·원인 트리·조치 표)
  analysis  데이터·시장·경쟁 분석 (시장 규모·점유율·고객·SWOT)
  blank     최소 골격
"""
import argparse
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, "..", "templates")
TYPES = {
    "monthly": "월간·주간·분기 실적 보고",
    "status": "프로젝트 진척·현황 보고",
    "proposal": "기획·제안 / 의사결정 요청",
    "incident": "이슈·사고 보고",
    "analysis": "데이터·시장·경쟁 분석",
    "blank": "최소 골격",
}


def main():
    ap = argparse.ArgumentParser(description="보고서 템플릿 복사")
    ap.add_argument("--type", "-t", choices=list(TYPES), help="보고서 유형")
    ap.add_argument("-o", "--out", help="출력 경로 (*.body.html 권장)")
    ap.add_argument("--list", action="store_true", help="유형 목록")
    ap.add_argument("--force", action="store_true", help="기존 파일 덮어쓰기")
    a = ap.parse_args()
    if a.list or not a.type:
        for k, v in TYPES.items():
            print(f"  {k:9} {v}")
        return 0 if a.list else 2
    out = a.out or f"{a.type}.body.html"
    if not out.endswith(".body.html"):
        print("[INFO] 출력 파일명은 *.body.html 형식을 권장합니다(빌드 시 *.html 생성).")
    if os.path.exists(out) and not a.force:
        print(f"[ERROR] 이미 존재: {out} (덮어쓰려면 --force)")
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    shutil.copyfile(os.path.join(TPL, f"{a.type}.body.html"), out)
    print(f"[OK] {out} 생성 ({TYPES[a.type]})")
    print("다음 단계:")
    print("  1) 예시 문구·수치를 실제 내용으로 교체, 차트/표의 \"sample\": true 삭제")
    print(f"  2) python \"{os.path.abspath(os.path.join(HERE, 'build_report.py'))}\" \"{out}\"")
    print("  3) (선택) python scripts/render_check.py <생성된 .html>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
