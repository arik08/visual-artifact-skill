---
name: vertical-html-report
description: 회사 업무용 세로형(스크롤형) 단일 HTML 보고서를 작성한다 — 월간·주간 실적, 현황, 프로젝트 진척, 기획·제안, 의사결정 요청, 결과, 이슈·사고, 데이터·시장 분석 보고서. ECharts 차트 20여 종(막대·선·워터폴·불릿·간트·히트맵·생키·퍼널 등), Mermaid 흐름도, KPI 카드, 표, 타임라인을 JSON 데이터만 채우면 검증된 디자인·팔레트로 자동 렌더링하고, 린트·헤드리스 렌더 검사로 품질을 확인한다. 사용자가 보고서·리포트·report·브리핑·현황 정리·실적 정리·분석 결과 정리·대시보드형 문서·시각화 문서·"보기 좋게 정리해서 공유"를 요청하면, HTML이라는 말이 없어도 이 스킬을 사용할 것.
---

# 세로형 HTML 업무 보고서 (report-kit)

**핵심 원리: "내용과 데이터는 당신이, 디자인과 차트 코드는 키트가."**
CSS·ECharts 코드를 직접 쓰지 않는다. 본문 조각(`*.body.html`)에 정해진 컴포넌트 클래스와
JSON 스펙만 작성하면 `report-kit`이 축·라벨·색·툴팁·인쇄·반응형을 일관되게 처리한다.
이렇게 하면 어떤 모델이 작성해도 결과물의 시각적 품질이 일정하게 유지된다.

스킬 폴더(이 파일이 있는 곳)를 `SKILL_DIR`이라 부른다.

---

## 0. 작업 순서 (반드시 이 순서로)

1. **기획 메모(6줄)를 먼저 쓴다** — 채팅에 짧게, 또는 머릿속으로.
   ```
   보고 대상/독자: (예: 대표이사, 3분 내 판단)
   목적/요청: (예: 단가 인상안 승인)
   한 줄 결론: (숫자 포함. 예: 3Q 매출 목표 101% 달성, 이익률은 원가로 1.1%p 하락)
   보고서 유형: monthly | status | proposal | incident | analysis | blank
   테마: navy(기본) | blue | teal | slate | wine | forest
   섹션별 핵심 메시지 → 시각화: (예: 2.매출 → bar+highlight, 3.이익 증감 → waterfall)
   ```
2. **템플릿 복사**: `python SKILL_DIR/scripts/new_report.py --type monthly -o <출력폴더>/보고서명.body.html`
3. **본문 작성**: 템플릿의 예시 내용을 실제 내용으로 교체(파일을 먼저 읽은 뒤 편집하거나 전체를 새로 써도 됨). 컴포넌트는 §3, 차트는 §4·§5 참고.
   기호(※, ▶, →, "시사점:")는 키트가 자동으로 붙이므로 직접 쓰지 않는다.
4. **빌드+린트**: `python SKILL_DIR/scripts/build_report.py <출력폴더>/보고서명.body.html`
   → 같은 폴더에 `보고서명.html` 생성. **[ERROR]가 0이 될 때까지 수정**하고, [WARN]은 읽고 판단한다.
5. **렌더 검사**(브라우저가 있으면): `python SKILL_DIR/scripts/render_check.py <출력폴더>/보고서명.html`
   → 차트 렌더 성공 수·오류·페이지 폭 초과를 출력하고 스크린샷을 1800px 단위 조각(`보고서명-1.png`, `-2.png` …)으로 저장.
   **조각을 하나씩 열어** 라벨 겹침·잘림·빈 차트를 눈으로 확인하고 고친다.
6. **전달**: 최종 `.html` 경로와 한 줄 요약, (있다면) 가정·예시 데이터 사용 여부를 알린다.

> Python을 쓸 수 없는 환경: §8 "빌드 없이 쓰기" 참고.

---

## 1. 절대 규칙 (어기면 보고서 품질이 무너진다)

