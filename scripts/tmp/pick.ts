import { contrastRatio } from "../../src/contrast.js";
const light = "#ffffff";
const dark = "#0b0b0c";
console.log("--- a border that identifies a control needs 3:1 ---");
for (const c of ["#9a9aa2", "#8e8e96", "#8a8a93", "#85858e", "#767680", "#6b7280"]) {
  console.log(`  ${c} on white  ${contrastRatio(c, light).toFixed(2)}:1`);
}
for (const c of ["#6e6e78", "#75757f", "#7c7c86", "#8a8a93"]) {
  console.log(`  ${c} on ${dark}  ${contrastRatio(c, dark).toFixed(2)}:1`);
}
console.log("--- a divider is decorative, 3:1 not required ---");
for (const c of ["#e4e4e7", "#27272a"]) {
  console.log(`  ${c}  light ${contrastRatio(c, light).toFixed(2)}:1  dark ${contrastRatio(c, dark).toFixed(2)}:1`);
}
console.log("--- the primary button: white text on the accent ---");
for (const c of ["#1d4ed8", "#1e40af", "#2563eb"]) {
  console.log(`  white on ${c}  ${contrastRatio("#ffffff", c).toFixed(2)}:1`);
}
console.log("--- dark mode primary: dark text on a light accent ---");
for (const c of ["#60a5fa", "#93c5fd"]) {
  console.log(`  #0b0b0c on ${c}  ${contrastRatio("#0b0b0c", c).toFixed(2)}:1`);
}
