"use client";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { CHOICE_GROUPS, chooserSections, conditionById, groupMembers, liveConditions, type Condition, type ConditionFamily } from "@/src/conditions";
import { conditionAnswered, durationBounds, unanswered, type GiftDraft, type Unanswered } from "@/src/gift-draft";
import { certificateById, cadenceOf, milestoneById } from "@/src/milestone-conditions";
import { loadOfferedConditions, readStanding } from "@/src/client/milestone";
import { checkSourceName } from "@/src/client/gift";
import { searchCertifications, type CertificationFound } from "@/src/client/certificate-gift";
import { ApiError } from "@/src/client/api";
import { suggestedTarget } from "@/src/milestone-terms";
import { FUND, MILESTONE_FUND as M, OFFER as W } from "@/src/sentences";
import { CARD_LABEL, CHOICE, HELP, INLINE_BUTTON, META, PRIMARY_BUTTON, SECONDARY_BUTTON, TILE } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { FamilyArt } from "../FamilyArt";
import { Nature } from "../Nature";
import { Field } from "../Field";
import { Sheet } from "../Sheet";
import { GradeTarget } from "./GradeTarget";
import { UniversityChooser } from "./UniversityChooser";
import { MarathonChooser } from "./MarathonChooser";
import { WcaChooser } from "./WcaChooser";
import { chosenUniversityTitle } from "@/src/university-choice";
import { suggestedGrade } from "@/src/university-shown";

/**
 * The will case: what they will do, and everything that condition itself asks (the vision of 19 Sep 2026, section 6).
 *
 * One sheet, two faces. The first is the catalogue, a list up to five conditions and, from six, four tiles, one per
 * family, each opening that family's list (D224: the founder, 24 Sep 2026, on a list of twenty-four lines; Hick's
 * law counts the options per group, and showing four then one family is the progressive disclosure NN/g describes).
 * It offers only what a gift can be made on today. The second is the condition's own questions, which are few and of
 * one kind: who is read, in what cadence, and what they reach. They stay in the same sheet because they are one
 * thought, and the old journey made three screens of them.
 *
 * Every word about a source comes from the register, and so does every refusal: this file knows that a name can be
 * refused, never what to say about it.
 */
/** What the list calls the whole profile: an id no course can have, so it never collides with a real one. */
const WHOLE_PROFILE = "whole-profile";

/** Where each missing answer is asked on the questions' face, so Done can take the person to it. */
const SPOTS_OF: Readonly<Record<Unanswered, string | null>> = {
  condition: null,
  name: "#source-name, #person-name",
  cadence: 'input[name="cadence"]',
  standing: "[data-reading]",
  target: "#gift-target, #certificate-target",
  course: '#certificate-course, input[name="course"], input[name="certification"], #certificate-search',
  scale: 'input[name="scale"], select[name="scale"]',
};