1. **숫자를 지어내지 않는다.** 사용자가 준 데이터·파일만 사용. 없으면 질문하거나, 꼭 필요할 때만 예시 수치를 쓰되 차트/표에 `"sample": true`를 넣고 전달 시 "예시 데이터"임을 밝힌다. 성장률·비중 등 파생 수치는 직접 계산해 검산한다.
2. **두괄식 구조**: 표지(`.rk-cover`) → 핵심 요약(`.rk-summary`: 결론 1줄 + 핵심 메시지 3개 + KPI 3~5개 + 요청사항) → 본문 섹션 → 부록. 요약만 읽어도 판단할 수 있어야 한다.
3. **제목은 결론형(액션 타이틀) + 숫자.** 차트 `title`, 섹션 `.rk-lead`, 표 `title` 모두 해당.
   - ✗ "월별 매출 추이" ✗ "채널별 현황"
   - ✓ "매출 3개월 연속 증가, 9월 652억원으로 최고" ✓ "온라인 비중 43%로 분기마다 확대"
   - 주제·기간·단위는 `subtitle`/`unit`에 둔다.
4. **개조식 + 해설 단락을 함께**: 목록·요약·KPI 설명은 개조식("~함 / ~임 / ~예정", 한 줄 한 메시지, 숫자 앞쪽). 단, **보고서가 차트·표만으로 채워지면 안 된다** —
   각 섹션에 **3~5문장짜리 해설 단락(`<p>`) 2~3개**를 넣어 배경·원인·해석·의미를 문장으로 설명한다(차트가 '무엇'을 보여주면 단락은 '왜·그래서'를 말함).
   단락 문체는 평서문("~이다/~했다")으로 쓰고 "~습니다"는 쓰지 않는다. 숫자는 단락에서도 근거로 인용.
5. **모든 수치에 단위·비교 기준·기간**: "매출 1,820억원(전년 동기 대비 +4.1%)". 비율의 차이는 **%p**(8.9%→7.8% = -1.1%p). 한 보고서 안에서 단위(억원/백만원)와 날짜 형식을 통일.
6. **차트는 JSON 스펙으로만** 만든다(§4). `<script src>`, ECharts 코드, `<style>`, 차트용 인라인 CSS를 직접 쓰지 않는다.
7. **색·그라데이션은 직접 만들지 않는다.** HEX·CSS 그라데이션 금지. 강조가 필요하면 `"highlight"`, 상태는 `good/warn/bad` 클래스, 브랜드색은 front matter `brand:`.
   **그라데이션은 기본 적용**된다: 표지(3단 그라데이션+점 무늬), 섹션 번호 배지·밑줄, 요약 상단 띠, KPI 상단 선, 진척 바, 의사결정 박스 테두리, 차트 막대·영역. 보수적 문서(이사회·감사 등)만 `style: flat`.
8. **한 차트 = 한 메시지.** 메시지의 대상만 `highlight`로 강조하고 나머지는 자동 회색 처리된다. 계열은 5개 이하, 8개 초과 금지.
9. **금지 차트**: 3D, 7조각 이상 파이(자동으로 '기타' 합침), 막대 1개짜리 차트(→ KPI 카드), 의미 없는 이중축(보조축은 %일 때만).
10. **출처**: 모든 차트·표에 `"source"`(시스템/자료명 + 기준일).
11. **섹션마다 "so what"**: 섹션 끝에 `<p class="rk-sowhat">…</p>` 한 줄로 시사점·조치를 쓴다.
12. **요약 ↔ 본문 일치**: 요약에 쓴 숫자는 본문이나 차트 데이터에 반드시 있어야 한다(린트가 검사).
13. **내장 기능은 그대로 둔다**: 우클릭 = 전체화면 전환(Shift+우클릭은 브라우저 메뉴), 흐름도·복잡 차트의 '크게 보기'(휠 확대/축소·드래그 이동·더블클릭 맞춤·Esc 닫기)는 자동. **인쇄/PDF 버튼은 사용자가 요청할 때만** front matter `toolbar: print`.
14. **Mermaid**: 노드 ID는 영문(`A1`, `step2`), 한글·괄호가 든 라벨은 큰따옴표 `A["매출(억원)"]`, 가로(LR) 흐름은 노드 5개 이하, 그 이상은 `flowchart TD`.
15. **분량·균형**: 섹션 3~7개, 핵심 메시지당 시각화 1개. **시각화와 글의 균형**: 섹션당 시각화 1~3개 + 해설 단락 2~3개(합계 400~800자) + 필요 시 개조식 목록. 핵심 요약 뒤에는 보고서 전체 맥락을 설명하는 도입 단락(`<p>` 2~3개)을 둔다.
   차트를 2개 이상 연달아 놓지 말고 사이에 해설 단락을 둔다. 린트가 해설 단락이 부족한 섹션을 경고한다.

---

## 2. 본문 파일의 뼈대 (`*.body.html`)

