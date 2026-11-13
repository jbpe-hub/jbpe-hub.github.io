"""자료실 화면 회귀 시험 (배포 전 확인용).

새 기능을 넣은 뒤 기존 흐름(목록·찾기·자료 창·가입·올리기·고치기·회원 공간·운영진)이
그대로 도는지 실제 브라우저(크롬)로 돌려 본다. 서버와 파이어베이스는 가짜로 바꿔 끼운다.

  sh tests/run.sh full            # 코드 검사 + 이 화면 시험. 실패가 하나라도 있으면 끝에 FAIL 과 함께 종료 코드 1
"""
import asyncio, json, re, sys, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / "index.html").read_text(encoding="utf-8")
TMP = ROOT / "tests" / "_smoke.html"

CFG = {"grades": ["1·2학년", "3·4학년", "5·6학년", "공통"],
       "areas": [{"n": "운동", "s": ["체력운동", "건강활동"]}, {"n": "스포츠", "s": ["기술형", "전략형", "생태형"]},
                 {"n": "표현", "s": []}, {"n": "AI·에듀테크", "s": ["AI 판정 프로그램", "앱·웹 도구", "디지털 수업 사례"]}],
       "types": ["수업 지도안", "수업 사례", "활동지", "PPT", "영상", "프로그램", "평가 자료"], "bookTitle": "시험 자료집"}
ITEMS = [
    {"id": "p1", "t": "티니클링 수업 사례", "d": "표현 활동 사례", "g": ["5·6학년"], "a": ["표현"], "ty": "수업 사례", "m": True,
     "by": "시험교사", "sc": "햇살초등학교", "dt": "2026-11-08", "v": 1, "hasFile": True, "fname": "a.pdf"},
    {"id": "p2", "t": "전략형 게임 지도안", "d": "지도안", "g": ["3·4학년"], "a": ["스포츠", "전략형"], "ty": "수업 지도안", "m": False,
     "by": "시험교사", "sc": "햇살초등학교", "dt": "2026-10-01", "v": 3, "hasFile": False,
     "link": "영상 | https://youtu.be/x\n긴 주소 | https://docs.google.com/spreadsheets/d/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/copy"},
    {"id": "p3", "t": "AI 판정 줄넘기 '점퍼스'", "d": "카메라 판정", "g": ["공통"], "a": ["운동", "AI·에듀테크", "AI 판정 프로그램"],
     "ty": "프로그램", "m": False, "by": "시험교사", "sc": "햇살초등학교", "dt": "2026-11-07", "v": 5, "hasFile": True, "fname": "z.zip",
     "link": "설치 영상 | https://youtu.be/y"},
]
PUBLIC = {"ok": True, "config": CFG, "items": [{k: v for k, v in i.items() if not (i["m"] and k == "link")} for i in ITEMS]}
ME_ADMIN = {"email": "t@x.kr", "name": "시험교사", "school": "햇살초등학교", "status": "승인", "admin": True, "member": True,
            "hasPhone": True, "hasPos": True, "pos": "교사"}
MD = {"ok": True, "items": [dict(i, canEdit=True, own=True) for i in ITEMS],
      "schedules": [{"id": "s1", "d": "2026-11-04", "t": "11월 자율연수", "p": "체육관", "tm": "16:00", "x": "", "att": ["t@x.kr"], "big": False}],
      "notices": [{"id": "n1", "t": "공지 시험", "x": "내용", "by": "시험교사", "dt": "2026-11-01", "pin": True, "cm": []}],
      "book": {}, "members": []}
AD = {"ok": True, "sheetUrl": "#", "members": [
    {"email": "t@x.kr", "n": "시험교사", "sc": "햇살초등학교", "dt": "2026-11-01", "s": "승인", "role": "운영진", "book": True, "reg": True, "phone": "010-1111-2222", "pos": "교사"},
    {"email": "w@x.kr", "n": "대기교사", "sc": "달빛초등학교", "dt": "2026-11-10", "s": "대기", "role": "회원", "book": False, "reg": True, "phone": "010-3333-4444", "pos": "교감"}],
    "log": []}


def build(logged_in):
    stub = f"""<script>
window.JBPE_API_URL="https://api.invalid/exec";window.JBPE_DB_URL="";
window.__CALLS=[];
const __U={json.dumps(logged_in)}?{{uid:"u1",email:"t@x.kr",getIdToken:async()=>"tok"}}:null;
const __A={{currentUser:__U,setPersistence(){{return Promise.resolve()}},onAuthStateChanged(cb){{setTimeout(()=>cb(__U),20)}},signInWithPopup(){{return Promise.reject(new Error("x"))}},signOut(){{return Promise.resolve()}}}};
window.firebase={{initializeApp(){{}},auth:Object.assign(function(){{return __A}},{{Auth:{{Persistence:{{LOCAL:1}}}},GoogleAuthProvider:function(){{}}}})}};
const __R={{public:{json.dumps(PUBLIC, ensure_ascii=False)},me:{{ok:true,me:{json.dumps(ME_ADMIN, ensure_ascii=False)}}},memberData:{json.dumps(MD, ensure_ascii=False)},adminData:{json.dumps(AD, ensure_ascii=False)}}};
window.fetch=async(url,opt)=>{{let b={{ok:true}};
 if(String(url).includes("public")) b=__R.public;
 else if(opt&&opt.body){{const q=JSON.parse(opt.body);window.__CALLS.push(q);b=__R[q.action]||{{ok:true,me:__R.me.me}};}}
 return {{ok:true,json:async()=>JSON.parse(JSON.stringify(b))}};}};
</script>"""
    s = re.sub(r'<script src="https://www\.gstatic\.com[^"]*"></script>\n', "", SRC).replace('<script src="config.js"></script>', stub)
    s = s.replace('sc.src = "vendor/qrcode.js"', f'sc.src = "{(ROOT / "vendor" / "qrcode.js").as_uri()}"')
    TMP.write_text(s, encoding="utf-8")
    return TMP.as_uri()


