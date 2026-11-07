/**
 * 전북초등체육교과연구회 자료실 — Apps Script 서버
 *
 * 처음 한 번: 위쪽 함수 목록에서 setup 을 골라 [실행] → 권한 허용.
 *   - 드라이브에 "전북초등체육교과연구회 자료실" 폴더(공개자료 / 회원전용 / 원고)
 *   - 관리용 구글 시트(자료·회원·일정·공지·댓글·내려받기·설정 탭)
 *   가 자동으로 만들어집니다. 실행 기록(로그)에 시트 주소가 나옵니다.
 * 그다음: [배포] → [새 배포] → 유형 "웹 앱", 실행 계정 "나", 액세스 "모든 사용자".
 */

var FIREBASE_API_KEY = 'AIzaSyCtc18NQqggoKHnuOqC-3u7uRdF-6Zn73Q';
var MAX_UPLOAD_MB = 20;

var SHEETS = {
  '자료': ['id','제목','설명','학년','영역','종류','공개범위','파일ID','파일이름','링크','참고자료','올린이메일','올린이','소속','등록일','조회','상태','원고파일ID','원고쪽수','원고상태','원고제출일'],
  '회원': ['이메일','이름','소속','신청일','상태','역할','책자이름동의','도명단동의','처리일','전화번호','uid'],
  '일정': ['id','날짜','시간','제목','장소','큰행사','참석'],
  '공지': ['id','제목','내용','작성자','작성일','고정'],
  '댓글': ['id','공지id','작성자이메일','작성자','내용','작성일'],
  '내려받기': ['일시','이메일','이름','자료id','자료제목'],
  '설정': ['항목','값','설명']
};

var DEFAULT_SETTINGS = [
  ['학년', '1·2학년, 3·4학년, 5·6학년, 공통', '쉼표로 구분'],
  ['영역', '운동: 체력운동, 건강활동 / 스포츠: 기술형, 전략형, 생태형 / 표현 / AI·에듀테크: AI 판정 프로그램, 앱·웹 도구, 디지털 수업 사례', '"큰영역: 세부, 세부" 를 / 로 구분'],
  ['자료종류', '수업 지도안, 활동지, PPT, 영상, 프로그램, 평가 자료', '쉼표로 구분'],
  ['깃허브저장소', 'jbpe-hub/hub', '사이트 저장소(조직이름/저장소이름). 공개 자료가 바뀌면 사이트 목록을 자동으로 새로 고칩니다'],
  ['책자제목', '2026 전북초등체육교과연구회 수업 자료집', '산출물 책자 기본 제목']
];

/* ───────────── 설치 ───────────── */

function setup() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('이미 설치되어 있습니다. 시트: ' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
    return;
  }
  var me = Session.getEffectiveUser().getEmail();
  var root = DriveApp.createFolder('전북초등체육교과연구회 자료실');
  var pub = root.createFolder('공개자료');
  var mem = root.createFolder('회원전용');
  var ms = root.createFolder('원고');
  pub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var ss = SpreadsheetApp.create('전북초등체육교과연구회 자료실 관리');
  DriveApp.getFileById(ss.getId()).moveTo(root);
  var first = ss.getSheets()[0];
  Object.keys(SHEETS).forEach(function (name, i) {
    var sh = i === 0 ? first.setName(name) : ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold').setBackground('#E8EEF7');
    sh.setFrozenRows(1);
  });
  ss.getSheetByName('설정').getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
  // 설치한 공용 계정을 첫 운영진으로 등록
  ss.getSheetByName('회원').appendRow([me, '연구회 공용 계정', '전북초등체육교과연구회', today_(), '승인', '운영진', 'N', 'N', today_()]);

  props.setProperties({ SHEET_ID: ss.getId(), ROOT_ID: root.getId(), PUB_ID: pub.getId(), MEM_ID: mem.getId(), MS_ID: ms.getId() });
  Logger.log('설치 완료! 관리 시트: ' + ss.getUrl());
  Logger.log('운영진으로 쓸 선생님 개인 구글 계정은, 그 선생님이 사이트에서 가입 신청한 뒤 시트 "회원" 탭에서 상태를 "승인", 역할을 "운영진"으로 바꾸면 됩니다.');
}

