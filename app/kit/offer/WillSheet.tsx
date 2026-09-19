"use client";
import { useEffect, useState } from "react";
import { useAccount } from "@/src/account/provider";
import { chooserSections, conditionById, liveConditions, type Condition } from "@/src/conditions";
import { conditionAnswered, durationBounds, type GiftDraft } from "@/src/gift-draft";
import { certificateById, cadenceOf, milestoneById } from "@/src/milestone-conditions";
import { loadOfferedConditions, readStanding } from "@/src/client/milestone";
import { checkSourceName } from "@/src/client/gift";
import { ApiError } from "@/src/client/api";
import { smallestTarget } from "@/src/milestone-terms";
import { FUND, MILESTONE_FUND as M, OFFER as W } from "@/src/sentences";
import { HELP, INLINE_BUTTON, PRIMARY_BUTTON } from "../../components/ui";
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
export function WillSheet({
  open,
  draft,
  onChange,
  onClose,
}: Readonly<{ open: boolean; draft: GiftDraft; onChange: (draft: GiftDraft) => void; onClose: () => void }>) {
  const { address } = useAccount();
  const [preview, setPreview] = useState<readonly string[]>([]);
  /**
   * Which face the sheet shows. Nothing asked: the list while no condition is chosen, its questions once one is.
   * Pressing "Change will" asks for the list, and closing the sheet forgets that, so the next opening follows the
   * card again rather than whatever was last pressed.
   */
  const [askedFor, setAskedFor] = useState<"list" | "questions" | null>(null);
  const choosing = askedFor === null ? draft.conditionId.length === 0 : askedFor === "list";
  const [nameCheck, setNameCheck] = useState<{ busy: boolean; refusal?: string; checked?: string }>({ busy: false });
  const [courses, setCourses] = useState<{ forName: string; list: readonly { id: string; title: string; xp: number }[] } | null>(null);
  const [reading, setReading] = useState<{ busy: boolean; nameRefusal?: string; cadenceRefusal?: string }>({ busy: false });

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

  const offered: readonly Condition[] = [...liveConditions(), ...preview.map((id) => conditionById(id)).filter((c): c is Condition => Boolean(c) && !c!.live)];
  const sections = chooserSections(offered);
  const condition = conditionById(draft.conditionId);
  const milestone = milestoneById(draft.conditionId);
  const certificate = certificateById(draft.conditionId);
  const nameLink = condition?.link.kind === "username" ? condition.link : undefined;
  const cadence = milestone && draft.cadence ? cadenceOf(milestone, draft.cadence) : undefined;
  const ready = conditionAnswered(draft);

  const choose = (id: string) => {
    const picked = conditionById(id);
    const bounds = durationBounds(id);
    const suggested = certificateById(id)?.target.suggested ?? picked?.target?.suggested;
    onChange({
      ...draft,
      conditionId: id,
      // Everything the last condition answered is dropped: a name on one source means nothing on another.
      subject: "",
      course: undefined,
      courseTitle: undefined,
      cadence: undefined,
      standing: undefined,
      standingReadAt: undefined,
      target: suggested !== undefined ? String(suggested) : "",
      // A length already typed is kept when this condition allows it, and dropped when it does not. Nothing is
      // filled in on the person's behalf: the fourth case stays theirs to answer.
      days: draft.days.length > 0 && Number(draft.days) >= bounds.min && Number(draft.days) <= bounds.max ? draft.days : "",
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
      const list = found.courses ?? [];
      const chosen = list.find((course) => course.id === found.currentCourseId) ?? list[0];
      onChange({
        ...draft,
        subject: found.username,
        ...(condition?.course && chosen ? { course: chosen.id, courseTitle: chosen.title } : { course: undefined, courseTitle: undefined }),
      });
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
    if (!draft.cadence) return setReading({ busy: false, cadenceRefusal: milestone.words.refusals.noCadence });
    setReading({ busy: true });
    try {
      const found = await readStanding(milestone.standingPath, name, draft.cadence);
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
        choosing || !condition ? undefined : (
          <button type="button" className={PRIMARY_BUTTON} disabled={!ready} onClick={onClose}>
            {W.done}
          </button>
        )
      }
    >
      {choosing || !condition ? (
        sections ? (
          sections.map((section) => (
            <ChoiceList
              key={section.family}
              name="condition"
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
              {reading.cadenceRefusal ? <p className="font-semibold">{reading.cadenceRefusal}</p> : null}
              {draft.standing === undefined ? (
                <button type="button" className={PRIMARY_BUTTON} disabled={reading.busy} onClick={() => void readRating()}>
                  {reading.busy ? M.detail.reading : M.detail.read}
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

          {/* A certificate: the name it will carry, and the score it must show. Nothing is read until they share it. */}
          {certificate ? (
            <>
              <Field
                id="person-name"
                label={certificate.words.nameLabel}
                help={certificate.words.nameHelp}
                value={draft.subject}
                onChange={(value) => onChange({ ...draft, subject: value })}
                refusal={draft.subject.trim().length === 0 ? undefined : conditionAnswered({ ...draft, target: String(certificate.target.suggested) }) ? undefined : certificate.words.refusals.nameShape}
                autoComplete="off"
              />
              <Field
                id="certificate-target"
                label={certificate.target.label}
                help={certificate.target.help}
                value={draft.target}
                onChange={(value) => onChange({ ...draft, target: value })}
                refusal={draft.target.trim().length === 0 || ready ? undefined : certificate.words.refusals.targetShape}
                inputMode="numeric"
              />
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
              {condition.course && courses && courses.list.length > 0 ? (
                <ChoiceList
                  name="course"
                  legend={condition.course.label}
                  value={draft.course ?? null}
                  onChange={(value) => {
                    const picked = courses.list.find((course) => course.id === value);
                    onChange({ ...draft, course: value, courseTitle: picked?.title ?? "" });
                  }}
                  options={courses.list.map((course) => ({ value: course.id, label: course.title }))}
                />
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
