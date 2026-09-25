import type { Portal } from "./portal-store";

/**
 * Student portals whose Reclaim provider already exists in the public directory and is used by other applications
 * (D199), pinned here the way the TOEFL's is (src/toefl-shown.ts): the provider's id, its version and the hash of its
 * one request, read on 23 Sep 2026 by the directory's own API (`/api/providers/explore/paginated`) and the
 * configuration the SDK fetches (`api.reclaimprotocol.org/api/providers/<id>/configs`). `pnpm portal:directory` writes
 * each as a portal row, marked unverified (D193), since no student has shown a proof from it to Viky yet.
 *
 * Rome proves enrolment, a current term. Four more (D267) prove a signed-in student account alone, and say so. HUJI
 * stays out: its patterns carry one student's own name and number. The rest of the founder's list is witnessed by AI,
 * which Viky refuses everywhere; docs/reclaim/directory-universities.md says each one.
 */
export type DirectoryPortal = Omit<Portal, "provenAt" | "provenBy" | "results" | "unverified"> &
  Readonly<{ usedBy: number; read: string }>;

export const DIRECTORY_PORTALS: readonly DirectoryPortal[] = [
  {
    portalId: "aur-it",
    name: "AUR, my.aur.edu",
    university: "The American University of Rome",
    country: "IT",
    // "American University of Rome", "Student Status", version 1.0.0, WITNESS, used by three applications.
    providerId: "8a769077-53f8-4bbb-b75f-d2afe3eb6a42",
    providerVersion: "1.0.0",
    requestHash: "0xe7543349ac7ac9b06c34a04ad8a1b5062e699513a8fcb61b1f82d85b6f06f18c",
    loginUrl: "https://my.aur.edu/ics",
    // `GET https://my.aur.edu/ICS/Student/`: the student's own course schedule page, "Course Schedule for <name>", and
    // the term it is for, "<term> - All Divisions". A schedule of this academic year is what says enrolled now.
    extract: {
      field: "Current_semester",
      matches: "(Fall|Spring|Summer).*20(26|27)|20(26|27).*(Fall|Spring|Summer)",
      keeps: "whether the student's own course schedule is for a term of the 2026-2027 academic year, and nothing else",
    },
    proves: "enrolment",
    usedBy: 3,
    read: "23 Sep 2026",
  },
  // Four more on the founder's decision of 26 Sep 2026 (D267): each proves a signed-in student account and no
  // enrolment status, which its line and its gift say. Read on 26 Sep 2026 the same way as Rome's.
  {
    portalId: "aus-ae",
    name: "AUS, iLearn",
    university: "American University of Sharjah",
    country: "AE",
    // "American University of Sharjah", version 1.0.0, WITNESS, verified by Reclaim: the learning platform's own record
    // of the signed-in user (`GET https://ilearn.aus.edu/learn/api/{{URL_PARAMS_1}}/users/me`), name, email, department.
    providerId: "3f649818-87a2-4199-bef6-8b234a2fd9d9",
    providerVersion: "1.0.0",
    requestHash: "0xa8c0fd8adab4c09421363c9c56fe01926aed5bcaf721c1811d3f431b51cb1f56",
    loginUrl: "https://ilearn.aus.edu/",
    extract: { field: "userName", matches: "\\S", keeps: "whether the learning platform answered for a signed-in student account, and nothing else" },
    proves: "account",
    usedBy: 1,
    read: "26 Sep 2026",
  },
  {
    portalId: "innopolis-ru",
    name: "Innopolis, my.university",
    university: "Innopolis University",
    country: "RU",
    // "Innopolis University", "Prove that you've been enrolled to Innopolis University", version 1.0.0, WITNESS: the
    // education tab of the student's own profile, and one field, the student's name. The description says enrolled; the
    // field does not, so the line says a student account.
    providerId: "337a2461-0464-495d-8f2e-642eeb04db4d",
    providerVersion: "1.0.0",
    requestHash: "0x261773de6cf6d6a5522e9fe72c4a8c06118ae063bd84c7a59727ec98ae1dc5d5",
    loginUrl: "https://my.university.innopolis.ru/profile/personal-form/index?tab=education",
    extract: { field: "studentName", matches: "\\S", keeps: "whether the student's own profile answered for a signed-in account, and nothing else" },
    proves: "account",
    usedBy: 1,
    read: "26 Sep 2026",
  },
  {
    portalId: "ignou-in",
    name: "IGNOU, Samarth",
    university: "Indira Gandhi National Open University",
    country: "IN",
    // "IGNOU", version 3.4.0, WITNESS: the student's own profile page, and one field, the name in its heading. The
    // older 2.4.0 matches the whole page, so this one.
    providerId: "5a293416-14ca-4ffe-8374-18b4d0d79e8e",
    providerVersion: "3.4.0",
    requestHash: "0x26f2f64fb19946748db4444b6d9d6fabc7ed2e0bb4f08ed2c20ab19c4d14ecf0",
    loginUrl: "https://ignou.samarth.edu.in/index.php/site/login",
    extract: { field: "fullName", matches: "\\S", keeps: "whether the student's own profile answered for a signed-in account, and nothing else" },
    proves: "account",
    usedBy: 1,
    read: "26 Sep 2026",
  },
  {
    portalId: "du-bd",
    name: "University of Dhaka, student portal",
    university: "University of Dhaka",
    country: "BD",
    // "University of Dhaka", version 3.0.0, WITNESS: `GET https://bk.eco.du.ac.bd/student/me`, the signed-in student's
    // own record. Its one pattern is the field alone, so the proof carries the whole answer to Viky's server, which
    // judges it not empty and keeps nothing: the only provider there is, written here as it is.
    providerId: "68cb338a-b0ee-4f63-a306-c768deae461f",
    providerVersion: "3.0.0",
    requestHash: "0x3b38ce00c77aa579e2d8c6ae73f237eedcab7c1c1e7f4a460321b0ac114c9779",
    loginUrl: "https://eco.du.ac.bd/dashboard/login?redirect=%2Fdashboard",
    extract: { field: "fullName", matches: "\\S", keeps: "whether the student's own record answered for a signed-in account, and nothing else" },
    proves: "account",
    usedBy: 1,
    read: "26 Sep 2026",
  },
];
