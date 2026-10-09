# The Université de Toulouse enrolment provider, a rule written by hand

The portal `utoulouse-fr` is read through a Reclaim provider of ours (`c560dffd-5f37-4b8a-94ed-106ce9e9ee27`, "utoulouse").
Its first versions were written by Reclaim's agent, one rule per pass, each different. Since 8 Oct 2026 it carries a
rule written by hand: the same request and the same pattern at every pass, and a script that takes the student from the
sign-in to the page the rule reads. The script is kept here byte for byte as it is pasted at Reclaim, in two files that
differ by one line:

| File | Bytes | What it holds |
| --- | --- | --- |
| [`utoulouse-enrolment.js`](utoulouse-enrolment.js) | 23,233 | the script with the character on its veil (sha256 `207b721a671513c486d830529776d7449f146e328dc7d7484641656c319e3edd`) |
| [`utoulouse-enrolment-no-character.js`](utoulouse-enrolment-no-character.js) | 15,456 | the same script with `var FIGURE = null;`, kept in case Reclaim's field refuses the length of the first, which it took on 9 Oct 2026 (sha256 `f1c091f387c309f79ef8cbde901ceaaf21bd4a1e1f5c29e4d55aa18c5d8bdff0`) |

## The record at Reclaim

Everything but the script is what version 3.0.0 held, and what versions 4.0.0 and 5.0.0 hold, read from Reclaim's public
record on 8 and 9 Oct 2026.

| Field | Value |
| --- | --- |
| Sign-in address | `https://ent.utoulouse.fr/` |
| Verification | `WITNESS`, script injected by `CDP` |
| Request | `POST https://mondossierweb.univ-tlse3.fr/UIDL/?v-uiId=0`, a constant address |
| Body | one press of a button and nothing else (the template below) |
| Match | contains `"{{academicYear}}","` |
| Redaction | `"tr",\{"key":\d+\},"(?<academicYear>2026\\/2027)","[^"]+"` |
| Script | `utoulouse-enrolment.js` |

```json
{"csrfToken":"{{BODY_PARAM_SECRET_1}}","rpc":[["{{BODY_PARAM_7}}","com.vaadin.shared.ui.button.ButtonServerRpc","click",[{"altKey":false,"button":"LEFT","clientX":{{BODY_PARAM_1}},"clientY":{{BODY_PARAM_2}},"ctrlKey":false,"metaKey":false,"relativeX":{{BODY_PARAM_3}},"relativeY":{{BODY_PARAM_4}},"shiftKey":false,"type":1}]]],"syncId":{{BODY_PARAM_5}},"clientId":{{BODY_PARAM_6}}}
```

The field a proof carries is `academicYear`, with the answer's own escaped slash: `2026\/2027`.

## What the script does

1. On `ent.utoulouse.fr` with no sign-in form on the page, the student is signed in (the ENT's root sends anybody else
   to the sign-in, on another host): it leaves at once for `https://mondossierweb.univ-tlse3.fr/`.
2. On the file, it waits for the menu entry "Inscriptions" to be shown, with no sign-in form, for up to two minutes.
3. It presses "Inscriptions", once, with the entry's own click. The file then asks its server for the registrations
   table, which is the request the rule reads.

## The veil

From the moment the student is signed in, on the ENT and on the file, a veil covers the page, so nobody watches their
own file move and stand still. `FIGURE` and `drawVeil` are the mockup's own text (`university-veil-2026-10-09`),
character for character.

- What is seen: the character, still; "Reading your enrolment."; "Keep this page open."; a dot going round. No
  duration is said: none has been measured.
- The ground is `#DDD6EB`, the words `#1E1633` in the system's own face. It is fixed over the whole window, on the
  page's root, above everything, and takes every touch. The press goes to the entry itself, under it.
- The drawing is the kit's own (`app/kit/figure-icon.ts`). There it carries its colours in style attributes; here they
  are plain attributes, with no style attribute at all, so a page that refuses inline styles does not turn it black.
- Order: the veil, the sentence and the dot first; the character after them, in a step of its own. If that step fails,
  the rest stands and the press is made all the same.
- When: as soon as the page has a root, before it draws anything of its own. Never over a sign-in form: it is not drawn
  over one, and if one appears the veil is removed, whatever it says by then.
- Failure: when the path gives up ("file never ready", "Inscriptions never pressable", a press that threw), and 60
  seconds after the press if the page is still there, the veil says "That did not work." then "Go back to Viky and try
  again.", and the dot is gone.
