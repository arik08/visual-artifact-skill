#!/usr/bin/env python3
"""
lint_report.py — 보고서 본문(*.body.html 또는 빌드된 *.html)의 흔한 실수를 잡는다. (표준 라이브러리만 사용)

  python scripts/lint_report.py report.body.html
  python scripts/lint_report.py report.html --json        # 기계가 읽을 수 있는 출력

검사: HTML 태그 짝 / 알 수 없는 rk- 클래스(오타) / 표지·요약·섹션 구조 / 차트 JSON 문법·스키마 /
      Mermaid 라벨 따옴표 / 결론형 제목 여부 / 출처 누락 / 예시·플레이스홀더 잔존 / 개조식 문체 /
      요약 수치가 본문에 존재하는지(일관성) / 인라인 스타일·하드코딩 색상 남용
종료코드: ERROR 가 있으면 1
"""
import difflib
import json
import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
CSS_PATH = os.path.join(HERE, "..", "assets", "report-kit.css")

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
CHART_TYPES = {"bar", "line", "combo", "pie", "waterfall", "bullet", "dumbbell", "slope", "pareto", "scatter", "heatmap", "calendar",
               "funnel", "gauge", "radar", "sankey", "treemap", "sunburst", "boxplot", "histogram", "gantt", "raw"}
TYPE_ALIASES = {"column", "columns", "bars", "grouped-bar", "stacked-bar", "stacked", "stacked-column", "percent-bar", "stacked-100", "100%",
                "hbar", "barh", "horizontal-bar", "bar-horizontal", "ranking", "rank", "lollipop", "lines", "spline", "trend", "area",
                "stacked-area", "mixed", "bar-line", "line-bar", "dual", "donut", "doughnut", "ring", "bridge", "variance-bridge", "bubble",
                "quadrant", "scatter-quadrant", "progress-ring", "meter", "roadmap", "schedule", "timeline", "calendar-heatmap", "box",
                "hist", "slopegraph", "tree", "tree-map", "flow", "alluvial", "spider"}
JS_CLASSES = {"rk-figure", "rk-plain", "rk-chart-canvas", "rk-fig-head", "rk-fig-title", "rk-fig-subrow", "rk-fig-sub", "rk-fig-unit",
              "rk-fig-foot", "rk-fig-insight", "rk-fig-note", "rk-datatable", "rk-error", "rk-sample-flag", "rk-diagram-canvas",
              "rk-toc-float", "rk-toolbar", "rk-noprint", "rk-qa-outline", "rk-kpi-bar", "rk-progress-head", "rk-progress-track",
              "rk-progress-fill", "rk-progress-target", "rk-toc-title", "rk-toc-no", "rk-mermaid", "rk-tablejs", "rk-chart", "rk-diagram",
              "rk-zoomable", "rk-zoom-btn", "rk-viewer", "rk-toast", "rk-is-fullscreen"}
TOPIC_ENDINGS = ("현황", "추이", "비교", "분석", "구성", "분포", "현황표", "실적", "동향", "개요", "결과", "전망", "계획", "일정", "구조", "흐름", "프로세스", "비중")
PLACEHOLDERS = [r"\bTODO\b", r"\bTBD\b", r"\bXXX\b", r"lorem ipsum", r"○○○", r"\[입력\]", r"\{\{", r"\bplaceholder\b", r"여기에 입력", r"내용 입력"]
VAGUE = ("크게", "대폭", "상당히", "다소", "많이", "현저히", "급격히", "꾸준히")