```html
<!--
title: 2026년 10월 영업 실적 보고
theme: navy
-->
<header class="rk-cover">
  <div class="rk-cover-top"><span class="rk-cover-kind">월간 실적 보고</span><span class="rk-badge secret">대외비</span></div>
  <h1>2026년 10월 영업 실적 보고</h1>
  <p class="rk-cover-sub">매출 목표 101% 달성, 영업이익률은 원가 상승으로 1.1%p 하락</p>
  <ul class="rk-cover-stats">   <!-- 표지 핵심 수치 3개: 본문·요약에 있는 숫자만 -->
    <li><b>652<small>억원</small></b><span>10월 매출 (목표 101%)</span></li>
    <li><b>7.8<small>%</small></b><span>영업이익률 (-1.1%p)</span></li>
    <li><b>5,933<small>억원</small></b><span>누적 매출(YTD)</span></li>
  </ul>
  <dl class="rk-cover-meta">
    <div><dt>보고일</dt><dd>2026.11.06</dd></div>
    <div><dt>작성</dt><dd>경영기획팀 홍길동</dd></div>
    <div><dt>보고 대상</dt><dd>대표이사</dd></div>
  </dl>
</header>

<section class="rk-summary">
  <h2>핵심 요약</h2>
  <p class="rk-bluf">결론 한 문장(숫자 포함)</p>
  <ol class="rk-keypoints">
    <li><strong>핵심 메시지 1 (숫자)</strong> — 근거/원인</li>
    <li><strong>핵심 메시지 2</strong> — 근거</li>
    <li><strong>핵심 메시지 3</strong> — 근거</li>
  </ol>
  <div class="rk-kpis"><script type="application/json">
  [{"label":"매출액","value":1820,"unit":"억원","delta":"+4.1%","deltaLabel":"전년 동기 대비"}]
  </script></div>
  <div class="rk-ask"><b>요청사항</b>11/15까지 단가 인상안 승인 요청</div>
</section>

<section class="rk-section">
  <h2>매출 실적</h2>
  <p class="rk-lead">이 섹션의 결론 한 줄 (숫자 포함)</p>
  <p>해설 단락 2~4문장. 차트가 보여주는 변화의 배경과 원인, 그 의미를 문장으로 풀어 쓴다. 예: 9월 매출은 652억원으로
     월 최고치를 기록했다. 신제품 A의 온라인 판매가 본격화되며 전년 동월 대비 38억원이 늘었고, 오프라인 채널은 정체였다.
     성장의 대부분이 단일 제품에 의존한다는 점은 4분기 리스크 요인이다.</p>
  <div class="rk-chart"><script type="application/json">
  {"type":"bar","title":"결론형 제목","unit":"억원","categories":["7월","8월","9월"],
   "series":[{"name":"매출","data":[612,630,652]}],"highlight":"9월","source":"ERP (2026.10.05 기준)"}
  </script></div>
  <ul class="rk-gae"><li>세부 설명 (개조식)<ul><li>하위 내용</li></ul></li></ul>
  <p class="rk-sowhat">시사점 또는 다음 조치 한 줄</p>
</section>
```

- `<html>`, `<head>`, `<body>`, `<main>`은 쓰지 않는다 — 빌드가 넣는다.
- 맨 위 주석(front matter) 옵션은 §6.
- 섹션 번호(1, 2, 3…)와 목차는 자동이다. 목차가 필요하면 요약 앞에 `<nav class="rk-toc"></nav>`.

---

## 3. 컴포넌트 치트시트

