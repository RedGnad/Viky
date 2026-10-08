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

  // Tells Reclaim's page whether the person still has to act on what is shown. Said as soon as they are signed in, so
  // the wait comes back and nobody watches their own file move and stop: a page that stands still after the sign-in
  // reads as broken within two seconds. Each call is in its own try, and says in the log whether the bridge had the
  // function and whether the call went through: at worst it does nothing, and the log says so.
  function userHasToAct(needed, where) {
    const said = 'user interaction ' + (needed ? 'required' : 'not required') + ' (' + where + '): ';
    let known = false;
    try {
      known = !!window.Reclaim && typeof window.Reclaim.requiresUserInteraction === 'function';
      if (known) {
        window.Reclaim.requiresUserInteraction(needed);
        log(said + 'told');
        return;
      }
    } catch {
      log(said + 'the call threw');
      return;
    }
    log(said + 'no such function on the bridge');
  }

  // A press as a finger makes it: one click in the middle of the entry, so the file sends what it sends for a person.
  function press(el) {
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y, screenX: x, screenY: y }));
    } catch {
      el.click();
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
      return;
    }
    writeState({ enrollmentTabClickAttempted: true, enrollmentTabClickAt: Date.now() });
    try {
      press(target);
      log('pressed Inscriptions');
    } catch {
      log('press on Inscriptions threw');
      return;
    }
    const shown = await until(() => /#!inscriptionsView$/.test(location.href), 20000, 300);
    log(shown ? 'on the Inscriptions view' : 'the view did not change after the press');
  }

  async function main() {
    await until(() => document.readyState !== 'loading', 15000, 100);
    log('loaded on ' + location.hostname + ' (bridge: ' + bridgeMembers() + ')');

    // The ENT's own pages exist only behind the sign-in (its root sends to the CAS, on another host), so being on
    // this host with no sign-in form is being signed in: leave at once for the file, whatever the home page shows.
    if (location.hostname === 'ent.utoulouse.fr') {
      if (hasLoginNegativeSignal() || state.applicationNavigationAttempted) return;
      log('signed in on the ENT, leaving for the file');
      userHasToAct(false, 'signed in on the ENT');
      writeState({ applicationNavigationAttempted: true, applicationNavigationAt: Date.now() });
      location.assign(TARGET_URL);
      return;
    }

    if (location.hostname === 'mondossierweb.univ-tlse3.fr') {
      let givenBack = false;
      const authenticated = await untilStable(
        () => {
          // A sign-in form here, after the wait was asked for on the ENT, needs the person: the page is theirs again.
          if (!givenBack && hasLoginNegativeSignal()) {
            givenBack = true;
            userHasToAct(true, 'sign-in form on the file');
          }
          return appAuthenticated() && !hasLoginNegativeSignal();
        },
        120000,
        400,
        3
      );
      if (!authenticated) {
        log('file never ready (' + whatIsThere() + ')');
        return;
      }
      log('file ready');
      userHasToAct(false, 'file ready');
      reportLoggedIn();
      await pressEnrolments();
    }
  }

  main().catch(() => {});
})();
