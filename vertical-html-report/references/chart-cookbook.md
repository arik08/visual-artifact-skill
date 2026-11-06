# 차트 쿡북 — 22개 type 전체 스펙과 복사용 예시

모든 차트는 아래 형태 하나로 작성한다. **ECharts 코드는 쓰지 않는다.**

```html
<div class="rk-chart"><script type="application/json">
{ "type": "...", "title": "결론형 제목", ... }
</script></div>
```

## 목차
1. 공통 필드
2. 막대 `bar` (세로·가로·묶음·누적·100%누적·강조·목표·IBCS 역할)
3. 꺾은선 `line` (영역·누적영역·전망 구간·주석)
4. 막대+선 `combo`
5. 파이/도넛 `pie`
6. 워터폴 `waterfall`
7. 불릿 `bullet`
8. 덤벨 `dumbbell` / 슬로프 `slope`
9. 파레토 `pareto`
10. 산점도·버블·4분면 `scatter`
11. 히트맵 `heatmap` / 달력 `calendar`
12. 퍼널 `funnel` / 게이지 `gauge`
13. 레이더 `radar`
14. 생키 `sankey`
15. 트리맵 `treemap` / 선버스트 `sunburst`
16. 박스플롯 `boxplot` / 히스토그램 `histogram`
17. 간트·로드맵 `gantt`
18. 고급: `raw`
19. type 별칭(alias)
20. 흔한 실수

---

## 1. 공통 필드 (모든 type)

| 필드 | 예 | 설명 |
|---|---|---|
| `type` | `"bar"` | 필수. 22종 + 별칭(§19) |
| `title` | `"매출 3개월 연속 증가, 9월 652억원"` | **결론형 제목 + 숫자**. 차트 위 굵은 글씨 |
| `subtitle` | `"월별 매출액, 2026년"` | 주제·기간·조건 |
| `unit` | `"억원"`, `"%"`, `"건"` | 우측 상단 "(단위: …)" 표시 + 툴팁 단위 |
| `source` | `"ERP (2026.10.05 기준)"` | 차트 아래 "출처:" |
| `note` | `"부가세 제외"` | 출처 옆 보조 설명 |
| `insight` | `"9월 상승은 신제품 효과"` | 차트 아래 "→" 한 줄 시사점 |
| `height` | `320` | px. 생략 시 type별 자동 |
| `highlight` | `"9월"` / `["A","B"]` / `2` | 강조 대상(범주 이름, 계열 이름, 또는 0부터 순번). 나머지는 회색 |
| `highlightColor` | `"accent"` | 강조색 (기본 1번색). `brand accent good bad warn c1~c8` |
| `target` | `600` 또는 `{"value":600,"label":"목표"}` | 가로(가로막대는 세로) 점선 기준선 |
| `annotations` | `[{"at":"4월","text":"개편"}]` | 특정 범주에 세로 점선+라벨 (bar·line·combo) |
| `labels` | `"all"` `"none"` `"max"` `"last"` | 값 라벨 표시 방식 (생략 시 자동) |
| `decimals` | `1` | 소수 자릿수 (생략 시 원 데이터 기준 자동) |
| `compact` | `true` | 만·억·조 축약 (예: 12,000,000 → 1,200만, 93,600 → 9.36만). 자릿수 고정: `compactDecimals` |
| `negative` | `"triangle"` | 음수를 △로 표기(재무·공공 문서 관례) |
| `colors` | `["brand","gray"]` | 계열 색 지정(가급적 쓰지 말 것 — 자동 팔레트가 검증됨) |
| `legend` | `false` | 범례 숨김 (계열 2개 이상이면 기본 표시) |
| `table` | `false` / `"open"` | 차트 아래 '데이터 표 보기' 숨김 / 펼친 상태 |
| `zoom` | `true` / `false` | '크게 보기' 버튼 (sankey·gantt·treemap·sunburst·heatmap 기본 켜짐) |
| `frame` | `false` | 테두리 없는 차트 |
| `sample` | `true` | "예시 데이터" 배지 + 린트 경고 (실데이터가 없을 때만) |
| `yMin` / `yMax` | `0`, `100` | 값축 범위 강제 |

**숫자 규칙**: 데이터는 숫자만(`1820`). `"1,820억"`처럼 쓰면 자동 변환되지만 경고가 뜬다. 결측은 `null`.

