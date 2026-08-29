# QT 인증 집계 PWA — 현재 상태 인수인계

이 문서는 변경 이력이나 작업 일지가 아니라, 다음 작업자가 현재 저장소를 처음 열었을 때 바로 이어서 작업하기 위한 현재 상태 설명이다. 아래 내용은 현재 작업 트리의 실제 파일과 Git 메타데이터를 기준으로 한다.

## 1. 프로젝트 목적과 전체 구조

신천중부교회 카카오톡 QT 대화 내보내기 파일을 분석해 구성원별 QT 인증 여부를 날짜별로 집계하고, 월간 묵상 나눔표를 PDF·PNG·CSV로 내보내는 정적 단일 페이지 PWA다. 명단과 기록은 브라우저 `localStorage`에 저장되며, 현재 working tree에는 Google Apps Script(GAS)와 Google Sheets를 이용한 여러 기기 간 전체 데이터 동기화 기능도 포함되어 있다.

별도 빌드 과정, 패키지 관리자, 테스트 러너는 없다. 브라우저가 루트의 `index.html`을 직접 실행한다.

```text
.
├── index.html
├── sw.js
├── manifest.json
├── _headers
├── icon-192.png
├── icon-512.png
├── icon-maskable-512.png
├── .gitignore
├── .DS_Store
├── HANDOFF.md
└── gas-backend/
    ├── Code.gs
    └── README.md
```

`.claude/`와 `.netlify/` 디렉터리는 현재 Git에서 ignored 상태다. `AGENTS.md`, `package.json`, 테스트 코드, CI 설정은 없다.

## 2. 현재 Git 상태

- Branch: `main`
- 아직 commit이 하나도 없는 unborn branch다.
- 유효한 `HEAD`가 없다. `git rev-parse HEAD`와 `git log -1`은 commit이 없어서 실패한다.
- remote/origin이 설정되어 있지 않다.
- upstream/tracking branch와 submodule이 없다.
- 이 상태에서 파일들은 기존 commit 대비 변경분이 아니라 최초 commit 전 작업물이다.

현재 `git status --short --branch`:

```text
## No commits yet on main
A  _headers
A  icon-192.png
A  icon-512.png
A  icon-maskable-512.png
AM index.html
A  manifest.json
A  sw.js
?? .DS_Store
?? .gitignore
?? HANDOFF.md
?? gas-backend/
```

상태 구분:

- Staged: `_headers`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `index.html`, `manifest.json`, `sw.js`
- Staged 후 다시 수정됨: `index.html`
- Untracked: `.DS_Store`, `.gitignore`, `HANDOFF.md`, `gas-backend/Code.gs`, `gas-backend/README.md`

특히 `index.html`은 `AM` 상태다. 최초 추가본이 index에 staged되어 있고, GAS 동기화 등 추가 변경은 working tree에만 있다. 따라서 `git diff --cached -- index.html`과 `git diff -- index.html`은 서로 다른 상태를 보여준다. 다음 작업자는 staged 상태와 working tree 상태를 합쳐서 하나로 오인하지 않아야 한다.

## 3. 주요 파일별 역할

### `index.html`

HTML, CSS, 애플리케이션 JavaScript가 모두 들어 있는 단일 페이지 앱이다. 주요 책임은 다음과 같다.

- 랜딩 화면과 업무 UI
- 카카오톡 TXT/CSV 파싱
- 발신자-실명 매핑과 명단 관리
- 인증 판정, 날짜 보정, 통계 계산
- `localStorage` 읽기/쓰기
- JSON 백업/복원
- GAS push/pull
- 월간 표 미리보기와 PDF·PNG·CSV 내보내기
- Service Worker 등록

외부 CDN에서 Pretendard, html2canvas, jsPDF, GSAP, ScrollTrigger, Flip을 불러온다.

### `sw.js`

PWA Service Worker다. 캐시 이름은 `sinchun-qt-pwa-v2`다.

