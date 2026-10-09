import type { PortalInput } from "./portal-store";

/**
 * Student portals whose Reclaim provider already exists in the public directory and is used by other applications
 * (D199), pinned here the way the TOEFL's is (src/toefl-shown.ts): the provider's id, its version and the hash of its
 * one request, read on 23 Sep 2026 by the directory's own API (`/api/providers/explore/paginated`) and the
 * configuration the SDK fetches (`api.reclaimprotocol.org/api/providers/<id>/configs`). `pnpm portal:directory` writes
 * each as a portal row, marked unverified (D193), since no student has shown a proof from it to Viky yet.
 *
 * Rome's proves enrolment, a current term, and is its enrolment provider. Four more (D267) prove a signed-in student
 * account alone, which is not a sense since D313: the universities are listed, without a provider. HUJI stays out: its
 * patterns carry one student's own name and number. docs/reclaim/directory-universities.md says each one.
 */
export type DirectoryPortal = Omit<PortalInput, "provenBy" | "unverified" | "provenAt" | "results"> &
  Readonly<{
    usedBy: number;
    read: string;
    /**
     * The day Reclaim's own record of the provider was read saying Reclaim approved it (`isApproved`, on
     * `api.reclaimprotocol.org/api/providers/<id>`, its `/configs` and the directory's own listing). Absent for a
     * provider that is not approved, or not read: a university is then never said ready on Reclaim's check.
     */
    approved?: string;
    /** How the judges page names the university in a line of its own: "Rome". */
    said?: string;
  }>;

export const DIRECTORY_PORTALS: readonly DirectoryPortal[] = [
  {
    portalId: "aur-it",
    name: "AUR, my.aur.edu",
    university: "The American University of Rome",
    country: "IT",
    // "American University of Rome", "Student Status", version 1.0.0, WITNESS, used by three applications.
    providerId: "8a769077-53f8-4bbb-b75f-d2afe3eb6a42",
    providerVersion: "1.0.0",
    // The hash a proof of this version carries, as Reclaim's own library works it out from the published request
    // (`fetchProviderHashRequirementsBy`, read 9 Oct 2026; the same working-out gives the hash Toulouse's real proofs
    // carry). The configuration also publishes a `requestHash` field, 0xe754...f18c, which is not that hash: this row
    // held it until 9 Oct 2026, and a proof from Rome would not have fitted it. No student of Rome has shown one yet.
    requestHash: "0x19bf1b0a18b2f66b9612b82348e97e070fd076db972d279131cdaf15beba11c2",
    // Approved by Reclaim and active, by its own record of the provider, its configuration and the directory's listing,
    // all three read on 9 Oct 2026 (`isApproved: true`, `isActive: true`). Not "verified", which is another mark of
    // Reclaim's (`isVerified: false`).
    approved: "9 Oct 2026",
    said: "Rome",
    loginUrl: "https://my.aur.edu/ics",
    // `GET https://my.aur.edu/ICS/Student/`: the student's own course schedule page, "Course Schedule for <name>", and
    // the term it is for, "<term> - All Divisions". A schedule of this academic year is what says enrolled now.
    extract: {
      field: "Current_semester",
      matches: "(Fall|Spring|Summer).*20(26|27)|20(26|27).*(Fall|Spring|Summer)",
      keeps: "whether the student's own course schedule is for a term of the 2026-2027 academic year, and nothing else",
    },
    usedBy: 3,
    read: "23 Sep 2026",
  },
  // Four more on the founder's decision of 26 Sep 2026 (D267), whose providers prove a signed-in student account and no
  // enrolment status. Since D313 a student account is not a sense a gift is made on: the universities stay listed, and
  // their providers of enrolment and results are asked for when a gift needs them. What each existing provider reads is
  // kept in the comments below, as it was read on 26 Sep 2026.
  {
    portalId: "aus-ae",
    name: "AUS, iLearn",
    university: "American University of Sharjah",
    country: "AE",
    // "American University of Sharjah", version 1.0.0, WITNESS, verified by Reclaim: the learning platform's own record
    // of the signed-in user (`GET https://ilearn.aus.edu/learn/api/{{URL_PARAMS_1}}/users/me`), name, email, department.
    loginUrl: "https://ilearn.aus.edu/",
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
    loginUrl: "https://my.university.innopolis.ru/profile/personal-form/index?tab=education",
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
    loginUrl: "https://ignou.samarth.edu.in/index.php/site/login",
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
    loginUrl: "https://eco.du.ac.bd/dashboard/login?redirect=%2Fdashboard",
    usedBy: 1,
    read: "26 Sep 2026",
  },
];