---

## 2. 막대 `bar`

**언제**: 범주(기간·항목) 간 크기 비교. 범주 ≤ 12개(세로), 그 이상·긴 이름은 가로.

```json
{"type":"bar","title":"9월 매출 652억원으로 월 최고, 목표 3개월 연속 상회",
 "subtitle":"월별 매출액","unit":"억원",
 "categories":["7월","8월","9월"],
 "series":[{"name":"매출","data":[612,630,652]}],
 "highlight":"9월","target":{"value":600,"label":"목표"},
 "source":"ERP (2026.10.05 기준)"}
```

| 옵션 | 값 | 효과 |
|---|---|---|
| `categories` | 문자열 배열 | x축(가로막대는 y축) 항목 |
| `series` | `[{"name","data","role","color"}]` | 계열. data 길이 = categories 길이 |
| `horizontal` | `true` | 가로 막대 (값축 자동 숨김 + 막대 끝 값 라벨) |
| `sort` | `"desc"` / `"asc"` | 값 기준 정렬 (순위 차트) |
| `stack` | `true` / `"percent"` | 누적 / 100% 누적(구성비). 구성비 라벨 소수 자릿수는 `decimals`(기본 0) |
| `totals` | `false` | 누적 막대 위 합계 라벨 끄기 |
| `targets` | `[600,620,640]` | 범주별 목표 마커(짧은 가로선) |
| `colorBySign` | `true` | 양수=좋음색, 음수=나쁨색 (증감·차이 막대) |
| `axis` | `true` | 가로 막대에서 값축 표시 |

**IBCS 역할 (계획/실적/전망/전년)** — series에 `role`을 주면 국제 보고 표준 표기로 자동 렌더링:
- `actual`(실적) = 진한 1번색, `forecast`(전망) = 같은 색+빗금 (실적과 같은 자리에 표시),
  `plan`(계획/예산/목표) = 흰 바탕 외곽선, `prev`(전년) = 회색. 한글(`"실적"`,`"계획"`,`"전망"`,`"전년"`)도 인식.

```json
{"type":"bar","title":"4분기 전망은 계획 대비 +3% 상회","unit":"억원",
 "categories":["7월","8월","9월","10월","11월","12월"],
 "series":[
   {"name":"계획","role":"plan","data":[600,620,640,650,660,700]},
   {"name":"실적","role":"actual","data":[612,598,625,null,null,null]},
   {"name":"전망","role":"forecast","data":[null,null,null,668,675,720]}],
 "source":"경영계획"}
```

**순위(가로) 예시**
```json
{"type":"bar","horizontal":true,"sort":"desc","title":"제품 A가 1위, 상위 2개가 58%","unit":"억원",
 "categories":["제품 A","제품 B","제품 C","제품 D"],"series":[{"name":"매출","data":[612,446,318,255]}],
 "highlight":"제품 A","source":"ERP"}
```

**100% 누적(구성비)**
```json
{"type":"bar","stack":"percent","horizontal":true,"title":"20대 모바일 비중 81%로 최고","unit":"천 건",
 "categories":["20대","30대","40대"],
 "series":[{"name":"모바일","data":[81,66,48]},{"name":"PC","data":[12,22,31]},{"name":"매장","data":[7,12,21]}],
 "source":"주문 DB"}
```

**증감(차이) 막대**: `{"type":"bar","colorBySign":true,"categories":[...],"series":[{"name":"전년비","data":[3.2,-1.5,4.0]}],"unit":"%"}`

---

## 3. 꺾은선 `line`

**언제**: 시간 흐름에 따른 추세. 계열 ≤ 4개(넘으면 `highlight`로 1~2개만 강조).

```json
{"type":"line","title":"회원 수 증가세 유지, 12월 52만 명 전망","subtitle":"월말 활성 회원(10월 이후 전망)",
 "unit":"만 명","categories":["7월","8월","9월","10월","11월","12월"],
 "series":[{"name":"당사","data":[45.1,46.0,47.3,48.6,50.1,52.0]},
           {"name":"경쟁사 평균","data":[37.4,37.9,38.1,38.6,39.0,39.5]}],
 "forecastFrom":"9월","annotations":[{"at":"8월","text":"멤버십 개편"}],"source":"CRM"}
```

