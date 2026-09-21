"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { chooserSections, conditionById, liveConditions, type Condition } from "@/src/conditions";
import { conditionAnswered, durationBounds, type GiftDraft } from "@/src/gift-draft";
import { certificateById, cadenceOf, milestoneById } from "@/src/milestone-conditions";
import { loadOfferedConditions, readStanding } from "@/src/client/milestone";
import { checkSourceName } from "@/src/client/gift";
import { searchCertifications, type CertificationFound } from "@/src/client/certificate-gift";
import { ApiError } from "@/src/client/api";
import { smallestTarget } from "@/src/milestone-terms";
import { FUND, MILESTONE_FUND as M, OFFER as W } from "@/src/sentences";
import { HELP, INLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../../components/ui";
import { ChoiceList } from "../ChoiceList";
import { Field } from "../Field";
import { Sheet } from "../Sheet";

/**
 * The will case: what they will do, and everything that condition itself asks (the vision of 19 Sep 2026, section 6).
 *
 * One sheet, two faces. The first is the catalogue, a list up to five conditions and sectioned by family from six
 * (the design audit of 16 Sep, section 3), offering only what a gift can be made on today. The second is the
 * condition's own questions, which are few and of one kind: who is read, in what cadence, and what they reach. They
 * stay in the same sheet because they are one thought, and the old journey made three screens of them.
 *
 * Every word about a source comes from the register, and so does every refusal: this file knows that a name can be
 * refused, never what to say about it.
 */
/** What the list calls the whole profile: an id no course can have, so it never collides with a real one. */
const WHOLE_PROFILE = "whole-profile";

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
   * The card says which face to open on (D136): the catalogue from the condition line, this condition's own questions
   * from the detail line under it. Before that, the questions could only be reached by pressing the chosen condition
   * again inside the catalogue, which nobody found. Read while rendering rather than written from an effect, which is
   * what React asks for a value derived from props: an effect writing state here renders the sheet twice on every
   * opening, and the first of the two shows the wrong face.
   */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    // Only the opening decides which face to show. Reading it again while the sheet is open moved somebody from the
    // catalogue to the questions under their hand, the moment the card's own draft arrived from the device. A sheet
    // that is built already open is decided by the same value, above, rather than left on the catalogue.
    if (open) setAskedFor(openAt);
  }
  const choosing = askedFor === null || askedFor === "list";
  const [nameCheck, setNameCheck] = useState<{ busy: boolean; refusal?: string; checked?: string }>({ busy: false });
  const [courses, setCourses] = useState<{ forName: string; list: readonly { id: string; title: string; xp: number }[] } | null>(null);
  const [reading, setReading] = useState<{ busy: boolean; nameRefusal?: string; cadenceRefusal?: string }>({ busy: false });
  /** The words typed to find a certification, and what the source knows by them (Credly, 20 Sep 2026). */
  const [search, setSearch] = useState<{ words: string; found: readonly CertificationFound[]; busy: boolean; nothing: boolean }>({ words: "", found: [], busy: false, nothing: false });

  // What this account may offer: the live conditions for everybody, plus whatever is wired and not live yet for an
  // account that runs Viky. Nothing else is ever listed here.
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

  const choose = (id: string) => {
    // The one already chosen is not a new choice: pressing it again is a way into its own questions, and nothing
    // it has been told is thrown away. Choosing another one drops all of it, because a name on one source means
    // nothing on another.
    if (id === draft.conditionId) {
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
    setAskedFor("questions");
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
        target: String(smallestTarget(milestone.shape, found.rating)),
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

  return (
    <Sheet
      open={open}
      title={title}
      onClose={() => {
        setAskedFor(null);
        onClose();
      }}
      footer={
        <button type="button" className={PRIMARY_BUTTON} disabled={choosing ? !condition : !ready} onClick={onClose}>
          {W.done}
        </button>
      }
    >
      {choosing || !condition ? (
        sections ? (
          sections.map((section) => (
            <ChoiceList
              key={section.family}
              name="condition"
              shape="lines"
              legend={section.title}
              value={draft.conditionId || null}
              onChange={choose}
              options={section.conditions.map((option) => ({
                value: option.id,
                label: option.name,
                help: option.live ? option.help : `${option.help} ${M.operatorOnly}`,
              }))}
            />
          ))
        ) : (
          <ChoiceList
            name="condition"
            shape="lines"
            legend={W.sheets.will}
            legendHidden
            value={draft.conditionId || null}
            onChange={choose}
            options={offered.map((option) => ({
              value: option.id,
              label: option.name,
              help: option.live ? option.help : `${option.help} ${M.operatorOnly}`,
            }))}
          />
        )
      ) : (
        <>
          <button type="button" className={INLINE_BUTTON} onClick={() => setAskedFor("list")}>
            {W.change(W.slots.will.label)}
          </button>

          {/* A climb: the account, the cadence, today's reading, then what they reach. */}
          {milestone ? (
            <>
              <Field
                id="source-name"
                label={milestone.condition.link.kind === "username" ? milestone.condition.link.label : milestone.words.targetLabel}
                help={milestone.condition.link.kind === "username" ? milestone.condition.link.help : undefined}
                value={draft.subject}
                onChange={(value) => {
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
                <button type="button" className={SECONDARY_BUTTON} disabled={reading.busy} onClick={() => void readRating()}>
                  {reading.busy ? milestone.words.reading : milestone.words.read}
                </button>
              ) : (
                <Field
                  id="gift-target"
                  label={milestone.words.targetLabel}
                  help={`${milestone.words.today(draft.standing, cadence?.label ?? "")} ${M.detail.smallest(smallestTarget(milestone.shape, draft.standing))}`}
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
              <Field
                id="person-name"
                label={certificate.words.nameLabel}
                help={certificate.words.nameHelp}
                value={draft.subject}
                onChange={(value) => onChange({ ...draft, subject: value })}
                refusal={draft.subject.trim().length === 0 || certificate.validName(draft.subject) ? undefined : certificate.words.refusals.nameShape}
                autoComplete="off"
              />
              {certificate.course?.search ? (
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
              ) : (
                <Field
                  id="certificate-target"
                  label={certificate.target.label}
                  help={certificate.target.help}
                  value={draft.target}
                  onChange={(value) => onChange({ ...draft, target: value })}
                  refusal={draft.target.trim().length === 0 || ready ? undefined : certificate.words.refusals.targetShape}
                  inputMode="numeric"
                />
              )}
              {/* Said back in full under the box, because a phone cuts the pasted link before the course's own word.
                  A list says its own words on each line, so it needs nothing repeated under it. */}
              {certificate.course && !certificate.course.search && draft.course ? <p className={HELP}>{certificate.course.named(draft.course)}</p> : null}
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