export function WillSheet({
  openAt,
  draft,
  onChange,
  onClose,
}: Readonly<{
  /**
   * Shut, or open on one of its two faces: one value, because the two used to be two (D150). Whether the sheet is
   * open and which face it opens on have to reach this component in the same render, and as two props they did not
   * always: a click that lands while the page is still being hydrated is replayed by React, and the two changes
   * were then applied one after the other. The sheet opened on the face of the last time and kept it, so the
   * catalogue's nineteen conditions stood where that condition's own questions belong.
   */
  openAt: "list" | "questions" | null;
  draft: GiftDraft;
  onChange: (draft: GiftDraft) => void;
  onClose: () => void;
}>) {
  const open = openAt !== null;
  const { address } = useAccount();
  const [preview, setPreview] = useState<readonly string[]>([]);
  /**
   * Which face the sheet shows, and it opens on the catalogue every time (the founder, 20 Sep 2026): the card's
   * line is "what they will do", and the first question inside it is which one. Choosing opens that condition's own
   * questions, which is the second of the two sheets the card keeps. Closing forgets the face, so the next opening
   * starts at the catalogue again rather than at whatever was last pressed.
   */
  const [askedFor, setAskedFor] = useState<"list" | "questions" | null>(openAt);
  /**
   * Which family's list the catalogue shows (D224), or the four tiles when none is chosen (D233: every opening, and
   * every way back, lands on the four; the founder's decision, where D224 had opened on the chosen condition's family).
   */
  const [family, setFamily] = useState<ConditionFamily | null>(null);
  /**
   * The card says which face to open on (D136): the catalogue from the condition line, this condition's own questions
   * from the detail line under it. Before that, the questions could only be reached by pressing the chosen condition
   * again inside the catalogue, which nobody found. Read while rendering rather than written from an effect, which is
   * what React asks for a value derived from props: an effect writing state here renders the sheet twice on every
   * opening, and the first of the two shows the wrong face.
   */
  /** Done was pressed with something still to answer: the sheet then says what, and stays (the founder, 28 Sep 2026). */
  const [pressedDone, setPressedDone] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    // Only the opening decides which face to show. Reading it again while the sheet is open moved somebody from the
    // catalogue to the questions under their hand, the moment the card's own draft arrived from the device. A sheet
    // that is built already open is decided by the same value, above, rather than left on the catalogue.
    if (open) {
      setAskedFor(openAt);
      setFamily(null);
      setPressedDone(false);
    }
  }
  const choosing = askedFor === null || askedFor === "list";
  const [nameCheck, setNameCheck] = useState<{ busy: boolean; refusal?: string; checked?: string }>({ busy: false });
  const [courses, setCourses] = useState<{ forName: string; list: readonly { id: string; title: string; xp: number }[] } | null>(null);
  const [reading, setReading] = useState<{ busy: boolean; nameRefusal?: string; cadenceRefusal?: string }>({ busy: false });
  /** The words typed to find a certification, and what the source knows by them (Credly, 20 Sep 2026). */
  const [search, setSearch] = useState<{ words: string; found: readonly CertificationFound[]; busy: boolean; nothing: boolean }>({ words: "", found: [], busy: false, nothing: false });

  // What this account may offer: the live conditions, plus the lines being built the founder lists anyway (D311),
  // the same for everybody. Nothing else is ever listed here.
  useEffect(() => {
    if (!open) return;
    let live = true;
    loadOfferedConditions()
      .then((answer) => {
        if (live) setPreview(answer.preview);
      })
      .catch(() => {
        if (live) setPreview([]);
      });
    return () => {
      live = false;
    };
  }, [address, open]);

  const searchPath = certificateById(draft.conditionId)?.course?.search?.path;
  useEffect(() => {
    if (!open || !searchPath) return;
    const words = search.words.trim();
    if (words.length < 2) return;
    let live = true;
    const timer = setTimeout(() => {
      setSearch((was) => ({ ...was, busy: true }));
      searchCertifications(searchPath, words)
        .then((found) => {
          if (live) setSearch((was) => ({ ...was, found, busy: false, nothing: found.length === 0 }));
        })
        .catch(() => {
          if (live) setSearch((was) => ({ ...was, found: [], busy: false, nothing: true }));
        });
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, searchPath, search.words]);

  const offered: readonly Condition[] = [...liveConditions(), ...preview.map((id) => conditionById(id)).filter((c): c is Condition => Boolean(c) && !c!.live)];
  const sections = chooserSections(offered);
  const condition = conditionById(draft.conditionId);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const nameLink = condition?.link.kind === "username" ? condition.link : undefined;
  const cadence = milestone && draft.cadence ? cadenceOf(milestone, draft.cadence) : undefined;
  const ready = conditionAnswered(draft);
  const shownSection = sections?.find((section) => section.family === family);
  /**
   * The lines a list draws (the founder, 29 Sep 2026): a group of conditions of one service once, under the group's
   * name, pressed whenever the one on the card is any of them; every other condition as itself.
   */
  const lines = (among: readonly Condition[]) =>
    among.flatMap((option) => {
      if (!option.group) return [{ option, name: option.name, chosen: draft.conditionId === option.id }];
      if (among.find((other) => other.group?.id === option.group!.id) !== option) return [];
      return [{ option, name: CHOICE_GROUPS[option.group.id].name, chosen: condition?.group?.id === option.group.id }];
    });

  const choose = (id: string) => {
    // The one already chosen is not a new choice: pressing it again is a way into its own questions, and nothing
    // it has been told is thrown away. Choosing another one drops all of it, because a name on one source means
    // nothing on another. A group's line is the one already chosen when the card holds any of its conditions.
    const pressed = conditionById(id);
    if (id === draft.conditionId || (pressed?.group && pressed.group.id === condition?.group?.id)) {
      setAskedFor("questions");
      return;
    }
    const picked = conditionById(id);
    const bounds = durationBounds(id);
    const suggested = certificateById(id)?.target.suggested ?? picked?.target?.suggested;
    // A climb with one thing to climb is not a question. The puzzle record is one number on one page, so it is
    // answered here and the sheet asks the name, the target and the length, which is everything that is left.
    const only = milestoneById(id)?.cadences;
    onChange({
      ...draft,
      conditionId: id,
      // Everything the last condition answered is dropped: a name on one source means nothing on another.
      subject: "",
      course: undefined,
      courseTitle: undefined,
      cadence: only?.length === 1 ? only[0].id : undefined,
      standing: undefined,
      standingReadAt: undefined,
      target: suggested !== undefined ? String(suggested) : "",
      // The length the register suggests for this condition, pressed: the chips come from the same bounds, and the
      // one marked is the one the code marks (the founder, 20 Sep 2026). A person changes it on the card in one press.
      days: String(bounds.suggested),
    });
    setNameCheck({ busy: false });
    setCourses(null);
    setReading({ busy: false });
    setFamily(null);
    setAskedFor("questions");
  };

  /**
   * Another condition of the same group (the founder, 29 Sep 2026): what they will show changes, and what the group
   * shares stays, the university, its country and the length; the target starts again at the new one's own.
   */
  const switchMode = (id: string) => {
    if (id === draft.conditionId) return;
    const next = certificateById(id);
    onChange({
      ...draft,
      conditionId: id,
      target: next?.portal?.scaled ? suggestedGrade(draft.scaleFixed ? draft.scale : undefined) : String(next?.target.suggested ?? ""),
      scale: draft.scaleFixed ? draft.scale : undefined,
      scaleFixed: draft.scaleFixed,
    });
  };

  /** The daily source: is there a public profile by that name, and which courses does it carry (U1). */
  const checkName = async () => {
    if (!nameLink?.check || draft.subject.trim().length === 0) return;
    setNameCheck({ busy: true });
    try {
      const found = await checkSourceName(nameLink.check.path, draft.subject.trim());
      const read = found.courses ?? [];
      // The course the source says is current comes first, and nothing is chosen for the funder: the default is the
      // whole profile, which is a real answer and the one that cannot be wrong (D136).
      const current = read.find((course) => course.id === found.currentCourseId);
      const list = current ? [current, ...read.filter((course) => course.id !== current.id)] : read;
      onChange({ ...draft, subject: found.username, course: undefined, courseTitle: undefined });
      setCourses(list.length > 0 ? { forName: found.username.toLowerCase(), list } : null);
      setNameCheck({ busy: false, checked: found.username });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      setNameCheck({
        busy: false,
        refusal:
          code === "NO_SUCH_PROFILE"
            ? nameLink.check.refusals.notFound
            : code === "INVALID_USERNAME"
              ? nameLink.check.refusals.shape
              : nameLink.check.refusals.unavailable,
      });
    }
  };

  /** A climb: where that account stands today, read before the funder chooses what to reach (C2, D44). */
  const readRating = async () => {
    if (!milestone) return;
    const name = draft.subject.trim();
    if (!milestone.validName(name)) return setReading({ busy: false, nameRefusal: milestone.words.refusals.nameShape });
    // A climb with one thing to climb answers itself, here as well as where a condition is chosen: a draft written
    // before this condition had its own entry carries no cadence, and there is only one it could mean.
    const climb = draft.cadence ?? (milestone.cadences.length === 1 ? milestone.cadences[0].id : undefined);
    if (!climb) return setReading({ busy: false, cadenceRefusal: milestone.words.refusals.noCadence });
    setReading({ busy: true });
    try {
      const found = await readStanding(milestone.standingPath, name, climb);
      if (!found.settled && milestone.condition.live) {
        onChange({ ...draft, standing: undefined, standingReadAt: undefined });
        return setReading({ busy: false, cadenceRefusal: milestone.words.refusals.settling });
      }
      onChange({
        ...draft,
        subject: found.username,
        standing: found.rating,
        standingReadAt: found.readAt,
        target: String(suggestedTarget(milestone.shape, found.rating)),
      });
      setReading({ busy: false });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      const refusals = milestone.words.refusals;
      if (code === "NO_RATING") return setReading({ busy: false, cadenceRefusal: refusals.noRating(cadence?.label ?? draft.cadence ?? "") });
      setReading({
        busy: false,
        nameRefusal:
          code === "NO_SUCH_PROFILE"
            ? refusals.notFound
            : code === "ACCOUNT_CLOSED"
              ? refusals.closed
              : code === "INVALID_USERNAME"
                ? refusals.nameShape
                : refusals.unavailable,
      });
    }
  };

  const title = choosing || !condition ? W.sheets.will : (condition.detailTitle ?? certificate?.words.detailQuestion ?? condition.name);

  /**
   * Done closes the sheet once the condition is answered. Before that it stays, says the first thing missing and takes
   * the person to it, where a grey button had said nothing (Smashing Magazine, "Usability Pitfalls of Disabled
   * Buttons", 2021: a disabled button does not say what is wrong).
   */
  const missing: Unanswered | null = choosing ? null : unanswered(draft);
  const done = () => {
    if (!missing) {
      setPressedDone(false);
      return onClose();
    }
    setPressedDone(true);
    const where = SPOTS_OF[missing];
    const field = where ? document.querySelector<HTMLElement>(where) : null;
    field?.scrollIntoView({ block: "center" });
    field?.focus({ preventScroll: true });
  };

  // The reading asks itself once a valid name and a rating are known, a moment after the last keystroke, and once per
  // name and rating: a refusal is shown rather than asked again in a loop.
  const tried = useRef("");
  const readingFor = milestone && draft.standing === undefined ? `${draft.subject.trim().toLowerCase()}|${draft.cadence ?? (milestone.cadences.length === 1 ? milestone.cadences[0].id : "")}` : "";
  useEffect(() => {
    if (!open || !milestone || !readingFor || readingFor === tried.current) return;
    const [name, climb] = readingFor.split("|");
    if (!climb || !milestone.validName(name)) return;
    const timer = window.setTimeout(() => {
      tried.current = readingFor;
      void readRating();
    }, 600);
    return () => window.clearTimeout(timer);
    // readRating reads the draft of the render that scheduled it, which is the one this key was taken from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, readingFor]);

  return (
    <Sheet
      open={open}
      title={title}
      view={choosing || !condition ? (family ?? "families") : "questions"}
      onClose={() => {
        setAskedFor(null);
        onClose();
      }}
      footer={
        <div className="flex flex-col gap-[var(--space-xs)]">
          {/* What is still missing, said once Done has been pressed, instead of a grey button with no word. */}
          {pressedDone && missing ? (
            <p role="status" className={`${HELP} text-center text-[var(--on-surface)]`}>
              {W.unanswered[missing]}
            </p>
          ) : null}
          <button type="button" className={PRIMARY_BUTTON} disabled={choosing && !condition} onClick={done}>
            {W.done}
          </button>
        </div>
      }
    >
      {choosing || !condition ? (
        sections ? (
          shownSection ? (
            <>
              {/* The way back to the four, as an arrow (D304, the founder, 28 Sep 2026), named for a reader of the screen. */}
              <button type="button" aria-label={W.families} className={`${INLINE_BUTTON} self-start`} onClick={() => setFamily(null)}>
                <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24">
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {/* Each condition is a button that goes on to its questions, with the card's own chevron (D304): a radio
                  said "pick one and stay", and pressing one went on anyway. The one on the card is marked. */}
              <div role="group" aria-label={shownSection.title} className="flex flex-col gap-[var(--space-sm)]">
                <p className={CARD_LABEL}>{shownSection.title}</p>
                {lines(shownSection.conditions).map(({ option, name, chosen }) => {
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-current={chosen ? "true" : undefined}
                      onClick={() => choose(option.id)}
                      className={`${INLINE_BUTTON} w-full justify-between! text-left ${chosen ? "bg-[var(--chosen)]!" : ""}`}
                    >
                      <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                        <span className={`${CHOICE} break-words`}>{name}</span>
                        <Nature nature={option.nature} />
                        {/* Every line the same height, chosen or not (the founder, 28 Sep 2026): what it proves is said on
                            its questions, where the detail is decided, not in the button, which grew when pressed. */}
                        {/* A line listed while it is being built says so in the meta voice, beside its nature (D311). */}
                        {option.live ? null : <span className={`block ${META}`}>{M.building}</span>}
                      </span>
                      <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24" className="shrink-0 text-[var(--on-surface-muted)]">
                        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* The four families, two by two: a picture, a name, a count. Each is a button and looks like one (D233):
               the outline and the relief every key carries; nothing is marked, because pressing one is the choice. */
            <div className="grid grid-cols-2 gap-[var(--space-md)]">
              {sections.map((section) => (
                <button key={section.family} type="button" onClick={() => setFamily(section.family)} className={TILE}>
                  <FamilyArt family={section.family} />
                  <span className={CHOICE}>{section.title}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          <ChoiceList
            name="condition"
            shape="lines"
            legend={W.sheets.will}
            legendHidden
            value={lines(offered).find((line) => line.chosen)?.option.id ?? null}
            onChange={choose}
            options={lines(offered).map(({ option, name }) => ({
              value: option.id,
              label: name,
              tag: <Nature nature={option.nature} />,
                help: option.live ? option.help : `${option.help} ${M.building}.`,
            }))}
          />
        )
      ) : (
        <>
          {/* The way back from a condition's questions, as an arrow like the family's (the founder, 28 Sep 2026, over
              D233): to the list it was chosen in, the screen before, not to the four families. */}
          <button
            type="button"
            aria-label={W.change(W.slots.will.label)}
            className={`${INLINE_BUTTON} self-start`}
            onClick={() => {
              setFamily(condition.family);
              setAskedFor("list");
            }}
          >
            <svg aria-hidden focusable="false" width="20" height="20" viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* A group's own question first (the founder, 29 Sep 2026): what they will show, as "Which rating?" asks a
              cadence. The one pressed says what it proves, so the help is not printed twice. */}
          {condition.group ? (
            <ChoiceList
              name="group-mode"
              shape="lines"
              legend={CHOICE_GROUPS[condition.group.id].question}
              value={condition.id}
              onChange={switchMode}
              options={groupMembers(condition.group.id, offered).map((member) => ({ value: member.id, label: member.group?.mode ?? member.name, help: member.help }))}
            />
          ) : (
            /* What it proves, under the questions' title, where the detail is decided (the founder, 28 Sep 2026). */
            <p data-condition-help="" className={HELP}>
              {condition.help}
            </p>
          )}

          {/* A climb: the account, the cadence, today's reading, then what they reach. */}
          {milestone ? (
            <>
              <Field
                id="source-name"
                label={milestone.condition.link.kind === "username" ? milestone.condition.link.label : milestone.words.targetLabel}
                help={milestone.condition.link.kind === "username" ? milestone.condition.link.help : undefined}
                value={draft.subject}
                onChange={(value) => {
                  // The reading belongs to a name: it goes only when the name itself changes, not with a space or a
                  // capital (the founder, 28 Sep 2026: one keystroke in the box silently undid the reading).
                  if (value.trim().toLowerCase() === draft.subject.trim().toLowerCase()) return onChange({ ...draft, subject: value });
                  setReading({ busy: false });
                  onChange({ ...draft, subject: value, standing: undefined, standingReadAt: undefined });
                }}
                refusal={reading.nameRefusal}
                autoComplete="off"
                spellCheck={false}
              />
              {milestone.cadences.length > 1 ? (
                <ChoiceList
                  name="cadence"
                  legend={milestone.words.cadenceQuestion}
                  value={draft.cadence ?? null}
                  onChange={(value) => {
                    setReading({ busy: false });
                    onChange({ ...draft, cadence: value, standing: undefined, standingReadAt: undefined });
                  }}
                  options={milestone.cadences.map((option) => ({ value: option.id, label: option.label, help: option.help }))}
                />
              ) : null}
              {reading.cadenceRefusal ? <p className="font-semibold">{reading.cadenceRefusal}</p> : null}
              {draft.standing === undefined ? (
                /* Read as soon as the name and the rating are known, with nothing to press (the founder, 28 Sep 2026:
                   a reading nobody remembered to ask for left every field filled and Done grey). The button stays for
                   a reading that failed, to try again. */
                <div data-reading="" className="flex flex-col gap-[var(--space-xs)]">
                  {reading.busy ? <p className={HELP} role="status">{milestone.words.reading}…</p> : null}
                  {!reading.busy && (reading.nameRefusal || reading.cadenceRefusal) ? (
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => void readRating()}>
                      {milestone.words.read}
                    </button>
                  ) : null}
                </div>
              ) : (
                <Field
                  id="gift-target"
                  label={milestone.words.targetLabel}
                  help={`${milestone.words.today(draft.standing, cadence?.label ?? "")} ${M.detail.smallest(suggestedTarget(milestone.shape, draft.standing))}`}
                  value={draft.target}
                  onChange={(value) => onChange({ ...draft, target: value })}
                  refusal={ready || draft.target.trim().length === 0 ? undefined : milestone.words.refusals.targetShape}
                  inputMode="numeric"
                />
              )}
            </>
          ) : null}

          {/*
            A certificate: the name it will carry, and then the one thing that tells this gift from another of the
            same kind. For a test that is the score. For a course certificate there is nothing to score, so it is the
            course, named by pasting its ordinary link: the certificate page carries the same word (C3).
          */}
          {certificate ? (
            <>
              {/* The name, unless the source prints none for the funder to match (a proof shown by the recipient
                  themselves, D233: this gate had shut the whole face on those, and the founder found it empty). */}
              {certificate.asksName !== false ? (
                <Field
                  id="person-name"
                  label={certificate.words.nameLabel}
                  help={certificate.words.nameHelp}
                  value={draft.subject}
                  onChange={(value) => onChange({ ...draft, subject: value })}
                  refusal={draft.subject.trim().length === 0 || certificate.validName(draft.subject) ? undefined : certificate.words.refusals.nameShape}
                  autoComplete="off"
                />
              ) : null}
              {certificate.course?.search?.competitions ? (
                /* The WCA's coming competitions, all countries by date, then the event (the founder, 27 Sep 2026). */
                <WcaChooser
                  open={open}
                  draft={draft}
                  named={certificate.course.named}
                  onChoose={(courseId, title) => onChange({ ...draft, course: courseId, courseTitle: title, target: String(certificate.target.suggested) })}
                />
              ) : certificate.course?.search?.races ? (
                /* The race, asked as a list from the register (D273): the marathon's own chooser. */
                <MarathonChooser
                  open={open}
                  draft={draft}
                  named={certificate.course.named}
                  onChoose={(courseId, title) => onChange({ ...draft, course: courseId, courseTitle: title, target: String(certificate.target.suggested) })}
                />
              ) : certificate.course?.search?.listed ? (
                /* The university: the person's country listed, the whole list searched (the founder, 29 Sep 2026). */
                <>
                  <UniversityChooser
                    open={open}
                    draft={draft}
                    onChoose={(one) =>
                      onChange({
                        ...draft,
                        course: one.pair,
                        courseTitle: chosenUniversityTitle(one),
                        // A grade starts on the university's own scale when it is known: 12 read on a scale out of 4 was
                        // refused the moment it was set (the audit of 29 Sep 2026).
                        target: certificate.portal?.scaled ? suggestedGrade(one.scale) : String(certificate.target.suggested),
                        // The scale a grade is typed on: the university's own when pinned, the funder's choice otherwise.
                        scale: one.scale ?? undefined,
                        scaleFixed: Boolean(one.scale),
                      })
                    }
                  />
                  {certificate.portal?.scaled && draft.course ? (
                    <GradeTarget draft={draft} label={certificate.target.label} help={certificate.target.help} refusal={certificate.words.refusals.targetShape} onChange={onChange} />
                  ) : null}
                </>
              ) : certificate.course?.search ? (
                /* A source whose things are found rather than pasted: the funder types a word or two, reads each
                   answer with who awards it, and chooses. What the terms carry is the answer's own pair of ids. */
                <>
                  <Field
                    id="certificate-search"
                    label={certificate.course.label}
                    help={certificate.course.help}
                    value={search.words}
                    onChange={(value) => setSearch((was) => ({ ...was, words: value, nothing: false }))}
                    refusal={search.nothing && !search.busy ? certificate.course.search.nothing : undefined}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {/* Under the field, where the eye is: what was chosen, in its own words; or, before choosing, how many
                      answers there are, because on a phone the list runs past the sheet's edge and a person could take
                      the first two for all of them (ui review, 20 Sep 2026). */}
                  {search.busy ? (
                    <p className={HELP}>{M.detail.searching}</p>
                  ) : draft.course && draft.courseTitle ? (
                    <p className="font-medium">{certificate.course.named(draft.courseTitle)}</p>
                  ) : search.found.length > 0 ? (
                    <p className={HELP}>{M.detail.found(search.found.length)}</p>
                  ) : null}
                  {search.found.length > 0 ? (
                    <ChoiceList
                      name="certification"
                      legend={certificate.course.label}
                      legendHidden
                      shape="lines"
                      value={draft.course ?? null}
                      onChange={(value) => {
                        const one = search.found.find((found) => found.pair === value);
                        onChange({ ...draft, course: value, courseTitle: one ? `${one.title}, ${one.issuer}` : value, target: String(certificate.target.suggested) });
                      }}
                      /* The issuer on every line, not only under the chosen one: it is what tells four certifications of the
                         same name apart, and a person has to read it before choosing, not after. */
                      options={search.found.map((one) => ({ value: one.pair, label: `${one.title}, ${one.issuer}` }))}
                    />
                  ) : null}
                </>
              ) : certificate.course ? (
                <Field
                  id="certificate-course"
                  label={certificate.course.label}
                  help={certificate.course.help}
                  value={draft.courseTitle ?? ""}
                  onChange={(value) => {
                    const slug = certificate.course?.slugOf(value);
                    // The course the terms are signed with is the word the page carries, never what was pasted around it.
                    onChange({ ...draft, courseTitle: value, course: slug, target: String(certificate.target.suggested) });
                  }}
                  refusal={(draft.courseTitle ?? "").trim().length === 0 || draft.course ? undefined : certificate.course.help}
                  autoComplete="off"
                />
              ) : certificate.target.min !== certificate.target.max ? (
                <Field
                  id="certificate-target"
                  label={certificate.target.label}
                  help={certificate.target.help}
                  value={draft.target}
                  onChange={(value) => onChange({ ...draft, target: value })}
                  refusal={draft.target.trim().length === 0 || ready ? undefined : certificate.words.refusals.targetShape}
                  inputMode="numeric"
                />
              ) : null}
              {/* Said back in full under the box, because a phone cuts the pasted link before the course's own word.
                  A list says its own words on each line, so it needs nothing repeated under it. */}
              {certificate.course && !certificate.course.search && draft.course ? <p className={HELP}>{certificate.course.named(draft.course)}</p> : null}
              {/* A proof the recipient shows themselves: what Viky keeps of it, in the register's words, so the face
                  says what there is to say when there is little to fill in (D233). */}
              {/* The university's chooser folds this under "How this is checked" instead (D247). */}
              {condition.nature === "shown" && !certificate.course?.search?.listed ? <p className={HELP}>{certificate.words.whatIsRead}</p> : null}
            </>
          ) : null}

          {/* A habit: the account, if the funder knows it, the one course that counts, and the bar for a day. */}
          {!milestone && !certificate ? (
            <>
              {nameLink ? (
                <>
                  <Field
                    id="source-name"
                    label={nameLink.label}
                    help={nameLink.help}
                    value={draft.subject}
                    onChange={(value) => {
                      setNameCheck({ busy: false });
                      setCourses(null);
                      onChange({ ...draft, subject: value, course: undefined, courseTitle: undefined });
                    }}
                    onBlur={() => void checkName()}
                    refusal={nameCheck.refusal}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {nameLink.why ? <p className={HELP}>{nameLink.why}</p> : null}
                  {nameCheck.busy ? <p className={HELP}>{FUND.detail.checking}</p> : null}
                </>
              ) : null}
              {condition.course ? (
                courses && courses.list.length > 0 ? (
                  <ChoiceList
                    name="course"
                    legend={condition.course.label}
                    value={draft.course ?? WHOLE_PROFILE}
                    onChange={(value) => {
                      const picked = courses.list.find((course) => course.id === value);
                      onChange(
                        value === WHOLE_PROFILE || !picked
                          ? { ...draft, course: undefined, courseTitle: undefined }
                          : { ...draft, course: picked.id, courseTitle: picked.title },
                      );
                    }}
                    /* The whole profile first, because it is the default and the one that cannot be wrong, then the
                       courses the profile really carries, each with the experience won in it (D136). */
                    options={[
                      { value: WHOLE_PROFILE, label: condition.course.wholeProfile },
                      ...courses.list.map((course) => ({ value: course.id, label: FUND.detail.courseWithXp(course.title, course.xp) })),
                    ]}
                  />
                ) : (
                  <p className={HELP}>{FUND.detail.courseAfterName}</p>
                )
              ) : null}
              {condition.target ? (
                <Field
                  id="gift-target"
                  label={condition.target.label}
                  value={draft.target}
                  onChange={(value) => onChange({ ...draft, target: value })}
                  refusal={draft.target.trim().length === 0 || ready ? undefined : condition.target.tooLow}
                  inputMode="numeric"
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