| 옵션 | 값 | 효과 |
|---|---|---|
| `forecastFrom` | `"9월"` 또는 순번 | 해당 지점 이후 점선 + 회색 '전망' 구간 |
| `forecastLabel` | `"추정"` | 전망 구간 라벨 |
| `area` | `true` | 영역 채움(단일 계열 추천) |
| `stack` | `true` | 누적 영역 (`area`와 함께) |
| `smooth` | `true` | 곡선 (기본 직선 — 보고서에는 직선 권장) |
| `markers` | `"all"` | 모든 점 표시 (기본: 12개 이하일 때만) |
| `endLabels` | `false` | 끝점 라벨(계열명+값) 끄기 (기본: 계열 ≤4개면 켜짐) |
| `zero` | `true` / `false` | y축 0부터 강제 / 자동 범위 (기본: 값이 높은 대역에 몰리면 자동 범위) |
| `highlight` | `"당사"` | 해당 계열만 진하게, 나머지 회색(끝 라벨은 연하게 유지). 두 계열을 동등하게 비교할 때는 쓰지 말 것 |

---

## 4. 막대+선 `combo`

**언제**: 금액(막대)과 비율(선)을 함께. **보조축(right)은 비율(%)일 때만.** 단위가 다른 금액 두 개는 차트 2개로.

```json
{"type":"combo","title":"매출 증가에도 영업이익률은 3분기 연속 하락",
 "unit":"억원","unit2":"%","categories":["1Q","2Q","3Q"],
 "series":[{"name":"매출","as":"bar","data":[1580,1650,1820]},
           {"name":"영업이익률","as":"line","axis":"right","data":[8.6,8.2,7.8]}],
 "source":"재무팀"}
```
- `as`: `"bar"`/`"line"` (생략 시 첫 계열 bar, 나머지 line)
- `highlight`: 막대 계열이 1개일 때 해당 범주 막대만 색, 나머지 회색
- `axis:"right"` 계열은 막대 위쪽 영역에 그려지고 보조축 눈금 대신 점 위에 값 라벨이 표시된다(겹침 방지 설계).

---

## 5. 파이/도넛 `pie` (별칭 `donut`)

**언제**: 한 시점의 구성비, **6조각 이하**. 비교가 목적이면 가로 막대가 더 정확하다.

```json
{"type":"donut","title":"수도권이 매출의 절반 이상(54%)","unit":"억원",
 "data":[{"name":"수도권","value":983},{"name":"영남","value":382},{"name":"충청","value":191},{"name":"기타","value":264}],
 "centerLabel":"총매출","source":"ERP"}
```
| 옵션 | 효과 |
|---|---|
| `donut:false` | 일반 파이 |
| `maxSlices` (기본 6) | 초과분을 `otherLabel`(기본 "기타")로 합침 |
| `centerLabel` / `centerValue` | 도넛 가운데 라벨/값 (기본: "합계"/자동 합계) |
| `highlight` | 한 조각만 색, 나머지 회색 |
| `legendMode` | `true`=오른쪽 범례(이름·값·비중) / `false`=바깥 라벨. 생략 시 폭이 좁으면 범례 |
| `sort:false` | 입력 순서 유지(기본 큰 순) |

---

## 6. 워터폴 `waterfall` (별칭 `bridge`)

**언제**: 시작값 → 증감 요인 → 끝값 분해(손익 브리지, 예산 변동, 인원 증감).

```json
{"type":"waterfall","title":"원재료비 상승(-31억원)이 판매 증가(+28억원)를 상쇄","unit":"억원",
 "items":[{"name":"'25.3Q 영업이익","value":155,"total":true},
          {"name":"판매량 증가","value":28},{"name":"판가 인상","value":9},
          {"name":"원재료비","value":-31},{"name":"인건비","value":-12},
          {"name":"'26.3Q 영업이익","total":true}],
 "source":"재무팀"}
```
- `total:true` 항목은 합계 막대. `value`를 생략하면 누계 자동 계산(끝값 검산용).
- 증가=좋음색, 감소=나쁨색, 합계=1번색. **비용·배출량처럼 감소가 좋은 브리지는 `"good":"down"`**(증가=빨강, 감소=초록).
  직접 지정: `upColor`/`downColor`/`totalColor` = `good` `bad` `brand` `accent` `gray` `c1~c8` 또는 HEX.
