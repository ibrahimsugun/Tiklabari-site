/* ============================================================
   Cursor Stability & Drift Lab — Uygulama Mantığı
   Pure JavaScript — Kütüphane yok
   ============================================================ */

(function () {
  'use strict';

  // ========== DOM Referansları ==========
  const hudX      = document.getElementById('hud-x');
  const hudY      = document.getElementById('hud-y');
  const hudDX     = document.getElementById('hud-dx');
  const hudDY     = document.getElementById('hud-dy');
  const hudTotal  = document.getElementById('hud-total');
  const hudStatus = document.getElementById('hud-status');

  const durationSelector = document.getElementById('duration-selector');
  const btnStart   = document.getElementById('btn-start');
  const btnReplay  = document.getElementById('btn-replay');
  const btnClear   = document.getElementById('btn-clear');

  const progressContainer = document.getElementById('progress-container');
  const progressBar       = document.getElementById('progress-bar');
  const progressLabel     = document.getElementById('progress-label');

  const arena           = document.getElementById('arena');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const countdownNumber  = document.getElementById('countdown-number');
  const driftCanvas      = document.getElementById('drift-canvas');
  const targetDot        = document.getElementById('target-dot');
  const virtualCursor    = document.getElementById('virtual-cursor');
  const arenaInfo        = document.getElementById('arena-info');

  const resultsPanel = document.getElementById('results-panel');
  const resCount     = document.getElementById('res-count');
  const resMax       = document.getElementById('res-max');
  const resAvg       = document.getElementById('res-avg');
  const resMin       = document.getElementById('res-min');

  // Kayıt göstergesi elementleri
  const recIndicator = document.getElementById('rec-indicator');
  const recCounter   = document.getElementById('rec-counter');
  const moveFlash    = document.getElementById('move-flash');
  const stopTooltip  = document.getElementById('stop-tooltip');

  const ctx = driftCanvas.getContext('2d');

  // ========== Durum Değişkenleri ==========
  /** @type {number} Seçilen test süresi (saniye) */
  let selectedDuration = 15;

  /** @type {boolean} Test aktif mi */
  let isTesting = false;

  /** @type {boolean} Replay aktif mi */
  let isReplaying = false;

  /** @type {{x: number, y: number}} Arena merkezinin sayfa üzerindeki koordinatları */
  let centerPoint = { x: 0, y: 0 };

  /** @type {{x: number, y: number}} Sub-pixel birikimli konum (gerçek imleç pozisyonu float olarak) */
  let precisePos = { x: 0, y: 0 };

  /** @type {number} Son flash zamanı (throttle için) */
  let lastFlashTime = 0;

  /** @type {number} Test başlangıç zamanı (ms) */
  let testStartTime = 0;

  /** @type {number} Test bitiş zamanı (ms) */
  let testEndTime = 0;

  /** @type {Array<{t: number, x: number, y: number}>} Kayıt dizisi */
  let recordings = [];

  /** @type {number|null} requestAnimationFrame kimliği */
  let rafId = null;

  /** @type {number|null} Geri sayım zamanlayıcı kimliği */
  let countdownTimer = null;

  /** @type {number|null} Test zamanlayıcı kimliği */
  let testTimer = null;

  // ========== Yardımcı Fonksiyonlar ==========

  /**
   * Canvas boyutlandırmasını arena ile eşleştirir.
   * Retina/HiDPI ekranlar için devicePixelRatio kullanılır.
   */
  function resizeCanvas() {
    const rect = arena.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    driftCanvas.width = rect.width * dpr;
    driftCanvas.height = rect.height * dpr;
    driftCanvas.style.width = rect.width + 'px';
    driftCanvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * Arena merkezinin viewport koordinatlarını hesaplar.
   * @returns {{x: number, y: number}}
   */
  function getArenaCenter() {
    const rect = arena.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  /**
   * HUD'daki durum metnini ve rengini günceller.
   * @param {string} text
   * @param {string} color - CSS renk değişkeni adı
   */
  function setStatus(text, color) {
    hudStatus.textContent = text;
    hudStatus.style.color = 'var(--accent-' + color + ')';
    hudStatus.style.textShadow = '0 0 12px var(--accent-' + color + ')';
  }

  /**
   * Canvas'ı tamamen temizler.
   */
  function clearCanvas() {
    const rect = arena.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }

  /**
   * İlerleme çubuğunu günceller.
   * @param {number} pct - 0 ile 100 arası yüzde
   */
  function updateProgress(pct) {
    progressBar.style.width = pct + '%';
    progressLabel.textContent = Math.round(pct) + '%';
  }

  // ========== Süre Seçici ==========
  durationSelector.addEventListener('click', function (e) {
    const btn = e.target.closest('.dur-btn');
    if (!btn || isTesting || isReplaying) return;

    // Aktif sınıfı değiştir
    durationSelector.querySelectorAll('.dur-btn').forEach(function (b) {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    selectedDuration = parseInt(btn.dataset.duration, 10);
  });

  // ========== Geri Sayım ==========

  /**
   * 3 saniyelik geri sayımı başlatır, bitince onComplete çağrılır.
   * @param {Function} onComplete
   */
  function startCountdown(onComplete) {
    let count = 3;
    countdownOverlay.classList.add('active');
    countdownNumber.textContent = count;

    setStatus('Geri Sayım...', 'amber');

    countdownTimer = setInterval(function () {
      count--;
      if (count > 0) {
        countdownNumber.textContent = count;
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownOverlay.classList.remove('active');
        if (onComplete) onComplete();
      }
    }, 1000);
  }
  // ========== Test Durdurma (Q tuşu / Tıklama) ==========

  /**
   * Q tuşuna basıldığında testi durdurur.
   * @param {KeyboardEvent} e
   */
  function onStopKey(e) {
    if ((e.key === 'q' || e.key === 'Q') && isTesting) {
      e.preventDefault();
      endTest();
    }
  }

  /**
   * Arena tıklandığında testi durdurur.
   * @param {MouseEvent} e
   */
  function onStopClick(e) {
    if (isTesting) {
      e.preventDefault();
      e.stopPropagation();
      endTest();
    }
  }

  // ========== Fare Hareketi Yakalama (Test) ==========

  /**
   * Test sırasında fare hareketini yakalar ve kaydeder.
   * movementX/Y ile sub-pixel hassasiyet sağlanır.
   * @param {MouseEvent} e
   */
  function onMouseMoveDuringTest(e) {
    if (!isTesting) return;

    // Sub-pixel hassas konum: movementX/Y ile birikimli hesapla
    // Bu sayede en küçük 1px altı hareketler bile yakalanır
    if (e.movementX !== undefined) {
      precisePos.x += e.movementX;
      precisePos.y += e.movementY;
    } else {
      // Fallback: clientX/Y kullan
      precisePos.x = e.clientX - centerPoint.x;
      precisePos.y = e.clientY - centerPoint.y;
    }

    const dx = precisePos.x;
    const dy = precisePos.y;
    const totalDrift = Math.sqrt(dx * dx + dy * dy);

    // HUD güncelle (sub-pixel göster)
    hudX.textContent = e.clientX;
    hudY.textContent = e.clientY;
    hudDX.textContent = (dx > 0 ? '+' : '') + dx.toFixed(1);
    hudDY.textContent = (dy > 0 ? '+' : '') + dy.toFixed(1);
    hudTotal.textContent = totalDrift.toFixed(2) + ' px';

    // Sapma rengini büyüklüğe göre değiştir
    if (totalDrift > 30) {
      hudTotal.style.color = 'var(--accent-red)';
    } else if (totalDrift > 10) {
      hudTotal.style.color = 'var(--accent-amber)';
    } else {
      hudTotal.style.color = 'var(--accent-green)';
    }

    // Kayıt dizisine ekle
    const nowMs = performance.now();
    recordings.push({
      t: nowMs - testStartTime,
      x: dx,
      y: dy,
    });

    // Kayıt sayacını güncelle
    recCounter.textContent = recordings.length + ' kayıt';

    // Canvas üzerine iz çiz
    drawDriftPoint(dx, dy, totalDrift);

    // Hareket flash efekti (throttled, her 50ms'de bir)
    const now = performance.now();
    if (now - lastFlashTime > 50) {
      triggerMoveFlash(dx, dy);
      lastFlashTime = now;
    }
  }

  /**
   * Hareket anında parlama halkası göster.
   * @param {number} dx
   * @param {number} dy
   */
  function triggerMoveFlash(dx, dy) {
    const rect = arena.getBoundingClientRect();
    const px = rect.width / 2 + dx;
    const py = rect.height / 2 + dy;
    moveFlash.style.left = px + 'px';
    moveFlash.style.top = py + 'px';
    // Yeniden tetikle
    moveFlash.classList.remove('ping');
    void moveFlash.offsetWidth; // reflow zorla
    moveFlash.classList.add('ping');
  }

  /**
   * Canvas üzerine bir sapma noktası çizer.
   * @param {number} dx
   * @param {number} dy
   * @param {number} totalDrift
   */
  function drawDriftPoint(dx, dy, totalDrift) {
    const rect = arena.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const px = cx + dx;
    const py = cy + dy;

    // Renk: sapma büyüklüğüne göre
    let alpha = Math.min(0.9, 0.3 + totalDrift / 60);
    let hue;
    if (totalDrift < 3) {
      hue = 160; // Yeşil
    } else if (totalDrift < 15) {
      hue = 45; // Sarı
    } else {
      hue = 0; // Kırmızı
    }

    // Glow ile daha görünür nokta
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'hsla(' + hue + ', 90%, 60%, 0.5)';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + hue + ', 90%, 60%, ' + alpha + ')';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // ========== Test Başlat ==========
  btnStart.addEventListener('click', function () {
    if (isTesting || isReplaying) return;

    // Önceki verileri temizle
    recordings = [];
    clearCanvas();
    resultsPanel.style.display = 'none';
    btnReplay.disabled = true;
    btnStart.disabled = true;
    arenaInfo.classList.add('hidden');

    resizeCanvas();

    startCountdown(function () {
      beginTest();
    });
  });

  /**
   * Asıl testi başlatan fonksiyon (geri sayım sonrası).
   */
  function beginTest() {
    isTesting = true;
    setStatus('Test Aktif', 'cyan');

    // Merkez hesapla
    centerPoint = getArenaCenter();

    // Sub-pixel pozisyonu sıfırla
    precisePos = { x: 0, y: 0 };

    // Hedef noktayı göster
    const rect = arena.getBoundingClientRect();
    targetDot.style.left = rect.width / 2 + 'px';
    targetDot.style.top = rect.height / 2 + 'px';
    targetDot.classList.add('visible');

    // Arena test + kayıt modunu aktif et
    arena.classList.add('testing');
    arena.classList.add('recording');

    // REC göstergesini aktif et
    recIndicator.classList.add('active');
    recCounter.classList.add('active');
    recCounter.textContent = '0 kayıt';

    // Durdurma tooltip'ini göster
    stopTooltip.classList.add('active');

    // İlerleme çubuğunu göster
    progressContainer.classList.add('visible');
    updateProgress(0);

    // Mousemove dinleyici ekle
    testStartTime = performance.now();
    testEndTime = testStartTime + selectedDuration * 1000;
    document.addEventListener('mousemove', onMouseMoveDuringTest);

    // Q tuşu ve tıklama ile durdurma dinleyicileri
    document.addEventListener('keydown', onStopKey);
    arena.addEventListener('click', onStopClick);

    // İlerleme animasyonu
    rafId = requestAnimationFrame(tickProgress);

    // Zamanlayıcı ile testi durdur
    testTimer = setTimeout(function () {
      endTest();
    }, selectedDuration * 1000);
  }

  /**
   * requestAnimationFrame ile ilerleme çubuğunu günceller.
   */
  function tickProgress() {
    if (!isTesting) return;

    const now = performance.now();
    const elapsed = now - testStartTime;
    const totalMs = selectedDuration * 1000;
    const pct = Math.min(100, (elapsed / totalMs) * 100);
    updateProgress(pct);

    // Kalan süreyi HUD'da göster
    const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    setStatus('Test Aktif — ' + remaining + 's', 'cyan');

    if (pct < 100) {
      rafId = requestAnimationFrame(tickProgress);
    }
  }

  /**
   * Testi sonlandırır, verileri kaydeder ve sonuçları gösterir.
   */
  function endTest() {
    isTesting = false;

    // Dinleyiciyi kaldır
    document.removeEventListener('mousemove', onMouseMoveDuringTest);
    cancelAnimationFrame(rafId);
    clearTimeout(testTimer);

    // Durdurma dinleyicilerini kaldır
    document.removeEventListener('keydown', onStopKey);
    arena.removeEventListener('click', onStopClick);

    // UI temizle
    targetDot.classList.remove('visible');
    arena.classList.remove('testing');
    arena.classList.remove('recording');
    recIndicator.classList.remove('active');
    recCounter.classList.remove('active');
    moveFlash.classList.remove('ping');
    stopTooltip.classList.remove('active');
    progressContainer.classList.remove('visible');
    updateProgress(100);

    btnStart.disabled = false;

    // Kayıt var mı kontrol et
    if (recordings.length > 0) {
      // sessionStorage'a kaydet
      try {
        sessionStorage.setItem('driftLabRecording', JSON.stringify(recordings));
        sessionStorage.setItem('driftLabDuration', String(selectedDuration));
      } catch (e) {
        console.warn('sessionStorage kayıt hatası:', e);
      }

      btnReplay.disabled = false;
      showResults();
      setStatus('Test Tamamlandı ✓', 'green');
    } else {
      setStatus('Hareket algılanmadı', 'amber');
    }

    arenaInfo.classList.remove('hidden');
    arenaInfo.querySelector('span').textContent = 'Test tamamlandı — Kaydı izleyebilir veya yeni test başlatabilirsiniz.';
  }

  /**
   * Sonuç panelini hesaplayıp gösterir.
   */
  function showResults() {
    const drifts = recordings.map(function (r) {
      return Math.sqrt(r.x * r.x + r.y * r.y);
    });

    const count = drifts.length;
    const maxD = Math.max.apply(null, drifts);
    const minD = Math.min.apply(null, drifts);
    const avgD = drifts.reduce(function (a, b) { return a + b; }, 0) / count;

    resCount.textContent = count.toLocaleString('tr-TR');
    resMax.textContent = maxD.toFixed(2) + ' px';
    resAvg.textContent = avgD.toFixed(2) + ' px';
    resMin.textContent = minD.toFixed(2) + ' px';

    resultsPanel.style.display = '';
  }

  // ========== Kaydı İzle (Replay) ==========
  btnReplay.addEventListener('click', function () {
    if (isTesting || isReplaying) return;

    // sessionStorage'dan verileri oku
    let data;
    try {
      const raw = sessionStorage.getItem('driftLabRecording');
      if (!raw) {
        setStatus('Kayıt bulunamadı', 'red');
        return;
      }
      data = JSON.parse(raw);
    } catch (e) {
      setStatus('Kayıt okunamadı', 'red');
      return;
    }

    if (!data || data.length === 0) {
      setStatus('Kayıt boş', 'amber');
      return;
    }

    startReplay(data);
  });

  /**
   * Kaydedilmiş verileri kullanarak replay animasyonunu başlatır.
   * Hayalet (ghost) izleri canvas üzerinde çizilir.
   * @param {Array<{t: number, x: number, y: number}>} data
   */
  function startReplay(data) {
    isReplaying = true;
    btnStart.disabled = true;
    btnReplay.disabled = true;
    arenaInfo.classList.add('hidden');

    setStatus('Replay Oynatılıyor...', 'purple');

    resizeCanvas();
    clearCanvas();

    // Hedef noktayı göster
    const rect = arena.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    targetDot.style.left = cx + 'px';
    targetDot.style.top = cy + 'px';
    targetDot.classList.add('visible');

    // Sanal imleci göster
    virtualCursor.classList.add('visible');
    virtualCursor.style.left = cx + 'px';
    virtualCursor.style.top = cy + 'px';

    arena.classList.add('testing');
    progressContainer.classList.add('visible');
    updateProgress(0);

    const totalDuration = data[data.length - 1].t; // son kaydın zamanı (ms)
    const replayStart = performance.now();
    let dataIndex = 0;

    /**
     * Replay loop: requestAnimationFrame ile 60 FPS
     */
    function replayTick() {
      if (!isReplaying) return;

      const elapsed = performance.now() - replayStart;
      const pct = Math.min(100, (elapsed / totalDuration) * 100);
      updateProgress(pct);

      const remaining = Math.max(0, Math.ceil((totalDuration - elapsed) / 1000));
      setStatus('Replay — ' + remaining + 's', 'purple');

      // Şu ana kadar olan tüm noktaları çiz
      while (dataIndex < data.length && data[dataIndex].t <= elapsed) {
        const point = data[dataIndex];

        const px = cx + point.x;
        const py = cy + point.y;

        // Hayalet iz çiz
        const drift = Math.sqrt(point.x * point.x + point.y * point.y);
        let hue;
        if (drift < 5)       hue = 270; // mor
        else if (drift < 20) hue = 280;
        else                 hue = 320; // pembe

        const alpha = Math.min(0.6, 0.15 + drift / 80);

        // Glow efekti
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'hsla(' + hue + ', 80%, 60%, 0.4)';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + hue + ', 80%, 60%, ' + alpha + ')';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Sanal imleci hareket ettir
        virtualCursor.style.left = px + 'px';
        virtualCursor.style.top = py + 'px';

        dataIndex++;
      }

      // İz bağlantı çizgileri (son 2 nokta arası)
      if (dataIndex >= 2) {
        const p1 = data[dataIndex - 2];
        const p2 = data[dataIndex - 1];
        ctx.beginPath();
        ctx.moveTo(cx + p1.x, cy + p1.y);
        ctx.lineTo(cx + p2.x, cy + p2.y);
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.12)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (elapsed < totalDuration) {
        rafId = requestAnimationFrame(replayTick);
      } else {
        endReplay();
      }
    }

    rafId = requestAnimationFrame(replayTick);
  }

  /**
   * Replay sonlandırma.
   */
  function endReplay() {
    isReplaying = false;
    cancelAnimationFrame(rafId);

    virtualCursor.classList.remove('visible');
    targetDot.classList.remove('visible');
    arena.classList.remove('testing');
    progressContainer.classList.remove('visible');

    btnStart.disabled = false;
    btnReplay.disabled = false;

    setStatus('Replay Tamamlandı ✓', 'green');
    arenaInfo.classList.remove('hidden');
    arenaInfo.querySelector('span').textContent = 'Replay tamamlandı — Yeniden izleyebilir veya yeni test başlatabilirsiniz.';
  }

  // ========== Temizle ==========
  btnClear.addEventListener('click', function () {
    if (isTesting || isReplaying) return;

    // sessionStorage temizle
    sessionStorage.removeItem('driftLabRecording');
    sessionStorage.removeItem('driftLabDuration');

    // Verileri sıfırla
    recordings = [];
    clearCanvas();

    // UI sıfırla
    hudX.textContent = '0';
    hudY.textContent = '0';
    hudDX.textContent = '0';
    hudDY.textContent = '0';
    hudTotal.textContent = '0.00 px';
    hudTotal.style.color = '';
    setStatus('Temizlendi', 'green');

    btnReplay.disabled = true;
    resultsPanel.style.display = 'none';
    arenaInfo.classList.remove('hidden');
    arenaInfo.querySelector('span').textContent = 'Testi başlatmak için yukarıdaki butona tıklayın';

    // Kısa animasyon: buton titreti
    btnClear.style.transform = 'scale(0.95)';
    setTimeout(function () {
      btnClear.style.transform = '';
    }, 200);
  });

  // ========== Global: Mouse pozisyonu HUD (test dışı) ==========
  document.addEventListener('mousemove', function (e) {
    if (isTesting) return; // test sırasında ayrı işleniyor
    hudX.textContent = e.clientX;
    hudY.textContent = e.clientY;
  });

  // ========== Pencere Boyutlandırma ==========
  window.addEventListener('resize', function () {
    resizeCanvas();
    // Eğer test aktifse merkezi yeniden hesapla
    if (isTesting) {
      centerPoint = getArenaCenter();
    }
  });

  // ========== Sayfa Yüklenince Başlat ==========
  window.addEventListener('DOMContentLoaded', function () {
    resizeCanvas();

    // sessionStorage'da önceki kayıt var mı kontrol et
    const prevData = sessionStorage.getItem('driftLabRecording');
    if (prevData) {
      btnReplay.disabled = false;
      setStatus('Önceki kayıt mevcut', 'green');
      arenaInfo.querySelector('span').textContent = 'Önceki test kaydı bulundu — İzleyebilir veya yeni test başlatabilirsiniz.';
    }
  });

})();
