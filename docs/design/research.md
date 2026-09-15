# Design research, read at the source

Everything here was read on the official page on 15 September 2026, before any line of design code was
written. It exists so that every number in Viky's layout can be traced to whoever published it, and so that
the ones nobody publishes are visible as such rather than invented.

Marking, on every claim:

- **[O]** read on the official page. The URL is given, and where a site serves its content from a separate
  data file, that is the URL given, because that is what was actually read.
- **[W]** a secondary source only, with the source named and the fact that the official page could not
  confirm it stated plainly.
- **[NV]** not verified. Present only where it matters that nobody has checked.

A negative finding is marked **[O, negative]**: the official corpus was searched and the guidance is not
there. Those matter as much as the numbers, because a missing rule is where invented precision creeps in.

## 0. What the research changed, in one table

| what we had | what the research says | source |
|---|---|---|
| four CSS variables, no scales | a spacing scale, a type scale and a grid are all published, with numbers | Material 3, Apple |
| no `viewport-fit`, so device insets ignored | insets need `viewport-fit=cover` plus `env(safe-area-inset-*)` to exist at all | web.dev |
| 44 px tap floor, cited as "platform guidance" with nobody named | four sources, four floors: web.dev 48 dp, Apple 44 pt, NN/g 1 cm, WCAG 2.2 24 px. We take **48** | 1.1 and 3.4 |
| no spacing rule between targets | Apple publishes 12 pt and 24 pt by bezel; web.dev publishes 8 px | Apple, web.dev |
| no line-length limit, so text can run the full width | 45 to 75 characters, 66 ideal, and `66ch` rather than a pixel width | web.dev |
| explanation above the money on the home page | two thirds of attention is in the top 40 % of the page | NN/g |
| contrast never measured | 4.5:1, and 3:1 only above a stated point size | WCAG, Apple |
| `100vh` unchecked | `100vh` is the documented mobile trap; `dvh` and friends exist for it | web.dev |

## 1. Apple, Human Interface Guidelines

The pages are a JavaScript shell: a plain fetch returns HTTP 200 and a title, nothing else. Apple serves the
same page as its own data file, and that is what was read:

`https://developer.apple.com/tutorials/data/design/human-interface-guidelines/<slug>.json`

Routes that failed first, recorded so nobody repeats them: `/tutorials/data/documentation/design/...` (404)
and `/design/human-interface-guidelines/<slug>.json` (404). Fetching many slugs at once is rate limited and
returns nothing; paced requests work. 63 pages were read, and every negative below is scoped to those 63.

### 1.1 Tap targets, and a conflict Apple has not resolved

Apple states two different things on two current pages, and both are official.

- **Buttons**: a button "needs a hit region of at least 44x44 pt", and 60x60 pt on visionOS. **[O]**
  `.../buttons.json`
- **Accessibility**, under offering sufficiently sized controls, gives a table where 44x44 pt is the iOS
  **default** and **28x28 pt** is the **minimum**. **[O]** `.../accessibility.json`

The older wording everyone quotes, "minimum tappable area of 44x44 points", is gone: neither "minimum
tappable" nor "tappable area" appears anywhere in the 63 pages. **[O, negative]**

**Viky does not take either number, because web.dev publishes a larger one**: see 3.4. Apple's 44 pt is the
stricter of its own two framings and is what the Buttons page still requires, but 48 dp satisfies Apple,
web.dev, NN/g and WCAG at once. What this section settles is that our old citation was empty: the test said
"platform guidance" without naming anyone, and the number it used was neither the strictest available nor
traceable.

### 1.2 Spacing between targets

Apple publishes two numbers, on Accessibility and again on Pointing devices: **[O]**
`.../accessibility.json`, `.../pointing-devices.json`

- about **12 points** of padding around an element that includes a bezel
- about **24 points** of padding around the visible edges of an element without a bezel

Our buttons have a visible border, so they are bezelled: 12 pt between stacked controls is the floor, and
the spacing scale must make that easy rather than accidental.

### 1.3 Margins: Apple has stopped publishing them

