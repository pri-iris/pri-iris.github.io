# IRIS-Edge 문서 사이트 (iris-edge-readme)

IRIS-Edge / IRIS-Edge 2.0 의 **외부 공개용** 문서 사이트. GitHub Pages(사용자 페이지)로
루트의 정적 HTML 을 그대로 서빙한다. (remote: `chomu97.github.io`, Jekyll 미사용 — `.nojekyll` 존재)

## 대원칙 (반드시 지킬 것)
- **외부 공개**다. **코드를 직접 노출하지 말 것**, **내부 아키텍처를 노출하지 말 것**
  (아키텍처 다이어그램, 디렉터리 구조, 내부 클래스/파일명, 매니저 계층 매핑 등 금지).
- 공개 문서는 프로토콜 규격 / API 계약 / 기능 단위 노드 설명까지만 다룬다.

## 소스 참고 (이 저장소가 아님)
- `D:\iris-edge`      : IRIS-Edge (Qt 데스크탑, 노드 에디터). 노드 소스는 `_node_control/node_editor/`.
- `D:\iris-edge2`     : IRIS-Edge 2.0 (헤드리스 서버, REST/WebSocket/gRPC).
- `D:\iris-edge\docs\노드_정의서.txt` : **노드 입출력 계약의 원본(single source of truth)**. 노드가 바뀌면 여기부터 확인.
- `D:\iris-edge\key_generator.py`     : 라이센스 키 알고리즘 원본.

## 페이지 구성
공개(홈에 링크됨):
- `index.html`          — 홈. 하위 문서 카드 + 버전 비교표.
- `devices.html`        — 호환 장치 리스트(카메라/로봇/그리퍼·IO/PLC/장치/AI 모델).
- `socket-protocol.html`— Socket 메시지 프레이밍 + IRIS Image 바이너리 프로토콜.
- `api.html`            — IRIS-Edge 2.0 REST/WebSocket/gRPC API.
- `nodes.html`          — 사용 가능한 노드(기능 단위, 내부 클래스명 미노출).

비공개/미링크(unlisted — 홈/공개 네비에 링크하지 않음. 직접 URL 로만 접근):
- `nodegen.html`        — 노드 생성기 (xxx_node.py + xxx_widget.py 생성).
- `usernodegen.html`    — 유저노드 파일 생성기 (user_node_xxx.py 생성).
- `index.html` 내 숨은 라이센스 키 생성기 — URL 해시 `#kg` 또는 푸터 `© ...` 5회 클릭으로 열림.

> ⚠️ 생성기/키 생성기를 홈에 링크하지 않은 이유: 동작을 위해 **노드 아키텍처·키 알고리즘을
> 페이지 소스(JS)에 임베드**해야 하므로 공개 시 대원칙과 충돌한다. 소스를 열면 다 보이므로
> "숨김"일 뿐 보안이 아니다. 근본 해결책은 이 파일들을 **비공개 배포하거나 프록시로 이전**하는 것.

## 공통 자산
- `assets/style.css`    — 공용 스타일(화이트 테마). `:root` CSS 변수로 테마 제어. 생성기 UI(`.gen-*`) 스타일 포함.
- `assets/logo.svg`     — 브랜드 로고. `D:\iris-edge2-ui\iris2_UI\resources\logo\LOGO_IRIS.svg` 원본 복사본.
                          내부에 base64 PNG 가 임베드돼 실제 컬러(빨강 포함)를 담고 있음. **색상 변경 금지**(원본 유지).
- `assets/generator.js` — 코드 생성기 공용 로직(아래).

---

## 코드 생성기 (nodegen / usernodegen) — 변경 가이드

브라우저에서 사용자가 입력한 **API 키로 AI 를 직접 호출**한다(서버 없음). 키는 브라우저 `localStorage` 에만 저장.

### 핵심 파일: `assets/generator.js`
전역 `IRIS_GEN` 객체를 노출. 페이지는 `wireSettings()` / `generate({system,user,maxTokens})` /
`parseOutput()` / `renderResult()` / `NODE_IO_REFERENCE` 를 사용.

- **제공자(Provider)**: `PROVIDERS` 객체. `claude` 와 `gemini` 두 개.
  - 각 제공자에 `models: [{id,label}]` 배열이 있음. 첫 항목이 기본값.
  - **모델이 폐기(deprecate)되면 여기만 고치면 됨.** (Gemini 는 무료 티어 여부가 자주 바뀜 — 라벨에 표기)
  - 호출 함수: `callClaude`(x-api-key + `anthropic-dangerous-direct-browser-access` 헤더),
    `callGemini`(x-goog-api-key 헤더, `generativelanguage.googleapis.com/v1beta`).