| 용도 | 마크업 (자세한 예시: `references/components.md`) |
|---|---|
| 표지 | `<header class="rk-cover">` (kind 배지, h1, `.rk-cover-sub`, **`ul.rk-cover-stats` 핵심 수치 3개**, `dl.rk-cover-meta`) |
| 핵심 요약 | `<section class="rk-summary">` + `.rk-bluf` + `ol.rk-keypoints` + `.rk-kpis` + `.rk-ask` |
| 섹션 | `<section class="rk-section"><h2>제목</h2><p class="rk-lead">결론</p>…<p class="rk-sowhat">시사점</p></section>` |
| 부록 | `<section class="rk-section rk-appendix">` |
| KPI 카드 | `<div class="rk-kpis"><script type="application/json">[{label,value,unit,delta,deltaLabel,good,status,progress,spark}]</script></div>` |
| 차트 | `<div class="rk-chart"><script type="application/json">{type,…}</script></div>` (§4) |
| 숫자 표(권장) | `<div class="rk-tablejs"><script type="application/json">{columns,rows,total,highlight,heat}</script></div>` |
| 일반 표 | `<table class="rk-table">` (숫자 셀 자동 우측정렬, `tr.rk-total`, `tr.rk-hl`, `data-heat="3"`) |
| 개조식 목록 | `<ul class="rk-gae">` (□ → ○ → - → · 자동) |
| 강조 박스 | `<div class="rk-callout rk-insight|rk-info|rk-good|rk-warn|rk-bad"><strong>제목</strong>내용</div>` |
| 시사점 한 줄 | `<p class="rk-sowhat">…</p>` |
| 2~4단 배치 | `<div class="rk-grid">` / `rk-grid rk-cols-3` / `rk-cols-4` / `rk-cols-1-2` / `rk-cols-2-1` |
| 카드 | `<div class="rk-card"><div class="rk-card-title">제목</div>…</div>` (`rk-hl` 강조) |
| As-Is → To-Be | `<div class="rk-compare"><div><div class="rk-compare-head">As-Is</div>…</div><div>…</div></div>` |
| 절차(가로 단계) | `<ol class="rk-steps"><li class="done|now"><b>단계</b><span>설명</span></li></ol>` |
| 경과(세로 타임라인) | `<ol class="rk-timeline"><li class="done|now"><time>2026.09</time><b>제목</b><p>설명</p></li></ol>` |
| 2×2 매트릭스 | `<div class="rk-matrix" data-x="X축" data-y="Y축"><div class="rk-hl"><b>사분면</b>…</div>×4</div>` |
| SWOT | `<div class="rk-swot"><div class="rk-s">…</div><div class="rk-w">…</div><div class="rk-o">…</div><div class="rk-t">…</div></div>` |
| 진척률 바 | `<div class="rk-progress" data-label="공정률" data-value="72" data-target="80"></div>` |
| 상태 배지 | `<span class="rk-badge good|warn|bad|info|brand">정상</span>` |
| 증감 표시 | `<span class="rk-delta" data-good="up|down">+4.1%</span>` (▲▼·색 자동) |
| 의사결정 요청 | `<div class="rk-decision"><h3>의사결정 요청 사항</h3><ol>…</ol></div>` |
| 흐름도 | `<div class="rk-diagram" data-title="결론형 제목"><script type="text/x-mermaid">flowchart LR …</script></div>` — 우측 상단 **크게 보기** 아이콘 자동(확대·축소·이동 뷰어) |
| 각주/출처 | `<div class="rk-footnotes"><ol><li>…</li></ol></div>`, `<p class="rk-note">…</p>`(※) |

---

## 4. 차트 고르기 (질문 → type)

| 독자가 알아야 할 것 | type | 핵심 옵션 |
|---|---|---|
| 숫자 1~3개 | **차트 아님 → KPI 카드** | `progress`, `spark` |
| 기간별 크기 비교(≤12기간) | `bar` | `highlight`, `target` |
| 항목 순위·비교 | `bar` + `"horizontal":true,"sort":"desc"` | `highlight` |
| 추세(기간 많음) | `line` | `forecastFrom`, `annotations`, `highlight` |
| 구성(시점 하나) ≤6개 | `pie`(도넛 기본) | `centerLabel` |
| 구성 변화·여러 개 비교 | `bar` + `"stack":true` 또는 `"stack":"percent"` | |
| 증감 요인 분해(브리지) | `waterfall` | `items[].total` |
| 목표 대비 실적(여러 KPI) | `bullet` | `ranges` |
| 단일 달성률 | `gauge` 또는 `.rk-progress` | `target` |
| 전/후, 두 시점 비교 | `dumbbell`(값) / `slope`(순위·추세) | `fromLabel`,`toLabel` |
| 계획·실적·전망(IBCS) | `bar` + series `role`: `actual`/`plan`/`forecast`/`prev` | |
| 금액+비율 함께 | `combo` (선 계열 `"axis":"right"`) | `unit2` |
| 원인 집중도(80/20) | `pareto` | `threshold` |
| 두 지표의 관계·포트폴리오 | `scatter`(크기 있으면 버블) | `quadrant`, `trend` |
| 요일×시간 등 2차원 패턴 | `heatmap` | |
| 일별 패턴(1년) | `calendar` | |
| 단계별 전환·이탈 | `funnel` | |
| 흐름·배분(A→B→C) | `sankey` | |
| 계층 구성(예산 등) | `treemap` / `sunburst` | |
| 역량 비교(≤3개 대상) | `radar` | |
| 분포·편차 | `boxplot`(그룹 비교) / `histogram`(원자료 1개) | |
| 일정·로드맵 | `gantt` | `today`, `progress`, `milestone` |
| 프로세스·절차·조직 | 차트 아님 → `.rk-steps` / Mermaid | |

