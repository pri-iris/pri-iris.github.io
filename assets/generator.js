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

  return { wireSettings, generate, parseOutput, renderResult };
})();