- **모델 ID 확인처**:
  - Claude: `shared/models.md`(claude-api 스킬) 또는 platform.claude.com. 기본 `claude-opus-4-8`.
  - Gemini: https://ai.google.dev/gemini-api/docs/models , /pricing (무료 티어 여부 확인).
    2.5 계열은 신규 사용자에게 막힘 → 현재 3.x 계열 사용(`gemini-3.5-flash` 기본, `gemini-flash-latest` 별칭 포함).
- **키 저장**: `localStorage` 키는 `iris_api_key_<provider>`, 모델은 `iris_model_<provider>`, 제공자는 `iris_provider`.

### ⭐ 노드 입출력 계약: `IRIS_GEN.NODE_IO_REFERENCE` (가장 중요한 변경 지점)
`generator.js` 안의 문자열 상수. 두 생성기가 시스템 프롬프트에 덧붙여 사용한다.
- **원본**: `D:\iris-edge\docs\노드_정의서.txt`. 여기서 각 노드의
  - `execute_inputs()` 가 읽는 key (= 뒤 노드로 보낼 result 에 반드시 포함해야 하는 key),
  - `output_data` 로 내보내는 key (= 앞 노드에서 읽을 수 있는 key) 를 추출해 표로 정리한 것.
- **노드가 추가/변경되면 `노드_정의서.txt` 를 다시 읽고 이 상수를 갱신**하면 두 생성기에 동시 반영된다.
- 브라우저는 로컬 파일을 못 읽으므로 전체(48KB)가 아니라 **입출력 key 만** 임베드했다(토큰/무료 할당량 절약).
- 핵심 규칙(프롬프트에 명시됨): 뒤 노드가 읽는 **모든 key 를 빠짐없이** result 에 담을 것.
  예) AI 추론 노드가 뒤에 오면 `CAMERA_GRAB_KEY` + `CAMERA_GRAB_RGB_IMAGE` + `CAMERA_GRAB_DEPTH_IMAGE` 셋 다.
  뒤 노드 여러 개면 요구 key 의 **합집합**.

### 페이지의 시스템 프롬프트
- `nodegen.html` → `NODE_SYSTEM_PROMPT` (노드 로직/위젯 파일 규약 + master 등록 3곳 안내).
- `usernodegen.html` → `USERNODE_SYSTEM_PROMPT` (`run(node_data_type_list, data, node_data, log_info) -> (result, node_data)` 규약).
- 두 페이지 모두 호출 시 `system = <PROMPT> + "\n\n" + IRIS_GEN.NODE_IO_REFERENCE`.
- 모델 출력 형식: 파일은 `<<<FILE path="...">>> ... <<<END FILE>>>`, 안내는 `<<<NOTES>>> ... <<<END NOTES>>>`.
  `parseOutput()` 이 이 구분자로 파싱하므로 형식을 바꾸면 파서도 함께 수정.
- 템플릿 리터럴(백틱) 안에 백틱/`${` 를 넣지 말 것(프롬프트가 깨짐).

### IRIS-Edge 노드 규약 요약 (프롬프트 근거)
- 노드: `Node` 상속, 클래스명 `Xxx_Node`, 파일 `Xxx_node.py`. 핀 `Ex In`/`finished`/`failed`(+데이터 핀).
  `execute_inputs()` → `compute()` → `set_pin_status('finished'|'failed', ...)`. 데이터 핀 payload 는 dict(key=node_data_type 상수).
- 위젯: `BaseNodeWidget` 상속, 파일 `xxx_widget.py`, `_build_body()`/`save_settings()`/`load_settings()`.
- master 등록 3곳: `common/node_title.py`(TITLE_*), `node_editor_main.py::create_nodes()`(append_node),
  `gui/node_widget.py::create_config_widget()`(elif 분기).
- 유저노드: `data` 는 {앞 노드 uuid: 출력 dict} + `data['ros_manager']`. result 에 `IP_RESULT_FLAG="OK"/"NG"` 필수.
  앞 노드 id 는 `CAMERA_GRAB_NODE_ID = "PASTE_NODE_ID_HERE"` 자리표시자로 넣고 사용자가 실제 id 를 붙여넣음.

## 라이센스 키 생성기 (index.html 내 숨김)
- 알고리즘: `sha256( mac.replace(':','').lower() + KEY ).hexdigest().upper()`, `KEY` 는 `key_generator.py` 와 동일.
- **콜론만 제거하고 대시는 유지** — 실기(`getmac`, 대시 대문자)와 일치시키기 위함. 형식이 결과에 영향.
- 여러 MAC 한 줄씩 입력, `#` 뒤는 메모, 줄별 복사 / 전체 복사 / `license.txt`(CRLF) 다운로드 지원.
