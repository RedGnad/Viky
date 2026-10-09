import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultProviderDomain, ENROLMENT_FIELD, providerDomains, providerInstruction, RESULTS_FIELDS } from "../src/provider-instruction";

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

test("a university that already has a provider keeps its domains, in the instruction and in the command", () => {
  // Toulouse signs in on utoulouse.fr and keeps the record on mondossierweb.univ-tlse3.fr: its enrolment provider
  // reads both, and its results provider, proposed from the sign-in page alone, would have refused its first proof as
  // read on another site (found before any such proof, 9 Oct 2026).
  const toulouse = {
    portalId: "utoulouse-fr",
    university: "Université de Toulouse",
    country: "FR",
    loginUrl: "https://cas.utoulouse.fr/cas/login",
    enrolment: { domain: "utoulouse.fr,univ-tlse3.fr" },
    results: null,
  };
  assert.equal(providerDomains(toulouse), "utoulouse.fr,univ-tlse3.fr");
  assert.equal(providerDomains({ ...toulouse, enrolment: null }), "utoulouse.fr", "with no provider yet, the sign-in page's own");
  assert.equal(providerDomains({ ...toulouse, enrolment: { domain: null }, results: { domain: " Univ-Tlse3.fr " } }), "univ-tlse3.fr");
  const results = providerInstruction(toulouse, "results");
  assert.match(results, /Read them from a page on utoulouse\.fr or univ-tlse3\.fr\./);
  assert.match(results, /pnpm provider:add utoulouse-fr results <the provider's id> --domain utoulouse\.fr,univ-tlse3\.fr$/);
  assert.match(providerInstruction(toulouse, "enrolment"), /Read it from a page on utoulouse\.fr or univ-tlse3\.fr\./);
  // The command that registers it proposes the same domains when none is given.
  assert.match(readFileSync("scripts/provider-requests.ts", "utf8"), /const domain = \(at > 0 \? process\.argv\[at \+ 1\] : providerDomains\(portal\)\)\?\.trim\(\)\.toLowerCase\(\) \?\? null;/);
});

test("the results instruction asks for the last year that carries a result, and says a result is often a code", () => {
  const results = providerInstruction({ portalId: "utoulouse-fr", university: "Université de Toulouse", country: "FR", loginUrl: "https://cas.utoulouse.fr/cas/login" }, "results");
  // The page lists every year, the one under way with no result: "the latest year" read the year that has nothing.
  assert.doesNotMatch(results, /latest academic year/);
  assert.match(results, /read the most recent academic year that carries a result, never a year that has none/);
  assert.match(results, /The page may list several years, and the year under way with no result yet/);
  // The result is written as its code on the portal Toulouse runs ("ADM"): kept as written, and the pattern reads it.
  assert.match(results, /which is often a short code and not a word \(for example "ADM", "AJ", "Admis", "Validé", "Passed"\): keep it exactly as written/);
  assert.match(results, /the academic year those two are for, as printed \(for example "2025\/2026"\)/);
});