- 앱 셸과 manifest 및 아이콘 precache
- navigation 요청: network-first, 실패 시 캐시된 `index.html`
- 동일 출처 정적 파일: cache-first, 미스 시 네트워크 응답 캐시
- 외부 CDN: network-first, 실패 시 기존 캐시 fallback
- activate 시 현재 캐시 이름 외의 캐시 삭제

### `manifest.json`

PWA 이름, 설명, 시작 URL, scope, standalone 표시 방식, 세로 방향, 테마 색상, 언어, 일반 및 maskable 아이콘을 정의한다.

### `_headers`

Netlify에서 `/manifest.json`과 `/sw.js`에 올바른 Content-Type을 설정하고 `Cache-Control: no-cache`를 적용한다.

### `gas-backend/Code.gs`

Google Sheets에 바인딩해 사용하는 Apps Script 백엔드의 버전관리용 사본이다. 다음 action을 처리한다.

- `fetchAll`
- `pushAll`
- `getReading`
- `setReading`

`setupSheets()`가 필요한 탭과 헤더를 생성한다. 접근 코드는 Script Properties의 `ACCESS_CODE`와 비교한다. 이 저장소의 파일을 변경하는 것만으로 실제 배포본이 갱신되지는 않는다.

### `gas-backend/README.md`

Google Sheet 생성, `setupSheets()` 실행, Script Properties 설정, 웹앱 배포, 새 버전 재배포, 자동 동기화 방식과 동시 편집 제한, 본문 캐시 예열 트리거를 설명한다.

## 4. 현재 구현된 주요 기능

- GSAP Flip/ScrollTrigger를 이용한 Bento 랜딩 애니메이션
- 카카오톡 TXT와 CSV 대화 내보내기 파싱
- 새로 붙여넣은 대화 조각을 이전 원문에 누적 저장
- 누적 원문에 새 텍스트 전체가 이미 포함된 경우 단순 중복 추가 방지
- 대화 발신자와 명단 실명의 자동·수동 매핑
- 명단 추가, 삭제, 이름 변경, 비고 편집
- 이름 변경 시 mapping과 날짜별 records 키 함께 이동
- 운영자·봇 등 표시 이름 제외
- 특정 발신자의 사진 메시지 자동 인정 제외
- 사진 메시지와 최소 글자 수 이상의 텍스트를 인증으로 판정
- 공지로 보이는 메시지와 링크만 있는 메시지 제외
- 메시지의 명시 날짜 또는 날짜별 성경 본문을 이용한 인증 날짜 보정
- `사진 N장` 메시지로 이전 날짜 인증 보충
- 날짜별 완료 여부, 해당 월 출석률, 해당 월 연속일수 계산
- 미래 날짜에 잘못 저장된 기록 정리
- 매일성경 오늘 본문 자동 조회와 날짜별 본문 수동 편집
- JSON schema version 1 기반 로컬 백업·복원
- GAS 전체 데이터 수동 및 자동 push/pull
- 내보내기 표 셀의 수동 순환: 빈칸 → `O` → `-` → 빈칸
- 월간 PDF, PNG, CSV 저장
- 내보내기 표시에서 이름 뒤 직함 제거
- 해당 월에 기록이 존재하지만 모두 미완료인 사람을 내보내기에서 제외
- manifest, Service Worker, 아이콘을 이용한 PWA 설치·오프라인 앱 셸

## 5. localStorage 및 GAS 데이터 구조

### localStorage 키

