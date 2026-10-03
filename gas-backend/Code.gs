/* ========================================================================
   신천중부교회 QT인증 집계 — Google Apps Script 백엔드
   배포 방법은 이 저장소의 gas-backend/README.md 참고.
   이 파일은 버전관리용 사본입니다 — 실제로는 Apps Script 에디터에 붙여넣어
   실행합니다. 수정 후에는 반드시 "배포 > 배포 관리 > 새 버전"으로
   갱신해야 /exec 엔드포인트에 반영됩니다.
   ======================================================================== */

/* ---------------- 시트 스키마 ---------------- */
var SHEETS = {
  Roster:        ['name', 'note'],
  Mapping:       ['displayName', 'realName'],
  Excluded:      ['displayName'],
  PhotoExcluded: ['displayName'],
  Settings:      ['key', 'value'],
  Records:       ['date', 'name', 'present'],
  ManualOverrides: ['date', 'name', 'value'],
  Readings:      ['date', 'text', 'cachedAt', 'source']
};

/* 구글시트는 "2026-08-23"처럼 날짜로 보이는 문자열을 셀에 넣으면 자동으로 날짜형으로
   바꿔버려서, 나중에 읽어올 때 Date 객체(예: "Sun Aug 23 2026 00:00:00 GMT+0900...")로
   깨져 나온다. date 컬럼은 서식을 텍스트('@')로 고정해 항상 원래 문자열 그대로 저장/조회되게 한다. */
var DATE_COLUMNS = {
  Records: [1],
  ManualOverrides: [1],
  Readings: [1, 3]
};

function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headers = SHEETS[name];
    var range = sheet.getRange(1, 1, 1, headers.length);
    var existing = range.getValues()[0];
    var needsHeader = headers.some(function (h, i) { return existing[i] !== h; });
    if (needsHeader) range.setValues([headers]);
    (DATE_COLUMNS[name] || []).forEach(function (col) {
      sheet.getRange(1, col, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
  });
  // 기본 시트("시트1" 등)가 남아있고 비어있으면 정리
  var defaultSheet = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
}

/* ---------------- 진입점 ---------------- */
function doGet(e) {
  if (e && e.parameter && e.parameter.ping) {
    return respond({ ok: true, message: 'QT backend alive' });
  }
  return respond({ ok: false, error: 'BAD_REQUEST', message: 'POST를 사용하세요' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: 'BAD_REQUEST', message: '잘못된 요청 본문' });
  }

  var action = body.action || '';
  if (!checkAccessCode(body.code)) {
    return respond({ ok: false, action: action, error: 'UNAUTHORIZED', message: '접근 코드가 올바르지 않습니다.' });
  }

  try {
    var data;
    switch (action) {
      case 'fetchAll':
        data = fetchAllData();
        break;
      case 'pushAll':
        data = pushAllData(body.payload);
        break;
      case 'getReading':
        data = getReading(body.date);
        break;
      case 'setReading':
        data = setReading(body.date, body.text);
        break;
      default:
        return respond({ ok: false, action: action, error: 'BAD_REQUEST', message: '알 수 없는 action: ' + action });
    }
    return respond({ ok: true, action: action, data: data });
  } catch (err) {
    return respond({ ok: false, action: action, error: 'INTERNAL_ERROR', message: String(err) });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkAccessCode(code) {
  var expected = PropertiesService.getScriptProperties().getProperty('ACCESS_CODE');
  return !!expected && code === expected;
}

/* ---------------- 시트 입출력 유틸 ---------------- */
function getSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + name + ' (setupSheets를 먼저 실행하세요)');
  return sheet;
}

function readSheet_(name) {
  var sheet = getSheet_(name);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).filter(function (row) { return row.some(function (c) { return c !== '' && c !== null; }); });
}

