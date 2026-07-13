/* ================================ 公開前設定 ================================
 * FORM_ENDPOINT: フォーム送信先URL（Google Apps Script / Formspree等のPOST先）。
 *                空のままの場合はプレビューモード（この端末のlocalStorageに保存）。
 * GA4_MEASUREMENT_ID: "G-XXXXXXXXXX" 形式。空のままの場合は計測タグを読み込まない
 *                     （イベントはconsole.debugとCustomEventにのみ流れる）。
 * ========================================================================== */
const CONFIG = {
  FORM_ENDPOINT: "",
  GA4_MEASUREMENT_ID: "",
};

/* ------------------------------- analytics ------------------------------- */

function initAnalytics() {
  if (!CONFIG.GA4_MEASUREMENT_ID) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CONFIG.GA4_MEASUREMENT_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", CONFIG.GA4_MEASUREMENT_ID);
}

function track(eventName, params = {}) {
  const detail = { event: eventName, ...params, path: window.location.pathname, timestamp: new Date().toISOString() };

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  } else {
    console.debug("[authentric:track]", detail);
  }

  window.dispatchEvent(new CustomEvent("authentric:track", { detail }));
}

initAnalytics();

/* ------------------------------- CTA clicks ------------------------------ */

document.querySelectorAll("[data-cta]").forEach((node) => {
  node.addEventListener("click", () => {
    track("cta_click", { cta_id: node.dataset.cta });
  });
});

/* ------------------------------ scroll depth ----------------------------- */

