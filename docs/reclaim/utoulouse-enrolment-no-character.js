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
  var FIGURE = null;

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
