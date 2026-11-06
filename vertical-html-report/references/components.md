# 컴포넌트 마크업 모음 (복사해서 내용만 교체)

규칙: 여기 있는 클래스만 쓴다. 새 클래스·인라인 `style`·`<style>`을 만들지 않는다(린트가 오타를 잡는다).
실제 모습은 `examples/gallery.html`에서 확인.

## 목차
1. 표지 · 목차
2. 핵심 요약 (BLUF · 핵심 메시지 · KPI · 요청사항)
3. 섹션 · 소제목 · 리드 · 시사점 · 개조식 목록
4. KPI 카드 (JSON / HTML)
5. 표 (JSON 표 / 일반 표)
6. 콜아웃 · 인용 · 의사결정 박스
7. 레이아웃: 그리드 · 카드 · As-Is/To-Be
8. 절차(steps) · 타임라인
9. 매트릭스 · SWOT
10. 진척률 · 배지 · 증감 · 태그
11. 각주 · 바닥글 · 페이지 나눔
12. 내장 동작 (전체화면 · 크게 보기 · 인쇄 버튼)

---

## 1. 표지 · 목차

```html
<header class="rk-cover">
  <div class="rk-cover-top">
    <span class="rk-cover-kind">월간 실적 보고</span>
    <span class="rk-badge secret">대외비</span>          <!-- 보안등급 없으면 생략 -->
  </div>
  <h1>2026년 10월 영업 실적 보고</h1>
  <p class="rk-cover-sub">한 줄 결론(숫자 포함) — 제목만 보고도 결론을 알 수 있게</p>
  <ul class="rk-cover-stats">          <!-- 표지 핵심 수치 3개(최대 4개). 요약·본문에 있는 숫자만 -->
    <li><b>1,820<small>억원</small></b><span>3분기 매출 (목표 101%)</span></li>
    <li><b>7.8<small>%</small></b><span>영업이익률 (-1.1%p)</span></li>
    <li><b>2027.9.30</b><span>첫 정산 기한</span></li>
  </ul>
  <dl class="rk-cover-meta">
    <div><dt>보고일</dt><dd>2026.11.06</dd></div>
    <div><dt>작성</dt><dd>경영기획팀 홍길동</dd></div>
    <div><dt>보고 대상</dt><dd>대표이사</dd></div>
    <div><dt>기준</dt><dd>2026.10.31</dd></div>
  </dl>
</header>

<nav class="rk-toc"></nav>   <!-- 선택: 섹션 4개 이상일 때. 내용은 자동 생성 -->
```
섹션이 4개 이상이면 넓은 화면(1420px+)에서 오른쪽에 떠 있는 목차도 자동 표시된다(끄기: front matter `float-toc: off`).

## 2. 핵심 요약

```html
<section class="rk-summary">
  <h2>핵심 요약</h2>
  <p class="rk-bluf">3분기 매출은 목표를 넘겼지만 원가 상승으로 이익률 1.1%p 하락 — 4분기 단가 3% 인상 필요</p>
  <p class="rk-why">경쟁사 2곳이 이미 인상해 11월 계약 갱신 전에 결정해야 하며, 동결 시 연간 이익 -24억원</p>
  <ol class="rk-keypoints">
    <li><strong>매출 1,820억원, 전년 동기 대비 +4.1%</strong> — 신제품 A 판매 호조(+38억원)가 견인</li>
    <li><strong>영업이익 142억원, 전년 대비 -8.4%</strong> — 원재료비 +9% 상승이 주 원인</li>
    <li><strong>4분기 단가 3% 인상 시 이익률 8.6% 회복 가능(추정)</strong> — 경쟁사 2곳 이미 인상</li>
  </ol>
  <div class="rk-kpis"><script type="application/json">
  [ {"label":"매출액","value":1820,"unit":"억원","delta":"+4.1%","deltaLabel":"전년 동기 대비","progress":101},
    {"label":"영업이익률","value":7.8,"unit":"%","delta":"-1.1%p","deltaLabel":"전년 동기 대비","status":"warn"} ]
  </script></div>
  <p class="rk-risk">인상 후 주요 고객 2곳 이탈 시 매출 -3%로 효과 상쇄 <span class="rk-conf mid"></span></p>
  <div class="rk-ask"><b>요청사항</b>11/15까지 4분기 단가 인상안(평균 3%) 승인 요청 (주관: 영업본부)</div>
</section>
```
- 순서: 결론 → 왜 지금 → 핵심 메시지 3개 → KPI → 리스크 → 요청. `rk-why`·`rk-risk` 라벨('왜 지금', '리스크')은 자동.
- 결론 100자·숫자 3개 이내, 핵심 메시지 굵은 글씨 50자 이내.
- 핵심 메시지는 **3개**(최대 5개). 각 항목은 본문 섹션 하나와 대응.
- 요청/결정 사항이 없으면 `.rk-ask` 대신 "향후 계획" 한 줄을 써도 된다.