| 키 | 값의 역할 |
|---|---|
| `qt_roster` | `{ name, note }` 항목 배열 |
| `qt_mapping` | 카카오톡 표시 이름을 실명에 연결하는 객체 |
| `qt_excluded` | 집계에서 제외할 표시 이름 배열 |
| `qt_photoExcluded` | 사진 자동 인정을 제외할 표시 이름 배열 |
| `qt_settings` | 최소 글자 수 `threshold`, 표시용 `roomName` |
| `qt_records` | 날짜별·이름별 완료 여부 |
| `qt_readings` | 날짜별 성경 본문 문자열 |
| `qt_lastChatText` | 누적된 카카오톡 대화 원문 |
| `qt_backendUrl` | 사용 중인 GAS 웹앱 URL |
| `qt_accessCode` | 사용 중인 GAS 접근 코드 |
| `qt_lastSyncedAt` | 마지막 동기화 시각 문자열 |

핵심 records 형태:

```js
records[date][name] = boolean
```

로컬 백업 형식은 `schemaVersion: 1`, `app: "sinchun-qt-checkin"`이며 `data` 아래에 다음 필드를 둔다.

- `roster`
- `mapping`
- `excluded`
- `photoExcluded`
- `settings`
- `records`
- `readings`

카카오톡 원문 `qt_lastChatText`, backend 설정, 마지막 동기화 시각은 백업 payload에 포함하지 않는다.

### GAS / Google Sheets 구조

| Sheet | Columns |
|---|---|
| `Roster` | `name`, `note` |
| `Mapping` | `displayName`, `realName` |
| `Excluded` | `displayName` |
| `PhotoExcluded` | `displayName` |
| `Settings` | `key`, `value` |
| `Records` | `date`, `name`, `present` |
| `Readings` | `date`, `text`, `cachedAt`, `source` |

GAS `fetchAllData()`와 프런트엔드 백업 `data` 객체는 동일한 상위 필드 구조를 사용한다. 프런트엔드의 `restoreLocalBackup()`이 fetch 결과를 schema version 1 백업 형태로 감싸 로컬 상태에 적용한다.

## 6. 핵심 데이터 흐름과 강하게 연결된 로직

```text
카카오톡 TXT/CSV
    ↓ parseChat / parseChatTxt / parseChatCsv
날짜·발신자·메시지
    ↓ resolveMessageDate / resolveSenderReal
날짜별·실명별 인증 판정
    ↓ analyzeAllDates
state.records
    ├─ 결과 화면과 월간 통계
    ├─ PDF·PNG·CSV 내보내기
    ├─ localStorage 저장
    ├─ JSON 백업·복원
    └─ GAS 전체 push/pull
```

강하게 연결된 부분:

- `state.roster`, `state.mapping`, `state.records`: 명단 이름 변경 시 매핑 대상과 모든 날짜의 기록 키를 함께 이동한다.
- `state.readings`와 날짜 보정: 날짜별 본문 문자열이 메시지의 실제 인증 날짜를 결정하는 입력으로 사용된다.
- 모든 `save*()` 함수와 GAS push: 현재 working tree에서는 roster, mapping, 제외 목록, settings, records, readings 저장이 2초 자동 push 예약으로 이어진다.
- `restoreLocalBackup()`과 GAS pull: 서버 전체 데이터와 로컬 JSON 복원이 같은 전체 상태 교체 경로를 사용한다.
- `state.records`와 내보내기: 자동 집계 결과와 내보내기 표에서 수동 수정한 값이 같은 객체에 저장된다.
- `index.html`과 `Code.gs`: action 이름, payload 필드, Sheet 변환 규칙이 양쪽에 나뉘어 있으므로 한쪽만 변경하면 동기화가 깨질 수 있다.
- `index.html`, `sw.js`, `manifest.json`: 시작 URL, 정적 파일 경로, 아이콘 경로, Service Worker 캐시 전략이 연결되어 있다.

## 7. 핵심 로직별 회귀 주의사항

### 카카오톡 파싱

