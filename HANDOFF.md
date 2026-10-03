# QT 인증 집계 PWA — 현재 상태 인수인계

이 문서는 변경 이력이나 작업 일지가 아니라, 다음 작업자가 현재 저장소에서 바로 이어서 작업하기 위한 현재 상태 설명이다. 아래 내용은 현재 working tree의 실제 코드와 Git 메타데이터를 기준으로 한다.

## 1. 프로젝트 목적과 구조

신천중부교회 카카오톡 QT 대화 내보내기 파일을 분석해 구성원별 QT 인증 여부를 날짜별로 집계하고, 월간 묵상 나눔표를 PDF·PNG·CSV로 내보내는 정적 단일 페이지 PWA다.

- 별도 빌드 과정, 패키지 관리자, 테스트 러너는 없다.
- 브라우저가 루트의 `index.html`을 직접 실행한다.
- 명단·자동 기록·수동 정정·본문 등은 `localStorage`에 저장한다.
- Google Apps Script(GAS)와 Google Sheets를 통해 여러 기기 간 전체 데이터를 동기화한다.

```text
.
├── index.html
├── sw.js
├── manifest.json
├── _headers
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png
├── DESIGN.md
├── QT인증도우미_PRD.md
├── HANDOFF.md
└── gas-backend/
    ├── Code.gs
    └── README.md
```

## 2. 현재 Git 및 배포 상태

- Branch: `main`
- HEAD: `f96acba` (`Merge previous QT project history`)
- Upstream: `origin/main`
- 현재 `main`과 `origin/main`은 같은 커밋을 가리킨다.
- 현재 working tree에는 아직 커밋하지 않은 기능 수정이 있다.

현재 기능 수정 파일:

```text
M gas-backend/Code.gs
M gas-backend/README.md
M index.html
```

이 `HANDOFF.md`를 갱신하면 문서도 modified 상태가 된다. 기존 수정은 사용자의 작업물이므로 임의로 reset하거나 checkout하지 말 것.

현재 프런트엔드는 Netlify 프로덕션 `https://scc-qt-5a9b16.netlify.app`에 배포되어 있다. 저장소의 `Code.gs` 변경은 Netlify 배포와 별개이며, Apps Script 에디터에 반영하고 새 버전으로 재배포해야 실제 GAS `/exec` 엔드포인트에 적용된다. 현재 실제 GAS 배포본이 저장소의 최신 `Code.gs`와 같은지는 별도로 확인해야 한다.

## 3. 주요 파일 역할

### `index.html`

HTML, CSS, 애플리케이션 JavaScript가 모두 포함된 단일 페이지 앱이다.

- 카카오톡 TXT/CSV 파싱
- 발신자-실명 매핑과 명단 관리
- 날짜 보정과 인증 판정
- 자동 분석 records와 수동 정정 manualOverrides 관리
- localStorage 및 JSON 백업·복원
- GAS 전체 push/pull
- 월간 표와 PDF·PNG·CSV 내보내기
- Service Worker 등록

외부 CDN에서 Pretendard, html2canvas, jsPDF, GSAP, ScrollTrigger, Flip을 불러온다.

### `gas-backend/Code.gs`

Google Sheets에 바인딩해 사용하는 Apps Script 백엔드의 버전관리용 사본이다.

- `fetchAll`
- `pushAll`
- `getReading`
- `setReading`
- `setupSheets`

접근 코드는 Script Properties의 `ACCESS_CODE`와 비교한다.

### PWA 파일

- `sw.js`: 앱 셸 precache, navigation network-first, 정적 파일 cache-first, 외부 CDN network-first
- `manifest.json`: PWA 이름, scope, standalone, portrait, 아이콘 정의
- `_headers`: Netlify에서 manifest와 Service Worker의 Content-Type 및 no-cache 설정

Service Worker 캐시 이름은 `sinchun-qt-pwa-v2`다. 정적 파일이나 캐시 전략 변경 시 기존 사용자에게 새 파일이 전달되는지 함께 확인해야 한다.

## 4. 핵심 데이터 구조

### localStorage