- 0을 가로지르는 음수 구간도 자동 처리.

---

## 7. 불릿 `bullet`

**언제**: 여러 KPI의 목표 대비 실적을 한 번에(게이지 여러 개보다 정확하고 공간 효율적).

```json
{"type":"bullet","title":"5개 KPI 중 3개 달성, 신규고객·NPS 미달",
 "subtitle":"막대=실적, 세로선=목표, 회색 구간=부진/보통/양호",
 "items":[{"name":"매출(억원)","actual":1820,"target":1800,"ranges":[1500,1700,2000]},
          {"name":"신규고객(천명)","actual":41,"target":50,"ranges":[35,45,60]},
          {"name":"NPS(점)","actual":38,"target":45}],
 "source":"KPI 대시보드"}
```
- 단위가 다른 KPI가 섞이면 자동으로 **목표=100%** 기준 정규화(`normalize:false`로 끔).
- 막대 끝 라벨: 실적값(달성률%). 미달은 빨간 글씨.

---

## 8. 덤벨 `dumbbell` / 슬로프 `slope`

**덤벨**: 항목별 두 시점 값의 차이(개선폭) 비교. 변화량 큰 순 자동 정렬(`sort:false`로 끔).
```json
{"type":"dumbbell","title":"강남점 만족도 +12점으로 개선폭 최대","unit":"점",
 "fromLabel":"상반기","toLabel":"하반기",
 "items":[{"name":"강남점","from":71,"to":83},{"name":"판교점","from":75,"to":81},{"name":"대전점","from":77,"to":72}],
 "source":"고객 설문"}
```
**슬로프**: 두 시점의 순위·값 변화(4~10개 항목). `highlight`로 이야기 대상만 강조.
```json
{"type":"slope","title":"B사 2위로 상승, 당사와 격차 3%p로 축소","unit":"%","fromLabel":"2025","toLabel":"2026",
 "items":[{"name":"당사","from":31,"to":29},{"name":"B사","from":21,"to":26},{"name":"C사","from":24,"to":22}],
 "highlight":["당사","B사"],"source":"시장조사기관"}
```

---

## 9. 파레토 `pareto`

**언제**: 소수 원인이 대부분을 차지하는지(80/20) 보여줄 때. 자동 내림차순 + 누적% 선 + 80% 기준선, 80%까지의 막대만 색.
```json
{"type":"pareto","title":"불량 원인 상위 3개가 전체의 81%","unit":"건","name":"불량 건수",
 "items":[{"name":"치수 불량","value":142},{"name":"도장 불량","value":98},{"name":"이물 혼입","value":61},
          {"name":"포장 파손","value":32},{"name":"기타","value":17}],
 "threshold":80,"source":"품질팀"}
```

---

## 10. 산점도·버블·4분면 `scatter` (별칭 `bubble`, `quadrant`)

**언제**: 두 지표의 관계, 포트폴리오(성장성×수익성), 우선순위 매트릭스(효과×난이도).
```json
{"type":"scatter","title":"고성장·고마진 사업 2개, 사업 E는 철수 검토",
 "xName":"매출 성장률","xUnit":"%","yName":"영업이익률","yUnit":"%","sizeName":"매출","sizeUnit":"억원",
 "points":[{"name":"사업 A","x":18,"y":14,"size":620},{"name":"사업 B","x":12,"y":11,"size":440},
           {"name":"사업 E","x":-6,"y":2,"size":120}],
 "quadrant":{"x":5,"y":9,"labels":["수익 유지","핵심 성장","철수 검토","수익성 개선"],"highlight":1},
 "source":"사업부 실적"}
```
| 옵션 | 효과 |
|---|---|
| `points[].size` | 있으면 버블(면적 비례) |
| `points[].group` | 그룹별 색 (**최대 3~4그룹**) |
| `quadrant.x/y` | 기준선 위치: 숫자 / `"mean"`(기본) / `"median"` |
| `quadrant.labels` | [좌상, 우상, 좌하, 우하] 사분면 이름 |
| `quadrant.highlight` | 0~3: 해당 사분면 옅은 배경 강조 |
| `trend:true` | 회귀 추세선 + R² |
| `labels:false` | 점 이름 숨김(기본: 24개 이하면 표시) |
| `highlight` | 특정 점 이름만 강조 |

---