- CSV는 `Date,User,Message` 헤더를 감지하고 RFC4180 형태의 따옴표, 쉼표, 메시지 내부 줄바꿈을 직접 처리한다.
- TXT는 한국어 전체 날짜 헤더, 점 표기 날짜 헤더, 날짜 구분선, 날짜 전용 행, 시간 메시지, 대괄호 메시지 형식을 각각 정규식으로 처리한다.
- 인식되지 않은 비어 있지 않은 행은 시스템 메시지가 아니면 직전 메시지의 연속 줄로 붙인다.
- 카카오톡 내보내기 형식이나 시스템 문구가 바뀌면 파싱 결과 전체가 달라질 수 있으므로 실제 TXT/CSV 샘플로 검증해야 한다.
- 중복 방지는 새 텍스트 전체가 누적 원문에 포함되는지만 확인한다. 일부 중복 구간이나 서로 겹치는 증분 파일을 메시지 단위로 deduplicate하지는 않는다.

### 발신자 매핑

- 표시 이름은 공백과 일부 기호를 제거해 정규화한 뒤 roster 이름 포함 관계로 자동 매칭한다.
- 후보가 정확히 하나면 자동 연결하고, 둘 이상이면 모호한 상태로 둔다.
- 수동 mapping이 있으면 자동 매칭보다 우선한다.
- 짧은 이름, 동명이인, 한 이름이 다른 이름에 포함되는 경우를 반드시 검증해야 한다.
- 명단 이름 수정 로직은 mapping과 모든 records를 함께 바꾸므로 이 연결을 분리해서 수정하면 과거 기록이 고아 데이터가 될 수 있다.

### 날짜 보정과 인증 판정

- 메시지 안의 `월/일` 표기와 날짜별 성경 본문 매칭 점수를 사용해 원래 메시지 날짜를 보정한다.
- 미래 날짜로 판정된 records는 초기화 중 삭제한다.
- 본문 parsing과 본문 문자열 형식을 바꾸면 날짜 보정 결과도 달라질 수 있다.
- 사진 메시지, 공지, 링크 전용 메시지, 최소 글자 수, 사진 제외 목록이 하나의 완료 판정에 함께 작용한다.
- `사진 N장` 보충 로직은 이전 날짜 records에도 영향을 줄 수 있으므로 단일 날짜 결과만 보고 검증하면 안 된다.

### 기록 저장과 복원

- `saveRecords()`는 localStorage 저장뿐 아니라 자동 push도 예약한다.
- JSON 복원과 GAS pull은 roster부터 readings까지 전체 로컬 상태를 교체한다.
- `cleanupFutureRecords()`도 변경이 있으면 `saveRecords()`를 호출한다.
- records의 이름 키는 roster 이름 원문을 사용한다. 내보내기 표시용 직함 제거 이름을 records 키로 사용하면 안 된다.

### 내보내기

- PDF와 PNG는 표의 overflow를 임시로 풀고 html2canvas로 전체 표를 캡처한다.
- PDF는 A4 landscape 한 페이지에 맞춰 축소한다.
- 표 셀 클릭은 records 자체를 변경하고 저장한다.
- 내보내기에서만 이름 끝의 지정된 직함을 제거하며, 원본 roster와 records 키는 유지한다.
- 한 달에 records가 하나도 없는 사람은 빈 줄로 남지만, 기록이 있고 모두 `false`인 사람은 제외된다.
- CSV는 현재 이름과 비고에 대한 CSV escaping을 하지 않는다. 아래 위험 항목 참고.

## 8. Service Worker와 PWA 구조

- `manifest.json`의 `start_url`과 `scope`는 모두 `./`이다.
- display mode는 `standalone`, orientation은 `portrait-primary`, 언어는 `ko-KR`이다.
- 일반 192px/512px 아이콘과 maskable 512px 아이콘을 사용한다.
- `index.html`은 HTTP 또는 HTTPS에서만 `./sw.js` 등록을 시도한다. `file://`에서는 등록하지 않는다.
- Service Worker는 install 시 앱 셸을 precache하고 즉시 `skipWaiting()`, activate 시 `clients.claim()`을 호출한다.
- 캐시 로직이나 정적 파일을 변경할 때는 기존 사용자에게 새 자원이 확실히 전달되는지 `CACHE_NAME`과 전략을 함께 검토해야 한다.
- 외부 CDN 의존성은 첫 성공 응답 뒤 캐시에 들어간다. 최초 오프라인 실행에서는 CDN 파일이 캐시되어 있지 않을 수 있다.

