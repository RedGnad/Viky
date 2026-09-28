import type { Portal } from "./portal-store";

/**
 * Student portals whose Reclaim provider already exists in the public directory and is used by other applications
 * (D199), pinned here the way the TOEFL's is (src/toefl-shown.ts): the provider's id, its version and the hash of its
 * one request, read on 23 Sep 2026 by the directory's own API (`/api/providers/explore/paginated`) and the
 * configuration the SDK fetches (`api.reclaimprotocol.org/api/providers/<id>/configs`). `pnpm portal:directory` writes
 * each as a portal row, marked unverified (D193), since no student has shown a proof from it to Viky yet.
 *
 * Rome proves enrolment, a current term. Four more (D267) prove a signed-in student account alone, and say so. HUJI
 * stays out: its patterns carry one student's own name and number. The rest of the founder's list is witnessed by AI:
 * the corridor's among them are listed below as witness portals (D312); docs/reclaim/directory-universities.md says each one.
 */
export type DirectoryPortal = Omit<Portal, "provenAt" | "provenBy" | "results" | "unverified" | "verification" | "witnessDomain" | "pin"> &
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

/**
 * The corridor's universities whose only Reclaim provider is an AI one (D312, the founder's decision of 28 Sep 2026):
 * listed now, for everybody, and verified by the pinned witness on the university's own domain, with no enclave. The
 * provider's configuration names no request: Reclaim's agent writes one at the first real run. So a row has no pattern
 * until a student shows a first proof, which is held for the operator's review and never paid alone; `pnpm portal:pin`
 * then fixes the version, the request and the field, and settles the held gift. Until then each row says a student
 * account, the least a signed-in page shows, and the pin says whether it is the year's enrolment.
 *
 * Read on 28 Sep 2026 from the directory's API and each provider's configuration: every one `verificationType: AI`,
 * `requestData: []`, used by nobody yet. The domain is the university's own, or, where the portal is hosted on a shared
 * platform, the portal's host alone, so no other tenant of that platform can stand in for it.
 *
 * IHET (Tunis) and MIT Polytech (Tunis) were taken out on 28 Sep 2026 (the founder): no portal of theirs can be read,
 * the first a plain http page on a bare address, the second a server name that no longer resolves.
 */
export type WitnessDirectoryPortal = Pick<Portal, "portalId" | "name" | "university" | "country" | "providerId" | "loginUrl"> & Readonly<{ witnessDomain: string }>;

