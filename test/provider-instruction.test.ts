import assert from "node:assert/strict";
import test from "node:test";
import { defaultProviderDomain, ENROLMENT_FIELD, providerInstruction, RESULTS_FIELDS } from "../src/provider-instruction";

/**
 * The instruction a university's provider is built from (D313): the fields it names are the ones `pnpm portal:pin`
 * reads, and the domain it proposes is the university's own, or the portal's host on a platform several share.
 */
test("the default domain is the university's own, and a shared platform's host", () => {
  assert.equal(defaultProviderDomain("https://studentcenter.ucad.sn/login"), "ucad.sn");
  assert.equal(defaultProviderDomain("https://si.uadb.edu.sn/etudiant/user/login"), "uadb.edu.sn");
  assert.equal(defaultProviderDomain("https://unikin.optsolution.net/"), "unikin.optsolution.net", "another tenant of the platform cannot stand in");
  assert.equal(defaultProviderDomain("https://uam.campusniger.com/auth/login"), "uam.campusniger.com");
  assert.equal(defaultProviderDomain("not a url"), null);
});

test("each sense's instruction names its fields, its domain, what is never extracted, and the command that registers it", () => {
  const unikin = { portalId: "unikin-cd", university: "Université de Kinshasa", country: "CD", loginUrl: "https://unikin.optsolution.net/" };
  const enrolment = providerInstruction(unikin, "enrolment");
  assert.match(enrolment, /Université de Kinshasa \(Congo - Kinshasa\), enrolment\./);
  assert.ok(enrolment.includes(`\`${ENROLMENT_FIELD}\``));
  assert.match(enrolment, /Read it from a page on unikin\.optsolution\.net\./);
  assert.match(enrolment, /no name, no student number/);
  assert.match(enrolment, /pnpm provider:add unikin-cd enrolment <the provider's id> --domain unikin\.optsolution\.net$/);
  const results = providerInstruction(unikin, "results");
  for (const field of Object.values(RESULTS_FIELDS)) assert.ok(results.includes(`\`${field}\``), field);
  assert.match(results, /no individual course grades/);
});