## 3. 섹션 · 소제목 · 리드 · 시사점 · 개조식 목록

```html
<section class="rk-section">
  <h2>매출 실적</h2>                                  <!-- 번호는 자동 (1, 2, 3 …) -->
  <p class="rk-lead">매출은 3분기 연속 증가, 9월 652억원으로 월 최고치 기록</p>   <!-- ▶ 섹션 결론 -->

  …차트·표…

  <h3>채널별 분석</h3>                                 <!-- 소제목: 왼쪽 막대 -->
  <ul class="rk-gae">                                  <!-- 개조식: □ ○ - · 자동 -->
    <li>온라인 매출 790억원, 전 분기 대비 +23%
      <ul>
        <li>모바일 앱 리뉴얼(8월) 후 전환율 2.1% → 2.9%</li>
        <li>신규 고객 중 20대 비중 41%
          <ul><li>인플루언서 협업 캠페인 효과</li></ul>
        </li>
      </ul>
    </li>
  </ul>
  <p class="rk-note">온라인 매출은 반품 차감 후 순매출 기준</p>   <!-- ※ 자동 -->
  <p class="rk-sowhat">4분기 온라인 마케팅 예산 15% 증액 필요</p> <!-- '시사점' 라벨 자동 -->
</section>

<section class="rk-section rk-appendix">              <!-- 부록: 번호 대신 '부록' -->
  <h2>용어 정의 및 산식</h2> …
</section>
```
- 일반 `<ul>`/`<ol>`도 사용 가능(브랜드색 불릿). 한국식 위계 표기가 필요하면 `rk-gae`.
- 강조: `<strong>`(굵게), `<mark>`(형광펜). 숫자 색: `<span class="rk-pos">+12%</span>`, `<span class="rk-neg">-3%</span>`.

## 4. KPI 카드

**JSON 방식(권장)**
```html
<div class="rk-kpis"><script type="application/json">
[
  {"label":"매출액","value":1820,"unit":"억원","delta":"+4.1%","deltaLabel":"전년 동기 대비","progress":101,"status":"good"},
  {"label":"영업이익","value":142,"unit":"억원","delta":"-8.4%","deltaLabel":"전년 동기 대비","status":"bad","spark":[150,155,149,158,151,146,142]},
  {"label":"원가율","value":71.4,"unit":"%","delta":"+2.3%p","good":"down","deltaLabel":"전년 동기 대비"},
  {"label":"신규 고객","value":"4.1만","unit":"명","note":"목표 5만 명 대비 82%"}
]
</script></div>
```
| 필드 | 설명 |
|---|---|
| `label`, `value`, `unit` | 이름, 값(숫자면 자동 콤마), 단위 |
| `delta` | `"+4.1%"`, `"-1.1%p"`, 숫자 `4.1`(→ `deltaUnit` 기본 %) — ▲▼·색 자동 |
| `deltaLabel` | 비교 기준 **필수** ("전년 동기 대비", "전월 대비", "목표 대비") |
| `good` | `"up"`(기본: 증가가 좋음) / `"down"`(비용·불량률·이탈률처럼 감소가 좋음) |
| `status` | `"good"`/`"warn"`/`"bad"` → 카드 왼쪽 색 막대(신호등) |
| `progress` | 달성률(%) → 목표선이 있는 진척 바(100%↑ 초록, 90%↑ 주황, 미만 빨강) |
| `spark` | 최근 추이 배열 → 미니 꺾은선 |
| `note` | 카드 하단 작은 설명 |