The Layout page was revised on **9 September 2026**, six days before this research, and its device
specification tables were removed. The page now contains no device table, no screen-size table, and no
occurrence of "safe area insets". An earlier change-log row ("Added specifications for iPhone 17, iPhone
Air...") proves the tables existed. **[O, negative]** `.../layout.json`

Apple now points the numbers off-page: Designing for iPhone Duo says, for margins and safe areas, see Apple
Design Resources. **[O]** `.../designing-for-iphone-duo.json`

What Layout still says, without numbers: a layout guide "defines a rectangular region" that applies standard
margins and restricts the width of text for readability; a safe area is the region not covered by a hardware
feature, naming toolbar, tab bar, status bar and the Dynamic Island, and respecting it "is essential". **[O]**

**Consequence for Viky**: our page margin cannot cite Apple. It cites Material 3 (see 2.1), which still
publishes a number.

Also worth recording, because it is the kind of thing that gets assumed: the current iOS rule about not
obscuring the home indicator **is not in the corpus**. The phrase appears eight times and every one is
visionOS. **[O, negative]** Respecting the bottom inset is still right, and the reason we give for it is
web.dev's (see 3.x), not Apple's.

### 1.4 The type scale, with numbers

iOS and iPadOS Dynamic Type, at the Large (default) size. **[O]** `.../typography.json`

| style | weight | size pt | leading pt |
|---|---|---|---|
| Large Title | Regular | 34 | 41 |
| Title 1 | Regular | 28 | 34 |
| Title 2 | Regular | 22 | 28 |
| Title 3 | Regular | 20 | 25 |
| Headline | Semibold | 17 | 22 |
| Body | Regular | 17 | 22 |
| Callout | Regular | 16 | 21 |
| Subhead | Regular | 15 | 20 |
| Footnote | Regular | 13 | 18 |
| Caption 1 | Regular | 12 | 16 |
| Caption 2 | Regular | 11 | 13 |

Apple publishes seven standard sizes and five accessibility sizes. Two endpoints, for scale: at the smallest,
Body is 14/19; at the largest accessibility size, Body is **53/62** and Large Title 60/70. **[O]**

Minimum text size, all text including custom fonts: iOS **11 pt**, default **17 pt**. **[O]** With a thin
weight, Apple says aim larger. It also says to avoid light weights generally, and especially when text is
small.

**Line length: Apple gives none.** Neither "line length" nor "characters per line" appears in the 63 pages.
**[O, negative]** So the maximum width of a paragraph in Viky cannot cite Apple either.

### 1.5 Contrast, and the shape of the rule

Accessibility, under striving to meet colour contrast minimums, gives the values Accessibility Inspector
uses, taken from WCAG Level AA: **[O]** `.../accessibility.json`

| text size | weight | minimum ratio |
|---|---|---|
| up to 17 pt | all | **4.5:1** |
| 18 pt | all | **3:1** |
| all | **bold** | **3:1** |

Read exactly as written: Apple says "18 pts", not "18 pt and above", and does not use the phrase "large
text" here. Bold at any size gets 3:1.

Dark Mode adds two more: keep the ratio "no lower than 4.5:1", and for custom foreground and background
colours "strive for a contrast ratio of 7:1, especially in small text". **[O]** `.../dark-mode.json`

**What Viky takes**: 4.5:1 for every piece of text, at every size, in both appearances. The 3:1 relaxation
exists and we do not use it: our largest text is money, which is the last thing to make harder to read.

### 1.6 Colour, and what it may not carry

- Convey information with **more than colour alone**. Apple names the hard pairings, red-green and
  blue-orange, and asks for "visual indicators, like distinct shapes or icons, in addition to color". **[O]**
  Repeated on the Color page: never colour alone to differentiate, to indicate interactivity, or to
  communicate essential information; use text labels or glyph shapes. **[O]** `.../color.json`
- Apply colour **sparingly**. To emphasise a primary action, apply colour "to the background rather than to
  symbols or text". Refrain from adding colour to the background of multiple controls. **[O]**
- With a colourful background, "too much color can be overwhelming and make control labels more difficult to
  read"; prefer a monochromatic appearance for bars, or an accent with real differentiation. **[O]**
- Do not hard-code system colour values; they change between releases. The published swatches are images, so
  no hex values are recoverable, which is consistent with that rule. **[O, negative]**
- Dark Mode is not an inversion: some colours invert, some do not. iOS uses a **base** and an **elevated**
  background set so foreground surfaces advance and background ones recede. Avoid an app-specific appearance
  setting. **[O]** A warning worth keeping: Increase Contrast **inside** Dark Mode "can result in reduced
  visual contrast between dark text and a dark background". **[O]**
- Apple states **no rule about saturation** behind text. The only mentions of saturation concern ambient
  light and wide colour. **[O, negative]** So "saturated colours hurt legibility" is not Apple's claim; the
  contrast ratio is the measurable rule, and it is the one we enforce.

**Consequence for the art direction the funder wants**: there is no published rule against a joyful, colourful
world. There are two published rules that shape it: colour goes to backgrounds and shapes rather than to text
and labels, and every piece of text still has to clear its ratio. That is exactly the "joy in the moments,
calm on the money" split, arrived at from the sources rather than from taste.

### 1.7 Enlargement and motion

- Let people enlarge text by **at least 200 percent**. **[O]**
- Adapting to Dynamic Type, concretely and with no numbers: horizontally adjacent views may need to stack;
  rows may need to grow in height so nothing is cropped; single lines may become several; reduce column
  count as size grows; keep primary elements toward the top even at the largest accessibility size; "aim to
  display as much useful text at the largest accessibility font size as you do at the largest standard font
  size". **[O]**
- Layout is decided by **size classes, not device or orientation**: compact or regular per axis. Keep
  functionality identical as they change; what may change is how much is visible. **[O]**
- Reduce Motion, when on: reduce automatic and repetitive animation, including zooming, scaling and
  peripheral motion. Apple's own techniques: tighten animation springs to reduce bounce; track animation to
  the gesture; avoid animating depth changes in z-axis layers; replace x, y and z transitions with fades;
  avoid animating into and out of blurs. **[O]**

Apple's guidelines never mention web technology: `prefers-reduced-motion` and CSS media queries appear
nowhere in the corpus. **[O, negative]** Mapping these settings onto `prefers-reduced-motion`,
`prefers-contrast` and `prefers-color-scheme` is an inference, not Apple's instruction, and is marked
**[NV]** wherever we rely on it. What is portable and official is the substance: the ratios, the 11 pt floor
and 17 pt default, 200 percent enlargement, 44x44 with 12 or 24 pt of padding, never colour alone, and those
five motion techniques.

## 2. Material Design 3

To be written from the second research pass.

## 3. web.dev and Chrome for Developers

### 3.1 The viewport tag, exactly

The recommended tag is `width=device-width, initial-scale=1`, and nothing else. **[O]**
`https://web.dev/articles/responsive-web-design-basics`

On `minimum-scale`, `maximum-scale` and `user-scalable`, verbatim: "We don't recommend using these attributes
because they can prevent the user from zooming the viewport, potentially causing accessibility issues."
**[O]** same URL. There is a measurable threshold behind it: the accessibility audit requires no
`user-scalable="no"` and `maximum-scale` **not less than 5**. **[O]**
`https://developer.chrome.com/docs/lighthouse/accessibility/scoring`

A second number worth knowing, because it is a cost and not a preference: "Tap interactions may be delayed by
up to **300 milliseconds** if the viewport is not optimized for mobile." **[O]**
`https://developer.chrome.com/docs/performance/insights/viewport` (published 8 Oct 2025)

**`viewport-fit=cover`**: if you want "full access to the screen, even the invisible area", add it, and then
use the insets. The same page warns that you can then "render pixels behind rounded corners and notches, so
you should always use safe margins or paddings for the critical content and interactive elements". **[O]**
`https://web.dev/learn/pwa/app-design`

### 3.2 Safe areas, and the bottom bar trap

The four variables, with fallbacks, because they behave like custom properties: **[O]**
`https://web.dev/learn/design/screen-configurations`

```css
padding-bottom: env(safe-area-inset-bottom, 1em);
```

What makes them work is `viewport-fit=cover`: the page then "will take up the entire viewport and safely pad
the document with device-provided inset values". **[O]** same URL. What they resolve to **without** `cover`
is not stated anywhere in web.dev or the Chrome docs: the pages only say `cover` is what makes them work, so
always pass a fallback. **[NV]**

For anything pinned to the bottom, Chrome publishes an explicit anti-pattern and a replacement. **[O]**
`https://developer.chrome.com/docs/css-ui/edge-to-edge`

- Do **not** write `padding-bottom: env(safe-area-inset-bottom, 0px)` on a bottom-anchored bar: "it results
  in layout thrashing", and "Chrome won't slide the chin away as you scroll when it detects this pattern".
- Use `safe-area-max-inset-bottom` for the padding and `bottom: calc(env(safe-area-inset-bottom, 0px) -
  var(--safe-area-max-inset-bottom))` for the offset. Chrome has a fast path for exactly that `calc(env(...)
  +/- ...)` shape, so only `bottom` recomputes.
- The recommended fallback is **36px**, and the reason is stated: Safari on iOS in Single Tab Mode has a
  maximum bottom offset of 36px in portrait.

The iOS home indicator is never named on web.dev either. **[NV]** The official facts are the notch, the
rounded corners, and that 36px figure. So our reason for padding the bottom is the Android gesture bar and
the browser chin, which are both documented, and not a rule about the home indicator that neither Apple nor
web.dev currently publishes.

### 3.3 Height units, and the `100vh` trap

**[O]** `https://web.dev/blog/viewport-units`

- `vh` does not change with dynamic toolbars, so "elements sized to be `100vh` tall will bleed out of the
  viewport": too tall on load, correct only once the browser UI has retracted.
- `sv*` assumes the UI expanded, `lv*` assumes it retracted, both stable. `dv*` tracks between them and is
  "clamped between their `lv*` and `sv*` counterparts".
- Support: Chrome 108, Firefox 101, Safari 15.4.
- Three caveats, all ours to respect: no viewport unit accounts for scrollbars, so `100vw` is "a little bit
  too wide" with classic scrollbars; dynamic values "do not update at 60fps" and are throttled; the on-screen
  keyboard is not part of the UA UI, so it does not affect any of them.

web.dev issues no directive to prefer one. Choosing `svh` where nothing may ever be clipped and `dvh` only
where a jump is acceptable is our inference from those statements. **[NV]**

### 3.4 Tap targets: the number is 48, not 44

- "A minimum recommended touch target size is around **48** device independent pixels", which "corresponds to
  around 9mm, which is about the size of a person's finger pad area". Spacing: "about **8 pixels** apart,
  horizontally and vertically". A 24px glyph reaches 48 through padding. **[O]**
  `https://web.dev/articles/accessible-tap-targets`
- The audit: it fails only when the target is smaller than 48 by 48 **and** at least 25 % of the area within
  48px of its centre overlaps another target. "Tap targets that are 48 px by 48 px never fail the audit." And
  "8 px between tap targets is a good starting point, but is not always enough spacing." **[O]**
  `https://developer.chrome.com/docs/lighthouse/seo/tap-targets`. The audit still exists: no deprecation
  banner, and it is in neither the replaced nor the removed list of Lighthouse 13. **[O]**
- Grow the target for a coarse pointer with `@media (pointer: coarse)`, and never shrink it for a fine one.
  **[O]** `https://web.dev/learn/design/interaction`

**What Viky takes: 48.** Four sources give four floors, Apple 44 pt, web.dev 48 dp, NN/g 1 cm (about 38 px)
and WCAG 2.2 24 px, so the only defensible choice is the largest. Our test asserted 44, which passed every
floor but the one that is easiest to measure and the one an audit will actually run.

One removal worth recording: the **font-size audit was removed in Lighthouse 13**, "there are no signals that
this remains an SEO concern today". Its historical numbers, still on the page, were that text under 12px is
often hard to read on mobile. **[O]** `https://developer.chrome.com/docs/lighthouse/seo/font-size`

### 3.5 Line length, and where breakpoints come from

Three official numbers, and they do not quite agree, which is worth saying rather than smoothing:

- "an ideal column should contain **70 to 80 characters** per line (about 8 to 10 words in English)" **[O]**
  `https://web.dev/articles/responsive-web-design-basics`
- **45 to 75** characters is "a satisfactory line length"; "The **66**-character line ... is widely regarded
  as ideal"; 40 to 50 for multiple columns. The recommended implementation is `max-inline-size: 66ch`,
  explicitly preferred over a pixel width, because `ch` scales with the font. **[O]**
  `https://web.dev/learn/design/typography/`
- `max-width: 60ch` as the worked sizing example. **[O]** `https://web.dev/learn/css/sizing`

On breakpoints: "It's best to choose your breakpoints based on your content rather than popular device
sizes", and the worked example breaks where "the lines of text become uncomfortably long". **[O]**
`https://web.dev/learn/design/media-queries`. And: "Don't define breakpoints based on device classes, or any
product, brand name, or operating system." **[O]** `https://web.dev/articles/responsive-web-design-basics`

Container queries are presented as complementary to media queries, and neither page says one replaces the
other. **[O]** `https://web.dev/learn/css/container-queries`

### 3.6 Horizontal scrolling

"users are used to scrolling websites vertically but not horizontally", and the named cause is a fixed-size
image, with the fix being "giving all images a `max-width` of `100%`". **[O]**
`https://web.dev/articles/responsive-web-design-basics`. The second documented cause is `100vw` with classic
scrollbars. **[O]** The old Lighthouse detection route (`window.innerWidth` versus `outerWidth`) sits on a
page that states PWA testing in Lighthouse is deprecated, so our own browser test is the detection. **[O]**

## 4. Nielsen Norman Group

### 4.1 Visual hierarchy, with limits that are numbers

**[O]** `https://www.nngroup.com/articles/visual-hierarchy-ux-definition/`

- Hierarchy is carried by contrast, not hue: "It's not the actual color of an element that creates the
  hierarchy, but rather the contrast in value and saturation."
- "Use no more than **3** contrast variations for complex designs."
- "Use no more than **3** sizes", and their concrete web scale: **14 to 16px body, 18 to 22px subheader, up
  to 32px header**.
- "Limit how many elements are big to a maximum of **2**".
- Group by proximity: tighten space inside a group, widen it between groups.
- The squint test: blur the design at **5, 10 and 20px** radii and see what survives.

### 4.2 Where attention actually goes

- **57 %** of page-viewing time above the fold, **74 %** in the first two screenfuls, more than **42 %** in
  the top fifth of the page, more than **65 %** in the top 40 %. 120 participants, over 130,000 fixations.
  **[O]** `https://www.nngroup.com/articles/scrolling-and-attention/`
- "the 100 pixels just above the fold were viewed **102 %** more than the 100 pixels just below"; the average
  difference above versus below is **84 %**. 57,453 fixations. **[O]**
  `https://www.nngroup.com/articles/page-fold-manifesto/`
- People read "at most **28 %** of the words during an average visit; 20 % is more likely". **[O]**
  `https://www.nngroup.com/articles/how-little-do-users-read/`

**Consequence for Viky**: the money and the state of the days belong in the first screenful, above anything
explanatory. Not as a style preference: as the measured place where two thirds of attention is.

### 4.3 Forms, and the one measured difference

**[O]** `https://www.nngroup.com/articles/web-form-design/`

The ten recommendations include: keep it short, group related fields, **one column**, logical order, **no
placeholder text**, field size matched to the input, mark optional and required, explain formatting, no reset
button, visible specific errors.

The measured support, and it is the strongest number in this whole research: forms that follow the guidelines
get **78 %** first-try submissions against **42 %** for forms that violate them, users "almost twice as
likely to submit the form with no errors from the first try" (Seckler et al., CHI '14). **[O]**

- One column, with the reason: "Multiple columns interrupt the vertical momentum of moving down the form."
  **[O]**
- "Limit the form to only **1 or 2** optional fields, and clearly label them as optional." **[O]**
- Labels go **above** the field: "Not inside, not below." **[O]**
  `https://www.nngroup.com/articles/mobile-input-checklist/`
- Avoid drop-downs for 2 or 3 options that could be radio buttons. **[O]**

### 4.4 Older users, and what NN/g does and does not publish

Seniors are 65+. Success rate **55.3 %** against **74.5 %** for ages 21 to 55; time on task 7:49 against
5:28; errors 2.4 against 1.1. Rated capacities: vision **82 % versus 95 %**, dexterity **73 % versus 95 %**,
memory **49 % versus 63 %**. "95 % of seniors were rated as methodical" against 35 % of younger users, and it
bought them no better results. **[O]** `https://www.nngroup.com/articles/usability-seniors-improvements/`

Font size, from the same page: "Sites that target seniors should use at least **12-point** fonts as the
default", and every site should let people resize. **[O]**

**An important negative.** NN/g's article on low contrast contains exactly one number, "Use at least an 8-pt
font", and **no contrast ratio at all**: it defers to W3C 1.4.3. **[O, negative]**
`https://www.nngroup.com/articles/low-contrast/` So the 4.5:1 figure is WCAG's, and attributing it to NN/g
would be wrong. What NN/g does contribute qualitatively: low-contrast elements do not stand out when
scanning, glare makes mobile worse, and dimmed text is read as disabled or as the current location, which
sends a wrong signal.

Touch targets, all ages rather than older-specific: "minimum size should be **1cm x 1cm**". **[O]**
`https://www.nngroup.com/articles/touch-target-size/`

### 4.5 Two rules we will not follow, because the data says not to

- **The three-click rule "has not been supported by data in any published studies to date."** The one study
  cited found that drop-off does not increase beyond three clicks and satisfaction does not decrease.
  **[O]** `https://www.nngroup.com/articles/3-click-rule/` So counting taps is not a target. What matters is
  the wording of labels and the visible state of the money.
- Interaction cost does matter, but "there are no universal thresholds": 4 easy clicks beat 5 easy clicks,
  and counting alone is insufficient. Response time does have thresholds: under 1 second feels seamless,
  under 10 seconds keeps attention. **[O]**
  `https://www.nngroup.com/articles/interaction-elasticity/`

And one limit we will follow: designs exceeding **2 disclosure levels** typically have low usability.
**[O]** `https://www.nngroup.com/articles/progressive-disclosure/`

### 4.6 Reading on a phone is not the problem it is said to be

276 participants, 1,629 cases: comprehension on mobile was about **3 percentage points higher** than on a
computer (95 % CI 1 to 5 %, p = 0.0006), which the article itself calls "not practically significant". The
real cost is speed, "about **30 milliseconds** more on each word" for hard passages. **[O]**
`https://www.nngroup.com/articles/mobile-content-is-twice-as-difficult/` (the page now refutes its own old
title). Conclusion: a small screen costs nothing on easy content and costs reading speed on hard content, so
the work is to make the content easy rather than to fear the screen.

## 5. Material Design 3

Material's pages are an Angular application that answers a plain fetch with "This website requires
JavaScript". The route that works: read `/static/angular/main.<hash>.js`, take `environment.carbonVersion`
and the slug-to-file table out of it, then fetch `https://m3.material.io/_dsm/content/m3/<carbonVersion>/
<fileId>`, and the token values from `/_dsm/data/dsdb-m3/<carbonVersion>/<TYPE>.<hash>.json`. The
`carbonVersion` read on 15 Sep 2026 was `2026-09-09_06-00-49`; it changes, so it must be re-read rather than
reused. Everything below was read in one of those files. **[O]**

### 5.1 Breakpoints and margins, which is where our page margin comes from

**[O]** `https://m3.material.io/foundations/layout/breakpoints`

| breakpoint | width | panes |
|---|---|---|
| compact | under 600dp | 1 |
| medium | 600 to 839dp | 1, or 2 |
| expanded | 840 to 1199dp | 1, or 2 recommended |
| large | 1200 to 1599dp | 1, or 2 recommended |
| extra large | 1600dp and above | 1 to 3 |

Margins: **16dp** leading and trailing on compact, **24dp** from medium upward, with a 24dp spacer between
panes. Padding "is measured in increments of 4dp". **[O]**

Two honest negatives. The word **gutter** does not appear on any current M3 page read (thirteen pages
grepped): M3 now names margin, spacer, padding and gap only, so any "gutter equals 16dp" figure is **[NV]**.
And M3 **no longer publishes a column count per breakpoint** as a specification: the old
`applying-layout/window-size-classes` page is gone and now redirects to breakpoints, and the only column
numbers left are figure captions. **[O, negative]** The familiar 4 / 12 / 12 table cannot be cited today.

M3 does publish a line-length rule: "keep text between **40 to 60 characters per line**" across all
breakpoints. **[O]**

### 5.2 The spacing system

The system is an **8dp scale**, stated as "space100 = 8dp", with smaller nested units at 0.25x, 0.5x, 0.75x
and 1.25x. Eighteen steps, read from the measurement token file: **[O]**
`https://m3.material.io/styles/spacing`

0, 2, 4, 6, **8**, 10, 12, 14, **16**, 20, **24**, **32**, 36, 40, **48**, 56, 64, 72 dp.

A caveat that must be recorded rather than glossed: the page's own availability table marks these tokens
**Unavailable** for Web and Android Views, and says "The spacing system tokens are only used on Jetpack
Compose". **[O]** So we are taking the published *scale*, which is a design system, and not claiming a token
contract that Material does not offer the web.

### 5.3 The type scale

Thirty styles, fifteen baseline and fifteen emphasized, in five roles. The baseline set, in the same context
the Typography page itself renders: **[O]** `https://m3.material.io/styles/typography`

| role | size | line height | weight | tracking |
|---|---|---|---|---|
| Display Large / Medium / Small | 57 / 45 / 36 | 64 / 52 / 44 | 400 | -0.25 / 0 / 0 |
| Headline Large / Medium / Small | 32 / 28 / 24 | 40 / 36 / 32 | 400 | 0 |
| Title Large / Medium / Small | 22 / 16 / 14 | 28 / 24 / 20 | 400 / 500 / 500 | 0 / 0.15 / 0.1 |
| Body Large / Medium / Small | 16 / 14 / 12 | 24 / 20 / 16 | 400 | 0.5 / 0.25 / 0.4 |
| Label Large / Medium / Small | 14 / 12 / 11 | 20 / 16 / 16 | 500 | 0.1 / 0.5 / 0.5 |

The emphasized set keeps every size and line height and changes only the weight. Line-height guidance:
about **1.2x** the size for title, headline and display, around **1.5x** for body and label. **[O]**

### 5.4 Touch targets, agreeing with web.dev

**[O]** `https://m3.material.io/foundations/designing`

- Touch targets "at least **48 x 48dp**", about 9mm, with a recommended physical range of 7 to 10mm.
- Pointer targets, for a mouse or stylus, minimum **44 x 44dp**.
- "targets separated by **8dp** of space or more".
- The worked examples are exactly our case: a 24dp icon inside a 48dp target, and a 36dp-high button with a
  48dp target.
- The Density sections put it in our units: "The default target size should be at least **48x48 CSS
  pixels**", and keep it there "even if the visual element, such as an icon, is smaller". **[O]**

M3 also notes on the same page that "iOS recommends 44 x 44dp targets", which is the conflict from 1.1 seen
from the other side. Two systems, one number that satisfies both: 48.

### 5.5 Shape and elevation

Corner radius, ten steps: **0, 4, 8, 12, 16, 20, 28, 32, 48** dp and **full**. **[O]**
`https://m3.material.io/styles/shape`

Elevation, six levels: **0, 1, 3, 6, 8, 12** dp. Levels 0 to 3 are resting states; 4 and 5 are reserved for
interaction such as hover and drag. The tokens carry no shadow and no colour: each platform decides. **[O]**
`https://m3.material.io/styles/elevation`

### 5.6 Colour, and the pairing rule that matters for a colourful theme

**[O]** `https://m3.material.io/styles/color/roles` and `.../color/system`

- Twenty six standard roles in six groups. "The color system is built on accessible color pairings. These
  color pairs provide an accessible minimum **3:1** contrast."
- An "on" role is "for text or icons on top of its paired parent color". Container roles are fills and
  "should not be used for text or icons".
- The rule that protects a saturated palette: "apply colors only in the intended pairs or layering orders",
  because improper combinations "may break contrast necessary for visual accessibility".
- Tonal palettes run tone **0 to 100**. Worked examples: tones 50 and 98 give 3:1, tones **30 and 98 give
  7:1**. Three contrast levels exist, standard, medium (minimum 3:1) and high (7:1).
- Text contrast, stated plainly: "Material aims for two main text contrast levels: 3:1 for large text, 4.5:1
  for small text", with on-surface as the default text colour. **[O]**
  `https://m3.material.io/styles/typography`

**This is the mechanism the funder's colourful direction needs.** A saturated world stays legible not by
being toned down but by pairing every surface with a foreground colour chosen against it. That is a system,
and it is the one both published systems use.

## 6. WCAG 2.2

`w3.org` refuses a plain fetch behind Cloudflare even with a full browser header set; fetching through a
different client works. The normative glossary could not be read in place, so the definitions below come from
the Key Terms sections of the Understanding pages, which quote the same glossary. Still w3.org, still **[O]**,
and the distinction is kept where it matters.

### 6.1 Contrast

- **1.4.3 Contrast (Minimum), AA**: at least **4.5:1** for normal text, **3:1** for large-scale text. **[O]**
  `https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum`
- Large scale is defined as "at least 18 point or 14 point bold". The Intent prose adds that these are
  "equivalent to approximately **18.5px and 24px**". That px figure is in the prose, not in the normative
  glossary, and is cited as such. **[O]**
- Values "should not be rounded (e.g., 4.499:1 would not meet the 4.5:1 threshold)". **[O]**
- **1.4.6 Contrast (Enhanced), AAA**: **7:1** normal, **4.5:1** large. **[O]**
- **1.4.11 Non-text Contrast, AA**: **3:1** for what is required to identify a user interface component and
  its state, and for parts of graphics required to understand the content. **[O]**

### 6.2 Target size, and why 48 is not overkill

- **2.5.8 Target Size (Minimum), AA, new in WCAG 2.2**: at least **24 by 24 CSS pixels**, with five
  exceptions. The first is the one worth knowing: an undersized target passes if a **24 CSS pixel diameter
  circle** centred on it does not intersect another target's circle. So the legal floor is really about size
  **or** spacing. **[O]** `https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum`
- **2.5.5 Target Size (Enhanced), AAA**: at least **44 by 44 CSS pixels**. **[O]**

Our 48 clears the AAA criterion, not merely the AA one. That is the answer to "is 48 overkill": it is the
number at which the two design systems and the strictest accessibility level all agree.

### 6.3 Text spacing and reflow, which decide whether a layout survives a real person

- **1.4.12 Text Spacing, AA**: content must survive the reader setting line height to **1.5x** the font
  size, paragraph spacing to **2x**, letter spacing to **0.12x** and word spacing to **0.16x**, with no loss
  of content or function. **[O]** `https://www.w3.org/WAI/WCAG22/Understanding/text-spacing`
- **1.4.10 Reflow, AA**: usable with no two-dimensional scrolling at a width equivalent to **320 CSS
  pixels** and a height equivalent to **256 CSS pixels**, which is a 1280 by 1024 viewport at 400 % zoom.
  **[O]** `https://www.w3.org/WAI/WCAG22/Understanding/reflow`

Reflow is the criterion that makes our own no-horizontal-scroll test a legal requirement rather than a
preference, and 320 is narrower than any phone we test: it is the real floor.

### 6.4 What is new in 2.2

Nine criteria. Of the ones above, only **2.5.8 Target Size (Minimum), AA** is new in 2.2. Reflow, Non-text
Contrast, Text Spacing and Target Size (Enhanced) came in 2.1; the two contrast criteria are from 2.0. Also
in 2.2: 4.1.1 Parsing was removed as obsolete. **[O]**
`https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/`

Three others in that list touch us directly and are recorded for the pass that follows: **3.2.6 Consistent
Help (A)**, **3.3.7 Redundant Entry (A)** and **3.3.8 Accessible Authentication (Minimum) (AA)**. A product
whose account is a passkey and whose journeys ask for a Duolingo name has something to answer on all three.

## 7. Where the sources disagree, and what Viky does

| question | the answers | what we take, and why |
|---|---|---|
| smallest tap target | web.dev 48 dp, M3 48 dp, Apple 44 pt, WCAG AAA 44 px, WCAG AA 24 px, NN/g 1 cm | **48**. The largest, and the only one that satisfies every source at once |
| spacing between targets | web.dev 8 px, M3 8 dp, Apple 12 pt bezelled or 24 pt not | **12** between stacked controls, which also satisfies Apple's bezelled case |
| page margin on a phone | M3 16 dp; Apple no longer publishes one | **16**, cited to M3, because Apple deleted its tables on 9 Sep 2026 |
| longest line of prose | M3 40 to 60 characters, web.dev 45 to 75 with 66 ideal, NN/g 50 to 75 | **60ch**, the widest value inside all three ranges |
| body text size | Apple 17 pt default and 11 pt floor, M3 16, NN/g 14 to 16 | **16 px**, which is the browser default and inside every range |
| contrast for text | WCAG 4.5:1 normal and 3:1 large, Apple the same, M3 the same | **4.5:1 for every size**. We do not use the large-text relaxation: our largest text is money |

## 8. What this research did not settle

- No source publishes a maximum width for a single-column app on a desktop. Ours is chosen from the prose
  limit instead: the app column is narrower than 60 characters, so prose can never exceed the limit. **[NV]**
  as a sourced number, and stated as a derivation.
- What `env(safe-area-inset-*)` resolves to without `viewport-fit=cover` is documented nowhere in the two
  source sets. We always pass a fallback. **[NV]**
- Whether `svh` or `dvh` is preferred: web.dev describes, never recommends. Ours is an inference. **[NV]**
- Apple's own mapping of its accessibility settings to CSS media queries does not exist: the guidelines never
  mention the web. **[O, negative]** Our use of `prefers-reduced-motion` and `prefers-color-scheme` is an
  inference from the substance of the guidance, which is itself official.
- NN/g publishes no contrast ratio anywhere: it defers to WCAG. Attributing 4.5:1 to NN/g would be wrong.
  **[O, negative]**
