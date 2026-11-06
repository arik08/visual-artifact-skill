# vertical-html-report — 세로형 HTML 업무 보고서 스킬

LLM(Claude Code, 기타 Agent Skills 호환 도구)이 **회사 업무용 세로형 단일 HTML 보고서**를 일관된 고품질로 만들게 하는 스킬.

- **데이터는 JSON, 디자인은 키트** — 모델은 차트 스펙(JSON)과 내용만 쓰고, 축·라벨·색·툴팁·인쇄·반응형은 `report-kit`이 결정한다.
  → 저가·소형 모델을 써도 시각화 품질이 크게 떨어지지 않는다.
- ECharts 6 기반 차트 **22종**(막대·선·콤보·도넛·워터폴·불릿·덤벨·슬로프·파레토·산점도/버블/4분면·히트맵·달력·퍼널·게이지·레이더·생키·트리맵·선버스트·박스플롯·히스토그램·간트) + IBCS 표기(실적/계획/전망/전년)
- Mermaid 흐름도·시퀀스·조직도 (테마 자동, **크게 보기**: 확대·축소·이동 뷰어)
- KPI 카드, 숫자 표(증감색·셀 막대·히트맵·배지), 타임라인, 절차, As-Is/To-Be, 2×2 매트릭스, SWOT, 진척률
- 검증된 테마 6종 + 팔레트 5종 (색각이상 시뮬레이션·대비 계산으로 검증)
- 한국 보고서 관례: 두괄식·개조식, 만/억/조 단위, %p, △ 표기, 증감 색(성과 기준 / 증시 관례)
- **우클릭 = 전체화면**, A4 인쇄 최적화, 모바일 대응, 인쇄/PDF 버튼은 요청 시에만
- 품질 게이트: 린트(구조·JSON·문체·수치 일관성) + 헤드리스 브라우저 렌더 검사·스크린샷

## 설치

**Claude Code**
```bash
# 개인 스킬로 (모든 프로젝트에서 사용)
cp -r vertical-html-report ~/.claude/skills/
# 또는 특정 프로젝트에서만
cp -r vertical-html-report <프로젝트>/.claude/skills/
```
Windows PowerShell: `Copy-Item -Recurse vertical-html-report $HOME\.claude\skills\`

**claude.ai**: `vertical-html-report` 폴더를 zip으로 묶어 설정 → Capabilities → Skills에 업로드.

**기타 도구**(Agent Skills 규격 지원 도구): 해당 도구의 skills 폴더에 복사하거나, 프롬프트에 "`vertical-html-report/SKILL.md`를 읽고 그대로 따를 것"이라고 지시.

요구사항: Python 3.8+ (표준 라이브러리만), 렌더 검사용 Chrome 또는 Edge(선택). 보고서를 여는 PC는 인터넷(CDN) 필요 — 사내망 차단 시 아래 오프라인 빌드.

## 사용

그냥 요청하면 된다: *"3분기 실적 데이터로 대표님 보고용 보고서 만들어줘"*, *"이 장애 건 보고서로 정리해줘"*.

직접 쓰는 경우:
```bash
python vertical-html-report/scripts/new_report.py --type monthly -o out/202611_실적.body.html   # 템플릿 복사
python vertical-html-report/scripts/build_report.py out/202611_실적.body.html                     # → out/202611_실적.html
python vertical-html-report/scripts/render_check.py out/202611_실적.html                          # 렌더 검사 + 스크린샷
```
템플릿 유형: `monthly`(실적) · `status`(프로젝트 진척) · `proposal`(기획·의사결정) · `incident`(이슈·사고) · `analysis`(시장·데이터 분석) · `blank`

오프라인(사내망) 빌드:
```bash
python vertical-html-report/scripts/fetch_vendor.py        # 인터넷 되는 곳에서 1회
python vertical-html-report/scripts/build_report.py 보고서.body.html --offline
```

회사 대표색 적용: 본문 파일 맨 위 주석에 `brand: #0055A4` (검증: `scripts/check_palette.py`).

## 구조

```
vertical-html-report/
├── SKILL.md                    # 모델이 읽는 핵심 지침 (작업 순서·절대 규칙·치트시트)
├── assets/
│   ├── report-kit.css          # 디자인 시스템 (토큰·테마 6종·컴포넌트·인쇄·반응형)
│   ├── report-kit.js           # 런타임 (JSON→ECharts 22종, KPI, 표, Mermaid, 뷰어, 전체화면, QA)
│   └── vendor/                 # (선택) 오프라인용 라이브러리 — fetch_vendor.py로 생성
├── references/                 # 필요할 때만 읽는 상세 문서
│   ├── chart-cookbook.md       # 차트 22종 전체 옵션·복사용 예시
│   ├── components.md           # 컴포넌트 마크업
│   ├── writing-guide.md        # 두괄식·개조식·액션 타이틀·숫자 표기·색 규칙·LLM 실수 방지
│   ├── report-types.md         # 보고서 유형별 목차·추천 시각화
│   ├── diagrams.md             # Mermaid 규칙·예시
│   ├── design-system.md        # 테마·팔레트·브랜드색
│   └── qa-checklist.md         # 제출 전 점검표
├── templates/                  # 유형별 본문 템플릿 (*.body.html) + shell.html(빌드 불가 환경용)
├── examples/gallery.*.html     # 모든 컴포넌트·차트 시연
└── scripts/
    ├── new_report.py           # 템플릿 복사
    ├── build_report.py         # 본문 → 단일 HTML (CSS/JS 인라인, 린트 자동 실행)
    ├── lint_report.py          # 구조·JSON·Mermaid·문체·수치 일관성 검사
    ├── render_check.py         # 헤드리스 Chrome/Edge 렌더 검사·스크린샷·PDF
    ├── check_palette.py        # 팔레트 대비·색각이상 검증
    └── fetch_vendor.py         # 오프라인 라이브러리 다운로드
```

## 설계 근거 (참고한 자료)

- 공개 스킬: anthropics/skills(`frontend-design`의 AI 기본값 회피, `web-artifacts-builder`의 초기화·번들 스크립트 패턴, `theme-factory`의 닫힌 테마 목록), antvis/chart-visualization-skills·mcp-server-chart(유형별 고정 데이터 스키마), apache/echarts-mcp(최소 스펙 → 고정 빌더), hustcc/mcp-echarts(검증·재시도 루프), Temikus/claude-skill-infographics(읽는 순서·결론형 제목), glebis tufte-report(분량 제한), Scalably report(템플릿 채우기), anthropics knowledge-work-plugins build-dashboard(KPI·인쇄 규칙)
- 이론: Minto 피라미드 원칙·SCQA·MECE, Knaflic *Storytelling with Data*, Tufte data-ink, Stephen Few 불릿 그래프, IBCS SUCCESS
- 색: OKLab ΔE + Machado(2009) 색각이상 시뮬레이션, WCAG 대비, Okabe-Ito / Tableau 10 / Observable 10 / IBM Carbon
- 라이브러리: Apache ECharts 6.1.0 (Apache-2.0), Mermaid 12.3.0 (MIT), Pretendard 1.3.9 (OFL)
