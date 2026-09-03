(function () {
  "use strict";

  var SCRIPT = document.currentScript;
  if (!SCRIPT) return;

  var AGENT_ID = SCRIPT.getAttribute("data-agent-id");
  if (!AGENT_ID) {
    console.error("[Campusly] data-agent-id is required on the script tag");
    return;
  }

  var API_BASE = (function () {
    var src = SCRIPT.src || "";
    try {
      var u = new URL(src);
      return u.origin;
    } catch {
      return window.location.origin;
    }
  })();

  var state = {
    open: false,
    conversationId: null,
    busy: false,
    messages: [],
    context: {},
    identity: null,
    config: {
      primaryColor: "#0C5C4C",
      welcomeMessage: "Hi! How can I help you today?",
      placeholder: "Ask a question...",
      position: "bottom-right",
    },
  };

  var root = document.createElement("div");
  root.id = "campusly-widget-root";
  root.setAttribute("data-agent-id", AGENT_ID);
  document.body.appendChild(root);

  var style = document.createElement("style");
  style.textContent =
    "#campusly-widget-root * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }" +
    "#campusly-launcher { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.15); z-index: 2147483000; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 24px; transition: transform 0.2s; }" +
    "#campusly-launcher:hover { transform: scale(1.05); }" +
    "#campusly-panel { position: fixed; bottom: 90px; right: 20px; width: 380px; max-width: calc(100vw - 40px); height: 520px; max-height: calc(100vh - 120px); background: #fff; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.12); z-index: 2147483000; display: none; flex-direction: column; overflow: hidden; border: 1px solid #c9dbd3; }" +
    "#campusly-panel.open { display: flex; }" +
    "#campusly-header { padding: 14px 16px; color: #fff; font-weight: 600; font-size: 15px; }" +
    "#campusly-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; background: #f7fbf9; }" +
    ".campusly-msg { max-width: 90%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; }" +
    ".campusly-msg.user { align-self: flex-end; color: #fff; }" +
    ".campusly-msg.assistant { align-self: flex-start; background: #fff; color: #14231f; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }" +
    "#campusly-form { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #c9dbd3; background: #fff; }" +
    "#campusly-input { flex: 1; border: 1px solid #c9dbd3; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; }" +
    "#campusly-input:focus { border-color: #0c5c4c; }" +
    "#campusly-send { border: none; border-radius: 10px; padding: 10px 16px; color: #fff; cursor: pointer; font-size: 14px; font-weight: 500; }" +
    "#campusly-send:disabled { opacity: 0.5; cursor: not-allowed; }" +
    ".campusly-loading { font-size: 13px; color: #5b6f68; padding: 8px 14px; }" +
    ".campusly-part { margin-top: 8px; padding: 10px; border-radius: 12px; background: #f0f7f4; border: 1px solid #c9dbd3; font-size: 13px; }" +
    ".campusly-part a { color: #0c5c4c; }" +
    ".campusly-part-title { font-weight: 600; margin-bottom: 4px; }" +
    ".campusly-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }" +
    ".campusly-btns button { border: 1px solid #c9dbd3; background: #fff; border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer; }";
  document.head.appendChild(style);

  var launcher = document.createElement("button");
  launcher.id = "campusly-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = "💬";
  launcher.style.background = state.config.primaryColor;

  var panel = document.createElement("div");
  panel.id = "campusly-panel";

  var header = document.createElement("div");
  header.id = "campusly-header";
  header.textContent = "Campusly Assistant";
  header.style.background = state.config.primaryColor;

  var messagesEl = document.createElement("div");
  messagesEl.id = "campusly-messages";

  var form = document.createElement("form");
  form.id = "campusly-form";

  var input = document.createElement("input");
  input.id = "campusly-input";
  input.type = "text";
  input.placeholder = state.config.placeholder;

  var sendBtn = document.createElement("button");
  sendBtn.id = "campusly-send";
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  sendBtn.style.background = state.config.primaryColor;

  form.appendChild(input);
  form.appendChild(sendBtn);
  panel.appendChild(header);
  panel.appendChild(messagesEl);
  panel.appendChild(form);
  root.appendChild(launcher);
  root.appendChild(panel);

  function renderPart(part, parent) {
    if (!part || !part.type) return;
    if (part.type === "text") return;
    var box = document.createElement("div");
    box.className = "campusly-part";
    if (part.type === "order_status") {
      box.innerHTML =
        '<div class="campusly-part-title">Order ' +
        escapeHtml(part.orderId || "") +
        "</div>" +
        "<div>Status: " +
        escapeHtml(part.status || "") +
        "</div>" +
        (part.eta ? "<div>ETA: " + escapeHtml(part.eta) + "</div>" : "") +
        (part.trackingUrl
          ? '<div><a href="' +
            escapeAttr(part.trackingUrl) +
            '" target="_blank" rel="noopener">Track package</a></div>'
          : "");
    } else if (part.type === "product_card" || part.type === "course_card") {
      box.innerHTML =
        '<div class="campusly-part-title">' +
        escapeHtml(part.title || "") +
        "</div>" +
        (part.subtitle ? "<div>" + escapeHtml(part.subtitle) + "</div>" : "") +
        (part.price ? "<div>" + escapeHtml(part.price) + "</div>" : "") +
        (part.href
          ? '<div><a href="' + escapeAttr(part.href) + '" target="_blank" rel="noopener">View</a></div>'
          : "");
    } else if (part.type === "booking_card") {
      box.innerHTML =
        '<div class="campusly-part-title">' +
        escapeHtml(part.title || "Booking") +
        "</div>" +
        (part.startsAt ? "<div>" + escapeHtml(part.startsAt) + "</div>" : "") +
        (part.location ? "<div>" + escapeHtml(part.location) + "</div>" : "");
    } else if (part.type === "account_card") {
      var fields = (part.fields || [])
        .map(function (f) {
          return "<div><strong>" + escapeHtml(f.label) + ":</strong> " + escapeHtml(f.value) + "</div>";
        })
        .join("");
      box.innerHTML = '<div class="campusly-part-title">' + escapeHtml(part.title || "Account") + "</div>" + fields;
    } else if (part.type === "button_group") {
      var row = document.createElement("div");
      row.className = "campusly-btns";
      (part.items || []).forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = item.label || "Choose";
        b.addEventListener("click", function () {
          if (item.href) window.open(item.href, "_blank");
          else sendMessage(item.label || item.value || item.action);
        });
        row.appendChild(b);
      });
      parent.appendChild(row);
      return;
    } else if (part.type === "citations") {
      box.innerHTML =
        '<div class="campusly-part-title">Sources</div>' +
        (part.items || [])
          .map(function (c) {
            return (
              "<div>" +
              escapeHtml(c.title || "Source") +
              (c.url ? ' — <a href="' + escapeAttr(c.url) + '" target="_blank" rel="noopener">link</a>' : "") +
              "</div>"
            );
          })
          .join("");
    } else if (part.type === "cta") {
      box.innerHTML =
        '<a href="' + escapeAttr(part.href || "#") + '" target="_blank" rel="noopener">' + escapeHtml(part.label || "Open") + "</a>";
    } else {
      return;
    }
    parent.appendChild(box);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function renderMessages() {
    messagesEl.innerHTML = "";
    if (state.messages.length === 0 && state.config.welcomeMessage) {
      var welcome = document.createElement("div");
      welcome.className = "campusly-msg assistant";
      welcome.textContent = state.config.welcomeMessage;
      messagesEl.appendChild(welcome);
    }
    state.messages.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "campusly-msg " + m.role;
      if (m.role === "user") {
        el.style.background = state.config.primaryColor;
      }
      var text = document.createElement("div");
      text.textContent = m.content || "";
      el.appendChild(text);
      if (m.parts && m.parts.length) {
        m.parts.forEach(function (p) {
          renderPart(p, el);
        });
      }
      messagesEl.appendChild(el);
    });
    if (state.busy) {
      var loading = document.createElement("div");
      loading.className = "campusly-loading";
      loading.textContent = "Thinking…";
      messagesEl.appendChild(loading);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendMessage(text) {
    if (!text || !text.trim() || state.busy) return;
    state.busy = true;
    state.messages.push({ role: "user", content: text.trim() });
    renderMessages();
    input.value = "";

    fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: AGENT_ID,
        message: text.trim(),
        conversationId: state.conversationId,
        public: true,
        pageUrl: window.location.href,
        pageTitle: document.title,
        channel: "widget",
        metadata: state.context,
        identity: state.identity,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Chat failed");
          return data;
        });
      })
      .then(function (data) {
        state.conversationId = data.conversationId;
        state.messages.push({
          role: "assistant",
          content: data.content || "",
          parts: data.parts || [],
        });
      })
      .catch(function (err) {
        state.messages.push({
          role: "assistant",
          content: err.message || "Something went wrong",
        });
      })
      .finally(function () {
        state.busy = false;
        renderMessages();
      });
  }

  function open() {
    state.open = true;
    panel.classList.add("open");
    launcher.innerHTML = "✕";
    input.focus();
  }

  function close() {
    state.open = false;
    panel.classList.remove("open");
    launcher.innerHTML = "💬";
  }

  function toggle() {
    if (state.open) close();
    else open();
  }

  launcher.addEventListener("click", toggle);
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage(input.value);
  });

  window.campusly = {
    open: open,
    close: close,
    toggle: toggle,
    sendMessage: sendMessage,
    identify: function (user) {
      state.identity = user;
    },
    setContext: function (ctx) {
      state.context = ctx || {};
    },
    getConversationId: function () {
      return state.conversationId;
    },
    setConfig: function (cfg) {
      if (!cfg) return;
      if (cfg.primaryColor) {
        state.config.primaryColor = cfg.primaryColor;
        launcher.style.background = cfg.primaryColor;
        header.style.background = cfg.primaryColor;
        sendBtn.style.background = cfg.primaryColor;
      }
      if (cfg.welcomeMessage) state.config.welcomeMessage = cfg.welcomeMessage;
      if (cfg.placeholder) {
        state.config.placeholder = cfg.placeholder;
        input.placeholder = cfg.placeholder;
      }
      if (cfg.headerTitle) header.textContent = cfg.headerTitle;
      renderMessages();
    },
  };

  renderMessages();
})();