**HTML 방식**(자유 배치가 필요할 때)
```html
<div class="rk-kpis">
  <div class="rk-kpi" data-status="good">
    <div class="rk-kpi-label">매출액</div>
    <div class="rk-kpi-value">1,820<span class="rk-unit">억원</span></div>
    <div class="rk-kpi-meta"><span class="rk-delta">+4.1%</span><span>전년 동기 대비</span></div>
    <div class="rk-kpi-spark" data-values="1700,1720,1750,1780,1820"></div>
  </div>
</div>
```
**히어로 숫자**(보고서 전체의 단 하나의 숫자): `<div class="rk-hero"><div class="rk-hero-value">101<small>%</small></div><div class="rk-hero-label">연간 매출 목표 달성률</div></div>`

## 5. 표

**JSON 표(숫자 표는 이것을 권장 — 정렬·서식·증감색·막대·합계 자동)**
```html
<div class="rk-tablejs"><script type="application/json">
{
  "title": "C사업부만 목표 미달(92%), 나머지 3곳은 초과 달성",
  "unit": "억원",
  "columns": [
    {"key":"name","label":"사업부"},
    {"key":"plan","label":"목표","type":"num"},
    {"key":"actual","label":"실적","type":"num"},
    {"key":"rate","label":"달성률","type":"bar","unit":"%","max":120},
    {"key":"yoy","label":"전년비","type":"delta","unit":"%"},
    {"key":"cost","label":"원가율 증감","type":"delta","unit":"%p","good":"down"},
    {"key":"status","label":"상태","type":"badge"}
  ],
  "rows": [
    {"name":"A사업부","plan":600,"actual":652,"rate":108.7,"yoy":9.2,"cost":-0.4,"status":"초과달성"},
    {"name":"C사업부","plan":420,"actual":386,"rate":91.9,"yoy":-3.1,"cost":1.8,"status":"미달"}
  ],
  "total": "auto",
  "highlight": ["C사업부"],
  "heat": ["actual"],
  "source": "ERP (2026.10.05 마감)"
}
</script></div>
```
| 열 `type` | 표시 |
|---|---|
| `text`(기본) | 왼쪽 정렬 |
| `num` | 콤마·우측 정렬. `decimals`, `compact`, `showUnit` |
| `pct` | 숫자 + % |
| `delta` | ▲▼ + 좋음/나쁨 색 (`good:"down"`이면 감소가 좋음) |
| `bar` | 셀 안 막대 + 값 (`max`로 막대 기준) |
| `badge` | 상태 배지 — '정상/완료/달성'=초록, '주의/지연/진행중'=주황, '위험/미달/중단'=빨강, '계획/예정/권고/착수'=파랑 자동. 직접 지정: `"map":{"검토":"warn","보류":"bad"}` (값: good·warn·bad·info·brand) |

`total`: `"auto"`(num 열 합계) 또는 직접 객체. `highlight`: 행 순번(0부터) 또는 첫 열 값. `heat`: 색 농도로 크기 표시할 열 key.
`rows`는 배열 형식도 가능: `"rows":[["A사업부",600,652,108.7,9.2,-0.4,"초과달성"]]`.

**일반 HTML 표**(텍스트 위주 표)
```html
<table class="rk-table" data-heat="3">           <!-- data-heat: 1부터 센 열 번호(쉼표로 여러 개) -->
  <caption>지역별 매출 (단위: 억원, %)</caption>
  <thead><tr><th>지역</th><th class="num">매출</th><th class="num">성장률</th><th>비고</th></tr></thead>
  <tbody>
    <tr><td>수도권</td><td>983</td><td>6.2</td><td>신규 매장 2곳</td></tr>
    <tr class="rk-hl"><td>충청</td><td>191</td><td>-1.4</td><td>경쟁 심화</td></tr>
    <tr class="rk-total"><td>합계</td><td>1,556</td><td>4.0</td><td></td></tr>
  </tbody>
</table>
```
- 숫자 셀은 자동 우측 정렬(열의 80% 이상이 숫자일 때). `tr.rk-sub`(소계), `td.pos`/`td.neg`(색), `.rk-indent`(들여쓰기), `table.rk-compact`(촘촘하게).
- 표는 자동으로 `.rk-table-wrap`(가로 스크롤 상자)에 감싸져 모바일에서 넘치지 않는다.
- 옵션 비교표의 권고안 열: `th.rk-rec`, `td.rk-rec`.

## 6. 콜아웃 · 인용 · 의사결정

