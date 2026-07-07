(() => {
  "use strict";

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

  // ---------- lead form (prototype: 送信先未接続) ----------
  // 公開時は FORM_ENDPOINT に送信先URL（Google Forms / Tally / 自前API）を設定する。
  const FORM_ENDPOINT = "";

  const form = document.querySelector("[data-lead-form]");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const statusEl = form.querySelector("[data-form-status]");

      if (!form.reportValidity()) return;

      if (!FORM_ENDPOINT) {
        showToast("プロトタイプのため、送信は接続されていません（公開時に接続します）。");
        if (statusEl) statusEl.textContent = "プロトタイプ: 送信先未接続";
        return;
      }

      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          body: new FormData(form),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        form.reset();
        showToast("送信しました。営業日24時間以内にご返信します。");
        if (statusEl) statusEl.textContent = "送信完了";
      } catch (err) {
        showToast("送信に失敗しました。時間をおいて再度お試しください。");
        if (statusEl) statusEl.textContent = "送信失敗";
      }
    });
  }
})();