function writeSheet_(name, headers, rows) {
  var sheet = getSheet_(name);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

/* ---------------- 전체 동기화 ---------------- */
function fetchAllData() {
  var roster = readSheet_('Roster').map(function (r) { return { name: String(r[0] || ''), note: String(r[1] || '') }; });
  var mapping = {};
  readSheet_('Mapping').forEach(function (r) { mapping[String(r[0])] = String(r[1] || ''); });
  var excluded = readSheet_('Excluded').map(function (r) { return String(r[0]); });
  var photoExcluded = readSheet_('PhotoExcluded').map(function (r) { return String(r[0]); });

  var settingsRows = readSheet_('Settings');
  var settings = { threshold: 20, roomName: '' };
  settingsRows.forEach(function (r) {
    if (r[0] === 'threshold') settings.threshold = Number(r[1]) || 20;
    if (r[0] === 'roomName') settings.roomName = String(r[1] || '');
  });

  var records = {};
  readSheet_('Records').forEach(function (r) {
    var date = String(r[0]), name = String(r[1]), present = !!r[2];
    if (!records[date]) records[date] = {};
    records[date][name] = present;
  });

  var manualOverrides = {};
  var manualOverridesSheet = SpreadsheetApp.getActive().getSheetByName('ManualOverrides');
  if (manualOverridesSheet) {
    readSheet_('ManualOverrides').forEach(function (r) {
      var date = String(r[0]), name = String(r[1]), value;
      if (r[2] === 'blank' || r[2] === null || r[2] === '') value = null;
      else if (r[2] === true || String(r[2]).toLowerCase() === 'true') value = true;
      else value = false;
      if (!manualOverrides[date]) manualOverrides[date] = {};
      manualOverrides[date][name] = value;
    });
  }

  var readings = {};
  readSheet_('Readings').forEach(function (r) {
    readings[String(r[0])] = String(r[1] || '');
  });

  return {
    roster: roster,
    mapping: mapping,
    excluded: excluded,
    photoExcluded: photoExcluded,
    settings: settings,
    records: records,
    manualOverrides: manualOverrides,
    readings: readings
  };
}

function pushAllData(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('EMPTY_PAYLOAD');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    writeSheet_('Roster', SHEETS.Roster, (payload.roster || []).map(function (r) { return [r.name || '', r.note || '']; }));
    writeSheet_('Mapping', SHEETS.Mapping, Object.keys(payload.mapping || {}).map(function (k) { return [k, payload.mapping[k]]; }));
    writeSheet_('Excluded', SHEETS.Excluded, (payload.excluded || []).map(function (n) { return [n]; }));
    writeSheet_('PhotoExcluded', SHEETS.PhotoExcluded, (payload.photoExcluded || []).map(function (n) { return [n]; }));

    var settings = payload.settings || {};
    var nowIso = new Date().toISOString();
    writeSheet_('Settings', SHEETS.Settings, [
      ['threshold', settings.threshold != null ? settings.threshold : 20],
      ['roomName', settings.roomName || ''],
      ['lastSyncedAt', nowIso]
    ]);

    var recordRows = [];
    var records = payload.records || {};
    Object.keys(records).forEach(function (date) {
      var byName = records[date] || {};
      Object.keys(byName).forEach(function (name) {
        recordRows.push([date, name, !!byName[name]]);
      });
    });
    writeSheet_('Records', SHEETS.Records, recordRows);

    var manualOverrideRows = [];
    var manualOverrides = payload.manualOverrides || {};
    Object.keys(manualOverrides).forEach(function (date) {
      var byName = manualOverrides[date] || {};
      Object.keys(byName).forEach(function (name) {
        var value = byName[name];
        manualOverrideRows.push([date, name, value === null ? 'blank' : !!value]);
      });
    });
    if (!SpreadsheetApp.getActive().getSheetByName('ManualOverrides')) {
      var manualOverridesSheet = SpreadsheetApp.getActive().insertSheet('ManualOverrides');
      manualOverridesSheet.getRange(1, 1, manualOverridesSheet.getMaxRows(), 1).setNumberFormat('@');
    }
    writeSheet_('ManualOverrides', SHEETS.ManualOverrides, manualOverrideRows);

    var readingRows = [];
    var readings = payload.readings || {};
    Object.keys(readings).forEach(function (date) {
      readingRows.push([date, readings[date], nowIso, 'manual']);
    });
    writeSheet_('Readings', SHEETS.Readings, readingRows);

    return { updatedAt: nowIso };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- 오늘의 QT 본문 ---------------- */
var READING_SOURCE_URL = 'https://sum.su.or.kr:8888/bible/today';
var READING_PATTERN = /본문\s*[:：]\s*([가-힣]+)\s*(?:\([^)]*\))?\s*(\d+\s*:\s*\d+(?:\s*-\s*\d+\s*:\s*\d+)?)\s*찬송가/;

function parseReadingText_(text) {
  var m = READING_PATTERN.exec(text);
  if (!m) return null;
  return m[1] + ' ' + m[2].replace(/\s+/g, '');
}

function findReadingRow_(date) {
  var sheet = getSheet_('Readings');
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === date) return { row: i + 1, data: values[i] };
  }
  return null;
}

function getReading(date) {
  if (!date) throw new Error('DATE_REQUIRED');
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var existing = findReadingRow_(date);

  if (existing) {
    var source = existing.data[3];
    var cachedAt = existing.data[2];
    var cachedDate = cachedAt ? Utilities.formatDate(new Date(cachedAt), 'Asia/Seoul', 'yyyy-MM-dd') : null;
    if (source === 'manual' || (source === 'auto' && date === today && cachedDate === today)) {
      return { reading: existing.data[1], cached: true };
    }
  }

  if (date !== today) {
    // 오늘이 아닌 과거 날짜는 스크래핑 대상이 아님 — 캐시가 없으면 실패 처리
    return { ok: false, error: 'NOT_FOUND' };
  }

  var res = UrlFetchApp.fetch(READING_SOURCE_URL, { muteHttpExceptions: true });
  var reading = parseReadingText_(res.getContentText());
  if (!reading) return { ok: false, error: 'FETCH_FAILED' };

  upsertReadingRow_(date, reading, 'auto');
  return { reading: reading, cached: false };
}

function setReading(date, text) {
  if (!date) throw new Error('DATE_REQUIRED');
  upsertReadingRow_(date, text || '', 'manual');
  return { ok: true };
}

function upsertReadingRow_(date, text, source) {
  var sheet = getSheet_('Readings');
  var nowIso = new Date().toISOString();
  var existing = findReadingRow_(date);
  if (existing) {
    sheet.getRange(existing.row, 1, 1, 4).setValues([[date, text, nowIso, source]]);
  } else {
    sheet.appendRow([date, text, nowIso, source]);
  }
}

/* ---------------- (선택) 매일 아침 캐시 예열용 트리거 ---------------- */
function cacheTodayReading() {
  var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  try { getReading(today); } catch (e) { /* 조용히 무시 — 다음 사용자 요청 때 재시도됨 */ }
}