```html
<div class="rk-callout rk-insight"><strong>시사점</strong>원가 상승은 구조적 — 단가 인상과 원가 절감 병행 필요</div>
<div class="rk-callout rk-info"><strong>참고</strong>…</div>
<div class="rk-callout rk-good"><strong>성과</strong>…</div>
<div class="rk-callout rk-warn"><strong>리스크</strong>…</div>
<div class="rk-callout rk-bad"><strong>긴급</strong>…</div>

<blockquote class="rk-quote">배송이 하루만 빨라도 다시 주문할 것 같아요<cite>고객 인터뷰, 30대 직장인</cite></blockquote>

<div class="rk-decision">
  <h3>의사결정 요청 사항</h3>
  <ol>
    <li><b>4분기 단가 3% 인상안 승인</b> — 결정 기한 11/15, 미결정 시 연간 이익 -24억원</li>
  </ol>
</div>
```
콜아웃은 섹션당 1~2개까지. 남발하면 강조 효과가 사라진다.

### 판단·실행 컴포넌트

```html
<!-- 확신도 배지: 핵심 판단 옆. 비워 두면 '확신도 높음/중간/낮음' 자동 -->
<p class="rk-lead">공급과잉은 2028년까지 이어질 가능성 높음 <span class="rk-conf mid"></span></p>

<!-- 실행 과제 표: 대응·계획·제언 섹션 필수 -->
<table class="rk-table rk-actions">
  <thead><tr><th>과제</th><th>담당(주관/협조)</th><th>기한</th><th>성공 지표</th><th>필요 자원</th></tr></thead>
  <tbody>
    <tr><td>4분기 단가 3% 인상 통보</td><td>영업본부 / 재무팀</td><td>2026.11.30</td><td>이익률 7.8%→8.6%</td><td>—</td></tr>
  </tbody>
</table>

<!-- 판단을 바꿀 신호: 전망에 기대는 보고서 -->
<table class="rk-table rk-signals">
  <thead><tr><th>지표</th><th>현재</th><th>임계값</th><th>넘으면</th></tr></thead>
  <tbody><tr><td>주요 고객 이탈</td><td>0곳</td><td>2곳 이상</td><td>인상폭 1.5%로 조정</td></tr></tbody>
</table>

<!-- 예상 질문 -->
<dl class="rk-faq">
  <dt>인상 대신 원가 절감으로 대응할 수 없는가?</dt>
  <dd>원가 절감 여력은 연 8억원으로 이익 감소분(24억원)의 3분의 1 수준이다.</dd>
</dl>
```

## 7. 레이아웃

```html
<div class="rk-grid">            …2단…           </div>
<div class="rk-grid rk-cols-3">  …3단…           </div>
<div class="rk-grid rk-cols-4">  …4단(카드용)…    </div>
<div class="rk-grid rk-cols-2-1">…넓은 차트 + 좁은 설명…</div>

<div class="rk-card">            <!-- rk-hl: 강조 테두리, rk-soft: 옅은 배경 -->
  <div class="rk-card-title">대안 A: 단가 인상 <span class="rk-badge brand">권고</span></div>
  <ul><li>…</li></ul>
</div>

<div class="rk-compare">
  <div><div class="rk-compare-head">As-Is (현재)</div><ul><li>수작업 정산, 월 5일 소요</li></ul></div>
  <div><div class="rk-compare-head">To-Be (개선 후)</div><ul><li>자동 정산, 월 1일 이내</li></ul></div>
</div>
```
- 그리드 안에 차트 2개를 나란히 둘 때, 두 차트의 `height`를 같게.
- 모바일(760px 이하)에서는 모두 1단으로 자동 전환.

## 8. 절차 · 타임라인

```html
<ol class="rk-steps">                                   <!-- 3~6단계 권장, 번호 자동 -->
  <li class="done"><b>현황 진단</b><span>9월 완료</span></li>
  <li class="now"><b>시범 적용</b><span>11월 진행 중</span></li>
  <li><b>전사 확산</b><span>12월~</span></li>
</ol>

<ol class="rk-timeline">                                <!-- 추진 경과·향후 일정 -->
  <li class="done"><time>2026.09.01</time><b>TF 구성</b><p>현업 6명, IT 4명</p></li>
  <li class="now"><time>2026.11.06</time><b>시범 적용 중</b><p>본사 재무팀</p></li>
  <li><time>2026.12.01</time><b>전사 확산</b><p>12개 부서</p></li>
</ol>
```
분기·갈래가 있는 흐름은 Mermaid(`references/diagrams.md`), 기간이 중요한 일정은 `gantt` 차트.