RESULTS = []
def check(name, ok, info=""):
    RESULTS.append((name, bool(ok), info))


async def guest(b):
    pg = await b.new_page(viewport={"width": 1280, "height": 900}); pg.set_default_timeout(5000); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(build(False)); await pg.wait_for_timeout(900)
    check("비회원: 자료 카드 3개", await pg.locator(".card").count() == 3)
    check("비회원: 카드 위 영역 색 띠", await pg.locator(".card.banded").count() == 3)
    await pg.locator("aside").get_by_role("button", name="프로그램", exact=True).click(); await pg.wait_for_timeout(200)
    check("비회원: 자료 종류 고르기", await pg.locator(".card").count() == 1)
    await pg.click(".freset"); await pg.wait_for_timeout(200)
    await pg.fill("#q", "티니클링"); await pg.wait_for_timeout(500)
    check("비회원: 검색", await pg.locator(".card").count() == 1)
    await pg.fill("#q", ""); await pg.wait_for_timeout(500)
    await pg.locator(".card", has_text="전략형").click(); await pg.wait_for_timeout(600)
    check("비회원: 자료 창 링크 2줄", await pg.locator("#ov .file").count() == 2)
    box = await pg.locator("#ov .file >> nth=1").bounding_box(); btn = await pg.locator("#ov .file >> nth=1 >> .btn").bounding_box()
    check("자료 창: 긴 주소여도 버튼이 칸 안", btn and box and btn["x"] + btn["width"] <= box["x"] + box["width"] + 1)
    check("자료 창: QR 그려짐", await pg.locator("#qrBox canvas").count() == 1)
    await pg.keyboard.press("Escape"); await pg.evaluate("closeM()")
    await pg.locator(".card", has_text="티니클링").click(); await pg.wait_for_timeout(300)
    check("비회원: 회원만 자료는 잠김", await pg.locator("#ov", has_text="회원만 내려받기").count() == 1)
    await pg.evaluate("closeM()")
    await pg.goto(build(False) + "?i=p3"); await pg.wait_for_timeout(1200)
    check("자료 링크(?i=)로 바로 열기", await pg.locator("#ov", has_text="점퍼스").count() == 1)
    await pg.evaluate("closeM();location.hash='#guide'"); await pg.wait_for_timeout(300)
    check("사용 안내 화면", await pg.locator(".guide .panel").count() >= 5)
    check("비회원: 오류 없음", not errs, "; ".join(errs))
    await pg.close()


async def admin(b, width):
    pg = await b.new_page(viewport={"width": width, "height": 900}); pg.set_default_timeout(5000); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    tag = "휴대폰" if width < 500 else "PC"
    await pg.goto(build(True)); await pg.wait_for_timeout(1200)
    check(f"{tag} 운영진: 로그인 후 목록", await pg.locator(".card").count() == 3)
    await pg.evaluate("openUpload()"); await pg.wait_for_timeout(200)
    check(f"{tag}: 올리기 창(링크 칸)", await pg.locator("#ulinks .lrow").count() == 1)
    await pg.evaluate("addLinkRow()"); check(f"{tag}: 링크 추가", await pg.locator("#ulinks .lrow").count() == 2)
    await pg.evaluate("closeM();openUpload('p2')"); await pg.wait_for_timeout(200)
    check(f"{tag}: 고치기 창에 기존 링크 2개", await pg.locator("#ulinks .lrow").count() == 2)
    check(f"{tag}: 고치기 창 제목 채움", await pg.input_value("#ut") == "전략형 게임 지도안")
    await pg.evaluate("closeM()")
    for k in ["chat", "meet", "cal", "review", "notice", "book"]:
        await pg.evaluate(f"go('members');msub='{k}';msubPicked=true;render()"); await pg.wait_for_timeout(150)
        check(f"{tag}: 회원 공간 '{k}' 탭 열림", await pg.locator("main").count() == 1)
    check(f"{tag}: 책자 탭 원고 양식 단추", await pg.locator(".msguide a[href$='ms-template.hwpx']").count() == 1)
    await pg.evaluate("location.hash='#mine'"); await pg.wait_for_timeout(300)
    check(f"{tag}: 내가 올린 자료 표", await pg.locator("table").count() >= 1)
    await pg.evaluate("location.hash='#admin'"); await pg.wait_for_timeout(600)
    ok = await pg.locator("main", has_text="교감").count() >= 1
    check(f"{tag}: 운영진 표에 직위", ok, "" if ok else (await pg.inner_text("main"))[:200])
    await pg.evaluate("copyRoster=copyRoster");
    check(f"{tag}: 오류 없음", not errs, "; ".join(errs))
    await pg.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, fn in [("비회원", guest(b)), ("PC 운영진", admin(b, 1280)), ("휴대폰 운영진", admin(b, 390))]:
            try: await fn
            except Exception as e: check(f"{name}: 시험 도중 멈춤", False, str(e).splitlines()[0])
        await b.close()
    TMP.unlink(missing_ok=True)
    bad = [r for r in RESULTS if not r[1]]
    for n, ok, info in RESULTS:
        print(("통과 " if ok else "실패 ") + n + (f"  ({info})" if info and not ok else ""))
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} 통과" + ("" if not bad else "  FAIL"))
    sys.exit(1 if bad else 0)

asyncio.run(main())
