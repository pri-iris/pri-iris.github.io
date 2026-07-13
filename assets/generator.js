/* ============================================================
   IRIS-Edge code generators — shared client-side infrastructure
   Calls the Claude API directly from the browser with a
   user-supplied API key (stored only in this browser).
   ============================================================ */

const IRIS_GEN = (function () {
  const KEY_STORE = "iris_claude_api_key";
  const MODEL_STORE = "iris_claude_model";
  const ENDPOINT = "https://api.anthropic.com/v1/messages";

  const MODELS = [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8 (최고 성능 · 권장)" },
    { id: "claude-sonnet-5", label: "Claude Sonnet 5 (빠름 · 균형)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (가장 빠름 · 경량)" },
  ];

  // ---------- API key + model persistence ----------
  function getKey() { return localStorage.getItem(KEY_STORE) || ""; }
  function setKey(v) { if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE); }
  function getModel() { return localStorage.getItem(MODEL_STORE) || MODELS[0].id; }
  function setModel(v) { localStorage.setItem(MODEL_STORE, v); }

  // Wire the standard API-settings panel. Expects elements:
  //   #genKey (input), #genKeySave, #genKeyClear, #genKeyMsg, #genModel (select)
  function wireSettings() {
    const keyIn = document.getElementById("genKey");
    const model = document.getElementById("genModel");
    const msg = document.getElementById("genKeyMsg");

    MODELS.forEach(m => {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = m.label;
      model.appendChild(o);
    });
    model.value = getModel();
    model.addEventListener("change", () => setModel(model.value));

    if (getKey()) {
      keyIn.value = getKey();
      msg.textContent = "저장된 키를 사용 중입니다.";
    }

    document.getElementById("genKeySave").addEventListener("click", () => {
      const v = keyIn.value.trim();
      if (!v) { msg.textContent = "API 키를 입력하세요."; return; }
      setKey(v);
      msg.textContent = "키가 이 브라우저에 저장되었습니다.";
    });
    document.getElementById("genKeyClear").addEventListener("click", () => {
      setKey(""); keyIn.value = ""; msg.textContent = "저장된 키를 삭제했습니다.";
    });
  }

  // ---------- Claude call (direct browser access) ----------
  async function callClaude({ system, user, maxTokens = 16000 }) {
    const key = (document.getElementById("genKey")?.value || getKey()).trim();
    if (!key) throw new Error("먼저 Claude API 키를 입력하세요.");
    const model = document.getElementById("genModel")?.value || getModel();

    const res = await fetch(ENDPOINT, {
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
    const text = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");
    if (!text) throw new Error("응답이 비어 있습니다. 다시 시도해 주세요.");
    return text;
  }

  // ---------- parse the model output into files + notes ----------
  // Files:  <<<FILE path="xxx.py">>> ... <<<END FILE>>>
  // Notes:  <<<NOTES>>> ... <<<END NOTES>>>
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

  // ---------- render files with copy + download ----------
  function esc(s) {
    return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function renderResult(container, parsed) {
    container.innerHTML = "";
    if (!parsed.files.length) {
      const pre = document.createElement("pre");
      pre.innerHTML = "<code>" + esc(parsed.raw) + "</code>";
      const warn = document.createElement("div");
      warn.className = "note warn";
      warn.textContent = "파일 구분자를 찾지 못해 원본 응답을 그대로 표시합니다.";
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

  return { wireSettings, callClaude, parseOutput, renderResult, getKey };
})();