/* ───────────── 공통 도구 ───────────── */

function P_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function ss_() { return SpreadsheetApp.openById(P_('SHEET_ID')); }
function sh_(name) { return ss_().getSheetByName(name); }
function today_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'); }
function now_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }
function uid_() { return Utilities.getUuid().slice(0, 8); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function str_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v == null ? '' : v); }

function rows_(name) {
  var sh = sh_(name), data = sh.getDataRange().getValues(), head = data.shift();
  return data.map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = str_(r[j]); });
    return o;
  });
}
function append_(name, obj) {
  var sh = sh_(name), head = SHEETS[name];
  sh.appendRow(head.map(function (h) { return obj[h] == null ? '' : obj[h]; }));
}
function update_(name, rowObj, patch) {
  var sh = sh_(name), head = SHEETS[name];
  Object.keys(patch).forEach(function (k) {
    var c = head.indexOf(k);
    if (c >= 0) sh.getRange(rowObj._row, c + 1).setValue(patch[k]);
  });
}
function deleteRow_(name, rowObj) { sh_(name).deleteRow(rowObj._row); }
function find_(name, key, val) { return rows_(name).filter(function (r) { return r[key] === String(val); })[0]; }

/** 예전에 만든 시트에 새 칸(예: 전화번호)이 없으면 머리줄에 붙여 줍니다. */
function ensureHeaders_(name) {
  var sh = sh_(name), head = SHEETS[name];
  var cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  head.forEach(function (h, i) { if (cur[i] !== h) sh.getRange(1, i + 1).setValue(h).setFontWeight('bold').setBackground('#E8EEF7'); });
}
function phone_(v) {
  var d = String(v || '').replace(/[^0-9]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(d)) throw new Error('휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)');
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}

function settings_() {
  var o = {};
  rows_('설정').forEach(function (r) { o[r['항목']] = r['값']; });
  var split = function (s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(String); };
  return {
    grades: split(o['학년']),
    types: split(o['자료종류']),
    areas: String(o['영역'] || '').split('/').map(function (part) {
      var p = part.split(':');
      return { n: p[0].trim(), s: p[1] ? split(p[1]) : [] };
    }).filter(function (a) { return a.n; }),
    repo: o['깃허브저장소'] || '',
    bookTitle: o['책자제목'] || ''
  };
}

/* ───────────── 로그인 확인 (파이어베이스 토큰) ───────────── */

function verify_(token) {
  if (!token) throw new Error('로그인이 필요합니다.');
  var cache = CacheService.getScriptCache();
  var key = 'tk_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  var j = JSON.parse(res.getContentText() || '{}');
  if (!j.users || !j.users[0] || !j.users[0].email) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
  var info = { email: j.users[0].email.toLowerCase(), uid: j.users[0].localId };
  cache.put(key, JSON.stringify(info), 600);
  return info;
}

function who_(email) {
  var m = find_('회원', '이메일', email);
  return {
    email: email,
    name: m ? m['이름'] : '',
    school: m ? m['소속'] : '',
    status: m ? m['상태'] : '없음',
    admin: !!(m && m['상태'] === '승인' && m['역할'] === '운영진'),
    member: !!(m && m['상태'] === '승인'),
    hasPhone: !!(m && m['전화번호']),
    row: m
  };
}
function needMember_(u) { if (!u.member) throw new Error('승인된 회원만 쓸 수 있습니다.'); }
function needAdmin_(u) { if (!u.admin) throw new Error('운영진만 쓸 수 있습니다.'); }

/* ───────────── 진입점 ───────────── */