- Nothing is fetched to draw it, and it uses no stylesheet, no style attribute in markup, no image and no font: it
  draws whole on a page whose policy is `default-src 'none'; script-src 'unsafe-inline'`.

## The session's log

One line per step, each starting with `[utoulouse-enrolment]`: `veil drawn (readyState=…)`, `character drawn` or
`character not drawn: <reason>`, `loaded on <host>`, `signed in on the ENT, leaving for the file`, `file ready`,
`logged-in signal sent` or `no logged-in function on the bridge`, `pressed Inscriptions`, `on the Inscriptions view`;
`veil removed: sign-in form`; when a step fails, `file never ready`, `Inscriptions never pressable` or
`press on Inscriptions threw`, each followed by `veil failed: <reason>` where a veil is on the page; and after a
press, `the view did not change after the press` and `veil failed: no proof 60 s after the press`. The two "never" lines end with counts of
what the page held (buttons, menu entries, whether "Inscriptions" was found and shown, whether a sign-in form was
there). Nothing of the page's content is written.

## What the pass of 8 Oct 2026 showed, and what version 4.0.0 changes

One student, version 3.0.0, no proof. The session's log read `file never ready` two minutes after the file loaded,
while the page was alive: the script never saw the menu, so it never pressed.

The file is esup-mdw (EsupPortail). Its menu entries are Vaadin 7.7 buttons (`MainUI.addItemMenu`:
`new Button(caption, icon)` with the menu's style), and Vaadin draws a button as
`<div role="button" class="valo-menu-item">` with the label in a `…-caption` span after the icon's glyph, never as a
`<button>` (`VButton`). Version 3.0.0 looked for `<button>` elements and found none. It also asked for three entries
together, one of which, "Calendrier des épreuves", is shown or not by a setting of the university.

Version 4.0.0, saved at Reclaim and pinned in production on 8 Oct 2026 (Reclaim gave it that number; its sign-in
address, request and rule are those of 3.0.0):
- looks for `[role="button"]`, `button`, `.v-button` and `.valo-menu-item`, and reads the label from the caption,
  without the icon's glyph;
- asks for "Inscriptions" alone, the entry every student's file has, preferring the entry that says exactly that;
- presses with a click that carries the entry's own position, as a person's press does;
- asks Reclaim for its wait as soon as the student is signed in, each call in its own try, with its line in the log;
- says one more line after the press, whether the view changed, and counts what it found when it gives up.

Version 5.0.0, saved at Reclaim by the founder on 9 Oct 2026 from the first file above and pinned in production the
same day, ahead of any proof (the script in Reclaim's public record is that file to the last character, read that day),
adds the veil
(the founder: a portal that stands still after the sign-in reads as broken in a second and a half), presses with the
entry's own `click()`, which a veil over the entry does not stop, and takes out the call to
`window.Reclaim.requiresUserInteraction(false)` that 4.0.0 made, which does nothing on the web page. The rest of the
path is 4.0.0's.

## Not verified

- On 9 Oct 2026 a student's pass on version 5.0.0 made a proof on this rule and gift 1000008 was paid at once, with no
  review (transaction 0xd950…77e2, block 111901591, 12:55:27 UTC).
- The veil on the real page. It is drawn and measured on the stand-in pages, one of them under the policy above; that
  Reclaim's window runs the script before the university's page draws, and shows the veil rather than its own wait,
  will be seen at the next student's pass (`veil drawn (readyState=loading)` in the log says the first). A second
  sign-in asked on a third host after the ENT is not under the veil: the script does nothing there.
- How long a proof takes after the press, on this path. On the three real proofs of 7 Oct 2026, made on the agent's
  path, the founder read two to three seconds from the start of a proof to its sending in Reclaim's own logs, which is
  why the veil waits 60 seconds after the press before it says "That did not work.". A proof that took longer than
  that, on a page Reclaim leaves open meanwhile, would be told as a failure while it succeeds.
- A finger on a real phone. The touches are taken from a browser that is told its screen is touched, not from a hand.
- Reclaim has not approved the provider since a version was saved by hand on 8 Oct 2026 (`isApproved: false` on every
  version). The script of 3.0.0 ran all the same.

## Pinning a version before any proof

From the operator's folder, a dry run first (`DRY_RUN=1`), then the same line without it:

```
PROVEN_BY=0x… pnpm portal:pin --portal utoulouse-fr --sense enrolment --ahead <version> --field academicYear --matches '^2026\\/2027$' --keeps "whether the student's own file shows the 2026-2027 academic year, and nothing else" --sample '2026\/2027'
```

The first proof that fits the pin is paid at once and confirms it; one that does not is held, never refused.
