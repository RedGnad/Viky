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
  // It covers everything, takes every touch, and stays to the end. The press below goes to the entry itself, under it.
  // Drawn with the page's own means and nothing fetched: no image, no font, no stylesheet of ours but one rule that
  // turns the dot. It comes off only when the person is needed again (a sign-in form) or when this script gives up.
  const VEIL_ID = '__viky_reading_veil';

  function veilDrawn() {
    return !!document.getElementById(VEIL_ID);
  }

  function drawVeil(where) {
    try {
      if (veilDrawn() || !document.documentElement) return;
      const veil = document.createElement('div');
      veil.id = VEIL_ID;
      veil.setAttribute('role', 'status');
      veil.style.cssText = 'position:fixed;inset:0;top:0;right:0;bottom:0;left:0;z-index:2147483647;margin:0;padding:24px;box-sizing:border-box;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'background:#DDD6EB;color:#1E1633;font-family:-apple-system, Helvetica, sans-serif;font-size:20px;line-height:1.4;text-align:center;' +
        'touch-action:none;cursor:default;';
      // One sentence each, so a narrow screen breaks the line between the two and never inside one.
      const words = document.createElement('p');
      words.style.cssText = 'margin:0;font-size:20px;font-weight:400;color:#1E1633;';
      ['Reading your enrolment.', 'Nothing to do.'].forEach((sentence, at) => {
        if (at > 0) words.appendChild(document.createTextNode(' '));
        const part = document.createElement('span');
        part.textContent = sentence;
        part.style.cssText = 'display:inline-block;';
        words.appendChild(part);
      });
      const turn = document.createElement('div');
      turn.style.cssText = 'margin-top:24px;width:36px;height:36px;animation:viky-veil-turn 1s linear infinite;';
      const dot = document.createElement('div');
      dot.style.cssText = 'width:12px;height:12px;margin:0 auto;border-radius:50%;background:#1E1633;';
      turn.appendChild(dot);
      const rule = document.createElement('style');
      rule.textContent = '@keyframes viky-veil-turn{to{transform:rotate(360deg)}}';
      veil.appendChild(rule);
      veil.appendChild(words);
      veil.appendChild(turn);
      // On the root and not in the body: the file redraws its body, and the veil must outlast that.
      document.documentElement.appendChild(veil);
      log('veil drawn (' + where + ')');
    } catch {
      log('veil not drawn (' + where + ')');
    }
  }

  function liftVeil(why) {
    try {
      const veil = document.getElementById(VEIL_ID);
      if (!veil) return;
      veil.remove();
      log('veil taken off (' + why + ')');
    } catch {
      log('veil not taken off (' + why + ')');
    }
  }

  // As early as the page has a root, which is before it draws anything of its own.
  function veilAtOnce(where) {
    if (document.documentElement) {
      drawVeil(where);
      return;
    }
    try {
      const seen = new MutationObserver(() => {
        if (!document.documentElement) return;
        seen.disconnect();
        drawVeil(where);
      });
      seen.observe(document, { childList: true });
    } catch {
      setTimeout(() => drawVeil(where), 0);
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
      liftVeil('gave up');
      return;
    }
    writeState({ enrollmentTabClickAttempted: true, enrollmentTabClickAt: Date.now() });
    try {
      target.click();
      log('pressed Inscriptions');
    } catch {
      log('press on Inscriptions threw');
      liftVeil('gave up');
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
    if (onTheFile || (onTheEnt && !state.applicationNavigationAttempted)) veilAtOnce('at the start');
    await until(() => document.readyState !== 'loading', 15000, 100);
    log('loaded on ' + location.hostname + ' (bridge: ' + bridgeMembers() + ')');

    // The ENT's own pages exist only behind the sign-in (its root sends to the CAS, on another host), so being on
    // this host with no sign-in form is being signed in: leave at once for the file, whatever the home page shows.
    if (onTheEnt) {
      if (hasLoginNegativeSignal()) {
        liftVeil('sign-in form on the ENT');
        return;
      }
      if (state.applicationNavigationAttempted) return;
      drawVeil('signed in on the ENT');
      log('signed in on the ENT, leaving for the file');
      writeState({ applicationNavigationAttempted: true, applicationNavigationAt: Date.now() });
      location.assign(TARGET_URL);
      return;
    }

    if (onTheFile) {
      let givenBack = false;
      const authenticated = await untilStable(
        () => {
          // A sign-in form here needs the person: the page is theirs again, and the veil comes back once it is gone.
          const form = hasLoginNegativeSignal();
          if (form && !givenBack) {
            givenBack = true;
            liftVeil('sign-in form on the file');
          }
          if (!form && givenBack && !veilDrawn()) drawVeil('signed in on the file');
          return appAuthenticated() && !form;
        },
        120000,
        400,
        3
      );
      if (!authenticated) {
        log('file never ready (' + whatIsThere() + ')');
        liftVeil('gave up');
        return;
      }
      log('file ready');
      drawVeil('file ready');
      reportLoggedIn();
      await pressEnrolments();
    }
  }

  main().catch(() => {});
})();