**모든 차트 공통 필드**: `type`, `title`(결론형), `subtitle`, `unit`, `source`, `note`, `insight`(차트 아래 "→" 한 줄),
`height`(px), `highlight`, `target`, `annotations`, `labels`(`"all"|"none"|"max"|"last"`), `decimals`, `compact`(만·억·조 축약),
`sample`(예시 데이터 표시), `table`(`false`=데이터 표 숨김, `"open"`=펼침), `legend`(false),
`zoom`(`true`=우측 상단 '크게 보기' 버튼. sankey·gantt·treemap·sunburst·heatmap은 기본 켜짐, `false`로 끔).
타입별 전체 옵션과 복사용 예시: **`references/chart-cookbook.md`**.

---

## 5. 가장 많이 쓰는 차트 JSON (그대로 복사해 값만 교체)

```json
{"type":"bar","title":"9월 매출 652억원으로 월 최고, 목표 3개월 연속 상회","subtitle":"월별 매출액",
 "unit":"억원","categories":["7월","8월","9월"],"series":[{"name":"매출","data":[612,630,652]}],
 "highlight":"9월","target":{"value":600,"label":"목표"},"source":"ERP (2026.10.05 기준)"}
```
```json
{"type":"bar","horizontal":true,"sort":"desc","title":"제품 A가 1위, 상위 2개가 58%","unit":"억원",
 "categories":["A","B","C"],"series":[{"name":"매출","data":[612,446,318]}],"highlight":"A","source":"ERP"}
```
```json
{"type":"line","title":"회원 수 증가세 유지, 12월 52만 명 전망","unit":"만 명",
 "categories":["7월","8월","9월","10월","11월","12월"],
 "series":[{"name":"당사","data":[45.1,46.0,47.3,48.6,50.1,52.0]},{"name":"경쟁사","data":[37.4,37.9,38.1,38.6,39.0,39.5]}],
 "forecastFrom":"9월","annotations":[{"at":"8월","text":"멤버십 개편"}],"source":"CRM"}
```
```json
{"type":"waterfall","title":"원재료비(-31억원)가 판매 증가(+28억원)를 상쇄","unit":"억원",
 "items":[{"name":"전년 영업이익","value":155,"total":true},{"name":"판매량","value":28},{"name":"원재료비","value":-31},
          {"name":"기타","value":-10},{"name":"금년 영업이익","total":true}],"source":"재무팀"}
```
```json
{"type":"combo","title":"매출은 늘었지만 이익률은 3분기 연속 하락","unit":"억원","unit2":"%",
 "categories":["1Q","2Q","3Q"],"series":[{"name":"매출","as":"bar","data":[1580,1650,1820]},
 {"name":"영업이익률","as":"line","axis":"right","data":[8.6,8.2,7.8]}],"source":"재무팀"}
```
```json
{"type":"donut","title":"수도권이 매출의 54%","unit":"억원","data":[{"name":"수도권","value":983},{"name":"영남","value":382},{"name":"기타","value":455}],"centerLabel":"총매출","source":"ERP"}
```
```json
{"type":"gantt","title":"개발 2주 지연, 오픈(3/2)은 유지 가능","today":"2026-11-06",
 "tasks":[{"name":"설계","start":"2026-09-01","end":"2026-10-24","group":"설계","progress":100},
          {"name":"개발","start":"2026-10-13","end":"2026-12-19","group":"개발","progress":45},
          {"name":"오픈","start":"2027-03-02","milestone":true,"group":"오픈"}],"source":"PMO"}
```

**JSON 작성 규칙**: 키·문자열은 큰따옴표, 마지막 항목 뒤 쉼표 금지, 숫자에 콤마·단위 금지(`1820` ○ / `"1,820억"` ✗), 단위는 `"unit"`에.
(런타임이 흔한 실수 일부를 자동 보정하지만, 린트 경고가 나오면 고친다.)

---

## 6. Front matter 옵션 (본문 파일 맨 위 주석)

