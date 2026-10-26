// AI Answer Generator front end: PDF upload, typed or spoken questions,
// answer + flowchart view, and a question history kept in this browser.
(() => {
    "use strict";

    const HISTORY_KEY = "aag-history";
    const THEME_KEY = "aag-theme";
    const MAX_HISTORY = 50;
    const MAX_UPLOAD_MB = 16;

    const $ = (selector) => document.querySelector(selector);

    const els = {
        app: $("#app"),
        menuBtn: $("#menuBtn"),
        scrim: $("#scrim"),
        newBtn: $("#newBtn"),
        navDoc: $("#navDoc"),
        navDocName: $("#navDocName"),
        navDocDot: $("#navDocDot"),
        navAsk: $("#navAsk"),
        historySearch: $("#historySearch"),
        historyList: $("#historyList"),
        historyEmpty: $("#historyEmpty"),
        clearHistory: $("#clearHistory"),
        themeToggle: $("#themeToggle"),
        uploadCard: $("#uploadCard"),
        dropzone: $("#dropzone"),
        fileInput: $("#fileInput"),
        uploadingName: $("#uploadingName"),
        uploadStatus: $("#uploadStatus"),
        uploadBar: $("#uploadBar"),
        docName: $("#docName"),
        replaceBtn: $("#replaceBtn"),
        emptyState: $("#emptyState"),
        loadingState: $("#loadingState"),
        loadingQuestion: $("#loadingQuestion"),
        elapsed: $("#elapsed"),
        answerView: $("#answerView"),
        answerQuestion: $("#answerQuestion"),
        answerMeta: $("#answerMeta"),
        copyBtn: $("#copyBtn"),
        flowBtn: $("#flowBtn"),
        flowCard: $("#flowCard"),
        panelAnswer: $("#panelAnswer"),
        panelFlow: $("#panelFlow"),
        askForm: $("#askForm"),
        question: $("#question"),
        voiceLang: $("#voiceLang"),
        micBtn: $("#micBtn"),
        sendBtn: $("#sendBtn"),
        listening: $("#listening"),
        hint: $("#hint"),
        toasts: $("#toasts"),
    };

    const state = {
        doc: els.app.dataset.doc || null, // PDF the server is answering from
        history: readHistory(),
        current: null, // history item shown in the answer view
        busy: false,
    };

    // ---------- Storage ----------

    function readHistory() {
        try {
            const items = JSON.parse(localStorage.getItem(HISTORY_KEY));
            return Array.isArray(items) ? items : [];
        } catch {
            return [];
        }
    }

    function writeHistory() {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
        } catch {
            // Storage blocked or full: history just won't survive a reload
        }
    }

    // ---------- Helpers ----------

    const TOAST_ICONS = { info: "i-info", success: "i-check", warn: "i-alert", error: "i-alert" };

    function toast(message, type = "info") {
        const el = document.createElement("div");
        el.className = `toast toast-${type}`;
        el.setAttribute("role", type === "error" ? "alert" : "status");
        el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${TOAST_ICONS[type]}"/></svg><span></span>`;
        el.lastElementChild.textContent = message;
        els.toasts.append(el);
        setTimeout(() => {
            el.classList.add("leaving");
            setTimeout(() => el.remove(), 300);
        }, type === "error" ? 7000 : 3500);
    }

    function flash(el) {
        el.classList.remove("flash");
        void el.offsetWidth; // restart the animation
        el.classList.add("flash");
    }

    function timeAgo(ts) {
        const minutes = Math.floor((Date.now() - ts) / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} d ago`;
        return new Date(ts).toLocaleDateString();
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    }

    function currentTheme() {
        return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }

    function closeSidebar() {
        els.app.classList.remove("sidebar-open");
    }

    // ---------- View state ----------

    function showView(name) {
        els.emptyState.hidden = name !== "empty";
        els.loadingState.hidden = name !== "loading";
        els.answerView.hidden = name !== "answer";
    }

    function setBusy(busy) {
        state.busy = busy;
        els.dropzone.disabled = busy;
        els.replaceBtn.disabled = busy;
        updateSendState();
    }

    function updateSendState() {
        els.sendBtn.disabled = state.busy || !els.question.value.trim();
    }

    function autoGrow() {
        const box = els.question;
        box.style.height = "auto";
        box.style.height = `${Math.min(box.scrollHeight, 180)}px`;
    }

    // ---------- 📄 Upload PDF ----------

    function setDoc(name) {
        state.doc = name || null;
        els.uploadCard.dataset.stage = state.doc ? "ready" : "empty";
        els.docName.textContent = state.doc || "";
        els.navDocName.textContent = state.doc || "No PDF uploaded";
        els.navDocDot.classList.toggle("ready", Boolean(state.doc));
        els.question.placeholder = state.doc
            ? "Ask anything about your document…"
            : "Upload a PDF first, then ask your question…";
    }

    function pickFile() {
        if (!state.busy) els.fileInput.click();
    }

    async function uploadFile(file) {
        if (!file || state.busy) return;
        if (!/\.pdf$/i.test(file.name)) {
            toast("Please choose a PDF file.", "error");
            return;
        }
        if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
            toast(`This PDF is larger than ${MAX_UPLOAD_MB} MB.`, "error");
            return;
        }

        const previous = state.doc;
        showUploadProgress({ doc_name: file.name, stage: "reading" });
        setBusy(true);

        const body = new FormData();
        body.append("pdf_file", file);

        try {
            const res = await fetch("/upload", { method: "POST", body });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                setDoc("doc_name" in data ? data.doc_name : previous);
                toast(data.message || `Upload failed (HTTP ${res.status}).`, "error");
                return;
            }
        } catch {
            setDoc(previous);
            toast("Could not reach the server. Is it still running?", "error");
            return;
        } finally {
            els.fileInput.value = "";
            setBusy(false);
        }

        await trackProcessing(previous);
    }

    function showUploadProgress(job) {
        const indexing = job.stage === "indexing" && job.total > 0;
        const percent = indexing ? Math.round((job.done / job.total) * 100) : 0;
        els.uploadCard.dataset.stage = "uploading";
        els.uploadingName.textContent = job.doc_name || "";
        els.uploadStatus.textContent = indexing
            ? `Indexing the PDF… ${percent}% (${job.done} / ${job.total} chunks)`
            : "Reading the PDF…";
        els.uploadBar.classList.toggle("indeterminate", !indexing);
        els.uploadBar.style.width = indexing ? `${percent}%` : "";
        if (indexing) els.uploadBar.setAttribute("aria-valuenow", String(percent));
        else els.uploadBar.removeAttribute("aria-valuenow");
    }

    // The server reads and indexes the PDF in the background; poll until it's done
    async function trackProcessing(previous) {
        setBusy(true);
        try {
            for (;;) {
                const job = await (await fetch("/upload/status")).json();
                if (job.state === "running") {
                    showUploadProgress(job);
                    await new Promise((resolve) => setTimeout(resolve, 800));
                    continue;
                }
                if (job.state === "done") {
                    setDoc(job.doc_name);
                    toast("PDF is ready. Ask your question!", "success");
                    els.question.focus();
                } else {
                    setDoc("doc_name" in job ? job.doc_name : previous);
                    toast(job.message || "Processing stopped. Please upload the PDF again.", "error");
                }
                return;
            }
        } catch {
            setDoc(previous);
            toast("Could not reach the server. Is it still running?", "error");
        } finally {
            setBusy(false);
        }
    }

    // ---------- ❓ Ask question ----------

    let elapsedTimer = null;

    async function ask(text) {
        const question = text.trim();
        if (!question || state.busy) return;
        if (!state.doc) {
            toast("Upload a PDF first, then ask your question.", "warn");
            flash(els.uploadCard);
            return;
        }

        stopListening();
        setBusy(true);
        els.sendBtn.classList.add("loading");
        els.loadingQuestion.textContent = question;
        els.elapsed.textContent = "";
        const started = Date.now();
        elapsedTimer = setInterval(() => {
            els.elapsed.textContent = `· ${Math.round((Date.now() - started) / 1000)}s`;
        }, 1000);
        showView("loading");
        els.loadingState.scrollIntoView({ block: "start", behavior: "smooth" });

        try {
            const res = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                const item = {
                    id: String(Date.now()),
                    question,
                    answer: data.answer,
                    flowchart: data.flowchart || null,
                    doc: data.doc_name || state.doc,
                    ts: Date.now(),
                };
                state.history = [item, ...state.history].slice(0, MAX_HISTORY);
                writeHistory();
                els.question.value = "";
                autoGrow();
                showAnswer(item);
            } else {
                if (data.need_upload) setDoc(null);
                showView(state.current ? "answer" : "empty");
                toast(data.message || `Something went wrong (HTTP ${res.status}).`, "error");
            }
        } catch {
            showView(state.current ? "answer" : "empty");
            toast("Could not reach the server. Is it still running?", "error");
        } finally {
            clearInterval(elapsedTimer);
            els.sendBtn.classList.remove("loading");
            setBusy(false);
        }
    }

    // ---------- 📘 Answer view ----------

    function showAnswer(item) {
        state.current = item;
        els.answerQuestion.textContent = item.question;
        els.answerMeta.textContent = [item.doc, formatDate(item.ts)].filter(Boolean).join(" · ");
        // Models sometimes wrap the HTML in a ```html fence
        els.panelAnswer.innerHTML = String(item.answer || "")
            .replace(/^\s*```(?:html)?\s*/i, "")
            .replace(/\s*```\s*$/, "");
        // 📊 Flowchart Diagram is shown below the answer
        els.flowCard.hidden = !item.flowchart;
        els.flowBtn.hidden = !item.flowchart;
        renderFlowchart(item.flowchart);
        showView("answer");
        renderHistory();
        els.answerView.scrollIntoView({ block: "start" });
    }

    // 📊 Professional flowchart look: nodes coloured by shape, plus a legend

    // [fill, border, text] per node type
    const FLOW_COLORS = {
        light: {
            start: ["#dcfce7", "#16a34a", "#14532d"],
            process: ["#dbeafe", "#2563eb", "#1e3a8a"],
            decision: ["#fef3c7", "#d97706", "#78350f"],
            io: ["#ede9fe", "#7c3aed", "#4c1d95"],
            data: ["#cffafe", "#0891b2", "#164e63"],
            end: ["#ffe4e6", "#e11d48", "#881337"],
        },
        dark: {
            start: ["#052e16", "#4ade80", "#dcfce7"],
            process: ["#172554", "#60a5fa", "#dbeafe"],
            decision: ["#451a03", "#fbbf24", "#fef3c7"],
            io: ["#2e1065", "#a78bfa", "#ede9fe"],
            data: ["#083344", "#22d3ee", "#cffafe"],
            end: ["#4c0519", "#fb7185", "#ffe4e6"],
        },
    };

    const FLOW_LABELS = {
        start: "Start",
        process: "Process",
        decision: "Decision",
        io: "Input / Output",
        data: "Data",
        end: "End",
    };

    const FLOW_THEME = {
        light: {
            primaryColor: "#dbeafe",
            primaryBorderColor: "#2563eb",
            primaryTextColor: "#1e3a8a",
            lineColor: "#64748b",
            edgeLabelBackground: "#ffffff",
            clusterBkg: "#f8fafc",
            clusterBorder: "#cbd5e1",
        },
        dark: {
            darkMode: true,
            background: "#121829",
            primaryColor: "#172554",
            primaryBorderColor: "#60a5fa",
            primaryTextColor: "#dbeafe",
            lineColor: "#94a3b8",
            edgeLabelBackground: "#121829",
            clusterBkg: "#182036",
            clusterBorder: "#334155",
        },
    };

    // Opening brackets of Mermaid node shapes, longest first
    const SHAPE_OPENERS = ["([", "((", "[(", "[[", "{{", "[/", "[\\", "[", "(", "{", ">"];
    const SHAPE_CLOSERS = { "[": "]", "(": ")", "{": "}", ">": "]" };

    // Finds node definitions such as A["Label"] or C{"Label"}: Map of id → { opener, label }
    function findFlowNodes(code) {
        const nodes = new Map();
        for (const line of code.split("\n")) {
            if (/^\s*(flowchart|graph|subgraph|direction|%%)\b/i.test(line) || /^\s*end\s*$/.test(line)) continue;
            let i = 0;
            while (i < line.length) {
                const ch = line[i];
                if (ch === '"' || ch === "|") {
                    // Skip quoted text and edge labels like -->|Yes|
                    const close = line.indexOf(ch, i + 1);
                    i = close < 0 ? line.length : close + 1;
                    continue;
                }
                const id = /^\w+/.exec(line.slice(i));
                if (!id) {
                    i++;
                    continue;
                }
                let j = i + id[0].length;
                const opener = SHAPE_OPENERS.find((o) => line.startsWith(o, j));
                if (!opener) {
                    i = j;
                    continue;
                }
                j += opener.length;
                let label = "";
                if (line[j] === '"') {
                    const close = line.indexOf('"', j + 1);
                    label = line.slice(j + 1, close < 0 ? undefined : close);
                    j = close < 0 ? line.length : close + 1;
                }
                const end = line.indexOf(SHAPE_CLOSERS[opener[0]], j);
                if (!label) label = line.slice(j, end < 0 ? undefined : end);
                if (!nodes.has(id[0])) nodes.set(id[0], { opener, label: label.replace(/[/\\()[\]{}]/g, "").trim() });
                i = end < 0 ? line.length : end + 1;
            }
        }
        return nodes;
    }

    function flowNodeType({ opener, label }) {
        if (opener[0] === "{") return "decision";
        if (opener === "[/" || opener === "[\\" || opener === ">") return "io";
        if (opener === "[(") return "data";
        if (/^(start|begin)\b/i.test(label)) return "start";
        if (/^(end|stop|finish)\b/i.test(label)) return "end";
        return "process";
    }

    // Adds classDef colours for every node type found in the diagram
    function styleFlowchart(code, palette) {
        let header = false;
        const body = code
            .split("\n")
            .filter((line) => {
                // Drop colours the model added itself, and repeated "flowchart TD" headers
                if (/^\s*(classDef|class|style|linkStyle)\s/i.test(line)) return false;
                if (!/^\s*(flowchart|graph)\b/i.test(line)) return true;
                if (header) return false;
                header = true;
                return true;
            })
            .join("\n");

        const groups = {};
        for (const [id, node] of findFlowNodes(body)) (groups[flowNodeType(node)] ||= []).push(id);

        const styles = Object.entries(groups).flatMap(([type, ids]) => {
            const [fill, stroke, color] = palette[type];
            return [
                `classDef fc_${type} fill:${fill},stroke:${stroke},color:${color},stroke-width:1.5px`,
                `class ${ids.join(",")} fc_${type}`,
            ];
        });
        return { code: [body, ...styles].join("\n"), types: Object.keys(groups) };
    }

    function flowLegend(types, palette) {
        const legend = document.createElement("div");
        legend.className = "flow-legend";
        for (const type of Object.keys(FLOW_LABELS)) {
            if (!types.includes(type)) continue;
            const swatch = document.createElement("span");
            swatch.className = "flow-swatch";
            swatch.style.background = palette[type][0];
            swatch.style.borderColor = palette[type][1];
            const item = document.createElement("span");
            item.className = "flow-legend-item";
            item.append(swatch, FLOW_LABELS[type]);
            legend.append(item);
        }
        return legend;
    }

    let flowRenderId = 0;

    async function renderFlowchart(code) {
        const id = ++flowRenderId;

        if (!code) {
            els.panelFlow.innerHTML = '<p class="muted">No flowchart for this answer.</p>';
            return;
        }
        if (!window.mermaid) {
            showFlowSource(code, "The flowchart library didn't load (check your internet connection). Diagram code:");
            return;
        }

        els.panelFlow.innerHTML = '<p class="muted">Drawing flowchart…</p>';
        try {
            const theme = currentTheme();
            const palette = FLOW_COLORS[theme];
            mermaid.initialize({
                startOnLoad: false,
                securityLevel: "loose",
                theme: "base",
                themeVariables: { fontFamily: "Inter, Segoe UI, sans-serif", fontSize: "14px", ...FLOW_THEME[theme] },
                flowchart: { curve: "basis", padding: 14, nodeSpacing: 40, rankSpacing: 50 },
            });

            // Draw the coloured version; if it doesn't parse, draw the diagram as the model wrote it
            const styled = styleFlowchart(code, palette);
            let source = styled.code;
            if (!(await mermaid.parse(source, { suppressErrors: true }))) {
                source = code;
                if (!(await mermaid.parse(source, { suppressErrors: true }))) throw new Error("Invalid diagram");
            }
            const { svg } = await mermaid.render(`flowchart-${id}`, source);
            if (id !== flowRenderId) return;
            els.panelFlow.innerHTML = svg;
            els.panelFlow.dataset.styled = String(source === styled.code);
            if (source === styled.code && styled.types.length > 1) {
                els.panelFlow.append(flowLegend(styled.types, palette));
            }
        } catch {
            if (id === flowRenderId) showFlowSource(code, "This flowchart couldn't be drawn. Diagram code:");
        }
    }

    function showFlowSource(code, note) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = note;
        const pre = document.createElement("pre");
        pre.className = "flow-source";
        pre.textContent = code;
        els.panelFlow.replaceChildren(p, pre);
    }

    // ---------- History ----------

    function renderHistory() {
        const query = els.historySearch.value.trim().toLowerCase();
        const items = state.history.filter((item) => item.question.toLowerCase().includes(query));
        els.historyList.replaceChildren(...items.map(historyRow));
        els.historyEmpty.hidden = items.length > 0;
        els.historyEmpty.textContent = state.history.length
            ? "No questions match your search"
            : "Your questions will appear here";
        els.clearHistory.hidden = state.history.length === 0;
    }

    function historyRow(item) {
        const row = document.createElement("li");

        const open = document.createElement("button");
        open.type = "button";
        open.className = "history-item";
        open.classList.toggle("active", state.current?.id === item.id);
        open.title = item.question;
        open.innerHTML =
            '<svg class="icon" aria-hidden="true"><use href="#i-message"/></svg>' +
            '<span class="hi-text"><span class="hi-q"></span><span class="hi-meta"></span></span>';
        open.querySelector(".hi-q").textContent = item.question;
        open.querySelector(".hi-meta").textContent = [timeAgo(item.ts), item.doc].filter(Boolean).join(" · ");
        open.addEventListener("click", () => {
            if (state.busy) {
                toast("Please wait for the current answer to finish.", "info");
                return;
            }
            showAnswer(item);
            closeSidebar();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "hi-del";
        remove.title = "Delete";
        remove.setAttribute("aria-label", `Delete "${item.question}" from history`);
        remove.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x"/></svg>';
        remove.addEventListener("click", () => deleteHistory(item.id));

        row.append(open, remove);
        return row;
    }

    function deleteHistory(id) {
        state.history = state.history.filter((item) => item.id !== id);
        writeHistory();
        if (state.current?.id === id) {
            state.current = null;
            if (!state.busy) showView("empty");
        }
        renderHistory();
    }

    // ---------- 🎤 Voice input ----------

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;

    const VOICE_ERRORS = {
        "not-allowed": "Microphone access is blocked. Allow it from the icon in the address bar.",
        "service-not-allowed": "Microphone access is blocked. Allow it from the icon in the address bar.",
        "audio-capture": "No microphone was found.",
        "no-speech": "Didn't hear anything. Click the mic and try again.",
        network: "Voice input needs an internet connection.",
    };

    function setListening(on) {
        els.micBtn.classList.toggle("listening", on);
        els.micBtn.setAttribute("aria-pressed", String(on));
        els.micBtn.title = on ? "Stop listening" : "Speak your question";
        els.listening.hidden = !on;
        els.hint.hidden = on;
    }

    function startListening() {
        const rec = new SpeechRecognition();
        rec.lang = els.voiceLang.value;
        rec.interimResults = true;
        rec.continuous = true;

        // Spoken words are added after anything already typed
        const typed = els.question.value.trim();
        rec.onresult = (event) => {
            let spoken = "";
            for (let i = 0; i < event.results.length; i++) spoken += event.results[i][0].transcript;
            els.question.value = [typed, spoken.trim()].filter(Boolean).join(" ");
            autoGrow();
            updateSendState();
        };
        rec.onerror = (event) => {
            if (event.error === "aborted") return;
            toast(
                VOICE_ERRORS[event.error] || `Voice input error: ${event.error}`,
                event.error === "no-speech" ? "warn" : "error"
            );
        };
        rec.onend = () => {
            recognizer = null;
            setListening(false);
            els.question.focus();
        };

        try {
            rec.start();
            recognizer = rec;
            setListening(true);
        } catch {
            toast("Couldn't start voice input. Try again.", "error");
        }
    }

    function stopListening() {
        if (recognizer) recognizer.stop();
    }

    // ---------- Wiring ----------

    els.menuBtn.addEventListener("click", () => els.app.classList.add("sidebar-open"));
    els.scrim.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeSidebar();
    });

    els.newBtn.addEventListener("click", () => {
        if (!state.busy) {
            state.current = null;
            showView("empty");
            renderHistory();
        }
        closeSidebar();
        els.question.focus();
    });

    els.navAsk.addEventListener("click", () => {
        closeSidebar();
        els.question.focus();
    });

    els.navDoc.addEventListener("click", () => {
        closeSidebar();
        els.uploadCard.scrollIntoView({ block: "start", behavior: "smooth" });
        flash(els.uploadCard);
    });

    els.themeToggle.addEventListener("click", () => {
        const theme = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch {
            // Theme just won't be remembered
        }
        if (state.current) renderFlowchart(state.current.flowchart);
    });

    els.historySearch.addEventListener("input", renderHistory);
    els.clearHistory.addEventListener("click", () => {
        if (!confirm("Delete all questions from history?")) return;
        state.history = [];
        state.current = null;
        writeHistory();
        if (!state.busy) showView("empty");
        renderHistory();
    });

    els.dropzone.addEventListener("click", pickFile);
    els.replaceBtn.addEventListener("click", pickFile);
    els.fileInput.addEventListener("change", () => uploadFile(els.fileInput.files[0]));

    els.uploadCard.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (!state.busy) els.uploadCard.classList.add("dragover");
    });
    els.uploadCard.addEventListener("dragleave", (event) => {
        if (!els.uploadCard.contains(event.relatedTarget)) els.uploadCard.classList.remove("dragover");
    });
    els.uploadCard.addEventListener("drop", (event) => {
        event.preventDefault();
        els.uploadCard.classList.remove("dragover");
        uploadFile(event.dataTransfer.files[0]);
    });
    // Don't let a PDF dropped outside the card replace the whole page
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => event.preventDefault());

    els.question.addEventListener("input", () => {
        autoGrow();
        updateSendState();
    });
    els.question.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            ask(els.question.value);
        }
    });
    els.askForm.addEventListener("submit", (event) => {
        event.preventDefault();
        ask(els.question.value);
    });

    document.querySelectorAll("[data-suggest]").forEach((chip) => {
        chip.addEventListener("click", () => {
            els.question.value = chip.dataset.suggest;
            autoGrow();
            updateSendState();
            els.question.focus();
        });
    });

    els.flowBtn.addEventListener("click", () => {
        els.flowCard.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    els.copyBtn.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(els.panelAnswer.innerText.trim());
            toast("Answer copied to clipboard.", "success");
        } catch {
            toast("Couldn't copy. Select the text and press Ctrl+C.", "error");
        }
    });

    if (SpeechRecognition) {
        els.micBtn.addEventListener("click", () => (recognizer ? stopListening() : startListening()));
    } else {
        els.micBtn.disabled = true;
        els.voiceLang.disabled = true;
        els.micBtn.title = "Voice input isn't supported in this browser. Use Chrome or Edge.";
    }

    // ---------- Start ----------

    setDoc(state.doc);
    renderHistory();
    updateSendState();

    // A PDF may still be processing from before this page was (re)loaded
    fetch("/upload/status")
        .then((res) => res.json())
        .then((job) => {
            if (job.state === "running") trackProcessing(state.doc);
        })
        .catch(() => {});
})();