| 키 | 역할 |
|---|---|
| `qt_roster` | `{ name, note }` 명단 배열 |
| `qt_mapping` | 카카오톡 표시 이름 → 실명 |
| `qt_excluded` | 집계 제외 이름 배열 |
| `qt_photoExcluded` | 사진 자동 인정 제외 이름 배열 |
| `qt_settings` | `threshold`, `roomName` |
| `qt_records` | 자동 분석 결과 |
| `qt_manualOverrides` | 월간 표에서 사용자가 수동 정정한 값 |
| `qt_readings` | 날짜별 성경 본문 |
| `qt_lastChatText` | 누적 카카오톡 원문 |
| `qt_backendUrl` | GAS 웹앱 URL |
| `qt_accessCode` | GAS 접근 코드 |
| `qt_lastSyncedAt` | 마지막 동기화 시각 |

자동 분석 결과:

```js
records[date][name] = boolean;
```

수동 정정:

```js
manualOverrides[date][name] = true;  // 수동 O
manualOverrides[date][name] = false; // 수동 -
manualOverrides[date][name] = null;  // 수동 빈칸
```

- override 키 없음: 자동 `records` 값 사용
- override 키 있음: 값이 `true`, `false`, `null` 중 무엇이든 자동값보다 우선
- `null`은 수동 빈칸이며 키 삭제와 의미가 다르다.
- JSON과 localStorage의 `JSON.stringify`/`JSON.parse` round-trip에서 객체 속성의 `null`이 유지된다.

### JSON 백업

현재 백업 schema는 version 2다.

```text
schemaVersion: 2
app: "sinchun-qt-checkin"
data:
  roster
  mapping
  excluded
  photoExcluded
  settings
  records
  manualOverrides
  readings
```

schema 1 백업 또는 `manualOverrides`가 없는 payload는 빈 객체로 안전하게 복원한다. 카카오톡 원문, backend 설정, 마지막 동기화 시각은 백업 payload에 포함하지 않는다.

### GAS / Google Sheets

| Sheet | Columns |
|---|---|
| `Roster` | `name`, `note` |
| `Mapping` | `displayName`, `realName` |
| `Excluded` | `displayName` |
| `PhotoExcluded` | `displayName` |
| `Settings` | `key`, `value` |
| `Records` | `date`, `name`, `present` |
| `ManualOverrides` | `date`, `name`, `value` |
| `Readings` | `date`, `text`, `cachedAt`, `source` |

`ManualOverrides.value` 저장 방식:

- boolean `TRUE`: 수동 O
- boolean `FALSE`: 수동 -
- 문자열 `blank`: 수동 빈칸

기존 `present` 헤더와 boolean 값으로 저장된 ManualOverrides 데이터도 열 위치를 기준으로 읽어 하위 호환한다. 시트가 없으면 `fetchAll`은 빈 객체를 반환하고, 첫 `pushAll`에서 시트를 자동 생성한다. `setupSheets()`를 다시 실행해 미리 생성할 수도 있다.

## 5. 카카오톡 파싱과 다중 날짜 블록

### 기본 파싱

- CSV는 `Date,User,Message` 헤더를 감지하고 RFC4180 형태의 따옴표·쉼표·메시지 내부 줄바꿈을 처리한다.
- TXT는 한국어 전체 날짜 헤더, 점 표기 날짜 헤더, 날짜 구분선, 날짜 전용 행, 시간 메시지, 대괄호 메시지 형식을 처리한다.
- 인식되지 않은 비어 있지 않은 행은 시스템 메시지가 아니면 직전 메시지의 연속 줄로 붙인다.

### 한 메시지 안의 여러 QT 날짜

`parseChat()` 이후 `analyzeAllDates()`에 들어가기 전에 `splitMessageDateBlocks()`가 각 메시지를 검사한다.

- 반드시 줄 시작의 날짜 + `[성경본문]` 패턴만 헤더로 본다.
- 대괄호 안에는 `숫자:` 또는 `숫자장` 형태의 장 표기가 있어야 한다.
- 지원 예: `8/25[이사야34:1-17]`, `8/25 [이사야34:1-17]`, `8월 25일 [이사야34:1-17]`
- 헤더가 메시지 안에 2개 이상일 때만 가상 메시지로 분리한다.
- 각 블록은 현재 헤더 시작부터 다음 헤더 직전까지이며, 마지막 블록은 메시지 끝까지다.
- sender, 원래 카카오톡 게시일 등 기존 메시지 속성은 그대로 복사한다.
- 단일 헤더 메시지는 원래 메시지 객체를 그대로 반환한다.
- 일반 본문의 `8/25` 같은 숫자는 줄 시작의 날짜+본문 헤더 조건을 만족하지 않으므로 분리하지 않는다.