(() => {
  const marks = [25, 50, 75, 100];
  const fired = new Set();

  function onScroll() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const percent = Math.round((window.scrollY / scrollable) * 100);

    marks.forEach((mark) => {
      if (percent >= mark && !fired.has(mark)) {
        fired.add(mark);
        track("scroll_depth", { percent: mark });
      }
    });

    if (fired.size === marks.length) {
      window.removeEventListener("scroll", onScroll);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
})();

/* ------------------------------- sticky CTA ------------------------------ */

(() => {
  const sticky = document.querySelector("[data-sticky-cta]");
  const hero = document.querySelector(".panel-01");
  const consult = document.getElementById("consultation");
  if (!sticky || !hero || !consult || !("IntersectionObserver" in window)) return;

  sticky.hidden = false;

  let heroVisible = true;
  let consultVisible = false;

  function update() {
    const show = !heroVisible && !consultVisible;
    sticky.classList.toggle("is-visible", show);
    document.body.classList.toggle("has-sticky-cta", show);
  }

  new IntersectionObserver(
    ([entry]) => {
      heroVisible = entry.isIntersecting;
      update();
    },
    { threshold: 0.08 }
  ).observe(hero);

  new IntersectionObserver(
    ([entry]) => {
      consultVisible = entry.isIntersecting;
      update();
    },
    { threshold: 0.08 }
  ).observe(consult);
})();

/* ------------------------------ FAQ tracking ----------------------------- */

document.querySelectorAll(".faq-item").forEach((item) => {
  item.addEventListener("toggle", () => {
    if (item.open) {
      track("faq_open", { faq_id: item.dataset.faq || "" });
    }
  });
});

/* --------------------------------- form ---------------------------------- */

(() => {
  const form = document.querySelector("[data-lead-form]");
  if (!form) return;

  const card = document.querySelector("[data-form-card]");
  const thanks = document.querySelector("[data-form-thanks]");
  const previewNote = document.querySelector("[data-preview-note]");
  const statusNode = form.querySelector("[data-form-status]");
  const submitButton = form.querySelector(".submit-button");
  let submitting = false;

  const messages = {
    company: "会社名を入力してください。",
    name: "お名前を入力してください。",
    email: "メールアドレスを入力してください。",
    email_format: "メールアドレスの形式が正しくありません。",
    employees: "従業員数を選択してください。",
    ai_status: "現在のAI活用状況を選択してください。",
    services: "関心のあるサービスを1つ以上選択してください。",
    privacy_consent: "プライバシーポリシーへの同意が必要です。",
  };

  function setFieldError(fieldName, message) {
    const errorNode = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (errorNode) errorNode.textContent = message || "";

    const input = form.elements[fieldName];
    const target = input instanceof RadioNodeList ? null : input;
    if (target && target.setAttribute) {
      if (message) {
        target.setAttribute("aria-invalid", "true");
      } else {
        target.removeAttribute("aria-invalid");
      }
    }
  }

  function validate() {
    let firstInvalid = null;

    ["company", "name"].forEach((fieldName) => {
      const value = form.elements[fieldName].value.trim();
      setFieldError(fieldName, value ? "" : messages[fieldName]);
      if (!value && !firstInvalid) firstInvalid = form.elements[fieldName];
    });

    const email = form.elements.email.value.trim();
    if (!email) {
      setFieldError("email", messages.email);
      if (!firstInvalid) firstInvalid = form.elements.email;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFieldError("email", messages.email_format);
      if (!firstInvalid) firstInvalid = form.elements.email;
    } else {
      setFieldError("email", "");
    }

    ["employees", "ai_status"].forEach((fieldName) => {
      const value = form.elements[fieldName].value;
      setFieldError(fieldName, value ? "" : messages[fieldName]);
      if (!value && !firstInvalid) firstInvalid = form.elements[fieldName];
    });

    const services = form.querySelectorAll('input[name="services"]:checked');
    setFieldError("services", services.length ? "" : messages.services);
    if (!services.length && !firstInvalid) {
      firstInvalid = form.querySelector('input[name="services"]');
    }

    const consent = form.querySelector('input[name="privacy_consent"]');
    setFieldError("privacy_consent", consent.checked ? "" : messages.privacy_consent);
    if (!consent.checked && !firstInvalid) firstInvalid = consent;

    return firstInvalid;
  }

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.toggle("is-error", Boolean(isError));
  }

  function buildPayload() {
    const formData = new FormData(form);
    return {
      company: (formData.get("company") || "").trim(),
      name: (formData.get("name") || "").trim(),
      role: (formData.get("role") || "").trim(),
      email: (formData.get("email") || "").trim(),
      tel: (formData.get("tel") || "").trim(),
      employees: formData.get("employees") || "",
      ai_status: formData.get("ai_status") || "",
      services: formData.getAll("services"),
      message: (formData.get("message") || "").trim(),
      contact_method: formData.get("contact_method") || "",
      privacy_consent: true,
      source: "authentric_ai_agent_lp",
      page_url: window.location.href,
      submitted_at: new Date().toISOString(),
    };
  }

  function showThanks(previewMode) {
    form.hidden = true;
    thanks.hidden = false;
    if (previewNote) previewNote.hidden = !previewMode;
    thanks.focus({ preventScroll: false });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;

    // honeypot: bots fill hidden fields — silently pretend success
    if (form.elements.company_url && form.elements.company_url.value) {
      showThanks(false);
      return;
    }

    const firstInvalid = validate();
    if (firstInvalid) {
      setStatus("入力内容をご確認ください。", true);
      firstInvalid.focus();
      track("form_error", { reason: "validation" });
      return;
    }

    setStatus("", false);
    submitting = true;
    submitButton.disabled = true;
    submitButton.classList.add("is-loading");
    submitButton.querySelector(".submit-label").textContent = "送信中…";

    const payload = buildPayload();

    try {
      if (CONFIG.FORM_ENDPOINT) {
        const response = await fetch(CONFIG.FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`Form endpoint returned ${response.status}`);
        }
        track("form_submit_success", { mode: "live" });
        showThanks(false);
      } else {
        localStorage.setItem("authentric_ai_agent_lp_last_lead", JSON.stringify(payload));
        track("form_submit_success", { mode: "preview" });
        showThanks(true);
      }
    } catch (error) {
      console.error(error);
      track("form_submit_error", { message: String(error && error.message) });
      setStatus("送信に失敗しました。お手数ですが、時間をおいて再度お試しください。", true);
      submitButton.disabled = false;
      submitButton.classList.remove("is-loading");
      submitButton.querySelector(".submit-label").textContent = "無料相談を申し込む";
      submitting = false;
    }
  });

  // clear field errors as the user fixes input
  form.addEventListener("input", (event) => {
    const name = event.target.name;
    if (!name) return;
    if (name === "services" || name === "privacy_consent") {
      setFieldError(name, "");
    } else if (form.querySelector(`[data-error-for="${name}"]`)) {
      if (event.target.value.trim()) setFieldError(name, "");
    }
  });
})();
