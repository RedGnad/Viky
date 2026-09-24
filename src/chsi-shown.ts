import { keccak256, stringToHex, type Hex } from "viem";
import { refuseShown, type ShownReading } from "./shown-proof";

/**
 * Enrolment in a Chinese university, shown from the Ministry of Education's own register, CHSI (学信网) (D215): the
 * person opens their own 教育部学籍在线验证报告 (the online verification report of their student status) with the
 * 在线验证码 they applied for, in the verification tab, and the page's 学籍状态 is what is read. Family "Exams & school", goal 27.
 *
 * Shown and not read for them, on the founder's instruction for a captcha: the report's page,
 * `https://www.chsi.com.cn/xlcx/bg.do?vcode=<code>&srcid=bgcx`, answers without a captcha for an invalid code
 * ("系统检测到非法访问，不合要求的在线验证码！", read 24 Sep 2026), but interposes an image captcha (`/xlcx/yzm.do`) for a
 * reader it does not take for a browser (a public parser of these reports, LenorEric/ChsiOnlineVerification, solves it
 * with a real browser). Answering a captcha is not a thing Viky's server does; the person, in their own browser, does.
 *
 * The report carries far more than a status: a photograph, the identity number, the birthday, the school, the major.
 * One field is extracted, the status; the verdict rule (D185) keeps it nowhere. The provider is ours, registered from
 * a real report; none exists yet, and no public report was found to test against.
 */

export const CHSI_SOURCE = "CHSI";
export const CHSI_GOAL_TYPE = 27;

export function chsiProviderId(): Hex {
  return keccak256(stringToHex("viky:provider:chsi-enrolment-shown:v1"));
}

/** The subject the funder signs: the same for every gift on the line, as the TOEFL's, since the page carries no name they could sign. */
export const CHSI_SUBJECT: Hex = keccak256(stringToHex("viky:subject:chsi-enrolment-shown:v1"));

/** A provider of ours, pinned once registered from a real report: nothing yet. */
export type ChsiProvider = Readonly<{ id: string; version: string; requestHash: string }>;
export const CHSI_PROVIDER: ChsiProvider | null = null;

export const CHSI_NOT_REGISTERED = "This condition's provider is not registered yet: it is built from a real CHSI report first, and nothing can be shown until then.";

/** Where the person goes, in their own browser: the report check page, where they type their 在线验证码. */
export const CHSI_LOGIN_URL = "https://www.chsi.com.cn/xlcx/bgcx.jsp";

export const CHSI_ENROLLED = 1;

/** The 学籍状态 the report prints, "在籍（注册学籍）" for a student enrolled now: enrolled, or refused by name. */
export function readChsiStatus(fields: Readonly<Record<string, string>>): ShownReading {
  const status = (fields.status ?? "").trim();
  if (!status) return refuseShown("NO_STATUS", "The report shown carries no student status.");
  if (!status.startsWith("在籍")) return refuseShown("NOT_ENROLLED", "The report shown does not say enrolled.");
  return { metricValue: BigInt(CHSI_ENROLLED), eventAt: null, accountKey: null, inWords: "Enrolled" };
}
