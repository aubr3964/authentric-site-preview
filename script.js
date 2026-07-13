/* ================================ 公開前設定 ================================
 * FORM_ENDPOINT: フォーム送信先URL（Google Apps Script等のPOST先）。
 *                空のままの場合はプレビューモード（この端末のlocalStorageに保存）。
 * GA4_MEASUREMENT_ID: "G-XXXXXXXXXX" 形式。空のままの場合は計測タグを読み込まない
 *                     （イベントはconsole.debugとCustomEventにのみ流れる）。
 * ========================================================================== */
const CONFIG = {
  FORM_ENDPOINT: "",
  GA4_MEASUREMENT_ID: "",
};

(() => {
  "use strict";

  // CSS側の .reveal はこのクラスがある場合のみ非表示から始まる（JS失敗時の安全弁）
  document.documentElement.classList.add("js");

  // ---------- analytics ----------
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

  document.querySelectorAll("[data-cta]").forEach((node) => {
    node.addEventListener("click", () => {
      track("cta_click", { cta_id: node.dataset.cta });
    });
  });

  // ---------- scroll depth ----------
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
      if (fired.size === marks.length) window.removeEventListener("scroll", onScroll);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
  })();

  // ---------- mobile nav ----------
  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  // ---------- reveal on scroll ----------
  const revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealed.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );
    revealed.forEach((el) => io.observe(el));
  } else {
    revealed.forEach((el) => el.classList.add("in"));
  }

  // ---------- toast ----------
  const toast = document.querySelector("[data-toast]");
  let toastTimer = null;
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 4200);
  };

  // ---------- lead form ----------
  const form = document.querySelector("[data-lead-form]");
  if (form) {
    let submitting = false;

    const setGroupError = (name, message) => {
      const errorNode = form.querySelector(`[data-error-for="${name}"]`);
      if (errorNode) errorNode.textContent = message || "";
    };

    // 「必須」表記のチェックボックス群・同意はHTML標準のrequiredが効かない/足りないためJSで検証する
    const validateGroups = () => {
      let firstInvalid = null;

      const interests = form.querySelectorAll('input[name="interest"]:checked');
      setGroupError("interest", interests.length ? "" : "関心のあるサービスを1つ以上選択してください。");
      if (!interests.length) firstInvalid = form.querySelector('input[name="interest"]');

      const consent = form.querySelector('input[name="privacy_consent"]');
      if (consent) {
        setGroupError("privacy_consent", consent.checked ? "" : "プライバシーポリシーへの同意が必要です。");
        if (!consent.checked && !firstInvalid) firstInvalid = consent;
      }

      return firstInvalid;
    };

    form.addEventListener("input", (e) => {
      const name = e.target.name;
      if (name === "interest" || name === "privacy_consent") setGroupError(name, "");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submitting) return;
      const statusEl = form.querySelector("[data-form-status]");

      // honeypot: botが隠しフィールドを埋めた場合は成功を装って捨てる
      if (form.elements.company_url && form.elements.company_url.value) {
        showToast("送信しました。営業日24時間以内にご返信します。");
        return;
      }

      if (!form.reportValidity()) return;

      const firstInvalid = validateGroups();
      if (firstInvalid) {
        firstInvalid.focus();
        track("form_error", { reason: "validation" });
        return;
      }

      const formData = new FormData(form);
      formData.delete("company_url");
      const payload = Object.fromEntries(formData.entries());
      payload.interest = formData.getAll("interest");
      payload.source = "authentric_corporate_site";
      payload.page_url = window.location.href;
      payload.submitted_at = new Date().toISOString();

      if (!CONFIG.FORM_ENDPOINT) {
        localStorage.setItem("authentric_corporate_last_lead", JSON.stringify(payload));
        showToast("プレビューモード: 送信内容はこの端末にのみ保存されました（公開時に接続します）。");
        if (statusEl) statusEl.textContent = "プレビューモード: 送信先未接続";
        track("form_submit_success", { mode: "preview" });
        return;
      }

      submitting = true;
      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      try {
        const res = await fetch(CONFIG.FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        showToast("送信しました。営業日24時間以内にご返信します。");
        if (statusEl) statusEl.textContent = "送信完了";
        track("form_submit_success", { mode: "live" });
      } catch (err) {
        showToast("送信に失敗しました。時間をおいて再度お試しください。");
        if (statusEl) statusEl.textContent = "送信失敗";
        track("form_submit_error", { message: String(err && err.message) });
      } finally {
        submitting = false;
        if (submitButton) submitButton.disabled = false;
      }
    });
  }
})();