/**
 * The corridor's universities (D313, the founder's decisions of 28 Sep 2026), written before the world's list and kept
 * here because each was looked up by hand: the portal a student signs in at, read on 28 Sep 2026 with the portal agent
 * and opened one by one (docs/reclaim/directory-universities.md, "The corridor's student portals"). Reclaim's directory
 * holds each only as a generic AI provider, which reads no sense: the providers of enrolment and results are built per
 * university from the exact instruction a gift's request carries (src/provider-instruction.ts), each with its own
 * domain. `sourceProviderId` is the directory's provider the row came from, kept to find it again.
 *
 * IHET (Tunis) and MIT Polytech (Tunis) were taken out on 28 Sep 2026: no portal of theirs can be read, the first a
 * plain http page on a bare address, the second a server name that no longer resolves. UNIKIN stays, on its live
 * platform: the directory's `futuriss.unikinrdc.com` is a parked domain.
 */
export type CorridorPortal = Readonly<{ portalId: string; name: string; university: string; country: string; loginUrl: string; sourceProviderId: string }>;

export const CORRIDOR_PORTALS: readonly CorridorPortal[] = [
  { portalId: "ucad-sn", name: "UCAD, student center", university: "Université Cheikh Anta Diop", country: "SN", sourceProviderId: "10560c0d-b009-412b-8e78-762d79fa7cc4", loginUrl: "https://studentcenter.ucad.sn/login" },
  // Every ugb.sn host times out from outside Senegal; the web archive of ugb.sn sends registration to this portal.
  { portalId: "ugb-sn", name: "UGB", university: "Université Gaston Berger", country: "SN", sourceProviderId: "4a2d6851-816a-4a47-89fc-c8dd7d6d5004", loginUrl: "https://portail.ugbnumerique.sn/" },
  // The directory calls it "Dakar Bourguiba University"; its portal is on uadb.edu.sn, Alioune Diop University of Bambey's.
  { portalId: "uadb-sn", name: "UADB, student portal", university: "Université Alioune Diop de Bambey", country: "SN", sourceProviderId: "cf828716-404b-4082-a060-8f0104cb1bd5", loginUrl: "https://si.uadb.edu.sn/etudiant/user/login" },
  { portalId: "udb-sn", name: "UDB", university: "Université Dakar Bourguiba", country: "SN", sourceProviderId: "137ef038-deed-4491-a846-73a4e39d1532", loginUrl: "https://udb.sn/login" },
  { portalId: "bem-sn", name: "BEM", university: "BEM Dakar Management School", country: "SN", sourceProviderId: "3d6b05b9-ac27-4998-940e-7f3fccb2de92", loginUrl: "https://bem.sn/connecter" },
  { portalId: "fhb-ci", name: "UFHB, mon espace", university: "Université Félix Houphouët-Boigny", country: "CI", sourceProviderId: "f0ead2b0-632e-4cad-9736-87e82eb8900c", loginUrl: "https://w.univ-fhb.edu.ci/mon-espace/" },
  { portalId: "univh2c-ma", name: "UH2C, ENT", university: "Université Hassan II de Casablanca", country: "MA", sourceProviderId: "e4f0b1c9-29e1-4232-9c58-db20b921bf99", loginUrl: "https://ent.univh2c.ma/uPortal/f/welcome/normal/render.uP" },
  { portalId: "um5-ma", name: "UM5, ETU-SERVICES", university: "Université Mohammed V de Rabat", country: "MA", sourceProviderId: "43efdd95-2e73-4cb2-8e80-6b2bfd5a732b", loginUrl: "https://etu.um5.ac.ma/" },
  { portalId: "uir-ma", name: "UIR, Learning Hub", university: "Université Internationale de Rabat", country: "MA", sourceProviderId: "2a959393-d9d1-46dd-93db-adad45014278", loginUrl: "https://connect.uir.ac.ma/" },
  { portalId: "mines-rabat-ma", name: "ENSMR, espace étudiant", university: "École Nationale Supérieure des Mines de Rabat", country: "MA", sourceProviderId: "0b3acda1-a1ef-4668-b3c6-baa38a8652da", loginUrl: "https://my.mines-rabat.ma/" },
  { portalId: "upm-ma", name: "UPM, extranet", university: "Université Privée de Marrakech", country: "MA", sourceProviderId: "3de473be-df5d-435e-9c90-3e01539d5ce9", loginUrl: "https://extranet.upm.ac.ma/" },
  { portalId: "supdeco-ma", name: "Sup de Co Marrakech", university: "École Supérieure de Commerce de Marrakech", country: "MA", sourceProviderId: "a321b00f-e485-4556-91e1-fd49e9adb6c3", loginUrl: "https://start.supdeco.ma/" },
  // The directory's elearning.iambamako.com does not resolve; the platform is on elearning-iambamako.com.
  { portalId: "iam-ml", name: "IAM, e-learning", university: "International Institute of Management of Bamako", country: "ML", sourceProviderId: "a6aa673a-f870-4d16-998b-6d64853beaaa", loginUrl: "https://elearning-iambamako.com/" },
  { portalId: "uam-ne", name: "UAM, campus", university: "Université Abdou Moumouni de Niamey", country: "NE", sourceProviderId: "4ae9a026-6acf-4972-9741-28994edb39eb", loginUrl: "https://uam.campusniger.com/auth/login" },
  { portalId: "esc-ouaga-bf", name: "ESC Ouaga, espace étudiant", university: "École Supérieure de Commerce de Ouagadougou", country: "BF", sourceProviderId: "663a4e6a-13ff-4fb3-a7ad-b759051cd830", loginUrl: "https://esc-ouaga.com/connexion/" },
  { portalId: "unikin-cd", name: "UNIKIN, plateforme digitale", university: "Université de Kinshasa", country: "CD", sourceProviderId: "654a3de5-b694-4fbc-943f-0331780849c3", loginUrl: "https://unikin.optsolution.net/" },
  { portalId: "iss-kin-cd", name: "ISS Kinshasa, espace étudiant", university: "Institut Supérieur de Statistique de Kinshasa", country: "CD", sourceProviderId: "0eabf1ff-a7b0-444b-beb1-f56d0c7c351c", loginUrl: "https://iss-kin.optsolution.net/student/connexion" },
  { portalId: "unilag-ng", name: "UNILAG, student portal", university: "University of Lagos", country: "NG", sourceProviderId: "41bb2902-daf8-44f1-a06a-5cd6b5cc9df5", loginUrl: "https://studentportal.unilag.edu.ng/" },
];

/**
 * Universities added by hand outside the corridor, each once its provider exists (D313). The Université de Toulouse
 * (the founder, 29 Sep 2026): Paul Sabatier's until 1 January 2025, missing from Reclaim's directory under that name,
 * neither Toulouse Capitole nor Jean Jaurès. Its students sign in at ent.utoulouse.fr through auth.utoulouse.fr; its
 * enrolment provider `c560dffd` reads its own two domains, utoulouse.fr and univ-tlse3.fr, registered with
 * `pnpm provider:add`. Its name carries "(Paul Sabatier)" (the founder, 29 Sep 2026), so a student of Paul Sabatier knows it
 * beside Capitole and Jean Jaurès.
 */
export const ADDED_PORTALS: readonly CorridorPortal[] = [
  { portalId: "utoulouse-fr", name: "Université de Toulouse, ENT", university: "Université de Toulouse (Paul Sabatier)", country: "FR", sourceProviderId: "c560dffd-5f37-4b8a-94ed-106ce9e9ee27", loginUrl: "https://ent.utoulouse.fr/" },
];
