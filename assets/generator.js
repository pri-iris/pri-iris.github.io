/* ============================================================
   IRIS-Edge code generators — shared client-side infrastructure
   Calls Claude (Anthropic) or Google Gemini directly from the
   browser with a user-supplied API key (stored only in this
   browser). No server involved.
   ============================================================ */

const IRIS_GEN = (function () {
  const PROVIDER_STORE = "iris_provider";
  const keyStoreName = p => "iris_api_key_" + p;
  const modelStoreName = p => "iris_model_" + p;

  // ---------- provider definitions ----------
  const PROVIDERS = {
    claude: {
      label: "Claude (Anthropic)",
      keyLabel: "Claude API 키",
      keyPlaceholder: "sk-ant-...",
      models: [
        { id: "claude-opus-4-8", label: "Claude Opus 4.8 (최고 성능 · 권장)" },
        { id: "claude-sonnet-5", label: "Claude Sonnet 5 (빠름 · 균형)" },
        { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (가장 빠름 · 경량)" },
      ],
      call: callClaude,
    },
    gemini: {
      label: "Google Gemini",
      keyLabel: "Google Gemini API 키",
      keyPlaceholder: "AIza...",
      models: [
        { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (권장 · 무료 티어 가능)" },
        { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (가장 빠름 · 무료 티어 가능)" },
        { id: "gemini-flash-latest", label: "Gemini Flash (항상 최신 · 무료 티어 가능)" },
        { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (최고 성능 · 유료 결제 필요)" },
      ],
      call: callGemini,
    },
  };

  // ---------- persistence ----------
  function getProvider() {
    const p = localStorage.getItem(PROVIDER_STORE);
    return PROVIDERS[p] ? p : "claude";
  }
  function setProvider(p) { localStorage.setItem(PROVIDER_STORE, p); }
  function getKey(p) { return localStorage.getItem(keyStoreName(p)) || ""; }
  function setKey(p, v) { if (v) localStorage.setItem(keyStoreName(p), v); else localStorage.removeItem(keyStoreName(p)); }
  function getModel(p) {
    const saved = localStorage.getItem(modelStoreName(p));
    const models = PROVIDERS[p].models;
    return models.some(m => m.id === saved) ? saved : models[0].id;
  }
  function setModel(p, v) { localStorage.setItem(modelStoreName(p), v); }

  // ---------- settings panel wiring ----------
  // Expects: #genProvider, #genKey, #genKeyLabel, #genKeySave, #genKeyClear,
  //          #genKeyMsg, #genModel
  function wireSettings() {
    const provSel = document.getElementById("genProvider");
    const keyIn = document.getElementById("genKey");
    const keyLbl = document.getElementById("genKeyLabel");
    const model = document.getElementById("genModel");
    const msg = document.getElementById("genKeyMsg");

    Object.keys(PROVIDERS).forEach(p => {
      const o = document.createElement("option");
      o.value = p; o.textContent = PROVIDERS[p].label;
      provSel.appendChild(o);
    });

    function loadProvider(p) {
      const def = PROVIDERS[p];
      // models
      model.innerHTML = "";
      def.models.forEach(m => {
        const o = document.createElement("option");
        o.value = m.id; o.textContent = m.label;
        model.appendChild(o);
      });
      model.value = getModel(p);
      // key + labels
      if (keyLbl) keyLbl.textContent = def.keyLabel;
      keyIn.placeholder = def.keyPlaceholder;
      keyIn.value = getKey(p);
      msg.textContent = getKey(p) ? "저장된 키를 사용 중입니다." : "";
    }

    provSel.value = getProvider();
    loadProvider(provSel.value);

    provSel.addEventListener("change", () => {
      setProvider(provSel.value);
      loadProvider(provSel.value);
    });
    model.addEventListener("change", () => setModel(provSel.value, model.value));

    document.getElementById("genKeySave").addEventListener("click", () => {
      const v = keyIn.value.trim();
      if (!v) { msg.textContent = "API 키를 입력하세요."; return; }
      setKey(provSel.value, v);
      msg.textContent = "키가 이 브라우저에 저장되었습니다.";
    });
    document.getElementById("genKeyClear").addEventListener("click", () => {
      setKey(provSel.value, ""); keyIn.value = ""; msg.textContent = "저장된 키를 삭제했습니다.";
    });
  }

  function currentContext() {
    const p = document.getElementById("genProvider")?.value || getProvider();
    const model = document.getElementById("genModel")?.value || getModel(p);
    const key = (document.getElementById("genKey")?.value || getKey(p)).trim();
    return { provider: p, model, key };
  }

  // ---------- Claude (Anthropic) ----------
  async function callClaude({ system, user, model, maxTokens, key }) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const j = await res.json(); detail = j.error?.message || detail; } catch (_) {}
      if (res.status === 401) detail = "API 키가 유효하지 않습니다. (401)";
      throw new Error(detail);
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (!text) throw new Error("응답이 비어 있습니다. 다시 시도해 주세요.");
    return text;
  }

  // ---------- Google Gemini ----------
  async function callGemini({ system, user, model, maxTokens, key }) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const j = await res.json(); detail = j.error?.message || detail; } catch (_) {}
      if (res.status === 400 && /API key not valid/i.test(detail)) detail = "API 키가 유효하지 않습니다. (400)";
      if (res.status === 429 && /free_tier|limit: 0/i.test(detail)) {
        detail = "이 모델은 무료 티어 할당량이 없습니다. 모델을 Gemini 3.5 Flash / 3.1 Flash-Lite 로 바꾸거나, 결제를 활성화한 키를 사용하세요.\n(원본: " + detail + ")";
      }
      throw new Error(detail);
    }
    const data = await res.json();
    const cand = (data.candidates || [])[0];
    if (!cand) {
      const blocked = data.promptFeedback?.blockReason;
      throw new Error(blocked ? `요청이 차단되었습니다: ${blocked}` : "응답이 비어 있습니다. 다시 시도해 주세요.");
    }
    const text = (cand.content?.parts || []).map(p => p.text || "").join("");
    if (!text) {
      if (cand.finishReason === "MAX_TOKENS") throw new Error("출력이 토큰 한도에 걸렸습니다. 더 빠른 모델이나 짧은 요청으로 다시 시도하세요.");
      if (cand.finishReason === "SAFETY") throw new Error("안전 필터로 응답이 차단되었습니다.");
      throw new Error("응답이 비어 있습니다. (finishReason: " + (cand.finishReason || "?") + ")");
    }
    return text;
  }

  // ---------- unified entry point ----------
  async function generate({ system, user, maxTokens = 16000 }) {
    const { provider, model, key } = currentContext();
    if (!key) throw new Error("먼저 API 키를 입력하세요.");
    return PROVIDERS[provider].call({ system, user, model, maxTokens, key });
  }

  // ---------- output parsing ----------
  function parseOutput(text) {
    const files = [];
    const fileRe = /<<<FILE\s+path="([^"]+)"\s*>>>\n?([\s\S]*?)<<<END FILE>>>/g;
    let m;
    while ((m = fileRe.exec(text)) !== null) {
      files.push({ path: m[1].trim(), code: m[2].replace(/\s+$/, "") + "\n" });
    }
    let notes = "";
    const nm = /<<<NOTES>>>\n?([\s\S]*?)<<<END NOTES>>>/.exec(text);
    if (nm) notes = nm[1].trim();
    return { files, notes, raw: text };
  }

  // ---------- rendering ----------
  function esc(s) {
    return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function renderResult(container, parsed) {
    container.innerHTML = "";
    if (!parsed.files.length) {
      const warn = document.createElement("div");
      warn.className = "note warn";
      warn.textContent = "파일 구분자를 찾지 못해 원본 응답을 그대로 표시합니다.";
      const pre = document.createElement("pre");
      pre.innerHTML = "<code>" + esc(parsed.raw) + "</code>";
      container.appendChild(warn);
      container.appendChild(pre);
      return;
    }

    parsed.files.forEach(f => {
      const wrap = document.createElement("div");
      wrap.className = "gen-file";

      const head = document.createElement("div");
      head.className = "gen-file-head";
      const name = document.createElement("span");
      name.className = "gen-file-name";
      name.textContent = f.path;
      head.appendChild(name);

      const btns = document.createElement("div");
      btns.className = "gen-file-btns";

      const copy = document.createElement("button");
      copy.className = "gen-btn";
      copy.textContent = "복사";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(f.code);
          const old = copy.textContent; copy.textContent = "복사됨";
          setTimeout(() => (copy.textContent = old), 1200);
        } catch (_) { copy.textContent = "복사 실패"; }
      });

      const dl = document.createElement("button");
      dl.className = "gen-btn";
      dl.textContent = "다운로드";
      dl.addEventListener("click", () => {
        const blob = new Blob([f.code], { type: "text/x-python;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = f.path.split("/").pop();
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });

      btns.appendChild(copy); btns.appendChild(dl);
      head.appendChild(btns);
      wrap.appendChild(head);

      const pre = document.createElement("pre");
      pre.innerHTML = "<code>" + esc(f.code) + "</code>";
      wrap.appendChild(pre);
      container.appendChild(wrap);
    });

    if (parsed.notes) {
      const note = document.createElement("div");
      note.className = "note";
      note.innerHTML = "<strong>연동 안내</strong><br>" + esc(parsed.notes).replace(/\n/g, "<br>");
      container.appendChild(note);
    }
  }

  // ---------- IRIS-Edge 노드 입출력 계약 (docs/노드_정의서.txt 기준) ----------
  // 두 생성기가 시스템 프롬프트에 덧붙여 사용. 노드가 바뀌면 이 표만 갱신하면 됨.
  const NODE_IO_REFERENCE = `
# IRIS-Edge 노드 입출력 계약 (정확도 핵심 — 반드시 준수)
- 데이터 핀의 payload 는 dict 이며 key 는 node_data_type 상수 문자열이다.
- 한 노드가 dict 에 여러 key 를 채워 넘기고, 다음 노드는 자기 execute_inputs() 에서 **필요한 key 만** 꺼내 쓴다.
- 따라서 뒤 노드가 정상 실행되려면, 그 노드가 execute_inputs() 에서 읽는 **모든 key** 가 result dict 에 들어 있어야 한다.
  (예: AI 추론 노드는 CAMERA_GRAB_KEY, CAMERA_GRAB_RGB_IMAGE, CAMERA_GRAB_DEPTH_IMAGE 세 key 를 모두 읽으므로 셋 다 넣어야 한다. RGB 만 넣으면 실행되지 않는다.)
- 뒤 노드가 여러 개면 각 노드가 읽는 key 들의 **합집합**을 result 에 모두 담는다.
- 뒤 노드가 여러 입력 데이터 핀(input_data / input_point / input_depth / input_setting / input_address)을 쓰면,
  유저노드의 단일 output_data 를 그 핀들에 각각 연결하면 되고(팬아웃), 해당 핀들이 읽는 key 를 모두 result 에 담으면 된다.
  어떤 핀에 연결해야 하는지는 NOTES 에 명시한다.

## [뒤에 연결될 노드] 가 execute_inputs() 에서 읽는 key → result 에 반드시 포함
- AI 추론 (AiTargetTracking): CAMERA_GRAB_KEY, CAMERA_GRAB_RGB_IMAGE, CAMERA_GRAB_DEPTH_IMAGE  (+ 선택 input_setting: AI_INFERENCE_SEG_INPUT_POINTS, AI_INFERENCE_SEG_INPUT_LABELS)
- 거리 추출 (ImageProcessingGetDepth): input_data=CAMERA_GRAB_DEPTH_IMAGE, input_point=IP_2D_TARGET_POINT
- 좌표 변환2D (ImageProcessingCoordTransform2D): input_point=IP_2D_TARGET_POINT, input_depth=IP_2D_TARGET_DEPTH
- QR 읽기 (ImageProcessingReadQR): CAMERA_GRAB_RGB_IMAGE
- 영상 처리 결과 (ImageProcessingResult): IP 결과 dict — IP_RESULT_DATA, IP_RESULT_IMAGE, IP_RESULT_FLAG (그 외 IP_* 도 표시)
- 딜레이 (Delay): NODE_DATA_DELAY_TIME (노드입력 모드일 때)
- 비교 (Compare): dict 면 PLC_READ_DATA 값을 비교, list 면 첫 요소
- 로봇 이동 (RobotMove): ROBOT_MOVE_POSE  (+ 선택 ROBOT_MOVE_MOVE_TYPE)
- Socket 송신 (SocketSend) / 장치 Socket 송신 (DeviceSocketSend): IP_RESULT_DATA
- Modbus 쓰기 (ModbusWrite): IP_RESULT_DATA
- PLC 쓰기 (PLCWrite): input_address=PLC_WRITE_ADDRESS, input_data=IP_RESULT_DATA
- 내부신호 쓰기 (IRISDIOWrite): IRIS_DIO_WRITE_ADDRESS, IRIS_DIO_WRITE_VALUE
- ROS Publish (ROSPub): IP_RESULT_DATA (+ 선택 CAMERA_GRAB_RGB_IMAGE, CAMERA_GRAB_DEPTH_IMAGE)
- ROS Client / Action Client: IP_RESULT_DATA
- 카메라 촬영 (CameraGrab): (선택) 파일 경로 문자열 또는 CAMERA_GRAB_READ_IMAGE_FILE — 보통 유저노드가 앞에 오지 않음
- 종료/시작/초기화/내부신호 대기/신호 대기 계열: 데이터 입력 없음 (실행 흐름만)

## [앞에 연결된 노드] 가 output_data 로 내보내는 key → data[NODE_ID] 에서 읽을 수 있음
- 카메라 촬영 (CameraGrab): CAMERA_GRAB_KEY, CAMERA_GRAB_RGB_IMAGE, CAMERA_GRAB_DEPTH_IMAGE, CAMERA_GRAB_POINT_CLOUD, NODE_DATA_RUN_TIME
- AI 추론 (AiTargetTracking): AI_INFERENCE_RESULT, AI_INFERENCE_RESULT_IMAGE, IP_RESULT_DATA, IP_RESULT_FLAG, IP_RESULT_IMAGE, NODE_DATA_RUN_TIME
- 거리 추출 (ImageProcessingGetDepth): IP_2D_TARGET_DEPTH (+ 입력 dict 유지 — 앞의 CAMERA_GRAB_* 등도 함께 넘어옴)
- 좌표 변환2D (ImageProcessingCoordTransform2D): IP_2D_TARGET_ROBOT_POSE, ROBOT_MOVE_POSE
- QR 읽기 (ImageProcessingReadQR): IP_QR_DATA(dict: coords/centers/text/image), IP_RESULT_DATA, IP_RESULT_FLAG, IP_RESULT_IMAGE
- 로봇 자세 (RobotPose): ROBOT_MOVE_KEY, ROBOT_MOVE_POSE
- PLC 읽기 (PLCRead) / Modbus 읽기 (ModbusRead): PLC_READ_DEVICE, PLC_READ_ADDRESS, PLC_READ_DATA
- Socket 수신 (SocketReceive) / 장치 Socket 수신 (DeviceSocketReceive): PLC_READ_DATA, IP_RESULT_DATA (동일 값)
- 내부신호 읽기 (IRISDIORead): IRIS_DIO_READ_ADDRESS, IRIS_DIO_READ_VALUE
- ROS Sub / Server / Client / Action: PLC_READ_DEVICE, PLC_READ_ADDRESS, PLC_READ_DATA
- 사용자 입력 노드 (UserInput): **dict 가 아니라 list** ([1, 2, "abc"] 형태). data[NODE_ID] 가 list 일 수 있음에 주의.

## 정확도 규칙
- 사용자가 앞/뒤 노드를 위 목록의 노드로 명시하면, **설명이 아니라 위 계약의 정확한 key 를 사용**한다.
- 목록에 없는(직접 만든) 노드면 사용자 설명을 근거로 추론하되, 어떤 key 를 가정했는지 NOTES 에 밝힌다.
- result 에는 위 요구 key 들에 더해 IP_RESULT_FLAG("OK"/"NG") 를 항상 포함한다.
- PLC_READ_DATA / IP_RESULT_DATA 는 여러 노드가 "범용 값 전달"로 재사용하므로, 뒤 노드 요구에 맞춰 채운다.`;

  return { wireSettings, generate, parseOutput, renderResult, NODE_IO_REFERENCE };
})();