## 11. 히트맵 `heatmap` / 달력 `calendar`

**히트맵**: 2차원 패턴(요일×시간, 지역×월, 리스크 발생가능성×영향도). `values`의 **행 = y 항목**.
```json
{"type":"heatmap","title":"화·수 오후 2~4시에 문의 집중(최대 96건)","unit":"건",
 "x":["9시","10시","11시","14시","15시"],"y":["월","화","수"],
 "values":[[32,45,51,62,58],[38,52,60,96,88],[35,50,58,91,84]],"source":"콜센터"}
```
- 음수·양수가 섞이면 자동으로 발산형(파랑↔빨강) 색. `diverging:true`로 강제.
- 셀 120개 이하면 값 표시(`labels:false`로 끔). `min`/`max`로 색 범위 고정.

**달력**: 일별 패턴(최대 1년). `{"type":"calendar","title":"…","data":[["2026-01-01",5],["2026-01-02",8]],"unit":"건"}`

---

## 12. 퍼널 `funnel` / 게이지 `gauge`

**퍼널**: 단계별 잔존·전환. 오른쪽에 전 단계 대비 전환율 자동 표시.
```json
{"type":"funnel","title":"장바구니→결제 전환 38%로 최대 이탈","unit":"명",
 "stages":[{"name":"방문","value":120000},{"name":"상품 조회","value":64000},{"name":"장바구니","value":21000},{"name":"결제","value":8000}],
 "source":"GA4"}
```
**게이지**: 단일(또는 2~4개) 달성률 링. 목표 대비 색 자동(달성=초록, 90% 이상=주황, 미만=빨강).
```json
{"type":"gauge","title":"공정률 72%, 계획 대비 8%p 지연","items":[{"name":"공정률","value":72,"target":80,"unit":"%"}],"source":"PMO"}
```
여러 개: `"items":[{"name":"매출","value":101,"target":100},{"name":"이익","value":94,"target":100}]` (나란히 배치)
> 단일 값은 KPI 카드나 `.rk-progress`가 더 간결할 때가 많다.

---

## 13. 레이더 `radar`

**언제**: 3개 이하 대상의 다차원 역량 비교(5~8개 지표). 대상이 많으면 히트맵이나 표.
```json
{"type":"radar","title":"당사는 품질·브랜드 우위, 가격·배송 열위",
 "indicators":[{"name":"품질","max":5},{"name":"가격","max":5},{"name":"배송","max":5},{"name":"브랜드","max":5},{"name":"서비스","max":5}],
 "series":[{"name":"당사","data":[4.5,3.1,3.3,4.4,4.0]},{"name":"B사","data":[3.8,4.2,4.1,3.5,3.9]}],"source":"고객 설문"}
```

---

## 14. 생키 `sankey` (별칭 `flow`)

**언제**: 흐름의 양(유입→경로→결과, 예산 배분, 에너지·물류 흐름). 노드는 자동 생성. 순환(A→B→A) 불가.
```json
{"type":"sankey","title":"검색 유입 최다, 앱 경유 전환율 최고","unit":"명",
 "links":[{"source":"검색","target":"웹","value":4200},{"source":"검색","target":"앱","value":1300},
          {"source":"웹","target":"구매","value":1300},{"source":"웹","target":"이탈","value":2900},
          {"source":"앱","target":"구매","value":900},{"source":"앱","target":"이탈","value":400}],
 "source":"GA4"}
```
- 노드 색 지정: `"nodes":[{"name":"구매","color":"good"},{"name":"이탈","color":"bad"}]`
- '크게 보기' 버튼 기본 제공.

---

## 15. 트리맵 `treemap` / 선버스트 `sunburst`

**언제**: 계층 구성(예산·매출의 부문→세부). 2단계 이하 권장.
```json
{"type":"treemap","title":"IT 예산의 46%가 인프라에 편중","unit":"억원",
 "data":[{"name":"인프라","children":[{"name":"클라우드","value":38},{"name":"보안","value":12}]},
         {"name":"애플리케이션","children":[{"name":"ERP","value":26},{"name":"CRM","value":15}]},
         {"name":"운영","value":5}],
 "source":"IT기획팀"}
```
선버스트는 같은 `data` 형식(`"type":"sunburst"`), 3단계 계층까지.

---

## 16. 박스플롯 `boxplot` / 히스토그램 `histogram`

