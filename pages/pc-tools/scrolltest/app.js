/* ═══════════════════════════════════════════════════════
   Mouse Wheel Tester & Recorder — Core Logic
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── DOM References ─────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const scrollZone     = $('#scrollZone');
  const ghostCanvas    = $('#ghostCanvas');
  const ctx            = ghostCanvas.getContext('2d');
  const scrollThumb    = $('#scrollThumb');
  const scrollTrack    = $('#scrollTrack');
  const scrollTrackFill = $('#scrollTrackFill');
  const directionArrow = $('#directionArrow');
  const errorFlash     = $('#errorFlash');
  const intensityBar   = $('#intensityBar');
  const statusIndicator = $('#statusIndicator');

  // Stat values
  const valDeltaY    = $('#valDeltaY');
  const valDirection = $('#valDirection');
  const valSpeed     = $('#valSpeed');
  const valTotal     = $('#valTotal');
  const valErrors    = $('#valErrors');

  // Direction timeline
  const dirTimeline = $('#directionTimeline');

  // Controls
  const btnRecord  = $('#btnRecord');
  const btnStop    = $('#btnStop');
  const btnReplay  = $('#btnReplay');
  const btnClear   = $('#btnClear');

  // Record info
  const recordTimer    = $('#recordTimer');
  const recordedEvents = $('#recordedEvents');
  const dataSize       = $('#dataSize');

  // Error log
  const errorLog        = $('#errorLog');
  const errorCountBadge = $('#errorCountBadge');

  // Replay bar (may not exist in HTML — guarded)
  const replayBar     = $('#replayBar');
  const replayBarFill = $('#replayBarFill');
  const replayBarText = $('#replayBarText');

  /* ── State ──────────────────────────────────────── */
  let isRecording     = false;
  let isReplaying     = false;
  let recordData      = [];
  let recordStartTime = 0;
  let timerInterval   = null;
  let eventCount      = 0;
  let errorCount      = 0;
  let lastDeltaY      = 0;
  let thumbPosition   = 50; // percentage
  let scrollDecay     = null;
  let lastWheelTime   = 0;

  // Ghost trail particles
  let particles = [];

  /* ── Canvas Setup ───────────────────────────────── */
  function resizeCanvas() {
    const rect = scrollZone.getBoundingClientRect();
    ghostCanvas.width  = rect.width * window.devicePixelRatio;
    ghostCanvas.height = rect.height * window.devicePixelRatio;
    ghostCanvas.style.width  = rect.width + 'px';
    ghostCanvas.style.height = rect.height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  resizeCanvas();
  window.addEventListener('resize', () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    resizeCanvas();
  });

  /* ── Ghost Particle System ──────────────────────── */
  class GhostParticle {
    constructor(x, y, deltaY) {
      this.x       = x;
      this.y       = y;
      this.originY = y;
      this.alpha   = 0.9;
      this.size    = Math.min(Math.abs(deltaY) * 0.15 + 3, 18);
      this.vy      = deltaY * 0.08;
      this.vx      = (Math.random() - 0.5) * 1.5;
      this.life    = 1;
      this.decay   = 0.012 + Math.random() * 0.01;
      this.hue     = deltaY < 0 ? 250 : 150; // purple for up, teal for down
      this.isError = false;
    }

    update() {
      this.y    += this.vy;
      this.x    += this.vx;
      this.vy   *= 0.97;
      this.vx   *= 0.95;
      this.life -= this.decay;
      this.alpha = this.life * 0.9;
      this.size *= 0.995;
      return this.life > 0;
    }

    draw(c) {
      if (this.alpha <= 0) return;
      c.save();
      c.globalAlpha = this.alpha;

      if (this.isError) {
        // Error particle — red glow
        const grad = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
        grad.addColorStop(0, 'rgba(255, 71, 87, 0.8)');
        grad.addColorStop(0.5, 'rgba(255, 71, 87, 0.2)');
        grad.addColorStop(1, 'transparent');
        c.fillStyle = grad;
        c.fillRect(this.x - this.size * 2, this.y - this.size * 2, this.size * 4, this.size * 4);
      } else {
        // Normal particle — soft glow
        const grad = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
        grad.addColorStop(0, `hsla(${this.hue}, 80%, 75%, 0.9)`);
        grad.addColorStop(0.4, `hsla(${this.hue}, 70%, 60%, 0.3)`);
        grad.addColorStop(1, 'transparent');
        c.fillStyle = grad;
        c.fillRect(this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
      }

      c.restore();
    }
  }

  /* ── Trail Line System ──────────────────────────── */
  let trailPoints = [];
  const MAX_TRAIL_POINTS = 60;

  function addTrailPoint(x, y, intensity, isErr) {
    trailPoints.push({ x, y, alpha: 1, intensity: Math.min(Math.abs(intensity), 120), isErr });
    if (trailPoints.length > MAX_TRAIL_POINTS) trailPoints.shift();
  }

  function drawTrails(c) {
    if (trailPoints.length < 2) return;

    for (let i = 0; i < trailPoints.length; i++) {
      trailPoints[i].alpha -= 0.018;
    }
    trailPoints = trailPoints.filter(p => p.alpha > 0);

    if (trailPoints.length < 2) return;

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';

    for (let i = 1; i < trailPoints.length; i++) {
      const p0 = trailPoints[i - 1];
      const p1 = trailPoints[i];
      const alpha = p1.alpha * 0.6;
      const width = (p1.intensity / 120) * 6 + 1;

      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.lineWidth = width;

      if (p1.isErr) {
        c.strokeStyle = `rgba(255, 71, 87, ${alpha})`;
      } else {
        c.strokeStyle = `rgba(162, 155, 254, ${alpha})`;
      }
      c.stroke();
    }

    c.restore();
  }

  /* ── Animation Loop ─────────────────────────────── */
  let animFrameId;

  function animate() {
    const rect = scrollZone.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.clearRect(0, 0, w, h);

    // Draw trail lines
    drawTrails(ctx);

    // Update and draw particles
    particles = particles.filter(p => {
      const alive = p.update();
      if (alive) p.draw(ctx);
      return alive;
    });

    animFrameId = requestAnimationFrame(animate);
  }

  animate();

  /* ── Spawn Particles ────────────────────────────── */
  function spawnParticles(deltaY, isError) {
    const rect     = scrollZone.getBoundingClientRect();
    const trackRect = scrollTrack.getBoundingClientRect();
    const cx       = trackRect.left - rect.left - 30;
    const thumbY   = (thumbPosition / 100) * rect.height;
    const count    = Math.min(Math.floor(Math.abs(deltaY) * 0.06) + 2, 12);

    for (let i = 0; i < count; i++) {
      const px = cx + (Math.random() - 0.5) * 20;
      const py = thumbY + (Math.random() - 0.5) * 30;
      const p  = new GhostParticle(px, py, deltaY);
      if (isError) {
        p.isError = true;
        p.size *= 1.5;
      }
      particles.push(p);
    }

    // Add trail point
    addTrailPoint(cx, thumbY, deltaY, isError);
  }

  /* ── Scroll Thumb Logic ─────────────────────────── */
  function moveThumb(deltaY) {
    const step = deltaY * 0.06;
    thumbPosition = Math.max(5, Math.min(95, thumbPosition + step));

    const trackH = scrollTrack.clientHeight;
    // Use the actual rendered thumb height instead of a missing CSS variable
    const thumbH = scrollThumb.offsetHeight || 28;
    const maxTop = trackH - thumbH;
    const top    = (thumbPosition / 100) * maxTop;

    scrollThumb.style.top = top + 'px';
    scrollThumb.style.transform = 'none';

    // Fill
    scrollTrackFill.style.height = (100 - thumbPosition) + '%';

    // Thumb glow
    scrollThumb.classList.add('active');
    clearTimeout(scrollDecay);
    scrollDecay = setTimeout(() => scrollThumb.classList.remove('active'), 300);
  }

  /* ── Direction Arrow ────────────────────────────── */
  let arrowTimeout;
  function showDirectionArrow(deltaY) {
    directionArrow.classList.add('visible');
    if (deltaY > 0) {
      directionArrow.classList.add('down');
    } else {
      directionArrow.classList.remove('down');
    }
    clearTimeout(arrowTimeout);
    arrowTimeout = setTimeout(() => directionArrow.classList.remove('visible'), 400);
  }

  /* ── Intensity Meter ────────────────────────────── */
  let intensityTimeout;
  function updateIntensity(deltaY) {
    const pct = Math.min((Math.abs(deltaY) / 300) * 100, 100);
    intensityBar.style.height = pct + '%';

    if (pct > 65) {
      intensityBar.classList.add('high');
    } else {
      intensityBar.classList.remove('high');
    }

    clearTimeout(intensityTimeout);
    intensityTimeout = setTimeout(() => {
      intensityBar.style.height = '0%';
      intensityBar.classList.remove('high');
    }, 500);
  }

  /* ── Status Indicator ───────────────────────────── */
  let statusTimeout;
  function setStatus(state, text) {
    statusIndicator.className = 'status-indicator ' + state;
    statusIndicator.querySelector('.status-text').textContent = text;
  }

  function flashScrolling() {
    if (!isRecording && !isReplaying) {
      setStatus('scrolling', 'Kaydırılıyor');
      clearTimeout(statusTimeout);
      statusTimeout = setTimeout(() => {
        if (!isRecording && !isReplaying) setStatus('', 'Bekleniyor');
      }, 600);
    }
  }

  /* ── Stats Update ───────────────────────────────── */
  function updateStats(deltaY) {
    valDeltaY.textContent = deltaY;
    valDirection.textContent = deltaY < 0 ? '↑ Yukarı' : '↓ Aşağı';

    const now = performance.now();
    if (lastWheelTime > 0) {
      const dt = (now - lastWheelTime) / 1000;
      const speed = Math.round(Math.abs(deltaY) / Math.max(dt, 0.001));
      valSpeed.textContent = Math.min(speed, 99999);
    }
    lastWheelTime = now;

    eventCount++;
    valTotal.textContent = eventCount;

    // Activate stat cards
    ['statDeltaY', 'statDirection', 'statSpeed', 'statTotal'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 300);
    });
  }

  /* ── Direction Timeline ─────────────────────────── */
  function addDirectionDot(deltaY, isErr) {
    const dot = document.createElement('div');
    dot.className = 'dir-dot ' + (isErr ? 'error' : (deltaY < 0 ? 'up' : 'down'));
    dirTimeline.appendChild(dot);

    // Keep max 120 dots
    while (dirTimeline.children.length > 120) {
      dirTimeline.removeChild(dirTimeline.firstChild);
    }

    // Auto-scroll
    dirTimeline.scrollTop = dirTimeline.scrollHeight;
  }

  /* ── Error Detection ────────────────────────────── */
  function checkDirectionError(deltaY) {
    if (lastDeltaY !== 0) {
      const prevDir = lastDeltaY > 0 ? 1 : -1;
      const currDir = deltaY > 0 ? 1 : -1;

      if (prevDir !== currDir) {
        errorCount++;
        valErrors.textContent = errorCount;

        // flash error stat
        const errCard = document.getElementById('statErrors');
        errCard.classList.add('active');
        setTimeout(() => errCard.classList.remove('active'), 500);

        // error badge
        errorCountBadge.textContent = errorCount;
        errorCountBadge.classList.add('has-errors');

        // flash thumb
        scrollThumb.classList.add('error-flash-thumb');
        setTimeout(() => scrollThumb.classList.remove('error-flash-thumb'), 400);

        // flash overlay
        errorFlash.classList.add('show');
        setTimeout(() => errorFlash.classList.remove('show'), 500);

        // log entry
        addErrorEntry(deltaY);

        lastDeltaY = deltaY;
        return true;
      }
    }
    lastDeltaY = deltaY;
    return false;
  }

  function addErrorEntry(deltaY) {
    // Remove empty state
    const empty = errorLog.querySelector('.error-log-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = 'error-entry';

    const prevLabel = lastDeltaY < 0 ? 'Yukarı' : 'Aşağı';
    const currLabel = deltaY < 0 ? 'Yukarı' : 'Aşağı';
    const ts = new Date().toLocaleTimeString('tr-TR', { hour12: false });

    entry.innerHTML = `
      <div class="error-entry-icon"></div>
      <div class="error-entry-content">
        <div class="error-entry-title">Yön Değişimi Tespit Edildi</div>
        <div class="error-entry-detail">${ts} — ${prevLabel} → ${currLabel} (Δ${deltaY})</div>
      </div>
    `;

    errorLog.prepend(entry);
  }

  /* ── Wheel Event Handler ────────────────────────── */
  function handleWheel(e) {
    // Prevent default scrolling; works on all platforms
    if (e.cancelable) e.preventDefault();
    if (isReplaying) return;

    // Normalize deltaY across browsers & deltaMode
    let deltaY = e.deltaY;
    // deltaMode 1 = lines (Firefox), deltaMode 2 = pages
    if (e.deltaMode === 1) deltaY *= 33;  // ~33px per line
    if (e.deltaMode === 2) deltaY *= 100; // rough page

    // Skip near-zero events (trackpad noise)
    if (Math.abs(deltaY) < 0.5) return;

    scrollZone.classList.add('active');
    clearTimeout(scrollZone._activeTimeout);
    scrollZone._activeTimeout = setTimeout(() => scrollZone.classList.remove('active'), 800);

    // Detect error
    const isErr = checkDirectionError(deltaY);

    // Visual updates
    moveThumb(deltaY);
    spawnParticles(deltaY, isErr);
    showDirectionArrow(deltaY);
    updateIntensity(deltaY);
    updateStats(deltaY);
    addDirectionDot(deltaY, isErr);
    flashScrolling();

    // Recording
    if (isRecording) {
      const timestamp = performance.now() - recordStartTime;
      recordData.push({ timestamp, deltaY });
      recordedEvents.textContent = recordData.length;
      dataSize.textContent = formatBytes(JSON.stringify(recordData).length);
    }
  }

  // Attach wheel with passive:false so preventDefault works on all browsers
  // Safari (macOS) defaults wheel listeners on document/window to passive
  try {
    scrollZone.addEventListener('wheel', handleWheel, { passive: false });
  } catch (_) {
    scrollZone.addEventListener('wheel', handleWheel);
  }

  // --- MacBook / Trackpad touch gesture support ---
  // 'gesturechange' (Safari-only) for pinch, and touchmove for two-finger scroll
  let lastTouchY = null;
  scrollZone.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      lastTouchY = e.touches[0].clientY;
    }
  }, { passive: true });

  scrollZone.addEventListener('touchmove', function(e) {
    if (isReplaying || lastTouchY === null) return;
    e.preventDefault();
    const currentY = e.touches[0].clientY;
    const deltaY = (lastTouchY - currentY) * -2; // invert to match wheel behaviour
    lastTouchY = currentY;
    if (Math.abs(deltaY) < 0.5) return;
    // Process like a wheel event
    scrollZone.classList.add('active');
    clearTimeout(scrollZone._activeTimeout);
    scrollZone._activeTimeout = setTimeout(() => scrollZone.classList.remove('active'), 800);
    const isErr = checkDirectionError(deltaY);
    moveThumb(deltaY);
    spawnParticles(deltaY, isErr);
    showDirectionArrow(deltaY);
    updateIntensity(deltaY);
    updateStats(deltaY);
    addDirectionDot(deltaY, isErr);
    flashScrolling();
    if (isRecording) {
      const timestamp = performance.now() - recordStartTime;
      recordData.push({ timestamp, deltaY });
      recordedEvents.textContent = recordData.length;
      dataSize.textContent = formatBytes(JSON.stringify(recordData).length);
    }
  }, { passive: false });

  scrollZone.addEventListener('touchend', function() {
    lastTouchY = null;
  }, { passive: true });

  /* ── Recording Logic ────────────────────────────── */
  btnRecord.addEventListener('click', () => {
    if (isReplaying) return;

    isRecording    = true;
    recordData     = [];
    recordStartTime = performance.now();
    eventCount     = 0;
    errorCount     = 0;
    lastDeltaY     = 0;
    lastWheelTime  = 0;

    // Reset UI
    valTotal.textContent  = '0';
    valErrors.textContent = '0';
    recordedEvents.textContent = '0';
    dataSize.textContent = '0 B';
    errorCountBadge.textContent = '0';
    errorCountBadge.classList.remove('has-errors');
    errorLog.innerHTML = '<div class="error-log-empty">Henüz hata tespit edilmedi</div>';
    dirTimeline.innerHTML = '';

    // Button states
    btnRecord.disabled = true;
    btnStop.disabled   = false;
    btnReplay.disabled = true;

    // Status
    setStatus('recording', 'Kaydediliyor');
    recordTimer.classList.add('active');

    // Timer
    let sec = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      sec++;
      const m = String(Math.floor(sec / 60)).padStart(2, '0');
      const s = String(sec % 60).padStart(2, '0');
      recordTimer.textContent = m + ':' + s;
    }, 1000);
  });

  btnStop.addEventListener('click', () => {
    if (!isRecording) return;

    isRecording = false;
    clearInterval(timerInterval);

    // Save to sessionStorage
    try {
      const json = JSON.stringify(recordData);
      sessionStorage.setItem('last_scroll_test', json);
      dataSize.textContent = formatBytes(json.length);
    } catch (err) {
      console.warn('sessionStorage save failed:', err);
    }

    // Button states
    btnRecord.disabled = false;
    btnStop.disabled   = true;
    btnReplay.disabled = false;

    // Status
    setStatus('', 'Kaydedildi ✓');
    recordTimer.classList.remove('active');
  });

  /* ── Replay Logic ───────────────────────────────── */
  btnReplay.addEventListener('click', () => {
    if (isRecording || isReplaying) return;

    const raw = sessionStorage.getItem('last_scroll_test');
    if (!raw) {
      setStatus('', 'Kayıt bulunamadı');
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      setStatus('', 'Veri hatalı');
      return;
    }

    if (!data.length) {
      setStatus('', 'Boş kayıt');
      return;
    }

    isReplaying = true;

    // Reset visual state
    thumbPosition = 50;
    moveThumb(0);
    eventCount  = 0;
    errorCount  = 0;
    lastDeltaY  = 0;
    lastWheelTime = 0;
    valTotal.textContent  = '0';
    valErrors.textContent = '0';
    dirTimeline.innerHTML = '';
    errorLog.innerHTML = '<div class="error-log-empty">Henüz hata tespit edilmedi</div>';
    errorCountBadge.textContent = '0';
    errorCountBadge.classList.remove('has-errors');

    // UI
    btnRecord.disabled  = true;
    btnStop.disabled    = true;
    btnReplay.disabled  = true;
    setStatus('replaying', 'Yeniden Oynatılıyor');
    if (replayBar) replayBar.classList.add('visible');

    const totalDuration = data[data.length - 1].timestamp;
    let idx = 0;

    function playNext() {
      if (idx >= data.length) {
        finishReplay();
        return;
      }

      const evt = data[idx];
      const deltaY = evt.deltaY;

      // Progress
      const progress = (evt.timestamp / totalDuration) * 100;
      if (replayBarFill) replayBarFill.style.width = progress + '%';
      if (replayBarText) replayBarText.textContent = `Yeniden Oynatılıyor… ${Math.round(progress)}%`;

      // Same visual as live
      const isErr = checkDirectionError(deltaY);
      moveThumb(deltaY);
      spawnParticles(deltaY, isErr);
      showDirectionArrow(deltaY);
      updateIntensity(deltaY);
      updateStats(deltaY);
      addDirectionDot(deltaY, isErr);

      idx++;

      if (idx < data.length) {
        const delay = data[idx].timestamp - evt.timestamp;
        setTimeout(playNext, Math.max(delay, 1));
      } else {
        setTimeout(finishReplay, 400);
      }
    }

    function finishReplay() {
      isReplaying = false;
      btnRecord.disabled  = false;
      btnReplay.disabled  = false;
      setStatus('', 'Oynatma Tamamlandı ✓');
      if (replayBarFill) replayBarFill.style.width = '100%';
      if (replayBarText) replayBarText.textContent = 'Tamamlandı';
      if (replayBar) setTimeout(() => replayBar.classList.remove('visible'), 1500);
    }

    // Start with the first event immediately
    playNext();
  });

  /* ── Clear Button ───────────────────────────────── */
  btnClear.addEventListener('click', () => {
    if (isRecording) {
      btnStop.click();
    }

    // Reset everything
    eventCount    = 0;
    errorCount    = 0;
    lastDeltaY    = 0;
    lastWheelTime = 0;
    thumbPosition = 50;
    particles     = [];
    trailPoints   = [];

    valDeltaY.textContent    = '0';
    valDirection.textContent = '—';
    valSpeed.textContent     = '0';
    valTotal.textContent     = '0';
    valErrors.textContent    = '0';

    recordedEvents.textContent = '0';
    dataSize.textContent       = '0 B';
    recordTimer.textContent    = '00:00';
    recordTimer.classList.remove('active');

    errorCountBadge.textContent = '0';
    errorCountBadge.classList.remove('has-errors');

    dirTimeline.innerHTML = '';
    errorLog.innerHTML = '<div class="error-log-empty">Henüz hata tespit edilmedi</div>';

    moveThumb(0);
    setStatus('', 'Bekleniyor');

    // Clear canvas
    const rect = scrollZone.getBoundingClientRect();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  });

  /* ── Check for existing replay data ─────────────── */
  (function checkExistingData() {
    const raw = sessionStorage.getItem('last_scroll_test');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        if (data.length > 0) {
          btnReplay.disabled = false;
        }
      } catch { /* ignore */ }
    }
  })();

  /* ── Utility ────────────────────────────────────── */
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

})();