## 9. GAS 동기화 구조

- 프런트엔드는 `POST` body에 `{ action, code, ... }` 형태의 JSON을 전송한다. Content-Type은 `text/plain;charset=utf-8`이다.
- GAS는 Script Properties의 `ACCESS_CODE`와 요청 code를 비교한다.
- 수동 버튼은 전체 가져오기/보내기 전에 `confirm()`을 표시한다.
- 자동 push: `saveRoster`, `saveMapping`, `saveExcluded`, `savePhotoExcluded`, `saveSettings`, `saveRecords`, `saveReadings`가 호출되면 2초 debounce 후 `pushAll`을 실행한다.
- 자동 pull: backend가 설정되어 있으면 화면이 보이는 동안 15초 interval로 `fetchAll`을 실행한다.
- 자동 pull은 문서가 hidden 상태이거나 input/textarea/contenteditable에 포커스가 있으면 건너뛴다.
- visibility가 다시 visible이 되면 자동 pull을 시도한다.
- `syncBusy`로 한 시점의 push와 pull을 상호 배제하고, pull 결과 복원 중에는 `suppressAutoSync`로 되받아 보내기를 막는다.
- `pushAllData()`는 각 Sheet 내용을 지우고 payload 전체로 다시 쓰는 전체 교체 방식이다. 필드별 또는 레코드별 병합이 아니다.
- 두 관리자의 동시 편집에는 revision/conflict resolution이 없으며 마지막 전체 push가 앞선 데이터를 덮어쓸 수 있다.
- 카카오톡 누적 원문 `lastChatText`는 JSON 백업 및 GAS payload에 포함되지 않으므로 GAS에 전송되지 않는다.
- `Code.gs` 변경 후에는 Apps Script에서 새 버전으로 직접 재배포해야 실제 `/exec` 배포본에 반영된다.

## 10. 현재 최우선 위험 및 확인 필요 항목

아래에서 **확인된 사실**은 현재 소스와 Git 상태에서 직접 확인한 내용이고, **가능성/확인 필요**는 그 코드 경로로 인해 발생할 수 있어 실제 환경 테스트가 필요한 내용이다.

### 10.1 하드코딩된 backend URL과 접근 코드

- 확인된 사실: working tree의 `index.html`에는 기본 GAS backend URL과 기본 접근 코드가 소스 상수로 하드코딩되어 있다. 보안 값 자체는 이 문서에 기록하지 않는다.
- 확인된 사실: `gas-backend/README.md`는 접근 코드를 Git에 넣지 말라고 안내하므로 현재 구현과 문서가 충돌한다.
- 확인 필요: 하드코딩된 값이 현재 실제 배포 backend와 동일하다면 단순 공유 비밀번호 접근 제어가 노출된 상태다. 운영 전 코드 교체와 기존 Script Property 회전 여부를 확인해야 한다.

### 10.2 신규 브라우저의 최초 pull 전 자동 push

- 확인된 사실: 기본 backend 설정이 존재하고, 오늘 본문이 로컬에 없으면 초기화 과정에서 `fetchReading()`을 호출한다.
- 확인된 사실: 본문 저장은 `saveReadings()`를 거쳐 2초 자동 push를 예약한다.
- 확인된 사실: `startAutoPull()`은 15초 interval을 설정할 뿐 시작 직후 즉시 pull하지 않는다.
- 가능성/확인 필요: 서버 본문 또는 proxy 본문 조회가 먼저 성공하면 신규 브라우저의 비어 있는 roster/mapping/records를 포함한 전체 payload가 최초 pull 전에 서버 데이터를 덮어쓸 수 있다. 빈 프로필 브라우저와 운영 데이터가 있는 테스트 backend로 재현 검증하기 전에는 자동 동기화를 안전하다고 간주하지 말 것.

