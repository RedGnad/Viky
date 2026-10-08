# The Université de Toulouse enrolment provider, a rule written by hand

The portal `utoulouse-fr` is read through a Reclaim provider of ours (`c560dffd-5f37-4b8a-94ed-106ce9e9ee27`, "utoulouse").
Its first versions were written by Reclaim's agent, one rule per pass, each different. Since 8 Oct 2026 it carries a
rule written by hand: the same request and the same pattern at every pass, and a script that takes the student from the
sign-in to the page the rule reads. The script is [`utoulouse-enrolment.js`](utoulouse-enrolment.js), kept here byte
for byte as it is pasted at Reclaim (sha256 `68a981e6774c4e749fb9edbde388cdcf4eb702df5bca987472b8f3c129043a6a`).

## The record at Reclaim

Everything but the script is what version 3.0.0 held, and what version 4.0.0 holds, read from Reclaim's public record
on 8 Oct 2026.

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
3. It presses "Inscriptions", once, in the middle of the entry. The file then asks its server for the registrations
   table, which is the request the rule reads.

From the moment the student is signed in, on the ENT and on the file, a veil covers the page: one plain screen
(ground `#DDD6EB`, words `#1E1633` at 20 px in the system's own face, "Reading your enrolment. Nothing to do.", a
dot of 12 px turning under them), fixed over the whole window, above everything, taking every touch. It is drawn as
soon as the page has a root, before the page draws anything of its own, and it stays to the end: the press goes to
the entry itself, under it. It comes off in two cases only: a sign-in form, which needs the person, and the script
giving up. Nothing is fetched to draw it, no image and no font.

It writes one line per step to the session's log, each starting with `[utoulouse-enrolment]`: `loaded on <host>`,
`veil drawn (at the start)`, `signed in on the ENT, leaving for the file`, `file ready`, `logged-in signal sent` or
`no logged-in function on the bridge`, `pressed Inscriptions`, `on the Inscriptions view`, and `veil taken off (…)`
with its reason; and when a step fails, `file never ready`,
`Inscriptions never pressable`, `press on Inscriptions threw`, `the view did not change after the press`. The two
"never" lines end with counts of what the page held (buttons, menu entries, whether "Inscriptions" was found and
shown, whether a sign-in form was there). Nothing of the page's content is written.

## What the pass of 8 Oct 2026 showed, and what version 4.0.0 changes

One student, version 3.0.0, no proof. The session's log read `file never ready` two minutes after the file loaded,
while the page was alive: the script never saw the menu, so it never pressed.

The file is esup-mdw (EsupPortail). Its menu entries are Vaadin 7.7 buttons (`MainUI.addItemMenu`:
`new Button(caption, icon)` with the menu's style), and Vaadin draws a button as
`<div role="button" class="valo-menu-item">` with the label in a `…-caption` span after the icon's glyph, never as a
`<button>` (`VButton`). Version 3.0.0 looked for `<button>` elements and found none. It also asked for three entries
together, one of which, "Calendrier des épreuves", is shown or not by a setting of the university.

Version 4.0.0, saved at Reclaim and pinned in production on 8 Oct 2026 (Reclaim gave it that number; the script is
this file, and its sign-in address, request and rule are those of 3.0.0):
- looks for `[role="button"]`, `button`, `.v-button` and `.valo-menu-item`, and reads the label from the caption,
  without the icon's glyph;
- asks for "Inscriptions" alone, the entry every student's file has, preferring the entry that says exactly that;
- presses the entry with a plain click;
- says one more line after the press, whether the view changed, and counts what it found when it gives up.

The version after it (9 Oct 2026, to be saved at Reclaim by the founder, who names it 4.0.1) adds the veil (the
founder: a portal that stands still after the sign-in reads as broken in a second and a half) and takes out the call
to `window.Reclaim.requiresUserInteraction(false)` that 4.0.0 made, which does nothing on the web page.

## Not verified

- No proof has been made on a rule written by hand. The stand-in pages of
  `test/browser/utoulouse-provider-script.spec.ts` are drawn from Vaadin's and esup-mdw's sources, not from a student's
  session: that the real menu is found, and that a press made by the script sends the body the rule expects, will be
  known at the next student's pass, from the log's lines.
- The veil on the real page. It is drawn and measured on the stand-in pages; that the university's own page lets a
  script add an element and one style rule, and that Reclaim's window shows the veil rather than its own wait, will
  be seen at the next student's pass. A second sign-in asked on a third host after the ENT is not under the veil: the
  script does nothing there, and the veil is drawn on the ENT and on the file alone.
- Reclaim has not approved the provider since a version was saved by hand on 8 Oct 2026 (`isApproved: false` on every
  version). The script of 3.0.0 ran all the same.

## Pinning a version before any proof

From the operator's folder, a dry run first (`DRY_RUN=1`), then the same line without it:

```
PROVEN_BY=0x… pnpm portal:pin --portal utoulouse-fr --sense enrolment --ahead <version> --field academicYear --matches '^2026\\/2027$' --keeps "whether the student's own file shows the 2026-2027 academic year, and nothing else" --sample '2026\/2027'
```

The first proof that fits the pin is paid at once and confirms it; one that does not is held, never refused.