export const WITNESS_PORTALS: readonly WitnessDirectoryPortal[] = [
  { portalId: "ucad-sn", name: "UCAD, student center", university: "Université Cheikh Anta Diop", country: "SN", providerId: "10560c0d-b009-412b-8e78-762d79fa7cc4", loginUrl: "https://studentcenter.ucad.sn/login", witnessDomain: "ucad.sn" },
  { portalId: "ugb-sn", name: "UGB", university: "Université Gaston Berger", country: "SN", providerId: "4a2d6851-816a-4a47-89fc-c8dd7d6d5004", loginUrl: "https://www.ugb.sn/", witnessDomain: "ugb.sn" },
  // The directory calls it "Dakar Bourguiba University"; its portal is on uadb.edu.sn, Alioune Diop University of Bambey's.
  { portalId: "uadb-sn", name: "UADB, student portal", university: "Université Alioune Diop de Bambey", country: "SN", providerId: "cf828716-404b-4082-a060-8f0104cb1bd5", loginUrl: "https://si.uadb.edu.sn/etudiant/user/login", witnessDomain: "uadb.edu.sn" },
  { portalId: "udb-sn", name: "UDB", university: "Université Dakar Bourguiba", country: "SN", providerId: "137ef038-deed-4491-a846-73a4e39d1532", loginUrl: "https://udb.sn/login", witnessDomain: "udb.sn" },
  { portalId: "bem-sn", name: "BEM", university: "BEM Dakar Management School", country: "SN", providerId: "3d6b05b9-ac27-4998-940e-7f3fccb2de92", loginUrl: "https://bem.sn/connecter", witnessDomain: "bem.sn" },
  { portalId: "fhb-ci", name: "UFHB, mon espace", university: "Université Félix Houphouët-Boigny", country: "CI", providerId: "f0ead2b0-632e-4cad-9736-87e82eb8900c", loginUrl: "https://w.univ-fhb.edu.ci/mon-espace/", witnessDomain: "univ-fhb.edu.ci" },
  { portalId: "univh2c-ma", name: "UH2C, ENT", university: "Université Hassan II de Casablanca", country: "MA", providerId: "e4f0b1c9-29e1-4232-9c58-db20b921bf99", loginUrl: "https://ent.univh2c.ma", witnessDomain: "univh2c.ma" },
  // The directory's sign-in address is http; a proof is only ever of an https page, so the row names the https one.
  { portalId: "um5-ma", name: "UM5, student portal", university: "Université Mohammed V de Rabat", country: "MA", providerId: "43efdd95-2e73-4cb2-8e80-6b2bfd5a732b", loginUrl: "https://etu.um5.ac.ma/", witnessDomain: "um5.ac.ma" },
  { portalId: "uir-ma", name: "UIR, connect", university: "Université Internationale de Rabat", country: "MA", providerId: "2a959393-d9d1-46dd-93db-adad45014278", loginUrl: "https://connect.uir.ac.ma/", witnessDomain: "uir.ac.ma" },
  { portalId: "mines-rabat-ma", name: "ENSMR", university: "École Nationale Supérieure des Mines de Rabat", country: "MA", providerId: "0b3acda1-a1ef-4668-b3c6-baa38a8652da", loginUrl: "https://my.mines-rabat.ma/", witnessDomain: "mines-rabat.ma" },
  { portalId: "upm-ma", name: "UPM, extranet", university: "Université Privée de Marrakech", country: "MA", providerId: "3de473be-df5d-435e-9c90-3e01539d5ce9", loginUrl: "https://extranet.upm.ac.ma/", witnessDomain: "upm.ac.ma" },
  { portalId: "supdeco-ma", name: "Sup de Co Marrakech", university: "École Supérieure de Commerce de Marrakech", country: "MA", providerId: "a321b00f-e485-4556-91e1-fd49e9adb6c3", loginUrl: "https://start.supdeco.ma/", witnessDomain: "supdeco.ma" },
  { portalId: "iam-ml", name: "IAM, e-learning", university: "International Institute of Management of Bamako", country: "ML", providerId: "a6aa673a-f870-4d16-998b-6d64853beaaa", loginUrl: "https://elearning.iambamako.com/", witnessDomain: "iambamako.com" },
  { portalId: "uam-ne", name: "UAM, campus", university: "Université Abdou Moumouni de Niamey", country: "NE", providerId: "4ae9a026-6acf-4972-9741-28994edb39eb", loginUrl: "https://uam.campusniger.com/", witnessDomain: "uam.campusniger.com" },
  { portalId: "esc-ouaga-bf", name: "ESC Ouaga, espace étudiant", university: "École Supérieure de Commerce de Ouagadougou", country: "BF", providerId: "663a4e6a-13ff-4fb3-a7ad-b759051cd830", loginUrl: "https://esc-ouaga.com/espace-etudiant/", witnessDomain: "esc-ouaga.com" },
  { portalId: "unikin-cd", name: "UNIKIN, Futuriss", university: "Université de Kinshasa", country: "CD", providerId: "654a3de5-b694-4fbc-943f-0331780849c3", loginUrl: "https://futuriss.unikinrdc.com/login", witnessDomain: "futuriss.unikinrdc.com" },
  { portalId: "iss-kin-cd", name: "ISS Kinshasa", university: "Institut Supérieur de Statistique de Kinshasa", country: "CD", providerId: "0eabf1ff-a7b0-444b-beb1-f56d0c7c351c", loginUrl: "https://iss-kin.optsolution.net/login", witnessDomain: "iss-kin.optsolution.net" },
  { portalId: "unilag-ng", name: "UNILAG, student portal", university: "University of Lagos", country: "NG", providerId: "41bb2902-daf8-44f1-a06a-5cd6b5cc9df5", loginUrl: "https://studentportal.unilag.edu.ng", witnessDomain: "unilag.edu.ng" },
];
