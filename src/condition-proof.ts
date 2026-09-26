import { CONDITIONS, type Condition } from "./conditions";

/**
 * What each condition actually proves, in the register's own words (U2).
 *
 * It sits beside `src/conditions.ts` rather than inside it because it answers a different question: that file says what
 * a condition is and how it is read, this one says what a reading is worth. Four questions, the same four for every
 * condition, so two conditions can be compared rather than praised:
 *
 * 1. Does the data come from the source's own servers?
 * 2. Is the account theirs?
 * 3. Who acted on the account?
 * 4. What does the source itself do against cheating?
 *
 * The rule for every sentence here: never stronger than what the code does. Where a thing is not known, it says so,
 * and `docs/SCREEN-CLAIMS.md` names the code path that makes each line true. The sources for question four are the
 * platforms' own published pages, read on 17 Sep 2026 and listed in `docs/DECISIONS.md`.
 */

export type ConditionProof = Readonly<{
  conditionId: string;
  /** The one line the chooser shows under the condition, so the funder reads it before choosing, not after. */
  inShort: string;
  /** Question 1: where the number comes from. */
  data: string;
  /** Question 2: how the account is tied to the person the gift is for. */
  account: string;
  /**
   * Whether the source itself describes watching the act, rather than only owning the account. It was false of every
   * condition until the Duolingo English Test, and the sentence below has to follow it either way (U3).
   */
  supervised: boolean;
  /** Question 3: who performed the activity. Where nothing is watched, the honest answer is "Unknown". */
  whoActed: string;
  /** Question 4: what the source does about cheating, and what it publishes that we can read. */
  sourcePolicing: string;
}>;

