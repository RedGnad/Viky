import ts from "typescript";

/**
 * The product rule "words the user must never see": wallet, gas, chain, seed, token, transaction hash,
 * address (CLAUDE.md). `scanSource` finds them in text a person can read: JSX text, JSX text attributes
 * (placeholder, title, alt, aria-label, label), sentence-like string and template literals. Identifiers
 * are code, not text, and are never flagged; a single-word literal outside JSX is treated as a code or a
 * key. A line that must keep such a word for a reason carries `consumer-words: allow <reason>`.
 */

export const FORBIDDEN_WORDS = /\b(wallets?|gas|chains?|seeds?|tokens?|transaction hash(?:es)?|address(?:es)?)\b/i;
const JSX_TEXT_ATTRIBUTES = new Set(["placeholder", "title", "alt", "aria-label", "label"]);

export type Finding = { file: string; line: number; text: string };

function isCodeLike(text: string): boolean {
  return !/\s/.test(text.trim());
}

export function scanSource(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n");
  const findings: Finding[] = [];
  const report = (node: ts.Node, value: string) => {
    if (!FORBIDDEN_WORDS.test(value)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    if ([lines[line] ?? "", lines[line - 1] ?? ""].some((l) => l.includes("consumer-words: allow"))) return;
    findings.push({ file, line: line + 1, text: value.trim().slice(0, 140) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      report(node, node.getText(source));
    } else if (ts.isJsxAttribute(node)) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) {
        if (JSX_TEXT_ATTRIBUTES.has(node.name.getText(source))) report(init, init.text);
        return; // className, href, type and the like are code
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const isKey = Boolean(parent) && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node;
      const inJsx = Boolean(parent) && ts.isJsxExpression(parent);
      if (!isKey && (inJsx || !isCodeLike(node.text))) report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const pieces = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
      if (!isCodeLike(pieces)) report(node, pieces);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}