function doGet(e) {
  try {
    var a = (e && e.parameter && e.parameter.action) || 'publicList';
    if (a === 'publicList') return out_(publicList_());
    return out_({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var req = JSON.parse(e.postData.contents);
    var tk = verify_(req.token);
    var u = who_(tk.email);
    u.uid = tk.uid;
    var a = req.action, r;
    var writes = ['join','updateMe','upload','updateItem','uploadMs','removeMs','reviewMs','addSchedule','delSchedule','attend','addNotice','delNotice','pinNotice','addComment','delComment','judge','view'];
    if (writes.indexOf(a) >= 0) lock.waitLock(20000);
    switch (a) {
      case 'me': syncChat_(u); r = { me: meInfo_(u) }; break;
      case 'join': r = join_(u, req); break;
      case 'updateMe': r = updateMe_(u, req); break;
      case 'memberData': needMember_(u); r = memberData_(u); break;
      case 'view': r = view_(req.id); break;
      case 'getFile': r = getFile_(u, req); break;
      case 'upload': needMember_(u); r = upload_(u, req); break;
      case 'updateItem': needMember_(u); r = updateItem_(u, req); break;
      case 'uploadMs': needMember_(u); r = uploadMs_(u, req); break;
      case 'removeMs': needMember_(u); r = removeMs_(u, req); break;
      case 'reviewMs': needAdmin_(u); r = reviewMs_(req); break;
      case 'addSchedule': needAdmin_(u); r = addSchedule_(req); break;
      case 'delSchedule': needAdmin_(u); r = delSchedule_(req); break;
      case 'attend': needMember_(u); r = attend_(u, req); break;
      case 'addNotice': needAdmin_(u); r = addNotice_(u, req); break;
      case 'delNotice': needAdmin_(u); r = delNotice_(req); break;
      case 'pinNotice': needAdmin_(u); r = pinNotice_(req); break;
      case 'addComment': needMember_(u); r = addComment_(u, req); break;
      case 'delComment': needMember_(u); r = delComment_(u, req); break;
      case 'adminData': needAdmin_(u); r = adminData_(); break;
      case 'judge': needAdmin_(u); r = judge_(req); break;
      default: throw new Error('알 수 없는 요청: ' + a);
    }
    r.ok = true;
    return out_(r);
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ───────────── 자료 목록 ───────────── */

function itemOut_(r, full) {
  var o = {
    id: r.id, t: r['제목'], d: r['설명'],
    g: r['학년'] ? r['학년'].split(',') : [], a: r['영역'] ? r['영역'].split(',') : [],
    ty: r['종류'], m: r['공개범위'] === '회원', by: r['올린이'], sc: r['소속'], dt: r['등록일'],
    v: Number(r['조회'] || 0), src: r['참고자료'], hasFile: !!r['파일ID'], fname: r['파일이름']
  };
  if (!o.m || full) {
    o.link = r['링크'];
    if (r['파일ID'] && !o.m) o.url = 'https://drive.google.com/file/d/' + r['파일ID'] + '/view';
  }
  if (full) {
    o.mine = r['올린이메일'];
    if (r['원고파일ID']) o.ms = { pages: Number(r['원고쪽수'] || 0), st: r['원고상태'] === '검토완료' ? 'ok' : 'sub', dt: r['원고제출일'] };
  }
  return o;
}

function publicList_() {
  var items = rows_('자료').filter(function (r) { return r['상태'] !== '숨김'; }).map(function (r) { return itemOut_(r, false); });
  return { ok: true, updated: now_(), config: settings_(), items: items };
}

function memberData_(u) {
  var items = rows_('자료').filter(function (r) { return r['상태'] !== '숨김'; }).map(function (r) {
    var o = itemOut_(r, true);
    o.canEdit = u.admin || r['올린이메일'] === u.email;
    o.own = r['올린이메일'] === u.email;
    delete o.mine;
    return o;
  });
  var comments = rows_('댓글');
  var notices = rows_('공지').map(function (n) {
    return {
      id: n.id, t: n['제목'], body: n['내용'], by: n['작성자'], dt: n['작성일'], pin: n['고정'] === 'Y',
      cm: comments.filter(function (c) { return c['공지id'] === n.id; }).map(function (c) {
        return { id: c.id, by: c['작성자'], x: c['내용'], dt: c['작성일'], mine: c['작성자이메일'] === u.email };
      })
    };
  });
  var schedules = rows_('일정').map(function (s) {
    var att = s['참석'] ? s['참석'].split(',') : [];
    var names = att.map(function (em) { var m = find_('회원', '이메일', em); return m ? m['이름'] : em; });
    return { id: s.id, d: s['날짜'], tm: s['시간'], t: s['제목'], p: s['장소'], big: s['큰행사'] === 'Y', att: names, me: att.indexOf(u.email) >= 0 };
  });
  var members = rows_('회원').filter(function (m) { return m['상태'] === '승인'; }).map(function (m) {
    return { n: m['이름'], sc: m['소속'], book: m['책자이름동의'] === 'Y' };
  });
  return { items: items, notices: notices, schedules: schedules, members: members };
}

function view_(id) {
  var r = find_('자료', 'id', id);
  if (r) update_('자료', r, { '조회': Number(r['조회'] || 0) + 1 });
  return {};
}

/* ───────────── 회원 ───────────── */

function meInfo_(u) { return { email: u.email, name: u.name, school: u.school, status: u.status, admin: u.admin, member: u.member, hasPhone: u.hasPhone }; }

function join_(u, req) {
  if (u.row && u.status !== '보류') throw new Error('이미 가입 신청을 했습니다. (상태: ' + u.status + ')');
  var name = String(req.name || '').trim(), school = String(req.school || '').trim();
  if (!name || !school) throw new Error('이름과 소속을 적어 주세요.');
  ensureHeaders_('회원');
  var phone = phone_(req.phone);
  var data = { '이메일': u.email, '이름': name, '소속': school, '신청일': today_(), '상태': '대기', '역할': '회원',
    '책자이름동의': req.book ? 'Y' : 'N', '도명단동의': req.reg ? 'Y' : 'N', '처리일': '', '전화번호': phone };
  if (u.row) update_('회원', u.row, data); else append_('회원', data);
  return { me: meInfo_(who_(u.email)) };
}

function updateMe_(u, req) {
  if (!u.row) throw new Error('먼저 가입 신청을 해 주세요.');
  ensureHeaders_('회원');
  var patch = { '전화번호': phone_(req.phone) };
  if (req.reg != null) patch['도명단동의'] = req.reg ? 'Y' : 'N';
  update_('회원', u.row, patch);
  return { me: meInfo_(who_(u.email)) };
}

function adminData_() {
  ensureHeaders_('회원');
  var members = rows_('회원').map(function (m) {
    return { email: m['이메일'], n: m['이름'], sc: m['소속'], dt: m['신청일'], s: m['상태'], role: m['역할'], book: m['책자이름동의'] === 'Y', reg: m['도명단동의'] === 'Y', phone: m['전화번호'] || '' };
  });
  var log = rows_('내려받기').slice(-30).reverse().map(function (l) { return { at: l['일시'], n: l['이름'], t: l['자료제목'] }; });
  return { members: members, log: log, sheetUrl: ss_().getUrl() };
}

function judge_(req) {
  var m = find_('회원', '이메일', req.email);
  if (!m) throw new Error('회원을 찾지 못했습니다.');
  var folder = DriveApp.getFolderById(P_('MEM_ID'));
  if (req.status === '승인') { try { folder.addViewer(m['이메일']); } catch (e) {} }
  else { try { folder.removeViewer(m['이메일']); } catch (e) {} }
  var patch = { '상태': req.status, '처리일': today_() };
  if (req.role) patch['역할'] = req.role;
  update_('회원', m, patch);
  if (req.status !== '승인') unsyncChat_(m);
  else if (m['uid']) { try { rtdb_('put', '/members/' + m['uid'], { n: m['이름'], sc: m['소속'], admin: (req.role || m['역할']) === '운영진' }); } catch (e) {} }
  return adminData_();
}

/** 시트에서 직접 "상태"를 바꿨을 때 폴더 권한을 맞추려면 이 함수를 실행하세요. */
function syncMemberFolder() {
  var folder = DriveApp.getFolderById(P_('MEM_ID'));
  var viewers = folder.getViewers().map(function (v) { return v.getEmail().toLowerCase(); });
  rows_('회원').forEach(function (m) {
    var em = m['이메일'].toLowerCase(), has = viewers.indexOf(em) >= 0;
    if (m['상태'] === '승인' && !has) { try { folder.addViewer(em); } catch (e) {} }
    if (m['상태'] !== '승인' && has) { try { folder.removeViewer(em); } catch (e) {} }
    if (m['상태'] !== '승인') unsyncChat_(m);
  });
}

/* ───────────── 파일 ───────────── */

function decode_(b64, mime, name) {
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(MAX_UPLOAD_MB + 'MB 이하 파일만 올릴 수 있습니다.');
  return Utilities.newBlob(bytes, mime || 'application/octet-stream', name);
}

function upload_(u, req) {
  var it = req.item || {};
  if (!it.t) throw new Error('자료 이름을 적어 주세요.');
  var mem = it.scope === '회원';
  var id = uid_(), fileId = '', fname = '';
  if (req.b64) {
    var f = DriveApp.getFolderById(mem ? P_('MEM_ID') : P_('PUB_ID')).createFile(decode_(req.b64, req.mime, req.name));
    if (!mem) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileId = f.getId(); fname = req.name;
  } else if (!it.link) throw new Error('파일을 고르거나 링크를 적어 주세요.');
  append_('자료', {
    id: id, '제목': it.t, '설명': it.d || '', '학년': (it.g || []).join(','), '영역': (it.a || []).join(','), '종류': it.ty || '',
    '공개범위': mem ? '회원' : '공개', '파일ID': fileId, '파일이름': fname, '링크': it.link || '', '참고자료': it.src || '',
    '올린이메일': u.email, '올린이': u.name, '소속': u.school, '등록일': today_(), '조회': 0, '상태': '게시'
  });
  refreshSite_();
  return { id: id };
}

function canEdit_(u, r) { return u.admin || r['올린이메일'] === u.email; }

function updateItem_(u, req) {
  var r = find_('자료', 'id', req.id);
  if (!r) throw new Error('자료를 찾지 못했습니다.');
  if (!canEdit_(u, r)) throw new Error('올린 선생님이나 운영진만 바꿀 수 있습니다.');
  var patch = {};
  if (req.scope && req.scope !== r['공개범위']) {
    patch['공개범위'] = req.scope;
    if (r['파일ID']) {
      var f = DriveApp.getFileById(r['파일ID']);
      if (req.scope === '회원') { f.moveTo(DriveApp.getFolderById(P_('MEM_ID'))); f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); }
      else { f.moveTo(DriveApp.getFolderById(P_('PUB_ID'))); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    }
  }
  if (req.hide) patch['상태'] = '숨김';
  if (req.edit) {
    var e = req.edit;
    if (!e.t) throw new Error('자료 이름을 적어 주세요.');
    patch['제목'] = e.t; patch['설명'] = e.d || ''; patch['학년'] = (e.g || []).join(','); patch['영역'] = (e.a || []).join(',');
    patch['종류'] = e.ty || ''; patch['참고자료'] = e.src || ''; patch['링크'] = e.link || '';
    var mem = (patch['공개범위'] || r['공개범위']) === '회원';
    var oldId = r['파일ID'];
    if (req.b64) {
      var nf = DriveApp.getFolderById(mem ? P_('MEM_ID') : P_('PUB_ID')).createFile(decode_(req.b64, req.mime, req.name));
      if (!mem) nf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      patch['파일ID'] = nf.getId(); patch['파일이름'] = req.name;
      if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (x) {} }
    } else if (e.removeFile && oldId) {
      try { DriveApp.getFileById(oldId).setTrashed(true); } catch (x) {}
      patch['파일ID'] = ''; patch['파일이름'] = '';
    }
    var hasFile = ('파일ID' in patch) ? !!patch['파일ID'] : !!oldId;
    if (!hasFile && !e.link) throw new Error('파일이나 링크가 하나는 있어야 합니다.');
  }
  update_('자료', r, patch);
  refreshSite_();
  return {};
}

function logDownload_(u, r) {
  append_('내려받기', { '일시': now_(), '이메일': u.email, '이름': u.name || u.email, '자료id': r.id, '자료제목': r['제목'] });
}

function getFile_(u, req) {
  var r = find_('자료', 'id', req.id);
  if (!r || r['상태'] === '숨김') throw new Error('자료를 찾지 못했습니다.');
  var fid;
  if (req.kind === 'ms') { needMember_(u); fid = r['원고파일ID']; }
  else { if (r['공개범위'] === '회원') needMember_(u); fid = r['파일ID']; }
  if (!fid) throw new Error('파일이 없습니다.');
  var f = DriveApp.getFileById(fid), blob = f.getBlob();
  if (req.kind !== 'ms') logDownload_(u, r);
  var isPdf = blob.getContentType() === 'application/pdf';
  if (req.kind === 'ms' || (isPdf && f.getSize() < 25 * 1024 * 1024)) {
    return { name: f.getName(), mime: blob.getContentType(), b64: Utilities.base64Encode(blob.getBytes()) };
  }
  return { name: f.getName(), url: 'https://drive.google.com/file/d/' + fid + '/view' };
}

function uploadMs_(u, req) {
  var r = find_('자료', 'id', req.id);
  if (!r) throw new Error('자료를 찾지 못했습니다.');
  if (!canEdit_(u, r)) throw new Error('올린 선생님이나 운영진만 원고를 올릴 수 있습니다.');
  if (r['원고파일ID']) { try { DriveApp.getFileById(r['원고파일ID']).setTrashed(true); } catch (e) {} }
  var f = DriveApp.getFolderById(P_('MS_ID')).createFile(decode_(req.b64, 'application/pdf', '[원고] ' + r['제목'] + '.pdf'));
  update_('자료', r, { '원고파일ID': f.getId(), '원고쪽수': Number(req.pages || 0), '원고상태': '제출', '원고제출일': today_() });
  return {};
}
function removeMs_(u, req) {
  var r = find_('자료', 'id', req.id);
  if (!r || !canEdit_(u, r)) throw new Error('원고를 뺄 수 없습니다.');
  if (r['원고파일ID']) { try { DriveApp.getFileById(r['원고파일ID']).setTrashed(true); } catch (e) {} }
  update_('자료', r, { '원고파일ID': '', '원고쪽수': '', '원고상태': '', '원고제출일': '' });
  return {};
}
function reviewMs_(req) {
  var r = find_('자료', 'id', req.id);
  if (!r) throw new Error('자료를 찾지 못했습니다.');
  update_('자료', r, { '원고상태': req.ok ? '검토완료' : '제출' });
  return {};
}

/* ───────────── 일정 · 공지 · 댓글 ───────────── */

function addSchedule_(req) {
  if (!req.t || !/^\d{4}-\d{2}-\d{2}$/.test(req.d || '')) throw new Error('제목과 날짜를 확인해 주세요.');
  append_('일정', { id: uid_(), '날짜': req.d, '시간': req.tm || '', '제목': req.t, '장소': req.p || '', '큰행사': req.big ? 'Y' : 'N', '참석': '' });
  return {};
}
function delSchedule_(req) { var s = find_('일정', 'id', req.id); if (s) deleteRow_('일정', s); return {}; }
function attend_(u, req) {
  var s = find_('일정', 'id', req.id);
  if (!s) throw new Error('일정을 찾지 못했습니다.');
  var att = s['참석'] ? s['참석'].split(',') : [], i = att.indexOf(u.email);
  if (i < 0) att.push(u.email); else att.splice(i, 1);
  update_('일정', s, { '참석': att.join(',') });
  return {};
}
function addNotice_(u, req) {
  if (!req.t || !req.body) throw new Error('제목과 내용을 적어 주세요.');
  append_('공지', { id: uid_(), '제목': req.t, '내용': req.body, '작성자': '운영진', '작성일': today_(), '고정': req.pin ? 'Y' : 'N' });
  return {};
}
function delNotice_(req) { var n = find_('공지', 'id', req.id); if (n) deleteRow_('공지', n); return {}; }
function pinNotice_(req) { var n = find_('공지', 'id', req.id); if (n) update_('공지', n, { '고정': n['고정'] === 'Y' ? 'N' : 'Y' }); return {}; }
function addComment_(u, req) {
  var x = String(req.x || '').trim();
  if (!x) throw new Error('댓글을 적어 주세요.');
  append_('댓글', { id: uid_(), '공지id': req.nid, '작성자이메일': u.email, '작성자': u.name, '내용': x.slice(0, 500), '작성일': today_() });
  return {};
}
function delComment_(u, req) {
  var c = find_('댓글', 'id', req.id);
  if (!c) return {};
  if (!u.admin && c['작성자이메일'] !== u.email) throw new Error('내 댓글만 지울 수 있습니다.');
  deleteRow_('댓글', c);
  return {};
}

/* ───────────── 대화(파이어베이스 실시간 DB) 허용 명단 ───────────── */
// 스크립트 속성: FIREBASE_DB_URL (예: https://jbpe-hub-default-rtdb.asia-southeast1.firebasedatabase.app)
//                FIREBASE_DB_SECRET (파이어베이스 프로젝트 설정 → 서비스 계정 → 데이터베이스 비밀번호)
function rtdb_(method, path, body) {
  var url = P_('FIREBASE_DB_URL'), secret = P_('FIREBASE_DB_SECRET');
  if (!url || !secret) return null;
  var opt = { method: method, muteHttpExceptions: true, contentType: 'application/json' };
  if (body !== undefined) opt.payload = JSON.stringify(body);
  return UrlFetchApp.fetch(url.replace(/\/$/, '') + path + '.json?auth=' + encodeURIComponent(secret), opt);
}
function syncChat_(u) {
  if (!u.uid || !u.row) return;
  if (u.row['uid'] !== u.uid) { ensureHeaders_('회원'); update_('회원', u.row, { uid: u.uid }); }
  var cache = CacheService.getScriptCache(), key = 'rt_' + u.uid + '_' + (u.member ? (u.admin ? 'a' : 'm') : 'x');
  if (cache.get(key)) return;
  try {
    if (u.member) rtdb_('put', '/members/' + u.uid, { n: u.name, sc: u.school, admin: u.admin });
    else rtdb_('delete', '/members/' + u.uid);
    cache.put(key, '1', 21600);
  } catch (e) {}
}
function unsyncChat_(m) {
  if (m && m['uid']) { try { rtdb_('delete', '/members/' + m['uid']); } catch (e) {} }
}

/* ───────────── 사이트 자동 갱신 (GitHub) ───────────── */

function refreshSite_() {
  var token = P_('GITHUB_TOKEN'), repo = settings_().repo;
  if (!token || !repo) return;
  try {
    UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
      payload: JSON.stringify({ event_type: 'refresh' })
    });
  } catch (e) {}
}

/** 시트에서 자료를 직접 고쳤을 때 사이트를 바로 새로 고치려면 이 함수를 실행하세요. */
function refreshSiteNow() { refreshSite_(); Logger.log('사이트 새로 고침 신호를 보냈습니다. 1~2분 뒤 반영됩니다.'); }