export const CONDITION_PROOFS: readonly ConditionProof[] = [
  {
    conditionId: "duolingo-daily",
    supervised: false,
    inShort: "Read each morning from Duolingo. It proves the account did the lesson, not who held the phone.",
    data: "Duolingo's own servers, read once a morning through an attested fetch. The reading is signed by Reclaim's attestor and Viky checks that signature, the address that signed it and the request it was about, before a day can count. Nobody types a number, and the person never touches the proof. When the gift is made on one course, the reading is anchored on that course's id, so experience won in another course is not in it.",
    account: "Proved once, before anything counts: either the funder names the Duolingo account when they offer the gift, or the person puts a short code in their Duolingo display name and Viky reads it there.",
    whoActed: "Unknown, and it is the honest answer: the reading proves what that account did, never who did it. Somebody else with the password, or a script, would read the same. Duolingo describes no proctoring and verifies no identity.",
    sourcePolicing: "Duolingo's own rules forbid scripts written to cheat and forbid scraping, and its terms let it delete an account for it. It publishes no anti-cheat status a third party can read, so Viky has nothing to check against: this is the weakest of the conditions on that question, and it is said here rather than left to be found.",
  },
  {
    conditionId: "chess-rating",
    supervised: false,
    inShort: "Read from Chess.com, which polices cheating itself. Viky never pays an account it has closed.",
    data: "Chess.com's public API, read every day through an attested fetch and checked the same way as Duolingo. The rating read is the one Chess.com publishes for that cadence, with its own reliability figure beside it.",
    account: "The funder names the Chess.com account, and the person proves it is theirs with a short code when they open the gift.",
    whoActed: "Unknown here too: the rating belongs to the account. What is different is that Chess.com hunts exactly that, and says so publicly.",
    sourcePolicing: "Chess.com polices engine use, outside help, account sharing and arranged results itself, publishes the sanction in the same API Viky reads (`status: closed:fair_play_violations`), and Viky refuses a closed account at every reading, so a gift is never paid on an account its own source has closed.",
  },
  {
    conditionId: "chess-tactics",
    supervised: false,
    inShort: "Read from Chess.com, which says nothing about policing puzzles. It only goes up, and never comes back down.",
    data: "Chess.com's public API, the same page as the rating, read through an attested fetch and checked the same way. What is read is `tactics.highest`, the best puzzle rating that account ever reached: it never goes down, so nothing the person does after beating their record can take the gift away from them.",
    account: "The funder names the Chess.com account, and the person proves it is theirs with a short code when they open the gift.",
    whoActed: "Unknown, and less watched here than in a game: a puzzle is solved alone against a clock, with no opponent and no game anybody can examine afterwards. The reading proves what that account reached, never who was at the keyboard.",
    sourcePolicing:
      "Chess.com closes an account for a Fair Play violation and publishes it in the same API Viky reads (`status: closed:fair_play_violations`), and Viky refuses a closed account at every reading. What it does not publish is anything about puzzles: read on 20 Sep 2026, neither its Fair Play policy nor its help centre article on Fair Play mentions the puzzle rating, and what they forbid is written about play. So nothing tells us this number is policed the way a rating is, and this condition is the weaker of the two on that question.",
  },
  {
    conditionId: "duolingo-english-test",
    supervised: true,
    inShort: "A test sat under watch, with an identity document and examiners. The result has a page they share.",
    data: "The page of the certificate its taker chose to make public, read through an attested fetch that takes three fields and no more: the score, the day of the test, and the name printed on it. The same answer also carries a date of birth and a photograph; Viky matches neither, receives neither and stores neither. The link is read again at every reading, so a certificate taken private again or past its two years stops paying, and says which. That reading is made by a program, which is the act Duolingo's terms ask to be asked about first, and that question has not been answered.",
    account: "The funder types the name the person will sit the test under, and it is hashed into the terms they sign. A certificate in another name pays nothing. Two people with the same name cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Known, and this is the only condition where it is: Duolingo records the session, checks a valid identity document, and has qualified examiners review it before a score is released.",
    sourcePolicing: "Duolingo may invalidate a result after it has been certified and notify everyone who received it, and it says so in its own terms. A certificate can also be taken private again by its holder, and expires two years after the test. All three are visible in the reading Viky already makes.",
  },
  {
    conditionId: "toefl-mybest-shown",
    supervised: false,
    inShort: "Shown by them: the score on their own ETS account, proved in a verification tab. Who sat the test is not read.",
    data: "The page ETS shows to the account holder once they have signed in, read in a Reclaim verification the person opens from their gift's page: one request to ETS's own servers, attested by a witness in a TEE, and two fields, the total score and the booking it belongs to. No name, no test date, no photograph. ETS's own terms on that reading were not read for this line, and that question stands.",
    account: "The link is the account the person signs in to, in their own browser, and the gift's own recipient, which the contract checks. No name is typed by the funder and none is read from the page: the subject the funder signs is the same for every gift on this condition, and that is written down rather than dressed up.",
    whoActed: "Unknown to Viky: the proof says which ETS account was signed in to, not who sat the test. ETS's own pages on identity checks and proctoring were not read for this line, so nothing is claimed about them here.",
    sourcePolicing: "Not read: what ETS does about a score it cancels, and whether a cancelled score leaves the account page, are ETS's rules and were not read for this line. The only thing Viky reads is what the page shows on the day it is shown.",
  },
  {
    conditionId: "cambridge-english-shown",
    supervised: false,
    inShort: "Shown by them: the Statement of Results on their own Cambridge English account. Who sat the exam is not read.",
    data: "The Statement of Results Cambridge English shows to the candidate once signed in to the Results Service for Candidates, read in a Reclaim verification the person opens from their gift's page: one request to Cambridge English's own servers, attested by a witness in a TEE, and the overall score on the Cambridge English Scale, from which the level follows (B1 from 140, B2 from 160, C1 from 180, C2 from 200, read on Cambridge English's results pages on 23 Sep 2026). No name, no photograph. The provider is ours, registered from a real candidate's session, and nothing is read until it exists.",
    account: "The link is the account the person signs in to, in their own browser, with the ID number and the password they registered with, and the gift's own recipient, which the contract checks. No name is typed by the funder and none is read from the page: the subject the funder signs is the same for every gift on this condition, and that is written down rather than dressed up.",
    whoActed: "Unknown to Viky: the proof says which Cambridge English account was signed in to, not who sat the exam. Cambridge English's own pages on identity checks were not read for this line, so nothing is claimed about them here.",
    sourcePolicing: "Not read: what Cambridge English does about a result it withdraws, and whether a withdrawn result leaves the candidate's page, are its rules and were not read for this line. Its website terms (cambridge.org, read 23 Sep 2026) forbid scraping or storing the site's content on a server and creating a database from it; whether a candidate showing their own result once falls under that is a question this line does not answer, and the judges' page says so.",
  },
  {
    conditionId: "ielts-shown",
    supervised: false,
    inShort: "Shown by them: the overall band on their own British Council test taker account. Who sat the test is not read.",
    data: "The result the British Council shows to the test taker once signed in to its Test Taker Portal, read in a Reclaim verification the person opens from their gift's page: one request to the British Council's own servers, attested by a witness in a TEE, and the overall band, in tenths for the contract. No name, no Test Report Form number kept. The provider is ours, registered from a real test taker's session, and nothing is read until it exists. A test taker who booked through IDP is not served by this line yet: IDP's results page asks the candidate's name, date of birth and passport number rather than an account, and is a provider of its own to come.",
    account: "The link is the account the person signs in to, in their own browser, with their email address and password, and the gift's own recipient, which the contract checks. No name is typed by the funder and none is read from the page: the subject the funder signs is the same for every gift on this condition.",
    whoActed: "Unknown to Viky: the proof says which test taker account was signed in to, not who sat the test. The British Council's own pages on identity checks at the test centre were not read for this line, so nothing is claimed about them here.",
    sourcePolicing: "Not read: what the British Council or IELTS does about a result it withdraws, and whether a withdrawn result leaves the portal, are their rules and were not read for this line. The British Council's terms of use for its digital services were opened on 23 Sep 2026; what they say of automated access is quoted in the provider's definition, and the judges' page says where the question stands.",
  },
  {
    conditionId: "bac-morocco-shown",
    supervised: false,
    inShort: "Shown by them: the Ministry's Bac Digital page, opened with their own CNE and CIN. Who sat the exam is not read.",
    data: "The page the Ministry of National Education's Bac Digital service (bac.t3.technology) shows for a candidate's CNE and CIN, opened by the candidate in their own browser in a Reclaim verification: one request to the service's own servers, attested by a witness in a TEE, and the decision, passed or not. The average and the mention the page also carries are not read tonight. The service sits behind Cloudflare, which blocks a reader that is not a browser, so this line is shown by the candidate and never read by Viky. The provider is ours, registered from a real candidate's session, and nothing is read until it exists.",
    account: "There is no account: the link is the pair of numbers the candidate types, their CNE and CIN, in their own browser, never sent to Viky, and the gift's own recipient, which the contract checks. Whoever holds those numbers can show the page: that gap is written down rather than dressed up.",
    whoActed: "Unknown. The page says a candidate with those numbers passed, not who sat the exam.",
    sourcePolicing: "The Ministry polices its own examination and publishes the decision on its own service. The service's page shows no terms of use (read 23 Sep 2026), so nothing is claimed about what it allows a program to do; the judges' page says so.",
  },
  {
    conditionId: "bac-cameroon-shown",
    supervised: false,
    inShort: "Shown by them: the candidate's own space on the Office du Baccalauréat's platform. Who sat the exam is not read.",
    data: "The page of the candidate's own space on Epim-Exam, the Office du Baccalauréat du Cameroun's platform, shown by them in a Reclaim verification: one request to the platform's own servers, attested by a witness in a TEE, and the decision, passed or not. The provider is ours, registered from a real candidate's session, and nothing is read until it exists.",
    account: "The link is the candidate's space the person signs in to, in their own browser, and the gift's own recipient, which the contract checks. No name is typed by the funder and none is read from the page.",
    whoActed: "Unknown. Signing in to the candidate's space is one person's act, and nothing says who sat the exam.",
    sourcePolicing: "The Office du Baccalauréat polices its own examination and publishes the decision on its own platform. The platform's public pages show no terms of use (read 23 Sep 2026), so nothing is claimed about what it allows a program to do; the judges' page says so.",
  },
  {
    conditionId: "bac-france-shown",
    supervised: false,
    inShort: "Shown by them: the candidate's own Cyclades space. Who sat the exam is not read.",
    data: "The page of the candidate's own Cyclades space (candidat.examens-concours.gouv.fr), shown by them in a Reclaim verification: one request to the Ministry's own servers, attested by a witness in a TEE, and the decision, passed or not. The mention the page also carries is not read tonight. The Ministry also publishes the results by name on a public page (resultats.examens-concours.gouv.fr), which would be the other reading; this line is the one the candidate shows. The provider is ours, registered from a real candidate's session, and nothing is read until it exists.",
    account: "The link is the Cyclades account the person signs in to, in their own browser, with their identifier and password or through FranceConnect, and the gift's own recipient, which the contract checks. No name is typed by the funder and none is read from the page.",
    whoActed: "Unknown. Signing in to the candidate's space is one person's act, and nothing says who sat the exam.",
    sourcePolicing: "The Ministry polices its own examination and publishes the decision on its own service. Cyclades's legal notice was opened on 23 Sep 2026; what it says of automated access is in the provider's definition, and the judges' page says where the question stands.",
  },
  {
    conditionId: "udemy-course-shown",
    supervised: false,
    inShort: "Shown by them: the course finished on their own Udemy account. Who watched the lessons is not read.",
    data: "The person's own \"My learning\" page on Udemy, shown by them in a Reclaim verification: one request to Udemy's own servers, attested by a witness in a TEE, and two fields, the course's slug and whether it is finished. Udemy's terms forbid a program reading its pages, so nothing is read for the person; the certificate page Udemy publishes is not read either. The provider is ours, registered from a real account, and nothing is read until it exists.",
    account: "The funder names the course by its link, and its slug is hashed into the terms they sign, so a course shown that is not that one pays nothing. The link is the Udemy account the person signs in to, in their own browser, and the gift's own recipient, which the contract checks; no name is typed by the funder and none is read from the page.",
    whoActed: "Unknown: Udemy describes no supervision of who watches a course, and a course is marked finished when its lectures are marked complete, which the account holder does.",
    sourcePolicing: "Udemy polices nothing about who finishes a course: a lecture is marked complete by the account, and the certificate of completion says so. Its terms (section 7, read 23 Sep 2026) forbid scraping, robots and any automated means of access, and (section 1) sharing login credentials, which is why this line is shown by the person and read by nobody else; the judges' page says so.",
  },
  {
    conditionId: "university-enrollment-shown",
    supervised: false,
    inShort: "Shown from their own student portal, the page that says enrolled. Proves the account, not who sits in class.",
    data: "The page of the person's own student portal, shown by them: they sign in there, in a verification tab, and an attestor in a TEE proves what the page carried, one field, the status or the academic year the portal names, matched against the pattern the portal's own row holds. Viky keeps that it said enrolled and the day, and nothing else; the password never reaches Viky. Each portal is proved first from a real student account before any gift can name it.",
    account: "The funder chooses the portal, from the ones Viky has proved, and it is hashed into the terms they sign; a page shown from another portal pays nothing. Who holds the portal's account is not proved: a shared student account is a shared student account.",
    whoActed: "Unknown. Signing in to a portal is one person's act, and nothing says who sat in class.",
    sourcePolicing: "Each university polices its own enrolment: a portal says enrolled because the registrar recorded it. What a portal's terms say about a program reading its pages is not read portal by portal (the judges' page says so), and a portal that changes its page stops proving until its row is proved again.",
  },  {
    conditionId: "chsi-enrolment-shown",
    supervised: false,
    inShort: "Shown by them from their own CHSI report, the Ministry of Education's register: enrolled or not.",
    data: "The person's own student-status verification report on CHSI (学信网), opened by them with its verification code in a Reclaim verification tab: one answer from CHSI's own servers, attested by a witness in a TEE, and one field, the student status. The report also carries a photograph, an identity number and a birthday; none of them is extracted, and the status itself is kept nowhere, only the verdict.",
    account: "The link is the report the person opens, which they applied for themselves, and the gift's own recipient, which the contract checks. The report carries a name the funder does not sign, so which person holds it is not bound beyond that.",
    whoActed: "Unknown: the report says the Ministry's register has the student enrolled, not who opened it.",
    sourcePolicing: "The Ministry's register is kept from the universities' own enrolment; CHSI publishes the report for third parties to check, free, while it is valid. Its copyright statement forbids using its content and services for other purposes, commercial ones included, without its consent, which Viky does not have: written on the judges' page.",
  },

  {
    conditionId: "waec-result-shown",
    supervised: false,
    inShort: "Shown by them from WAEC's own result checker: how many credits, English and Mathematics among them.",
    data: "The person's own WASSCE result on waecdirect.org, opened by them with their examination number and result card in a Reclaim verification tab: one answer from WAEC's own servers, attested by a witness in a TEE, and three fields, the examination, the grades and whether anything is withheld. The credits are counted in memory and only the count is kept; the name, the examination number and the centre are not extracted.",
    account: "The result the person opens with their own card, and the gift's own recipient, which the contract checks. The result carries a name the funder does not sign, so which candidate it belongs to is not bound beyond that: whoever holds a card and an examination number can show that result.",
    whoActed: "Unknown to Viky: the proof says which result was opened, not who sat the exam. WAEC's own pages on identity checks at the centre were not read for this line, so nothing is claimed about them here.",
    sourcePolicing: "WAEC marks the examination, withholds results it investigates (the result page has a table for them, and a withheld result pays nothing here), publishes lists of cancelled results, and opens results on its own checker. Its privacy policy forbids giving its access codes to a third party, which is why the card is typed on WAEC's page and never reaches Viky.",
  },
  {
    conditionId: "university-year-passed-shown",
    supervised: false,
    inShort: "Shown from their own student portal, the results page that says passed. Proves the account, not who sat the exams.",
    data: "The results page of the person's own student portal, shown by them: they sign in there, in a verification tab, and an attestor in a TEE proves what the page carried, the one field that says passed, matched against the pattern the portal's own row holds, and the year's field where the portal dates its page, so a page of another year pays nothing. Viky keeps that it said passed and the day, and nothing else; no grade is read and the password never reaches Viky. Each portal's results page is proved first from a real student account before any gift can name it.",
    account: "The funder chooses the portal, from the ones Viky has proved with a results page, and it is hashed into the terms they sign under this condition's own name; a page shown from another portal, or a proof of enrolment on the same one, pays nothing. Who holds the portal's account is not proved: a shared student account is a shared student account.",
    whoActed: "Unknown. Signing in to a portal is one person's act, and nothing says who sat the exams.",
    sourcePolicing: "Each university polices its own exams and publishes the result on its own portal: the page says passed because the jury recorded it. What a portal's terms say about a program reading its pages is not read portal by portal (the judges' page says so), and a portal that changes its results page stops proving until its row is proved again.",
  },
  {
    conditionId: "university-grade-shown",
    supervised: false,
    inShort: "Shown from their own student portal, the grade on the results page, on the university's scale. Proves the account, not who sat the exams.",
    data: "The results page of the person's own student portal, shown by them: they sign in there, in a verification tab, and an attestor in a TEE proves what the page carried, the one field that holds the grade, read on the scale the portal's own row declares (out of 20, a GPA out of 4, or out of N in a step; a scale of letters is declared and refused when the gift is made), and the year's field where the portal dates its page, so a page of another year pays nothing. Viky keeps the grade in hundredths and the day, and nothing else; the password never reaches Viky.",
    account: "The funder chooses the portal, from the ones Viky has proved with a results page, and sets the grade on that university's own scale; the portal is hashed into the terms they sign under this condition's own name, so a page shown from another portal pays nothing, and the contract compares the grade shown with the target in the same hundredths. Who holds the portal's account is not proved: a shared student account is a shared student account.",
    whoActed: "Unknown. Signing in to a portal is one person's act, and nothing says who sat the exams.",
    sourcePolicing: "Each university polices its own exams and publishes the grade on its own portal: the page carries what the jury recorded. What a portal's terms say about a program reading its pages is not read portal by portal (the judges' page says so), and a portal that changes its results page stops proving until its row is proved again.",
  },
  {
    conditionId: "ecoledirecte-grade-shown",
    supervised: false,
    inShort: "Shown by them: the overall average on their own EcoleDirecte account, out of 20. Who did the work is not read.",
    data: "The grades page of the pupil's own EcoleDirecte account, or the family's, shown by them in a Reclaim verification: one request to EcoleDirecte's own servers, attested by a witness in a TEE, and one field, the overall average out of 20, carried in hundredths. No grade, no remark, no name; the password never reaches Viky. The provider is ours, registered from a real pupil's session, and nothing is read until it exists.",
    account: "The link is the EcoleDirecte account the person signs in to, in their own browser, and the gift's own recipient, which the contract checks. A family account shows the pupils the family answers for, so a family with several pupils shows the one the gift is for: the subject the funder signs is the same for every gift on this condition, and that is written down rather than dressed up.",
    whoActed: "Unknown. Signing in to the account is one person's act, and nothing says who did the work the average rewards.",
    sourcePolicing: "The school records the grades and answers for them; EcoleDirecte's publisher, Aplim, hosts them. Aplim's terms (read 23 Sep 2026) say the holder of a password reaches only the information about themselves or those they answer for, and name no program; PRONOTE, the other portal read, is not built, its publisher's terms forbidding any device retrieving data from its sites without its written authorisation, and the judges' page says so.",
  },

  {
    conditionId: "fitbit-daily",
    supervised: false,
    inShort: "Connected by them: each morning, whether yesterday's Fitbit reached the minutes. A yes or a no, and no number.",
    data: "The Google Health API's own daily roll-up of active minutes (`dailyRollUp` on `active-minutes`, the successor of the Fitbit Web API), read each morning through an attested fetch with the person's own key handed to the fetch as a secret the attestor never sees: the reading is signed by Reclaim's attestor, and Viky checks that signature and the request it was about, its body included. Only minutes recorded by Google's and Fitbit's own wearables are asked for, not minutes logged by hand; what is read is the moderate and vigorous minutes of the day; what is signed for the contract is the verdict alone, so the chain and the journal hold a yes or a no and never a number of the person's. The roll-up is judged and dropped: no proof of it is stored.",
    account: "The person connects their own Google account once, on Google's own page, in their own browser, after the consent screen says in Viky's words what the funder will be told and what they will never see. The pseudonym of that account's Google Health user id is bound at the first reading, and a key Google stops honouring ends the reading until the person connects again; disconnect and erase is theirs at any time, and gives the key back to Google first.",
    whoActed: "Unknown: the roll-up says what the account's tracker recorded, never who wore it. Google describes no check of who moves.",
    sourcePolicing: "Google polices nothing about who moves, beyond leaving out intervals a wearable was not worn. Its Google Health API Developer Terms and its Developer and User Data Policy (both of 24 Mar 2026, read 23 Sep 2026) frame what Viky does: use limited to the feature the person asked for, a transfer to a third party only to provide it and with their consent, the disclosure shown immediately before the consent, deletion honoured on request, no human reading the data; the consent screen, the verdict-only reading and the erase button are those, and the judges' page says so.",
  },
  {
    conditionId: "strava-daily",
    supervised: false,
    inShort: "Connected by them: each morning, whether yesterday's Strava activities reached the kilometres. A yes or a no, no number.",
    data: "Strava's own API, the list of the day's activities, read each morning through an attested fetch with the person's own key handed to the fetch as a secret the attestor never sees: the reading is signed by Reclaim's attestor and Viky adds the distances, judges the day and drops the list, its routes and its times with it. What reaches the contract is the verdict, never a number of the person's.",
    account: "The person connects their own Strava account once, on Strava's own page, in their own browser, after the consent screen says in Viky's words what the funder will be told and what they will never see; Strava sends back what they allowed, and without the activities nothing is kept. The pseudonym of that account's athlete id is bound on the chain by the first reading, so another account cannot count for this gift, and the contract checks the recipient.",
    whoActed: "Unknown: the list says what the account recorded, never who carried the phone or the watch, and an activity can be entered by hand. Strava describes no check of who moves.",
    sourcePolicing: "Strava polices nothing about who moves; it flags some activities as suspect on its own site and that flag is not read here. Its API Agreement (read 23 Sep 2026) frames what Viky does with Strava Data: used to serve the person who authorised it and nobody else, neither aggregated across people nor shown to others, deleted when they ask. The verdict-only reading, the consent screen and the erase button that gives the key back first are those three; the funder's daily yes or no is the one bit that leaves.",
  },
  {
    conditionId: "coursera-certificate",
    supervised: false,
    inShort: "Read from the certificate's public page. Coursera checks identity once, not each piece of work.",
    data: "The public page of the certificate, read through an attested fetch when the person shares its link, and read again at every reading: four things come out of it and nothing else, the name on it, the course, the certificate's own code and the day it was granted. That reading is made by a program, which is the act Coursera's terms ask to be asked about first, and that question has not been answered.",
    account: "The funder names the person and the course, and both are hashed into the terms they sign, so a certificate for another course or in another name pays nothing. Two people of the same name who finish the same course inside the same days cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Unknown: Coursera describes no supervision of each assignment.",
    sourcePolicing: "Coursera verifies identity once per account, with an official document and a selfie, and says some programmes require it while others only check a name. Nothing published says a certificate was earned under supervision.",
  },  {
    conditionId: "marathon-finish",
    supervised: false,
    inShort: "Read from the timing company's public results page: one line, the name, the bib, the official time.",
    data: "The runner's own page on the timing company's results site (Breizh Chrono for the Marathon de Dakar), read through an attested fetch when the person asks after the race, and again at every reading: the name and the bib in its title, and the official time. Nothing else is matched. A runner who did not finish has no time there and pays nothing; a bib nobody wore answers an empty page.",
    account: "Three ties: the runner's name, written by the funder at creation and hashed into the terms they sign, never published; the bib, entered by the person on the gift's page before the race starts (the field closes at the start); and the timing company's line for that bib, which has to carry that bib, that name and a finish time. The name is compared with no case, no accents and no order. Two runners of the same name in the same race with bibs entered before the start cannot be told apart.",
    whoActed: "Unknown: the timing company records who crossed the line wearing the bib. Whether the person wore their own bib is not read.",
    sourcePolicing: "The timing company chips the bib and publishes the results for the organiser; a runner can ask the federation to be removed from them. Klikego's terms (CGU of 26 Jun 2026, and its legal notice) claim the site's content and its database, forbid reproduction without written consent, and count the use of robots among the reasons to close a member's account: Viky reads one runner's page per gift, when the person asks, and keeps three fields; written on the judges' page, the risk assumed as for edX.",
  },
  {
    conditionId: "wca-time",
    supervised: true,
    inShort: "Read from the WCA's public results: one row, the name, the event, the best single. Judged and timed at a WCA competition.",
    data: "The person's own list of results on the World Cube Association's public API, read through an attested fetch when the person asks after the competition, and again at every reading: the row of that competition, that event and the round of their best single, with the name and the times as the WCA prints them. Nothing else is matched. An attempt that is a DNF has no time there and pays nothing.",
    account: "Three ties: the person's name, written by the funder at creation and hashed into the terms they sign, never published; the competitors list of the competition, public, on which the person has to be registered in the event before the first day (that stands in for a bib); and the WCA's own results, which have to carry that name with a result in that event. The name is compared with no case, no accents and no order.",
    whoActed: "The WCA's judges: every attempt at a WCA competition is timed and checked by a judge, the examiner of that attempt, under the WCA Regulations, at a table in the venue.",
    sourcePolicing: "The WCA governs the competition under its Regulations and can invalidate results and review incidents; its results are published for everybody and, by its privacy statement, are not personal data. Its API is public and asks for no key; its export may be re-published with a notice that the results are the WCA's. Written on the judges' page.",
  },
  {
    conditionId: "mitx-online-certificate",
    supervised: false,
    inShort: "Read from the certificate's public page on MITx Online. It proves a course passed there, not a place at MIT.",
    data: "The public page MITx Online publishes for the certificate, read through an attested fetch when the person shares its link, and again at every reading: the course or program's title, the holder's name, the day of issue and the certificate's own id. Nothing else is matched. A certificate that is revoked answers 404 and stops paying.",
    account: "The funder names the person and the course by its title, and both are hashed into the terms they sign, so a certificate for another course or in another name pays nothing. Two people of the same name who finish the same course inside the same window cannot be told apart (D49's gap), as on edX.",
    whoActed: "Unknown: MITx Online issues a certificate on a passing grade in the paid track; its terms describe identity-verified proctoring for some courses only, and the page does not say which.",
    sourcePolicing: "MITx Online issues the certificate at its own discretion, under its own name, and can revoke it (a revoked certificate's page answers 404). Its terms forbid scraping or downloading its content in bulk and allow personal, noncommercial use of site content, which Viky's one reading per shared certificate sits beside: written on the judges' page, the risk assumed as for edX.",
  },
  {
    conditionId: "edx-certificate",
    supervised: false,
    inShort: "Read from the verified certificate's public page on edX. edX checks identity for that track, not each piece of work.",
    data: "The public page edX publishes for the certificate, read through an attested fetch when the person shares its link, and again at every reading: the organisation and the course's number, its printed name, the track, the holder's name, the day of issue and the certificate's own id. Nothing else is matched. A certificate edX withdraws answers 404 and stops paying.",
    account: "The funder names the person and the course, and both are hashed into the terms they sign, so a certificate for another course or in another name pays nothing. Two people of the same name who finish the same course inside the same window cannot be told apart (D49's gap), as on Coursera.",
    whoActed: "Unknown: edX verifies the learner's identity for the verified track and describes no supervision of each assignment.",
    sourcePolicing: "edX issues the certificate on a passing grade in the verified track, after an identity check, and publishes a page per certificate. Its terms (11.6, updated 3 Nov 2025) forbid accessing the service through robots or crawlers other than edX's own, which Viky's one reading per shared certificate is: written on the judges' page, the risk assumed as for Duolingo and Coursera.",
  },

  {
    conditionId: "credly-badge",
    supervised: false,
    inShort: "The badge its issuer published: nobody can award themselves one, and the record says which it is.",
    data: "Two public records of the same badge, read through an attested fetch and read again at every reading: the Open Badges assertion, which says the day and carries the issuer's id and the badge class's id, and the badge's public page, which is the only place the holder's name is published. Three things come out of them and nothing else. The assertion also carries the holder's email address, hashed; nothing here matches it, receives it or keeps it.",
    account: "The funder names the person and chooses the certification, and both are hashed into the terms they sign, so a badge for another certification or in another name pays nothing. The certification is decided by the pair of ids Credly publishes rather than by a title, which can be edited or reused. Two people of the same name who earn the same certification inside the same days cannot be told apart by this, because the page has no field its holder can edit: that gap is written down rather than dressed up.",
    whoActed: "Unknown: nothing describes how the work behind the badge was supervised, and it varies by issuer. What is different from a certificate a site prints for its own course is that the issuer is a third party who awards the badge, so nobody can award one to themselves.",
    sourcePolicing: "Credly hosts what issuers award and does not mark the work: a badge can be revoked by its issuer, and a holder can make it private again, and both stop the reading, because the two records are read again every time. Nothing published says a badge was earned under supervision.",
  },  {
    conditionId: "accredible-credential",
    supervised: false,
    inShort: "The credential its issuer published on Accredible: nobody can issue one to themselves, and the record says which it is.",
    data: "The public record Accredible publishes for the credential (the JSON its page is drawn from), read through an attested fetch when the person shares its link, and again at every reading: the title, the issuer's website, the day of issue, whether it is private, expired or revoked, and the name on it. Its recipient's masked email is matched and never taken.",
    account: "The funder names the person and the credential by its title and its issuer's website, and all three are hashed into the terms they sign, so a credential with another title, from another issuer or in another name pays nothing. Two people of the same name with the same credential in the same window cannot be told apart (D49's gap).",
    whoActed: "Unknown: what stands behind a credential varies by issuer, and Accredible describes none of it. What differs from a certificate a site prints for its own course is that an issuer, a third party, awards it.",
    sourcePolicing: "The issuer awards and can revoke the credential, and Accredible publishes whether it is revoked or expired, which the reading checks. Accredible's terms (April 2026) are a contract with issuers and name no automated access; nothing about a reader is claimed.",
  },

];

export function proofOfCondition(conditionId: string): ConditionProof | undefined {
  return CONDITION_PROOFS.find((entry) => entry.conditionId === conditionId);
}

/** Every condition with what it proves, for the judges page: the register's order, so nothing can be left out quietly. */
export function conditionsWithProof(): ReadonlyArray<{ condition: Condition; proof: ConditionProof }> {
  return CONDITIONS.flatMap((condition) => {
    const proof = proofOfCondition(condition.id);
    return proof ? [{ condition, proof }] : [];
  });
}