분리된 각 블록은 기존 `resolveMessageDate()`를 독립적으로 통과한다. `detectExplicitDate()`와 `detectPassageDate()` 자체는 변경하지 않았다.

```text
parseChat
  ↓ flatMap(splitMessageDateBlocks)
날짜별 가상 메시지
  ↓ resolveMessageDate
명시 날짜 → 본문 기반 날짜 → 원래 게시일
  ↓ analyzeAllDates
records[date][name]
```

## 6. 날짜 보정과 인증 판정

- 메시지 안의 `M/D`, `M.D`, `M월 D일` 명시 날짜를 게시일보다 우선 사용한다.
- 게시일보다 미래인 명시 날짜는 무시한다.
- 명시 날짜가 없으면 저장된 날짜별 성경 본문과 책·장 일치 점수로 날짜를 추정한다.
- 여러 본문 날짜가 일치하면 게시일에 가장 가까운 날짜를 선택한다.
- 사진 메시지, 공지, 링크 전용 메시지, 최소 글자 수, 사진 제외 목록이 완료 판정에 함께 작용한다.
- `사진 N장`은 해당 판정 날짜부터 이전 N일을 완료로 보충한다.
- 미래 날짜 records는 초기화 시 정리한다.

다중 날짜 분리는 각 블록을 기존 날짜 보정에 전달할 뿐, 미래 날짜 방지·본문 추정·사진 보충 로직을 변경하지 않는다.

## 7. 자동 분석과 수동 정정

`analyzeAllDates()`는 자동 분석 결과인 `state.records`만 갱신하고 저장한다. `state.manualOverrides`는 수정하지 않는다.

표시값은 공통 조회 경로에서 다음 순서로 결정한다.

```text
manualOverrides에 이름 키가 있음
  ├─ true  → O
  ├─ false → -
  └─ null  → 빈칸
키가 없음
  └─ records 자동 분석값 사용
```

월간 날짜 셀 클릭은 override 상태를 다음처럼 순환한다.

```text
키 없음 → true → false → null → true
              O      -      빈칸
```

따라서 자동값이 `true`, `false`, 없음 중 무엇이든 반복 클릭 결과는 수동 `O → - → 빈칸 → O`가 된다. 자동값이 이미 O인 셀의 첫 클릭은 화면은 O로 같지만 상태는 자동 O에서 수동 O로 바뀐다.

수동값 우선 규칙은 다음에 공통 적용된다.

- 월간 표 화면
- 날짜별 결과 화면
- 출석률과 연속일수
- PDF
- PNG
- CSV

`null`은 통계에서 기록 없는 빈칸으로 처리한다. 명단 이름 변경 시 mapping과 자동 records뿐 아니라 `manualOverrides`의 `true`/`false`/`null` 키도 함께 이동한다.

## 8. 저장·복원·동기화

### 자동 push/pull

- 각 `save*()`는 localStorage에 즉시 저장한 뒤 2초 debounce 자동 push를 예약한다.
- backend가 설정되어 있으면 초기 pull 완료 후 15초마다 자동 pull을 시도한다.
- 자동 pull은 문서가 hidden 상태이거나 input/textarea/contenteditable 편집 중이면 건너뛴다.
- `syncBusy`로 push와 pull을 상호 배제한다.
- pull 복원 중에는 `suppressAutoSync`로 되받아 보내기를 막는다.
- GAS `pushAllData()`는 Sheet 전체를 교체하며 병합하지 않는다.

### 진행 중 pull 경쟁 보호

로컬 변경마다 `localRevision`을 증가시키고 `localDirty`를 설정한다. `runPull()`은 요청 시작 시 revision을 캡처한 뒤 `fetchAll` 응답 도착 시 다음을 다시 검사한다.

```text
localRevision이 시작 시점과 다름
또는 localDirty === true
또는 autoPushTimer가 존재함
  → 서버 응답 폐기
  → restoreLocalBackup 실행 안 함
  → pending push 유지
```

따라서 fetch 요청이 진행 중일 때 셀을 수정해도 늦게 도착한 서버 응답이 로컬 값을 덮지 않는다. 사용자가 확인창에서 명시적으로 수동 가져오기를 선택한 경우에만 기존 dirty 상태를 포기한다.

### 동기화 배포 주의

