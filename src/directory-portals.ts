import type { Portal } from "./portal-store";

/**
 * Student portals whose Reclaim provider already exists in the public directory and is used by other applications
 * (D199), pinned here the way the TOEFL's is (src/toefl-shown.ts): the provider's id, its version and the hash of its
 * one request, read on 23 Sep 2026 by the directory's own API (`/api/providers/explore/paginated`) and the
 * configuration the SDK fetches (`api.reclaimprotocol.org/api/providers/<id>/configs`). `pnpm portal:directory` writes
 * each as a portal row, marked unverified (D193), since no student has shown a proof from it to Viky yet.
 *
 * Kept only when a field any student has proves enrolment: a current term, a status, an active year. The six others
 * of the founder's list stay out, each for its reason, in docs/reclaim/directory-universities.md.
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
    usedBy: 3,
    read: "23 Sep 2026",
  },
];