### 10.3 pending push와 polling pull 경쟁

- 확인된 사실: 로컬 저장 후 push는 2초 지연되며, pull은 독립적인 15초 polling이다.
- 확인된 사실: 아직 실행되지 않은 pending push를 나타내는 dirty/revision 상태는 없고, pull은 로컬 전체 상태를 교체한다.
- 가능성/확인 필요: 로컬 수정 직후 push 실행 전에 polling pull이 시작되면 아직 서버에 보내지 않은 로컬 변경이 서버 상태로 덮일 수 있다. 타이머 경계와 두 브라우저 동시 수정 테스트가 필요하다.

### 10.4 중복 `fetchReading()` 호출

- 확인된 사실: 오늘 본문이 없을 때 설정 입력 초기화 구간과 하단 `init()` 양쪽에서 `fetchReading()`을 호출한다.
- 가능성/확인 필요: 첫 비동기 요청이 완료되기 전에 두 번째 호출이 시작되어 backend/proxy 조회와 후속 저장이 중복 실행될 수 있다. 네트워크 로그로 확인해야 한다.

### 10.5 GAS 파일이 untracked 상태

- 확인된 사실: `gas-backend/Code.gs`와 `gas-backend/README.md`가 포함된 `gas-backend/` 전체가 `??` 상태다.
- 확인된 사실: 현재 staged 최초 추가 파일에 GAS backend는 포함되지 않는다.
- 주의: 다음 작업자는 최초 commit 범위를 결정하기 전에 working tree와 staged snapshot의 동기화 기능 차이를 검토해야 한다.

### 10.6 CSV escaping

- 확인된 사실: CSV 생성은 roster 이름과 비고를 문자열에 직접 삽입하며 쉼표, 큰따옴표, 줄바꿈을 RFC4180 방식으로 escape하지 않는다.
- 가능성/확인 필요: 이름이나 비고에 해당 문자가 들어가면 열 또는 행 구조가 깨질 수 있다. 실제 Excel/Sheets import 테스트가 필요하다.

### 10.7 전체 교체와 자동 오류 표시

- 확인된 사실: GAS push는 모든 Sheet의 데이터를 전체 교체하며 병합하지 않는다.
- 확인된 사실: 비대화형 자동 pull 실패는 상태 배너를 갱신하지 않는다.
- 가능성/확인 필요: 장기간 동기화 실패나 여러 관리자의 마지막-write-wins 데이터 유실을 사용자가 즉시 인지하지 못할 수 있다.

## 11. 현재 미완료 사항

- 랜딩 Bento 갤러리 8칸은 실제 이미지가 아니라 코드 주석상 실제 사진 준비 전 임시 그라디언트 플레이스홀더다.
- 테스트 코드, lint, CI, 자동 브라우저 테스트가 없다.
- 최초 Git commit이 없고 remote/origin도 연결되지 않았다.
- GAS backend 디렉터리는 아직 untracked다.
- 현재 조사에서 inline JavaScript 3개, `sw.js`, `Code.gs`는 JavaScript 구문 검사를 통과했지만 실제 브라우저, 실데이터 파싱, GAS 배포본, PDF/PNG 렌더링 동작 검증을 의미하지는 않는다.

## 12. 다음 작업 전 필수 회귀 테스트 체크리스트

### Git 및 배포 경계

- [ ] 작업 전 `git status --short --branch`, `git diff`, `git diff --cached`를 각각 확인한다.
- [ ] `index.html`의 staged 버전과 working tree 버전 차이를 확인한다.
- [ ] 저장소 `Code.gs`와 실제 Apps Script 배포 버전이 같은지 확인한다.
- [ ] Service Worker 변경 시 기존 캐시에서 업데이트되는지 확인한다.

