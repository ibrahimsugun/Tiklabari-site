/**
 * ============================================================
 * TIKLABARI — Navigation Header JavaScript
 * Dosya: nav/navbar.js
 * ============================================================
 *
 * Görevler:
 *  1. Mobil hamburger menüsü aç/kapat
 *  2. Mobil dropdown accordion (tıklama ile aç/kapat)
 *  3. Dışarı tıklayınca dropdown'ları kapat
 *  4. Escape tuşuyla her şeyi kapat
 *  5. Scroll tespiti (is-scrolled sınıfı)
 *  6. Klavye erişilebilirliği (ARIA güncellemeleri)
 *
 * NOT: Bu dosya herhangi bir framework gerektirmez.
 * Vanilla JS ile yazılmıştır. defer ile yüklenebilir.
 * ============================================================
 */

(function () {
  "use strict";

  // ── Yardımcı: Güvenli querySelector
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  // ── DOM Referansları
  const nav = $(".tkl-nav");
  const hamburger = $("#tkl-hamburger");
  const menu = $("#tkl-main-nav");
  const dropdownItems = $$(".tkl-nav__item--dropdown");

  if (!nav) {
    console.warn("[TKL Nav] .tkl-nav elementi bulunamadı.");
    return;
  }

  // ─────────────────────────────────────────────────────
  // 1. SCROLL TESPİTİ
  //    Sayfa 10px scroll edildiğinde nav'a 'is-scrolled'
  //    sınıfı eklenir → backdrop daha belirgin hale gelir.
  // ─────────────────────────────────────────────────────
  function handleScroll() {
    if (window.scrollY > 10) {
      nav.classList.add("is-scrolled");
    } else {
      nav.classList.remove("is-scrolled");
    }
  }

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll(); // Sayfa yüklenir yüklenmez çalıştır

  // ─────────────────────────────────────────────────────
  // 2. HAMBURGERİ AÇ/KAPAT (Mobil)
  // ─────────────────────────────────────────────────────
  function closeMobileMenu() {
    if (!menu || !hamburger) return;
    menu.classList.remove("is-open");
    hamburger.setAttribute("aria-expanded", "false");
    // Tüm açık dropdown'ları da kapat
    closeAllDropdowns();
  }

  function openMobileMenu() {
    if (!menu || !hamburger) return;
    menu.classList.add("is-open");
    hamburger.setAttribute("aria-expanded", "true");
  }

  function toggleMobileMenu() {
    const isOpen = hamburger.getAttribute("aria-expanded") === "true";
    if (isOpen) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  if (hamburger) {
    hamburger.addEventListener("click", toggleMobileMenu);
  }

  // ─────────────────────────────────────────────────────
  // 3. DROPDOWN YÖNETİMİ
  //    Masaüstü: CSS hover yeterli + ARIA güncellemeleri
  //    Mobil: Tıklama ile accordion davranışı
  // ─────────────────────────────────────────────────────

  /**
   * Bir dropdown'u kapat
   * @param {Element} item - .tkl-nav__item--dropdown elementi
   */
  function closeDropdown(item) {
    const btn = $(".tkl-nav__link--dropdown", item);
    const panel = $(".tkl-nav__dropdown", item);
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (panel) panel.classList.remove("is-open");
  }

  /**
   * Tüm dropdown'ları kapat
   */
  function closeAllDropdowns() {
    dropdownItems.forEach(closeDropdown);
  }

  /**
   * Bir dropdown'u aç
   * @param {Element} item - .tkl-nav__item--dropdown elementi
   */
  function openDropdown(item) {
    const btn = $(".tkl-nav__link--dropdown", item);
    const panel = $(".tkl-nav__dropdown", item);
    if (btn) btn.setAttribute("aria-expanded", "true");
    if (panel) panel.classList.add("is-open");
  }

  /**
   * Dropdown toggle
   * @param {Element} item
   */
  function toggleDropdown(item) {
    const panel = $(".tkl-nav__dropdown", item);
    const isOpen = panel && panel.classList.contains("is-open");
    // Önce diğerlerini kapat
    closeAllDropdowns();
    // Sonra bu dropdown'ı toggle et
    if (!isOpen) {
      openDropdown(item);
    }
  }

  // Masaüstü: Hover giriş/çıkış ARIA güncellemesi
  // (CSS hover zaten görselliği halleder, sadece ARIA için)
  dropdownItems.forEach((item) => {
    const btn = $(".tkl-nav__link--dropdown", item);

    // Masaüstü mouse events → ARIA güncelle
    item.addEventListener("mouseenter", () => {
      if (!isMobile()) {
        if (btn) btn.setAttribute("aria-expanded", "true");
      }
    });

    item.addEventListener("mouseleave", () => {
      if (!isMobile()) {
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });

    // Mobil ve klavye: tıklama ile toggle
    if (btn) {
      btn.addEventListener("click", (e) => {
        if (isMobile()) {
          e.preventDefault();
          toggleDropdown(item);
        }
        // Masaüstünde buton tıklaması da toggle yapar
        else {
          toggleDropdown(item);
        }
      });
    }
  });

  // ─────────────────────────────────────────────────────
  // 4. DIŞARI TIKLANINCA KAPAT
  //    Nav dışında bir yere tıklanırsa tüm dropdown'lar
  //    kapanır ve mobil menü kapanır.
  // ─────────────────────────────────────────────────────
  document.addEventListener("click", (e) => {
    // Nav içindeyse hiçbir şey yapma
    if (nav.contains(e.target)) return;

    closeAllDropdowns();

    // Mobil menü açıksa kapat
    if (menu && menu.classList.contains("is-open")) {
      closeMobileMenu();
    }
  });

  // ─────────────────────────────────────────────────────
  // 5. ESCAPE TUŞU İLE KAPAT
  // ─────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllDropdowns();
      closeMobileMenu();
      // Odağı hamburger'a ver (erişilebilirlik)
      if (hamburger) hamburger.focus();
    }
  });

  // ─────────────────────────────────────────────────────
  // 6. KLAVYE ODAĞI İLE NAVİGASYON (Tab erişilebilirliği)
  //    Dropdown içindeki son öğeden Tab basılırsa dropdown kapanır.
  // ─────────────────────────────────────────────────────
  dropdownItems.forEach((item) => {
    const links = $$(".tkl-nav__dropdown-item", item);
    const lastLink = links[links.length - 1];

    if (lastLink) {
      lastLink.addEventListener("keydown", (e) => {
        // Shift+Tab değilse ve Tab ise dropdown'ı kapat
        if (e.key === "Tab" && !e.shiftKey) {
          closeDropdown(item);
        }
      });
    }
  });

  // ─────────────────────────────────────────────────────
  // 7. PENCERE YENİDEN BOYUTLANINCA
  //    Masaüstüne geçildiğinde mobil menüyü temizle.
  // ─────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!isMobile()) {
        closeMobileMenu();
        closeAllDropdowns();
      }
    }, 150);
  });

  // ─────────────────────────────────────────────────────
  // YARDIMCI: Mobil mi?
  //    768px breakpoint CSS ile senkronize edilmiştir.
  // ─────────────────────────────────────────────────────
  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ─────────────────────────────────────────────────────
  // INIT TAMAMLANDI
  // ─────────────────────────────────────────────────────
  console.log("[TKL Nav] Navigation başarıyla yüklendi.");
})();