| 키 | 값 | 설명 |
|---|---|---|
| `title` | 문자열 | 브라우저 탭 제목 (없으면 h1) |
| `theme` | `navy`(기본) `blue` `teal` `slate` `wine` `forest` | 색 테마. 금융/보수적→navy·slate, IT→blue, ESG·헬스케어→teal·forest, 프리미엄→wine |
| `brand` | `#RRGGBB` | 회사 대표색. 테마 주색·차트 1번색을 대체 (검증: `scripts/check_palette.py`) |
| `palette` | `theme` `okabe-ito` `tableau` `observable` `carbon` | 차트 범주색 세트 교체 (색각이상 배려가 최우선이면 okabe-ito) |
| `delta` | `semantic`(기본) / `market` | 증감 색: semantic=좋음 초록·나쁨 빨강(비용↑=빨강) / market=증시 관례 상승 빨강·하락 파랑 |
| `numbering` | `decimal` `roman` `none` | 섹션 번호 형식 |
| `cover` | `dark`(기본) / `light` | 표지: 테마 주색의 어두운 그라데이션 밴드 + 흰 글씨 / 밝은 표지 |
| `style` | `rich`(기본) / `flat` | rich: 그라데이션·깊이·질감 / flat: 평면형(이사회·감사 등 보수적 문서) |
| `font` | `pretendard`(기본) `noto` `system` | 웹폰트 (사내망 차단 시 system) |
| `toolbar` | `print` | **요청 시에만**: 우측 하단 '인쇄 / PDF 저장' 버튼 |
| `fullscreen` | `off` | 우클릭 전체화면 기능 끄기 (기본 켜짐) |

빌드 옵션: `--offline`(인터넷 차단 환경: `scripts/fetch_vendor.py`로 받은 라이브러리를 HTML에 내장), `--strict`(린트 오류 시 실패), `-o 경로`.

---

## 7. 참고 문서 — 필요할 때 읽는다

| 상황 | 읽을 파일 |
|---|---|
| 보고서 구조·섹션 구성을 정할 때 | `references/report-types.md` (유형별 목차·섹션별 추천 시각화) |
| 문장·제목·숫자 표기를 다듬을 때 | `references/writing-guide.md` (두괄식·개조식·액션 타이틀·%/%p·△·색 규칙) |
| 차트 옵션이 더 필요할 때 | `references/chart-cookbook.md` (22개 type 전체 스펙·예시) |
| 컴포넌트 마크업 예시 | `references/components.md` |
| 흐름도·조직도·시퀀스 | `references/diagrams.md` (Mermaid 규칙·예시·흔한 오류) |
| 테마·색·브랜드색 적용 | `references/design-system.md` |
| 제출 전 최종 점검 | `references/qa-checklist.md` |
| 모든 컴포넌트가 실제로 어떻게 보이는지 | `examples/gallery.body.html` (빌드본 `examples/gallery.html`) |

---

## 8. 빌드 없이 쓰기 (Python 불가 환경)

1. `templates/shell.html`을 복사한다.
2. `<main class="rk-page">` 안에 본문을 넣는다.
3. 표시된 두 자리(`/*__RK_CSS__*/`, `/*__RK_JS__*/`)에 `assets/report-kit.css`, `assets/report-kit.js` 내용을 **그대로** 붙여 넣는다(수정 금지).
4. 린트 대신 `references/qa-checklist.md`를 직접 점검한다.

---

## 9. 자주 나는 문제

| 증상 | 원인 → 해결 |
|---|---|
| 차트 자리에 빨간 "렌더링 오류" 박스 | 메시지대로 JSON 수정 (대부분 categories/series 길이 불일치, 따옴표, 쉼표) |
| "ECharts 라이브러리를 불러오지 못했습니다" | 인터넷 차단 → `fetch_vendor.py` 1회 실행 후 `build_report.py --offline` |
| 라벨이 겹치거나 잘림 | 항목명을 짧게, 범주 12개 이하로, 또는 `"horizontal":true` / `"height"` 증가 |
| 막대가 모두 회색 | `highlight` 값이 categories의 이름과 정확히 일치하는지 확인 |
| 이중축이 어색함 | 보조축은 비율(%)만. 단위가 다른 금액 둘 → 차트 2개로 분리 |
| Mermaid 오류 | 라벨을 큰따옴표로, 노드 ID 영문, `end` 소문자 금지 (`references/diagrams.md`) |
| 인쇄 시 차트가 잘림 | 브라우저 인쇄 배율 '맞춤', 배경 그래픽 체크. 섹션 사이 `<div class="rk-pagebreak"></div>`로 페이지 나눔 |