## 9. 매트릭스 · SWOT

```html
<div class="rk-matrix" data-x="실행 난이도 (낮음 → 높음)" data-y="기대 효과 (낮음 → 높음)">
  <div class="rk-hl"><b>Quick Win</b><ul><li>정산 자동화</li></ul></div>   <!-- 좌상 -->
  <div><b>전략 과제</b><ul><li>데이터 플랫폼</li></ul></div>               <!-- 우상 -->
  <div><b>선택 과제</b><ul><li>양식 정비</li></ul></div>                   <!-- 좌하 -->
  <div><b>보류</b><ul><li>전면 재구축</li></ul></div>                      <!-- 우하 -->
</div>

<div class="rk-swot">
  <div class="rk-s"><b>S 강점</b><ul><li>…</li></ul></div>
  <div class="rk-w"><b>W 약점</b><ul><li>…</li></ul></div>
  <div class="rk-o"><b>O 기회</b><ul><li>…</li></ul></div>
  <div class="rk-t"><b>T 위협</b><ul><li>…</li></ul></div>
</div>
```
항목을 수치로 배치해야 하면 `scatter` + `quadrant`가 더 정확하다.

## 10. 진척률 · 배지 · 증감 · 태그

```html
<div class="rk-progress" data-label="전체 공정률" data-value="72" data-target="80"></div>
<div class="rk-progress" data-label="예산 집행" data-value="3.2" data-max="5" data-unit="억원"></div>
<!-- 목표 있으면 상태색 자동(달성 초록 / 90%↑ 주황 / 미만 빨강). 직접 지정: data-status="good|warn|bad" -->

<span class="rk-badge good">정상</span> <span class="rk-badge warn">주의</span> <span class="rk-badge bad">위험</span>
<span class="rk-badge info">참고</span> <span class="rk-badge brand">권고</span> <span class="rk-badge solid">신규</span>

<span class="rk-delta">+4.1%</span>                 <!-- ▲ 4.1% 초록 -->
<span class="rk-delta" data-good="down">+2.3%p</span> <!-- ▲ 2.3%p 빨강 (비용 증가는 나쁨) -->
<span class="rk-tag">ERP</span>
```

## 11. 참고문헌 · 각주 · 바닥글 · 페이지 나눔

```html
<ol class="rk-refs">   <!-- 부록의 참고문헌: URL은 자동으로 링크가 된다 -->
  <li>EU Commission, "CBAM — Definitive period", 2026.01.01, https://taxation-customs.ec.europa.eu/…</li>
</ol>
```

```html
<div class="rk-footnotes"><ol><li>금액은 부가세 제외.</li><li>반올림으로 합계 불일치 가능.</li></ol></div>
<footer class="rk-footer"><span>경영기획팀 · 대외비</span><span>문의: 내선 1234</span></footer>
<div class="rk-pagebreak"></div>   <!-- 인쇄 시 여기서 페이지 넘김 -->
```

## 12. 내장 동작 (따로 작성할 필요 없음)

| 기능 | 동작 | 설정 |
|---|---|---|
| 우클릭 전체화면 | 페이지 어디서나 우클릭 → 전체화면 전환/해제 (Shift·Ctrl+우클릭은 기본 메뉴) | 끄기: `fullscreen: off` |
| 크게 보기 | 다이어그램·복잡 차트 우측 상단 아이콘 → 확대/축소(휠·+/−·핀치)·이동(드래그)·맞춤(더블클릭)·Esc 닫기 | 차트 `"zoom": true/false`, 다이어그램 `data-zoom="off"` |
| 인쇄/PDF 버튼 | 우측 하단 버튼 | **요청 시에만** `toolbar: print` (Ctrl+P 인쇄는 항상 가능, A4 최적화) |
| 데이터 표 | 각 차트 아래 '데이터 표 보기' (인쇄 시 숨김) | 차트 `"table": false` / `"open"` |
| 목차 | `.rk-toc` 자리 자동 생성 + 넓은 화면 플로팅 목차 | `float-toc: off` |
| QA 패널 | 주소 뒤 `?qa` → 오류·경고 목록 표시 | — |
