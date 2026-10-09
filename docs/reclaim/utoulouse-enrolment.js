(function () {
  'use strict';

  if (window.__RECLAIM_PROVIDER_INJECTION_ACTIVE__) return;
  window.__RECLAIM_PROVIDER_INJECTION_ACTIVE__ = true;

  const KEY = '__reclaim_utoulouse_enrollment_v3';
  const LOG_PREFIX = '[utoulouse-enrolment]';
  const TARGET_URL = 'https://mondossierweb.univ-tlse3.fr/';
  // The file draws each menu entry as a Vaadin Button, which is a div with the role of a button and never a
  // <button> (esup-mdw MainUI.addItemMenu, Vaadin 7.7): 3.0.0 looked for <button> alone and found none.
  const ENTRY_SELECTOR = '[role="button"], button, .v-button, .valo-menu-item';
  const state = readState();

  function readState() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeState(next) {
    try {
      Object.assign(state, next);
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      Object.assign(state, next);
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function until(check, safetyCapMs, intervalMs) {
    const deadline = Date.now() + safetyCapMs;
    while (Date.now() < deadline) {
      const value = check();
      if (value) return value;
      await delay(intervalMs);
    }
    return null;
  }

  async function untilStable(check, safetyCapMs, intervalMs, stableCount) {
    let hits = 0;
    return until(() => {
      if (check() !== true) {
        hits = 0;
        return false;
      }
      hits += 1;
      return hits >= stableCount ? true : false;
    }, safetyCapMs, intervalMs);
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  // An entry's own words: its caption when it has one, with the icon's glyph taken out (the file draws an icon
  // font's character in front of the label, with no space between them).
  function labelOf(el) {
    const caption = el.querySelector('[class*="caption"]');
    const text = (caption ? caption.textContent : el.textContent) || '';
    return text.replace(/[\uE000-\uF8FF]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function hasLoginNegativeSignal() {
    const password = Array.from(document.querySelectorAll('input[type="password"]')).some(visible);
    const loginForm = Array.from(document.querySelectorAll('form')).some((form) => {
      if (!visible(form)) return false;
      const action = form.getAttribute('action') || '';
      return /login|signin|sign-in|cas/i.test(action) || !!form.querySelector('input[type="password"]');
    });
    return password || loginForm;
  }

  // The entries that carry a label: the ones that say exactly it when there are any, otherwise the ones that hold
  // it as a word, so "Inscriptions" is preferred to a longer entry that merely contains the word.
  function appEntries(label) {
    const all = Array.from(document.querySelectorAll(ENTRY_SELECTOR));
    const exact = all.filter((el) => labelOf(el).toLowerCase() === label.toLowerCase());
    if (exact.length > 0) return exact;
    const wanted = new RegExp('(?:^|\\s)' + label + '(?:\\s|$)', 'i');
    return all.filter((el) => wanted.test(labelOf(el)));
  }

  function visibleAppButton(label) {
    return appEntries(label).find(visible) || null;
  }

  function disabled(el) {
    return el.disabled === true || el.getAttribute('aria-disabled') === 'true' || /(?:^|\s)v-disabled(?:\s|$)/.test(el.className || '');
  }

  // The one entry every student's file has. The calendar of exams is shown or not by a setting of the
  // university (esup-mdw MainUI, isAffCalendrierEpreuvesEtudiant), so it is not asked for.
  function appAuthenticated() {
    if (location.hostname !== 'mondossierweb.univ-tlse3.fr' || hasLoginNegativeSignal()) return false;
    return !!visibleAppButton('Inscriptions');
  }

  // One line per step, read afterwards in the session's log. Nothing of the page is written in them: counts only.
  function log(message) {
    try {
      if (window.Reclaim && typeof window.Reclaim.log === 'function') {
        window.Reclaim.log('info', LOG_PREFIX + ' ' + message);
      }
    } catch {}
  }

  function bridgeMembers() {
    try {
      return window.Reclaim ? Object.keys(window.Reclaim).sort().join(',') : 'none';
    } catch {
      return 'unreadable';
    }
  }

  // What the page holds where an entry was looked for, in numbers: for whoever reads a pass that stopped.
  function whatIsThere() {
    const count = (selector) => document.querySelectorAll(selector).length;
    const entries = appEntries('Inscriptions');
    return 'role-buttons ' + count('[role="button"]') +
      ', buttons ' + count('button') +
      ', menu items ' + count('.valo-menu-item') +
      ', Inscriptions found ' + entries.length +
      ', shown ' + entries.filter(visible).length +
      ', sign-in form ' + (hasLoginNegativeSignal() ? 'yes' : 'no');
  }

  // The logged-in signal is sent when the bridge offers it, and the press follows either way.
  function reportLoggedIn() {
    if (state.loginReported) return;
    try {
      if (window.Reclaim && typeof window.Reclaim.reportUserLoggedIn === 'function') {
        window.Reclaim.reportUserLoggedIn();
        writeState({ loginReported: true });
        log('logged-in signal sent');
        return;
      }
    } catch {}
    log('no logged-in function on the bridge');
  }

  // The veil: one plain screen over the page from the moment the student is signed in, so nobody watches their own
  // file move and stand still (a portal that stands still after the sign-in reads as broken in a second and a half).
  // FIGURE and drawVeil are the mockup's own (university-veil-2026-10-09), character for character: plain DOM only,
  // no stylesheet, no image, no font, no style attribute in markup, so it does not depend on what the page allows.
  // The veil covers everything, takes every touch, and stays; the press below goes to the entry itself, under it.
  // It is never over a sign-in form, and when the path gives up it says so and where to go.
  var FIGURE = "<svg aria-hidden=\"true\" focusable=\"false\" viewBox=\"0 0 64 40\" data-character=\"diamond\"><g data-part=\"figure\"><g><defs><linearGradient id=\"icon-body\" x1=\"0.15\" y1=\"0.15\" x2=\"0.85\" y2=\"0.85\"><stop offset=\"0\" stop-color=\"#FF7F8E\"></stop><stop offset=\"1\" stop-color=\"#B79BFF\"></stop></linearGradient><linearGradient id=\"icon-edge\" x1=\"0.15\" y1=\"0.15\" x2=\"0.85\" y2=\"0.85\"><stop offset=\"0\" stop-color=\"#FFF4D0\"></stop><stop offset=\"1\" stop-color=\"#E8B860\"></stop></linearGradient></defs><g data-part=\"body\"><path d=\"M25 7.86 Q32 4 39 7.86 L54 16.14 Q61 20 54 23.86 L39 32.14 Q32 36 25 32.14 L10 23.86 Q3 20 10 16.14 Z\" fill=\"url(#icon-body)\" stroke=\"url(#icon-edge)\" stroke-width=\"2.2\" stroke-linejoin=\"round\"></path><g data-part=\"halftone\"><path d=\"\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.22\" stroke-linecap=\"round\"></path><path d=\"\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.34\" stroke-linecap=\"round\"></path><path d=\"M27 6.77h0M28.6 6.77h0M30.2 6.77h0M31.8 6.77h0M33.4 6.77h0M35 6.77h0M36.6 6.77h0M24.6 8.16h0M26.2 8.16h0M27.8 8.16h0M29.4 8.16h0M31 8.16h0M32.6 8.16h0M34.2 8.16h0M35.8 8.16h0M37.4 8.16h0M22.2 9.54h0M23.8 9.54h0M25.4 9.54h0M27 9.54h0M28.6 9.54h0M30.2 9.54h0M31.8 9.54h0M33.4 9.54h0M35 9.54h0M19.8 10.93h0M21.4 10.93h0M23 10.93h0M24.6 10.93h0M26.2 10.93h0M27.8 10.93h0M29.4 10.93h0M31 10.93h0M32.6 10.93h0M17.4 12.31h0M19 12.31h0M20.6 12.31h0M22.2 12.31h0M23.8 12.31h0M25.4 12.31h0M27 12.31h0M28.6 12.31h0M30.2 12.31h0M15 13.7h0M16.6 13.7h0M18.2 13.7h0M19.8 13.7h0M21.4 13.7h0M23 13.7h0M24.6 13.7h0M26.2 13.7h0M27.8 13.7h0M12.6 15.08h0M14.2 15.08h0M15.8 15.08h0M17.4 15.08h0M19 15.08h0M20.6 15.08h0M22.2 15.08h0M23.8 15.08h0M25.4 15.08h0M10.2 16.47h0M11.8 16.47h0M13.4 16.47h0M15 16.47h0M16.6 16.47h0M18.2 16.47h0M19.8 16.47h0M21.4 16.47h0M23 16.47h0M7.8 17.86h0M9.4 17.86h0M11 17.86h0M12.6 17.86h0M14.2 17.86h0M15.8 17.86h0M17.4 17.86h0M19 17.86h0M20.6 17.86h0M7 19.24h0M8.6 19.24h0M10.2 19.24h0M11.8 19.24h0M13.4 19.24h0M15 19.24h0M16.6 19.24h0M18.2 19.24h0M7.8 20.63h0M9.4 20.63h0M11 20.63h0M12.6 20.63h0M14.2 20.63h0M15.8 20.63h0M7 22.01h0M8.6 22.01h0M10.2 22.01h0M11.8 22.01h0M13.4 22.01h0M9.4 23.4h0M11 23.4h0\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.46\" stroke-linecap=\"round\"></path><path d=\"M39 8.16h0M36.6 9.54h0M38.2 9.54h0M39.8 9.54h0M41.4 9.54h0M34.2 10.93h0M35.8 10.93h0M37.4 10.93h0M39 10.93h0M40.6 10.93h0M42.2 10.93h0M43.8 10.93h0M31.8 12.31h0M33.4 12.31h0M35 12.31h0M36.6 12.31h0M38.2 12.31h0M39.8 12.31h0M41.4 12.31h0M43 12.31h0M44.6 12.31h0M29.4 13.7h0M31 13.7h0M32.6 13.7h0M34.2 13.7h0M35.8 13.7h0M37.4 13.7h0M39 13.7h0M40.6 13.7h0M42.2 13.7h0M27 15.08h0M28.6 15.08h0M30.2 15.08h0M31.8 15.08h0M33.4 15.08h0M35 15.08h0M36.6 15.08h0M38.2 15.08h0M39.8 15.08h0M24.6 16.47h0M26.2 16.47h0M27.8 16.47h0M29.4 16.47h0M31 16.47h0M32.6 16.47h0M34.2 16.47h0M35.8 16.47h0M37.4 16.47h0M22.2 17.86h0M23.8 17.86h0M25.4 17.86h0M27 17.86h0M28.6 17.86h0M30.2 17.86h0M31.8 17.86h0M33.4 17.86h0M35 17.86h0M19.8 19.24h0M21.4 19.24h0M23 19.24h0M24.6 19.24h0M26.2 19.24h0M27.8 19.24h0M29.4 19.24h0M31 19.24h0M32.6 19.24h0M17.4 20.63h0M19 20.63h0M20.6 20.63h0M22.2 20.63h0M23.8 20.63h0M25.4 20.63h0M27 20.63h0M28.6 20.63h0M30.2 20.63h0M15 22.01h0M16.6 22.01h0M18.2 22.01h0M19.8 22.01h0M21.4 22.01h0M23 22.01h0M24.6 22.01h0M26.2 22.01h0M27.8 22.01h0M12.6 23.4h0M14.2 23.4h0M15.8 23.4h0M17.4 23.4h0M19 23.4h0M20.6 23.4h0M22.2 23.4h0M23.8 23.4h0M25.4 23.4h0M11.8 24.78h0M13.4 24.78h0M15 24.78h0M16.6 24.78h0M18.2 24.78h0M19.8 24.78h0M21.4 24.78h0M23 24.78h0M14.2 26.17h0M15.8 26.17h0M17.4 26.17h0M19 26.17h0M20.6 26.17h0M18.2 27.56h0\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.58\" stroke-linecap=\"round\"></path><path d=\"M46.2 12.31h0M43.8 13.7h0M45.4 13.7h0M47 13.7h0M48.6 13.7h0M41.4 15.08h0M43 15.08h0M44.6 15.08h0M46.2 15.08h0M47.8 15.08h0M49.4 15.08h0M51 15.08h0M39 16.47h0M40.6 16.47h0M42.2 16.47h0M43.8 16.47h0M45.4 16.47h0M47 16.47h0M48.6 16.47h0M50.2 16.47h0M51.8 16.47h0M36.6 17.86h0M38.2 17.86h0M39.8 17.86h0M41.4 17.86h0M43 17.86h0M44.6 17.86h0M46.2 17.86h0M47.8 17.86h0M49.4 17.86h0M34.2 19.24h0M35.8 19.24h0M37.4 19.24h0M39 19.24h0M40.6 19.24h0M42.2 19.24h0M43.8 19.24h0M45.4 19.24h0M47 19.24h0M31.8 20.63h0M33.4 20.63h0M35 20.63h0M36.6 20.63h0M38.2 20.63h0M39.8 20.63h0M41.4 20.63h0M43 20.63h0M44.6 20.63h0M29.4 22.01h0M31 22.01h0M32.6 22.01h0M34.2 22.01h0M35.8 22.01h0M37.4 22.01h0M39 22.01h0M40.6 22.01h0M42.2 22.01h0M27 23.4h0M28.6 23.4h0M30.2 23.4h0M31.8 23.4h0M33.4 23.4h0M35 23.4h0M36.6 23.4h0M38.2 23.4h0M39.8 23.4h0M24.6 24.78h0M26.2 24.78h0M27.8 24.78h0M29.4 24.78h0M31 24.78h0M32.6 24.78h0M34.2 24.78h0M35.8 24.78h0M37.4 24.78h0M22.2 26.17h0M23.8 26.17h0M25.4 26.17h0M27 26.17h0M28.6 26.17h0M30.2 26.17h0M31.8 26.17h0M33.4 26.17h0M35 26.17h0M19.8 27.56h0M21.4 27.56h0M23 27.56h0M24.6 27.56h0M26.2 27.56h0M27.8 27.56h0M29.4 27.56h0M31 27.56h0M32.6 27.56h0M20.6 28.94h0M22.2 28.94h0M23.8 28.94h0M25.4 28.94h0M27 28.94h0M28.6 28.94h0M30.2 28.94h0M23 30.33h0M24.6 30.33h0M26.2 30.33h0\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.7\" stroke-linecap=\"round\"></path><path d=\"M53.4 16.47h0M51 17.86h0M52.6 17.86h0M54.2 17.86h0M55.8 17.86h0M48.6 19.24h0M50.2 19.24h0M51.8 19.24h0M53.4 19.24h0M55 19.24h0M56.6 19.24h0M46.2 20.63h0M47.8 20.63h0M49.4 20.63h0M51 20.63h0M52.6 20.63h0M54.2 20.63h0M55.8 20.63h0M57.4 20.63h0M43.8 22.01h0M45.4 22.01h0M47 22.01h0M48.6 22.01h0M50.2 22.01h0M51.8 22.01h0M53.4 22.01h0M55 22.01h0M56.6 22.01h0M41.4 23.4h0M43 23.4h0M44.6 23.4h0M46.2 23.4h0M47.8 23.4h0M49.4 23.4h0M51 23.4h0M52.6 23.4h0M54.2 23.4h0M39 24.78h0M40.6 24.78h0M42.2 24.78h0M43.8 24.78h0M45.4 24.78h0M47 24.78h0M48.6 24.78h0M50.2 24.78h0M51.8 24.78h0M36.6 26.17h0M38.2 26.17h0M39.8 26.17h0M41.4 26.17h0M43 26.17h0M44.6 26.17h0M46.2 26.17h0M47.8 26.17h0M49.4 26.17h0M34.2 27.56h0M35.8 27.56h0M37.4 27.56h0M39 27.56h0M40.6 27.56h0M42.2 27.56h0M43.8 27.56h0M45.4 27.56h0M47 27.56h0M31.8 28.94h0M33.4 28.94h0M35 28.94h0M36.6 28.94h0M38.2 28.94h0M39.8 28.94h0M41.4 28.94h0M43 28.94h0M44.6 28.94h0M27.8 30.33h0M29.4 30.33h0M31 30.33h0M32.6 30.33h0M34.2 30.33h0M35.8 30.33h0M37.4 30.33h0M39 30.33h0M40.6 30.33h0M42.2 30.33h0M25.4 31.71h0M27 31.71h0M28.6 31.71h0M30.2 31.71h0M31.8 31.71h0M33.4 31.71h0M35 31.71h0M36.6 31.71h0M38.2 31.71h0M27.8 33.1h0M29.4 33.1h0M31 33.1h0M32.6 33.1h0M34.2 33.1h0M35.8 33.1h0\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.82\" stroke-linecap=\"round\"></path><path d=\"\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"0.94\" stroke-linecap=\"round\"></path><path d=\"\" fill=\"none\" stroke=\"#835EFF\" stroke-opacity=\"0.45\" stroke-width=\"1.06\" stroke-linecap=\"round\"></path></g><g data-part=\"gloss\"><ellipse cx=\"23.02\" cy=\"13\" rx=\"5.2\" ry=\"3.2\" transform=\"rotate(-28.89 23.02 13)\" fill=\"rgba(255, 255, 255, 0.45)\"></ellipse><circle cx=\"30.59\" cy=\"10.03\" r=\"1.9\" fill=\"rgba(255, 255, 255, 0.45)\"></circle></g><path data-part=\"edge\" d=\"M25 7.86 Q32 4 39 7.86 L54 16.14 Q61 20 54 23.86 L39 32.14 Q32 36 25 32.14 L10 23.86 Q3 20 10 16.14 Z\" fill=\"none\" stroke=\"url(#icon-edge)\" stroke-width=\"2.2\" stroke-linejoin=\"round\"></path></g><g data-part=\"face\"><g data-part=\"eyes\"><g data-part=\"gaze\"><g data-part=\"lid\"><circle data-part=\"eye\" cx=\"26\" cy=\"18\" r=\"2.8\" fill=\"#1E1633\"></circle></g><g data-part=\"lid\"><circle data-part=\"eye\" cx=\"38\" cy=\"18\" r=\"2.8\" fill=\"#1E1633\"></circle></g></g></g><g data-part=\"mouth\"><path d=\"M28.1 23.8 Q32 27.1 35.9 23.8\" fill=\"none\" stroke=\"#1E1633\" stroke-width=\"1.5\" stroke-linecap=\"round\"></path></g></g></g></g></svg>";

  function drawVeil(host, position, figureSvg) {
    var veil = document.createElement('div');
    var s = veil.style;
    s.position = position; s.top = '0'; s.right = '0'; s.bottom = '0'; s.left = '0';
    s.zIndex = '2147483647'; s.background = '#DDD6EB'; s.color = '#1E1633';
    s.display = 'flex'; s.flexDirection = 'column'; s.alignItems = 'center'; s.justifyContent = 'center';
    s.fontFamily = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
    s.textAlign = 'center'; s.touchAction = 'none'; s.userSelect = 'none'; s.webkitUserSelect = 'none';
    veil.setAttribute('role', 'status');

    // The sentence first: it stands whatever happens to the drawing.
    var line = document.createElement('div');
    line.textContent = 'Reading your enrolment.';
    line.style.fontSize = '20px'; line.style.fontWeight = '600'; line.style.lineHeight = '26px';
    veil.appendChild(line);

    var sub = document.createElement('div');
    sub.textContent = 'Keep this page open.';
    sub.style.fontSize = '16px'; sub.style.lineHeight = '22px'; sub.style.marginTop = '4px'; sub.style.opacity = '0.7';
    veil.appendChild(sub);

    // The one thing that moves: a dot going round, the sign that work is under way.
    var orbit = document.createElement('div');
    orbit.style.width = '28px'; orbit.style.height = '28px'; orbit.style.marginTop = '24px'; orbit.style.position = 'relative';
    var dot = document.createElement('div');
    dot.style.width = '10px'; dot.style.height = '10px'; dot.style.borderRadius = '50%'; dot.style.background = '#1E1633';
    dot.style.position = 'absolute'; dot.style.top = '0'; dot.style.left = '9px';
    orbit.appendChild(dot); veil.appendChild(orbit);
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var turning = null;
    if (!still && orbit.animate) turning = orbit.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: 1100, iterations: Infinity });

    // The character, in its own guarded step, above the sentence. It stays still.
    if (figureSvg) {
      try {
        var box = document.createElement('div');
        box.style.width = '66%'; box.style.maxWidth = '300px'; box.style.marginBottom = '28px';
        box.innerHTML = figureSvg;
        var svg = box.firstChild;
        svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.overflow = 'visible';
        veil.insertBefore(box, line);
      } catch (e) { /* the veil, the sentence and the dot still stand */ }
    }

    ['click', 'touchstart', 'touchend', 'pointerdown', 'mousedown'].forEach(function (t) {
      veil.addEventListener(t, function (e) { e.preventDefault(); e.stopPropagation(); }, { capture: true, passive: false });
    });
    host.appendChild(veil);

    return {
      veil: veil,
      fail: function () {
        line.textContent = 'That did not work.';
        sub.textContent = 'Go back to Viky and try again.';
        if (turning) turning.cancel();
        orbit.style.visibility = 'hidden'; // its place is kept, so nothing jumps
      }
    };
  }

  let veilNow = null;
  let veilFailed = false;
  let signInWatch = null;

  // The character after the veil, the sentence and the dot, in its own guarded step: if it fails, they stand, and
  // the press is made all the same. It is the mockup's own five lines, with the reason kept for the log.
  function drawCharacter(veil) {
    if (!FIGURE) {
      log('character not drawn: none in this version');
      return;
    }
    try {
      const box = document.createElement('div');
      box.style.width = '66%'; box.style.maxWidth = '300px'; box.style.marginBottom = '28px';
      box.innerHTML = FIGURE;
      const svg = box.firstChild;
      svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.overflow = 'visible';
      veil.insertBefore(box, veil.firstChild);
      log('character drawn');
    } catch (e) {
      log('character not drawn: ' + String(e && e.message || e).slice(0, 120));
    }
  }

  function removeVeil(why) {
    try {
      if (!veilNow) return;
      veilNow.veil.remove();
      veilNow = null;
      log('veil removed: ' + why);
    } catch {
      log('veil not removed: ' + why);
    }
  }

  function showVeil() {
    try {
      if (veilNow || veilFailed || !document.documentElement) return;
      // Never over a sign-in form: that page is the person's.
      if (document.body && hasLoginNegativeSignal()) return;
      veilNow = drawVeil(document.documentElement, 'fixed', null);
      log('veil drawn (readyState=' + document.readyState + ')');
      drawCharacter(veilNow.veil);
      // If a sign-in form appears under it, at any moment and whatever it says by then, the veil comes off.
      if (!signInWatch) {
        signInWatch = setInterval(() => {
          if (veilNow && hasLoginNegativeSignal()) removeVeil('sign-in form');
        }, 400);
      }
    } catch (e) {
      log('veil not drawn: ' + String(e && e.message || e).slice(0, 120));
    }
  }

  // The path gave up, or nothing came of the press: the veil says so and where to go, and its dot stops.
  function failVeil(reason) {
    try {
      if (veilFailed) return;
      if (!veilNow && !hasLoginNegativeSignal()) showVeil();
      if (!veilNow) return;
      veilFailed = true;
      veilNow.fail();
      log('veil failed: ' + reason);
    } catch {
      log('veil not failed: ' + reason);
    }
  }

  // As early as the page has a root, which is before it draws anything of its own.
  function veilAtOnce() {
    if (document.documentElement) {
      showVeil();
      return;
    }
    try {
      const seen = new MutationObserver(() => {
        if (!document.documentElement) return;
        seen.disconnect();
        showVeil();
      });
      seen.observe(document, { childList: true });
    } catch {
      setTimeout(showVeil, 0);
    }
  }

  async function pressEnrolments() {
    if (state.enrollmentTabClickAttempted || /#!inscriptionsView$/.test(location.href)) return;
    const target = await until(() => {
      if (!appAuthenticated()) return null;
      const button = visibleAppButton('Inscriptions');
      if (!button || disabled(button)) return null;
      return button;
    }, 60000, 300);
    if (!target) {
      log('Inscriptions never pressable (' + whatIsThere() + ')');
      failVeil('Inscriptions never pressable');
      return;
    }
    writeState({ enrollmentTabClickAttempted: true, enrollmentTabClickAt: Date.now() });
    try {
      target.click();
      log('pressed Inscriptions');
      // A minute after the press, a page that is still here has given no proof: the veil must not turn for ever.
      setTimeout(() => failVeil('no proof 60 s after the press'), 60000);
    } catch {
      log('press on Inscriptions threw');
      failVeil('press on Inscriptions threw');
      return;
    }
    const shown = await until(() => /#!inscriptionsView$/.test(location.href), 20000, 300);
    log(shown ? 'on the Inscriptions view' : 'the view did not change after the press');
  }

  async function main() {
    // The ENT's own pages exist only behind the sign-in, and the file is reached from there: on either host the veil
    // is drawn before the page draws itself, and comes off if a sign-in form is found after all. Not on the ENT once
    // this script has left it: somebody who comes back there is acting, and nothing would follow.
    const onTheEnt = location.hostname === 'ent.utoulouse.fr';
    const onTheFile = location.hostname === 'mondossierweb.univ-tlse3.fr';
    if (onTheFile || (onTheEnt && !state.applicationNavigationAttempted)) veilAtOnce();
    await until(() => document.readyState !== 'loading', 15000, 100);
    log('loaded on ' + location.hostname + ' (bridge: ' + bridgeMembers() + ')');

    // The ENT's own pages exist only behind the sign-in (its root sends to the CAS, on another host), so being on
    // this host with no sign-in form is being signed in: leave at once for the file, whatever the home page shows.
    if (onTheEnt) {
      if (hasLoginNegativeSignal()) {
        removeVeil('sign-in form');
        return;
      }
      if (state.applicationNavigationAttempted) return;
      showVeil();
      log('signed in on the ENT, leaving for the file');
      writeState({ applicationNavigationAttempted: true, applicationNavigationAt: Date.now() });
      location.assign(TARGET_URL);
      return;
    }

    if (onTheFile) {
      const authenticated = await untilStable(
        () => {
          // A sign-in form here needs the person: the page is theirs, and the veil comes back once it is gone.
          const form = hasLoginNegativeSignal();
          if (form) removeVeil('sign-in form');
          else showVeil();
          return appAuthenticated() && !form;
        },
        120000,
        400,
        3
      );
      if (!authenticated) {
        log('file never ready (' + whatIsThere() + ')');
        failVeil('file never ready');
        return;
      }
      log('file ready');
      showVeil();
      reportLoggedIn();
      await pressEnrolments();
    }
  }

  main().catch(() => {});
})();