### 카카오톡 파싱과 집계

- [ ] 실제 카카오톡 TXT 전체 내보내기 샘플을 파싱한다.
- [ ] 실제 카카오톡 CSV 샘플에서 쉼표, 따옴표, 여러 줄 메시지를 파싱한다.
- [ ] 새 날짜분만 추가했을 때 기존 기록이 유지되는지 확인한다.
- [ ] 동일 원문 재입력과 일부 겹치는 증분 입력을 각각 확인한다.
- [ ] 공지, 링크 전용 메시지, 사진, 일반 장문, 시스템 메시지 판정을 확인한다.
- [ ] `사진 N장`이 의도한 이전 날짜만 보충하는지 확인한다.

### 매핑, 명단, 날짜 보정

- [ ] 이모지·공백·직함이 포함된 표시 이름 자동 매칭을 확인한다.
- [ ] 동명이인, 짧은 이름, 이름 포함 관계에서 모호성 처리를 확인한다.
- [ ] 수동 매핑이 자동 매칭보다 우선하는지 확인한다.
- [ ] 명단 이름 변경 후 mapping과 모든 과거 records가 함께 이동하는지 확인한다.
- [ ] 명시 날짜가 있는 메시지와 본문 기반 날짜 보정을 확인한다.
- [ ] 미래 날짜 records 정리가 정상 데이터까지 삭제하지 않는지 확인한다.

### 저장, 백업, 동기화

- [ ] JSON 백업 후 동일 브라우저와 깨끗한 브라우저에서 round-trip 복원한다.
- [ ] 카카오톡 원문이 JSON 및 GAS payload에 포함되지 않는지 확인한다.
- [ ] 운영 데이터가 있는 backend에 신규 브라우저를 연결해 최초 pull 전에 push가 발생하는지 확인한다.
- [ ] 오늘 본문이 없는 신규 브라우저에서 `fetchReading()` 요청 횟수를 확인한다.
- [ ] 로컬 수정 직후 2초 이내에 polling pull이 겹치는 경우 데이터 보존을 확인한다.
- [ ] 두 브라우저가 같은 날짜와 다른 날짜를 동시에 수정하는 경우를 각각 확인한다.
- [ ] 접근 코드 오류, 네트워크 실패, 잘못된 backend 응답이 UI에 충분히 표시되는지 확인한다.
- [ ] 수동 push/pull confirm과 자동 push/pull의 동작 차이를 확인한다.

### 결과와 내보내기

- [ ] 월 경계에서 출석률과 연속일수가 새 달 기준으로 계산되는지 확인한다.
- [ ] 내보내기 표 셀 수동 변경이 records와 동기화되는지 확인한다.
- [ ] 기록이 전혀 없는 사람과 전부 미완료인 사람의 내보내기 포함 여부를 확인한다.
- [ ] 직함 제거가 표시 이름에만 적용되고 records 키에는 영향을 주지 않는지 확인한다.
- [ ] 긴 명단과 31일 월을 모바일·데스크톱에서 PDF/PNG로 전체 캡처한다.
- [ ] 이름/비고에 쉼표, 큰따옴표, 줄바꿈, 한글이 있을 때 CSV를 Excel 및 Google Sheets에서 연다.

### PWA와 외부 의존성

- [ ] HTTPS 배포에서 manifest와 Service Worker가 정상 등록되는지 확인한다.
- [ ] 온라인 최초 방문 후 오프라인 재실행을 확인한다.
- [ ] 최초 오프라인 상태에서 CDN 의존성이 없는 경우의 UI 동작을 확인한다.
- [ ] Netlify에서 `manifest.json`과 `sw.js`의 Content-Type 및 no-cache 헤더를 확인한다.