새 프런트엔드와 구버전 GAS를 함께 사용하면 구버전은 `manualOverrides`를 저장하지 않는다. 이후 pull에서 수동 정정이 사라질 수 있으므로 저장소의 최신 `Code.gs`를 실제 Apps Script에 반영하고 새 버전으로 재배포해야 한다.

두 브라우저의 동시 편집에 revision 기반 서버 conflict resolution은 없다. push는 전체 교체이고 마지막 write가 앞선 데이터를 덮을 수 있다.

## 9. 강하게 연결된 로직과 회귀 주의사항

- `roster`, `mapping`, `records`, `manualOverrides`: 이름 변경 시 모든 이름 키를 함께 이동해야 한다.
- `readings`와 날짜 보정: 본문 문자열 형식을 바꾸면 인증 날짜가 달라질 수 있다.
- `splitMessageDateBlocks`와 `resolveMessageDate`: 분리는 블록 경계만 담당하고 날짜 확정은 기존 함수가 담당한다.
- `records`와 `manualOverrides`: 자동 분석은 records만 수정하고 모든 표시·통계는 override를 우선해야 한다.
- `index.html`과 `Code.gs`: payload 필드와 ManualOverrides 직렬화 규칙을 양쪽에서 함께 유지해야 한다.
- `runPull`, `scheduleAutoPush`, `localRevision`, `localDirty`, `autoPushTimer`: 하나만 분리해 수정하면 진행 중 pull이 로컬 변경을 덮을 수 있다.
- `index.html`, `sw.js`, `manifest.json`: 경로와 캐시 전략이 연결되어 있다.

## 10. 현재 확인된 제한과 위험

- GAS 접근 URL과 기본 접근 코드가 프런트엔드 상수에 포함되어 있다. 운영 보안 정책과 일치하는지 별도 확인이 필요하다.
- GAS 동기화는 전체 교체이며 여러 관리자의 동시 수정 충돌 해결이 없다.
- 카카오톡 누적 원문 중복 방지는 새 텍스트 전체 포함 여부만 확인한다. 일부 겹치는 증분 파일을 메시지 단위로 deduplicate하지 않는다.
- CSV는 이름과 비고의 쉼표·큰따옴표·줄바꿈을 RFC4180 방식으로 escape하지 않는다.
- 외부 CDN은 첫 성공 응답 뒤 캐시된다. 최초 오프라인 실행에서는 CDN 의존성이 없을 수 있다.
- 테스트 코드, lint, CI, 자동 브라우저 테스트는 없다.
- Bento 갤러리 8칸은 실제 사진이 아니라 임시 그라디언트 플레이스홀더다.

## 11. 다음 작업 전 회귀 테스트

### 파싱과 날짜

- 실제 카카오톡 TXT/CSV 샘플 파싱
- 단일 날짜 QT 메시지가 이전과 동일하게 집계되는지 확인
- 한 메시지의 `8/25[...]`, `8/24[...]`가 두 날짜로 집계되는지 확인
- `8월 25일 [...]` 다중 헤더 확인
- 일반 본문의 날짜 숫자가 블록으로 분리되지 않는지 확인
- 미래 날짜 명시가 기존처럼 차단되는지 확인
- 본문 기반 날짜 보정과 `사진 N장` 보충 확인

### 수동값

- 자동값 true, false, 없음 각각에서 4회 클릭 결과 확인
- 수동 O, -, 빈칸이 재분석과 새로고침 후 유지되는지 확인
- JSON backup/restore에서 `null` 유지 확인
- 이름 변경 후 manualOverrides 키 이동 확인
- PDF·PNG·CSV 및 통계에서 수동 빈칸 확인

### 동기화

- 실제 GAS에 최신 `Code.gs`가 재배포됐는지 확인
- `ManualOverrides` 시트의 TRUE/FALSE/blank round-trip 확인
- 진행 중 fetchAll과 셀 클릭을 겹쳐 응답이 폐기되는지 확인
- push 실패, 수동 pull, backend 설정 변경 경로 확인
- 두 브라우저 동시 편집 시 전체 교체 위험 확인

### PWA와 내보내기

- 온라인 최초 방문 후 오프라인 재실행
- Service Worker 업데이트 전달
- 긴 명단과 31일 월 PDF/PNG 전체 캡처
- CSV 특수문자 입력 시 Excel/Google Sheets 결과 확인
