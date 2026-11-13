"""코드 검사 (단순 수정 때 돌리는 1단계 검사).

  python3 tests/check.py

1) 자바스크립트 문법 오류 (index.html 안의 스크립트, server/Code.gs)
2) 따옴표·괄호 짝 (문법 검사로 함께 잡힘) + HTML 주요 태그 짝
3) 단추·입력칸의 onclick/onchange/oninput/... 가 부르는 함수가 실제로 있는지
4) 판 번호가 파일마다 같은지 (index.html APP_VERSION = server/Code.gs APP_VERSION)
하나라도 걸리면 끝에 FAIL 과 함께 종료 코드 1.
"""
import re, sys, json, subprocess, pathlib, tempfile
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
GS = (ROOT / "server" / "Code.gs").read_text(encoding="utf-8")
RES = []
def check(name, ok, info=""): RES.append((name, bool(ok), info))

# 1) 문법
scripts = re.findall(r"<script>([\s\S]*?)</script>", HTML)
js = "\n;\n".join(scripts)
with tempfile.TemporaryDirectory() as d:
    files = {"index.html 스크립트": js, "server/Code.gs": GS}
    for label, code in files.items():
        p = pathlib.Path(d) / "c.js"; p.write_text(code, encoding="utf-8")
        r = subprocess.run(["node", "-e", "new Function(require('fs').readFileSync(process.argv[1],'utf8'))", str(p)], capture_output=True, text=True)
        err = (r.stderr.strip().splitlines() or [""])
        msg = next((l for l in err if "Error" in l), err[-1])
        check(f"문법: {label}", r.returncode == 0, msg)
    # json 파일들
    for jf in [ROOT / "data" / "public.json"]:
        if jf.exists():
            try: json.loads(jf.read_text(encoding="utf-8")); check(f"문법: {jf.name}", True)
            except Exception as e: check(f"문법: {jf.name}", False, str(e))

# 2) HTML 주요 태그 짝 (스크립트 밖의 정적 HTML만)
class TagCheck(HTMLParser):
    VOID = {"br", "img", "input", "meta", "link", "hr", "col", "source", "area", "base", "wbr"}
    def __init__(self): super().__init__(); self.stack = []; self.bad = []
    def handle_starttag(self, t, a):
        if t not in self.VOID: self.stack.append((t, self.getpos()[0]))
    def handle_endtag(self, t):
        if t in self.VOID: return
        if self.stack and self.stack[-1][0] == t: self.stack.pop(); return
        if any(x[0] == t for x in self.stack):
            while self.stack and self.stack[-1][0] != t:
                tt, ln = self.stack.pop()
                if tt not in {"p", "li", "option", "td", "th", "tr"}: self.bad.append(f"{tt}({ln}줄) 닫힘 없음")
            self.stack.pop()
        else: self.bad.append(f"</{t}>({self.getpos()[0]}줄) 여는 태그 없음")
static = re.sub(r"<script[\s\S]*?</script>", "<script></script>", HTML)
static = re.sub(r"<style[\s\S]*?</style>", "<style></style>", static)
tc = TagCheck(); tc.feed(static)
left = [f"{t}({ln}줄)" for t, ln in tc.stack if t not in {"html", "body", "head", "p", "li"}]
check("HTML 태그 짝", not tc.bad and not left, "; ".join(tc.bad + left)[:300])

# 3) 이벤트가 부르는 함수가 있는지
defined = set(re.findall(r"\bfunction\s+([A-Za-z_$][\w$]*)", js))
defined |= set(re.findall(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", js))
defined |= set(re.findall(r"window\.([A-Za-z_$][\w$]*)\s*=", js))
BUILTIN = {"if", "for", "while", "switch", "return", "typeof", "function", "catch", "alert", "confirm", "parseInt", "parseFloat",
           "String", "Number", "JSON", "Math", "Date", "Object", "Array", "setTimeout", "clearTimeout", "encodeURIComponent",
           "decodeURIComponent", "isNaN", "Boolean", "Promise", "open", "print", "event", "fetch"}
handlers = re.findall(r"""\bon(?:click|change|input|submit|keydown|keyup|toggle|load|error)=(?:"([^"]*)"|'([^']*)')""", HTML)
missing = {}
for a, b in handlers:
    code = a or b
    code = re.sub(r"\$\{[^}]*\}", "0", code)          # 템플릿 값 자리 지우기
    code = re.sub(r"(['\"`]).*?\1", "''", code)       # 문자열 지우기
    for name in re.findall(r"(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(", code):
        if name not in defined and name not in BUILTIN:
            missing.setdefault(name, 0); missing[name] += 1
check("단추가 부르는 함수가 모두 있음", not missing, ", ".join(f"{k}({v}곳)" for k, v in missing.items()))
check("검사한 단추·입력칸 수", len(handlers) > 50, f"{len(handlers)}개")

# 4) 판 번호
vh = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', HTML); vg = re.search(r"APP_VERSION\s*=\s*'([^']+)'", GS)
check("판 번호가 파일마다 같음", vh and vg and vh.group(1) == vg.group(1),
      f"index.html={vh and vh.group(1)}, Code.gs={vg and vg.group(1)}")

bad = [r for r in RES if not r[1]]
for n, ok, info in RES:
    print(("통과 " if ok else "실패 ") + n + (f"  ({info})" if info and (not ok or n.startswith("검사한") or n.startswith("판")) else ""))
print(f"\n코드 검사 {len(RES) - len(bad)}/{len(RES)} 통과" + ("  FAIL" if bad else ""))
sys.exit(1 if bad else 0)