class Lint(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # (tag, line, classes)
        self.issues = []
        self.classes = []        # (class, line)
        self.scripts = []        # (type, text, line, parent_classes)
        self._script = None
        self.inline_styles = 0
        self.h1 = 0
        self.texts = []          # (text, line, context-classes)
        self.li_texts = []
        self._li = None
        self.sections = []       # dict(line, h2, ...)
        self._h2 = None
        self.imgs_no_alt = 0
        self.ext_scripts = 0
        self.summary_text = []
        self._in_summary = 0

    def err(self, line, msg):
        self.issues.append(("ERROR", line, msg))

    def warn(self, line, msg):
        self.issues.append(("WARN", line, msg))

    def ctx_classes(self):
        out = set()
        for _, _, cl in self.stack:
            out |= set(cl)
        return out

    def handle_starttag(self, tag, attrs):
        line = self.getpos()[0]
        a = dict(attrs)
        cls = (a.get("class") or "").split()
        for c in cls:
            if c.startswith("rk-"):
                self.classes.append((c, line))
        if a.get("style") is not None and not re.fullmatch(r"\s*(--[\w-]+\s*:\s*[^;]+;?\s*)+", a.get("style") or ""):
            self.inline_styles += 1
        if tag == "h1":
            self.h1 += 1
        if tag == "img" and not a.get("alt"):
            self.imgs_no_alt += 1
        if tag == "script":
            if a.get("src"):
                self.ext_scripts += 1
            self._script = {"type": (a.get("type") or "").lower(), "line": line, "text": "", "parent": self.ctx_classes()}
        if tag == "section" and "rk-section" in cls:
            self.sections.append({"line": line, "h2": None, "appendix": "rk-appendix" in cls})
        if tag == "h2":
            self._h2 = {"line": line, "text": ""}
        if tag == "li":
            self._li = {"line": line, "text": ""}
        if "rk-summary" in cls:
            self._in_summary += 1
        if tag not in VOID:
            self.stack.append((tag, line, cls))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if tag in VOID:
            return
        if tag == "script" and self._script is not None:
            self.scripts.append(self._script)
            self._script = None
        if tag == "h2" and self._h2 is not None:
            txt = self._h2["text"].strip()
            parent = self.ctx_classes()
            if self.sections and "rk-summary" not in parent and self.sections[-1]["h2"] is None:
                self.sections[-1]["h2"] = txt
            self._h2 = None
        if tag == "li" and self._li is not None:
            self.li_texts.append((self._li["text"].strip(), self._li["line"]))
            self._li = None
        # 짝 맞추기
        if not self.stack:
            self.err(line, f"</{tag}> 에 대응하는 여는 태그가 없음")
            return
        if self.stack[-1][0] == tag:
            t, l, cls = self.stack.pop()
            if "rk-summary" in cls:
                self._in_summary -= 1
            return
        # 암묵적으로 닫히는 태그(p, li, td 등)를 허용
        names = [s[0] for s in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, l, cls = self.stack.pop()
                if t not in ("p", "li", "td", "th", "tr", "dt", "dd", "option", "thead", "tbody"):
                    self.err(l, f"<{t}> 가 닫히지 않은 채 </{tag}> 를 만남 (line {line})")
                if "rk-summary" in cls:
                    self._in_summary -= 1
            t, l, cls = self.stack.pop()
            if "rk-summary" in cls:
                self._in_summary -= 1
        else:
            self.err(line, f"</{tag}> 가 열린 적 없는 태그를 닫음")

    def handle_data(self, data):
        if self._script is not None:
            self._script["text"] += data
            return
        if self._h2 is not None:
            self._h2["text"] += data
        if self._li is not None:
            self._li["text"] += data
        if data.strip():
            self.texts.append((data, self.getpos()[0]))
            if self._in_summary > 0:
                self.summary_text.append(data)


def known_classes():
    try:
        with open(CSS_PATH, encoding="utf-8") as f:
            css = f.read()
    except OSError:
        return set()
    return set(re.findall(r"\.(rk-[a-z0-9-]+)", css)) | JS_CLASSES


def relaxed_json(txt):
    """주석·후행쉼표·작은따옴표 정도는 보정 시도 (런타임도 같은 보정을 함)."""
    t = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    t = re.sub(r"(^|[^:\"'])//.*?$", r"\1", t, flags=re.M)
    t = re.sub(r",\s*([}\]])", r"\1", t)
    t = re.sub(r"([{,]\s*)([A-Za-z_][\w]*)\s*:", r'\1"\2":', t)
    t = re.sub(r"'([^'\\]*)'", r'"\1"', t)
    return json.loads(t)


def is_num_like(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_chart(spec, line, issues):
    W = lambda m: issues.append(("WARN", line, m))
    E = lambda m: issues.append(("ERROR", line, m))
    if not isinstance(spec, dict):
        E("차트 JSON은 객체({...})여야 함")
        return
    t = str(spec.get("type", "")).lower().strip()
    if not t:
        W("차트 type 누락 → 런타임이 추정함. 명시 권장")
    elif t not in CHART_TYPES and t not in TYPE_ALIASES:
        E(f"알 수 없는 차트 type '{t}'. 사용 가능: {', '.join(sorted(CHART_TYPES))}")
    title = str(spec.get("title", "")).strip()
    if not title:
        W("차트 title 없음 → 결론이 담긴 제목(예: '매출은 3분기 연속 증가, 9월 +12%')을 넣으세요")
    else:
        if not re.search(r"\d", title) and title.endswith(TOPIC_ENDINGS):
            W(f"차트 제목이 주제형('{title}') — 결론·수치를 담은 액션 타이틀 권장")
    if not spec.get("source") and t != "raw":
        W(f"차트 '{title[:20]}' 출처(source) 없음 — 데이터 출처·기준일 명시 권장")
    if spec.get("sample"):
        W(f"차트 '{title[:20]}' 에 sample:true(예시 데이터) — 실제 데이터로 교체했는지 확인")
    cats = spec.get("categories")
    series = spec.get("series")
    if isinstance(series, dict):
        series = [{"name": k, "data": v} for k, v in series.items()]
    if isinstance(series, list):
        if len(series) > 8:
            E(f"계열이 {len(series)}개 — 8개 초과는 색 구분 불가. 상위만 남기고 '기타'로 합치거나 소형 다중 차트로 분리")
        elif len(series) > 5 and t in ("line", "bar", "column", "area"):
            W(f"계열 {len(series)}개 — 5개 이하 권장(강조 highlight 사용 고려)")
        for sr in series:
            if not isinstance(sr, dict):
                continue
            data = sr.get("data", sr.get("values"))
            if isinstance(cats, list) and isinstance(data, list) and len(data) != len(cats):
                E(f"계열 '{sr.get('name')}' 데이터 {len(data)}개 ≠ categories {len(cats)}개")
            if isinstance(data, list):
                bad = [d for d in data if isinstance(d, str) and re.search(r"[^\d.,\-+ ]", d)]
                if bad:
                    W(f"계열 '{sr.get('name')}' 값에 문자/단위 포함({bad[0]!r}) — 숫자만 넣고 단위는 \"unit\"으로")
            if (sr.get("axis") == "right" or sr.get("yAxisIndex") == 1) and "%" not in str(spec.get("unit2", "%")):
                W(f"이중 축의 보조축 단위가 '{spec.get('unit2')}' — 보조축은 비율(%)일 때만, 그 외엔 차트 2개로 분리 권장")
    if t in ("pie", "donut", "doughnut", "ring"):
        data = spec.get("data") or spec.get("items") or []
        n = len(data) if isinstance(data, (list, dict)) else 0
        if n == 0 and isinstance(cats, list):
            n = len(cats)
        if n > 6:
            W(f"파이 조각 {n}개 — 6개 초과분은 '기타'로 자동 합쳐짐. 비교가 목적이면 가로 막대(ranking) 권장")
        if 0 < n <= 2:
            W("파이 조각 2개 이하 — KPI 카드(숫자) 또는 진척 바가 더 적합")
    if t in ("bar", "column") and isinstance(cats, list) and isinstance(series, list) and len(cats) == 1 and len(series) == 1:
        W("막대 1개짜리 차트 — 숫자 하나는 KPI 카드로 표현")
    if t == "raw" and not isinstance(spec.get("option"), dict):
        E("raw 차트에는 \"option\": {...} 이 필요")


def check_mermaid(code, line, issues):
    W = lambda m: issues.append(("WARN", line, m))
    first = next((l.strip() for l in code.splitlines() if l.strip()), "")
    if not re.match(r"(---|flowchart|graph|sequenceDiagram|gantt|timeline|mindmap|quadrantChart|journey|stateDiagram|classDiagram|erDiagram|pie|xychart|sankey|block|gitGraph|requirementDiagram|C4|architecture|kanban|packet|radar|treemap)", first):
        W(f"Mermaid 첫 줄이 다이어그램 선언이 아님: '{first[:40]}' (예: flowchart LR)")
    if not re.match(r"(flowchart|graph)\b", first):
        return  # 라벨 따옴표 규칙은 flowchart 에서만 검사 (sequence 메시지 등은 괄호 허용)
    warned = False
    for ln_no, l in enumerate(code.splitlines()):
        s = l.strip()
        if s.startswith("%%") or s.startswith("classDef") or s.startswith("class ") or s.startswith("style "):
            continue
        bare = re.sub(r'"[^"]*"', '""', s)          # 따옴표로 감싼 라벨은 제외
        bare = re.sub(r"\|[^|]*\|", "||", bare)      # 엣지 라벨 |...| 제외
        if not warned:
            for m in re.finditer(r"\b[\w-]+\s*(\[\[?|\(\(?|\{\{?)([^\]\)\}]*?)(\]\]?|\)\)?|\}\}?)", bare):
                label = m.group(2)
                if label and label != '""' and re.search(r"[()\[\]{}:;#&<>]", label):
                    W(f"Mermaid 라벨 '{label[:30]}' 에 특수문자 — 큰따옴표로 감싸세요: A[\"{label[:20]}\"] (블록 내 {ln_no + 1}행)")
                    warned = True
                    break
        if re.search(r"(^|\s|-->|---|&)\s*end\s*($|-->|---|;|&|\[|\()", bare) and bare != "end":
            W("Mermaid flowchart 에서 소문자 'end' 를 노드 ID로 쓰면 오류 — 'End' 또는 'done' 사용")


def lint_text(text, path="<text>"):
    issues = []
    # 빌드된 전체 문서라면 main 안쪽만
    m = re.search(r'<main[^>]*class="[^"]*rk-page[^"]*"[^>]*>(.*)</main>', text, re.S)
    offset = 0
    body = text
    if m:
        offset = text[: m.start(1)].count("\n")
        body = m.group(1)
    # front matter 주석은 무시
    p = Lint()
    try:
        p.feed(body)
        p.close()
    except Exception as e:  # noqa
        issues.append(("ERROR", 0, f"HTML 파싱 실패: {e}"))
    for t, l, cls in p.stack:
        if t not in ("p", "li", "td", "th", "tr", "dt", "dd", "thead", "tbody", "html", "body"):
            p.err(l, f"<{t}{(' class=' + cls[0]) if cls else ''}> 가 끝까지 닫히지 않음")
    issues += p.issues

    # 클래스 오타
    kc = known_classes()
    if kc:
        seen = set()
        for c, l in p.classes:
            if c not in kc and c not in seen:
                seen.add(c)
                sug = difflib.get_close_matches(c, kc, n=1)
                issues.append(("WARN", l, f"알 수 없는 클래스 '{c}'" + (f" → '{sug[0]}' 오타?" if sug else " (references/components.md 확인)")))

    # 구조
    cls_set = {c for c, _ in p.classes}
    if "rk-cover" not in cls_set:
        issues.append(("WARN", 1, "표지(.rk-cover) 없음 — 제목·작성일·작성부서를 담은 표지 권장"))
    if "rk-summary" not in cls_set:
        issues.append(("WARN", 1, "핵심 요약(.rk-summary) 없음 — 두괄식: 결론·핵심 메시지 3개·요청사항을 맨 앞에"))
    if p.h1 == 0:
        issues.append(("WARN", 1, "h1(보고서 제목) 없음"))
    elif p.h1 > 1:
        issues.append(("WARN", 1, f"h1이 {p.h1}개 — 제목은 1개만"))
    if not p.sections:
        issues.append(("WARN", 1, "섹션(<section class=\"rk-section\">) 없음"))
    for s in p.sections:
        if not s["h2"]:
            issues.append(("ERROR", s["line"], "rk-section 에 h2 제목이 없음"))
    if len([s for s in p.sections if not s["appendix"]]) > 9:
        issues.append(("WARN", 1, f"섹션 {len(p.sections)}개 — 8개 이하로 압축 권장(부록 활용)"))

    # 스크립트 블록 (차트/KPI/표 JSON, Mermaid)
    n_charts = 0
    for sc in p.scripts:
        typ, txt, line, parent = sc["type"], sc["text"], sc["line"], sc["parent"]
        if typ in ("application/json", "text/json"):
            try:
                spec = json.loads(txt)
            except json.JSONDecodeError as e:
                try:
                    spec = relaxed_json(txt)
                    issues.append(("WARN", line, f"JSON 문법 비표준(주석/후행쉼표/작은따옴표) — 런타임이 보정하지만 수정 권장: {e.msg}"))
                except Exception:
                    issues.append(("ERROR", line + e.lineno - 1, f"JSON 문법 오류: {e.msg} (블록 내 {e.lineno}행 {e.colno}열)"))
                    continue
            if "rk-chart" in parent:
                n_charts += 1
                check_chart(spec, line, issues)
            elif "rk-kpis" in parent:
                arr = spec if isinstance(spec, list) else spec.get("items", []) if isinstance(spec, dict) else []
                if len(arr) > 6:
                    issues.append(("WARN", line, f"KPI 카드 {len(arr)}개 — 3~5개 권장"))
                for k in arr:
                    if isinstance(k, dict) and k.get("delta") is not None and not k.get("deltaLabel") and not k.get("compare"):
                        issues.append(("WARN", line, f"KPI '{k.get('label')}' 증감의 비교 기준(deltaLabel: '전년 동기 대비' 등) 없음"))
                        break
            elif "rk-tablejs" in parent:
                if isinstance(spec, dict) and not spec.get("rows") and not spec.get("data"):
                    issues.append(("ERROR", line, "표 JSON에 rows 가 없음"))
        elif typ in ("text/x-mermaid", "text/mermaid"):
            check_mermaid(txt, line, issues)
        elif typ in ("", "text/javascript", "module"):
            issues.append(("WARN", line, "본문에 직접 작성한 <script> — 차트는 JSON 스펙으로, 로직 스크립트는 지양"))

    if n_charts > 12:
        issues.append(("WARN", 1, f"차트 {n_charts}개 — 핵심 메시지당 1개 원칙, 과다 여부 점검"))
    if p.inline_styles > 8:
        issues.append(("WARN", 1, f"인라인 style 속성 {p.inline_styles}개 — 컴포넌트 클래스 사용 권장"))
    hexes = re.findall(r"(?<![&\w])#[0-9a-fA-F]{6}\b", re.sub(r"<script.*?</script>", "", body, flags=re.S))
    if len(hexes) > 3:
        issues.append(("WARN", 1, f"본문에 HEX 색상 {len(hexes)}개 하드코딩 — 테마 토큰/클래스 사용 권장"))
    if p.imgs_no_alt:
        issues.append(("WARN", 1, f"alt 없는 이미지 {p.imgs_no_alt}개"))
    if p.ext_scripts:
        issues.append(("WARN", 1, "본문에 외부 <script src> — 빌드 스크립트가 라이브러리를 넣으므로 제거"))

    plain = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    plain_txt = re.sub(r"<[^>]+>", " ", plain)
    for pat in PLACEHOLDERS:
        mm = re.search(pat, plain_txt, re.I)
        if mm:
            issues.append(("WARN", 1, f"플레이스홀더 잔존 의심: '{mm.group(0)}'"))

    # 시각화 대비 해설 단락(줄글) 부족
    for m in re.finditer(r'<section\s+class="rk-section(?![^"]*rk-appendix)[^"]*"[^>]*>(.*?)</section>', body, re.S):
        sec = re.sub(r"<script.*?</script>", " ", m.group(1), flags=re.S)
        prose = re.findall(r'<p(?:\s+class="[^"]*rk-prose[^"]*")?\s*>(.*?)</p>', sec, re.S)
        n_chars = sum(len(re.sub(r"<[^>]+>|\s+", "", t)) for t in prose)
        n_vis = len(re.findall(r'class="(?:rk-chart|rk-tablejs|rk-diagram)"', m.group(1)))
        line = offset + body[: m.start()].count("\n") + 1
        h2 = re.search(r"<h2[^>]*>(.*?)</h2>", sec, re.S)
        name = re.sub(r"<[^>]+>", "", h2.group(1)).strip()[:20] if h2 else ""
        if n_vis and n_chars < 300:
            issues.append(("WARN", line, f"섹션 '{name}': 시각화 {n_vis}개에 해설 단락(<p>) {n_chars}자 — 3~5문장 해설 단락 2~3개(400자 이상) 권장"))
        elif n_vis >= 3 and n_chars < 400:
            issues.append(("WARN", line, f"섹션 '{name}': 시각화 {n_vis}개 대비 해설 단락이 짧음({n_chars}자)"))

    # 계산 과정 나열(아무도 읽지 않음) 경고
    calc = re.findall(r"\d[\d,.]*\s*[÷×]\s*\(?\d[\d,.]*[^<]{0,40}?=\s*[-+]?\d", body)
    if len(calc) >= 4:
        issues.append(("WARN", 0, f"계산 과정('a ÷ b = c') {len(calc)}건 — 검산 과정은 보고서에 쓰지 말고, 추정·역산 값만 차트 note에 방법 한 줄로"))

    # 문체: 개조식
    li = [t for t, _ in p.li_texts if len(t) > 8]
    if li:
        seo = [t for t in li if re.search(r"(습니다|입니다|했다|한다|된다|였다)[.!]?\s*$", t)]
        if len(seo) >= 3 and len(seo) / len(li) > 0.3:
            issues.append(("WARN", 1, f"목록 {len(li)}개 중 {len(seo)}개가 서술식(~습니다/~했다) — 개조식(~함, ~임, ~예정) 권장. 예: '{seo[0][:30]}'"))
        for t, l in p.li_texts:
            if any(v in t for v in VAGUE) and not re.search(r"\d", t):
                issues.append(("WARN", l, f"수치 없는 모호한 표현: '{t[:40]}' — 숫자·비교기준·기간을 함께"))
                break

    # 요약 ↔ 본문 수치 일관성
    summ = " ".join(p.summary_text)
    if summ:
        nums = set(re.findall(r"\d[\d,]*\.?\d*", summ))
        rest = body.replace(summ, " ")
        rest_norm = rest.replace(",", "")
        missing = [n for n in nums if len(n.replace(",", "").replace(".", "")) >= 2 and n.replace(",", "").rstrip(".") not in rest_norm]
        if missing:
            issues.append(("WARN", 1, f"요약의 수치 {', '.join(sorted(missing)[:6])} 가 본문·차트 데이터에서 발견되지 않음 — 근거 확인"))

    issues = [(lv, (ln or 0) + offset, msg) for lv, ln, msg in issues]
    issues.sort(key=lambda x: (0 if x[0] == "ERROR" else 1, x[1]))
    return {"path": path, "issues": issues, "charts": n_charts, "sections": len(p.sections), "appendix": len([s for s in p.sections if s["appendix"]])}


def print_report(res, quiet=False):
    errs = [i for i in res["issues"] if i[0] == "ERROR"]
    warns = [i for i in res["issues"] if i[0] == "WARN"]
    app = res.get('appendix', 0)
    print(f"[LINT] {os.path.basename(res['path'])}: 섹션 {res['sections'] - app}개{f'(+부록 {app})' if app else ''}, 차트 {res['charts']}개 — ERROR {len(errs)}, WARN {len(warns)}")
    for lv, ln, msg in errs + ([] if quiet else warns):
        print(f"  [{lv}] line {ln}: {msg}")
    return len(errs)


def main():
    import argparse
    ap = argparse.ArgumentParser(description="세로형 HTML 보고서 린터")
    ap.add_argument("path")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    with open(a.path, encoding="utf-8") as f:
        res = lint_text(f.read(), a.path)
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=2))
        return 1 if any(i[0] == "ERROR" for i in res["issues"]) else 0
    return 1 if print_report(res) else 0


if __name__ == "__main__":
    sys.exit(main())
