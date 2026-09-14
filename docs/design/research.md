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
| 44 px tap floor, invented as "platform guidance" | it is real, and it is Apple's Buttons page; Apple's Accessibility page now says 28 pt, and WCAG 2.2 says 24 px | see the conflict in 1.1 |
| no spacing rule between targets | Apple publishes 12 pt and 24 pt, depending on whether the control has a bezel | Apple |
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

**What Viky takes**: 44 px as the floor for anything a person taps. It is the stricter of the two Apple
framings, it is what the Buttons page still requires of a button, and it is comfortably above WCAG 2.2's
24x24 (see 3.4). Our browser test already asserted 44 while citing "platform guidance" without naming it;
the number was right and the citation was not.

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

## 3. WCAG 2.2, web.dev and Nielsen Norman Group

To be written from the second and third research passes.