**박스플롯**: 그룹 간 분포·편차 비교. **원자료**를 넣으면 사분위·이상치 자동 계산.
```json
{"type":"boxplot","title":"C라인 처리시간 편차가 가장 큼","unit":"분",
 "groups":[{"name":"A라인","values":[12,13,14,13,15,16]},{"name":"C라인","values":[10,14,19,22,13,30]}],"source":"MES"}
```
**히스토그램**: 한 변수의 분포. `{"type":"histogram","title":"…","values":[1.2,1.8,2.1,…],"bins":8,"unit":"일","countUnit":"건"}`

---

## 17. 간트·로드맵 `gantt` (별칭 `roadmap`, `schedule`)

```json
{"type":"gantt","title":"개발 2주 지연, 오픈(3/2)은 유지 가능","today":"2026-11-06",
 "tasks":[{"name":"요구사항 정의","start":"2026-09-01","end":"2026-09-30","group":"분석·설계","progress":100},
          {"name":"핵심 개발","start":"2026-10-13","end":"2026-12-19","group":"개발","progress":45,"owner":"개발1팀"},
          {"name":"통합 테스트","start":"2027-01-12","end":"2027-02-13","group":"테스트"},
          {"name":"오픈","start":"2027-03-02","milestone":true,"group":"테스트"}],
 "source":"PMO 주간보고"}
```
- 날짜: `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY-MM`(월 단위: 시작=1일, 종료=말일). 연도만 알면 `YYYY-01`~`YYYY-12`로 쓰고 작업명에 "(예정)" 표기.
- 작업명은 15자 이내로 짧게(이름 열 최대 200px). 여러 해에 걸치면 마일스톤 날짜에 연도가 자동 표시('27.3/2).
- `progress`(0~100): 진한 부분이 진척. `milestone:true`: 마름모 + 날짜. `today`: 빨간 세로선.
- `group`별 색·범례. 작업 15개 이하 권장(많으면 단계별로 나눔).

---

## 18. 고급: `raw`

키트가 지원하지 않는 특수 차트만. 폰트·팔레트는 자동 주입된다. **약한 모델은 사용하지 말 것.**
```json
{"type":"raw","title":"…","option":{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}}
```

---

## 19. type 별칭

| 별칭 | 실제 |
|---|---|
| `column`, `grouped-bar` | bar |
| `hbar`, `horizontal-bar`, `ranking`, `lollipop` | bar + horizontal (+ ranking은 sort desc) |
| `stacked`, `stacked-bar`, `stacked-column` | bar + stack |
| `percent-bar`, `stacked-100` | bar + stack percent |
| `area` / `stacked-area` / `spline` | line + area / + stack / + smooth |
| `mixed`, `bar-line`, `dual` | combo |
| `donut`, `doughnut`, `ring` | pie (도넛) |
| `bridge` | waterfall |
| `bubble`, `quadrant` | scatter |
| `meter`, `progress-ring` | gauge |
| `roadmap`, `schedule`, `timeline` | gantt |
| `flow`, `alluvial` | sankey |
| `tree` | treemap |
| `spider` | radar |
| `hist`, `box`, `slopegraph`, `calendar-heatmap` | histogram, boxplot, slope, calendar |

---

## 20. 흔한 실수 → 올바른 방법

| 실수 | 올바른 방법 |
|---|---|
| `"data":["1,234억", "5%"]` | `"data":[1234, 5]` + `"unit":"억원"` |
| categories 6개, data 5개 | 길이를 맞추고 결측은 `null` |
| 제목 "월별 매출 추이" | "매출 3개월 연속 증가, 9월 652억원 최고" |
| 계열 8개 꺾은선 | 핵심 1~2개만 `highlight`, 또는 상위 4개 + 기타 |
| 매출(억원)과 고객 수(명)를 이중축 | 차트 2개로 분리 (보조축은 % 전용) |
| 숫자 1개를 막대 1개로 | KPI 카드 |
| 12조각 파이 | 가로 막대 순위 (`ranking`) |
| `highlight:"9월 "`(공백) | 범주 이름과 **정확히** 일치 |
| 날짜 `"11/6"` (간트) | `"2026-11-06"` |
| JSON 안에 주석 `// 설명` | 주석 금지 (설명은 `note`/`subtitle`에) |
