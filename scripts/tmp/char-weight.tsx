import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Character, type CharacterState } from "../../app/kit/Character";
const states: CharacterState[] = ["toCome", "today", "catchable", "earned", "returned", "gift", "diamond"];
for (const size of ["small", "large"] as const) for (const state of states) {
  const html = renderToStaticMarkup(createElement(Character, { state, size, standing: size === "large" }));
  const styles = (html.match(/ style="[^"]*"/g) ?? []).join("").length;
  const paths = (html.match(/ d="[^"]*"/g) ?? []).join("").length;
  const parts = (html.match(/ data-part="[^"]*"/g) ?? []).join("").length;
  console.log(`${size.padEnd(5)} ${state.padEnd(9)} ${String(html.length).padStart(5)} bytes, style ${styles}, d ${paths}, data-part ${parts}`);
}
console.log(renderToStaticMarkup(createElement(Character, { state: "today", size: "small", standing: false })));
