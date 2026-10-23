// Heavy export dependencies, built into a separate lib.js that main.ts loads
// on the first export. Keeping them out of main.js keeps Obsidian's startup
// read/parse of this plugin tiny.
export { default as jsPDF } from "jspdf";
export { default as html2canvas } from "html2canvas-pro";
