import { App, MarkdownRenderer, Notice, Plugin, TFile } from "obsidian";
import { setupAutoUpdate } from "./updater";
// jspdf and html2canvas-pro are ~1MB combined; they're loaded lazily on the
// first export (see exportToPdf) so they don't add to Obsidian's startup time.

// Must match the `scale` option passed to html2canvas below — used to convert
// DOM (CSS-pixel) link positions into canvas-pixel positions.
const RENDER_SCALE = 2;

interface LinkRect {
	xPx: number;
	yPx: number;
	wPx: number;
	hPx: number;
	url: string;
}

export default class MdToPdfPlugin extends Plugin {
	async onload() {
		setupAutoUpdate(this, "VeryRandomness/obsidian-md-to-pdf");
		this.addCommand({
			id: "export-current-note-to-pdf",
			name: "Export current note to PDF",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) this.exportToPdf(file);
				return true;
			},
		});

		this.addRibbonIcon("file-output", "Export note to PDF", () => {
			const file = this.app.workspace.getActiveFile();
			if (!file || file.extension !== "md") {
				new Notice("Open a markdown note first.");
				return;
			}
			this.exportToPdf(file);
		});
	}

	async exportToPdf(file: TFile) {
		const notice = new Notice("Rendering PDF…", 0);
		const container = createDiv({ cls: "md-pdf-export-container" });
		// Positioned at real, in-viewport coordinates (0,0) but tucked behind the
		// real UI with a negative z-index. Placing it far off-screen (e.g. large
		// negative left) instead breaks html2canvas in Electron: a transformed
		// ancestor can make `position: fixed` relative to itself rather than the
		// true viewport, clipping anything outside its bounds to nothing — which
		// is what produced the blank/white output.
		container.style.position = "fixed";
		container.style.top = "0";
		container.style.left = "0";
		container.style.zIndex = "-9999";
		container.style.pointerEvents = "none";
		container.style.width = "780px";
		container.style.background = "#ffffff";
		document.body.appendChild(container);

		try {
			const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
				import("jspdf"),
				import("html2canvas-pro"),
			]);

			const content = await this.app.vault.cachedRead(file);
			await MarkdownRenderer.render(this.app, content, container, file.path, this);

			await waitForImages(container);
			// let embeds/canvas settle a beat before we rasterize
			await new Promise((r) => setTimeout(r, 150));

			if (container.offsetWidth === 0 || container.offsetHeight === 0) {
				throw new Error("Rendered note has zero size — nothing to export.");
			}

			const links = collectLinks(container, file, this.app);

			const canvas = await html2canvas(container, {
				scale: RENDER_SCALE,
				useCORS: true,
				allowTaint: true,
				backgroundColor: "#ffffff",
				logging: false,
				windowWidth: container.scrollWidth,
			});

			if (isBlankCanvas(canvas)) {
				throw new Error(
					"Capture came out blank. Try again after the note has fully finished rendering."
				);
			}

			const pdf = new jsPDF({ unit: "pt", format: "a4" });
			const pageWidth = pdf.internal.pageSize.getWidth();
			const pageHeight = pdf.internal.pageSize.getHeight();
			const margin = 36;
			const contentWidth = pageWidth - margin * 2;
			const contentHeight = pageHeight - margin * 2;

			// pdf-points per canvas-pixel, so the raster lines up with the page width
			const scale = contentWidth / canvas.width;
			const sliceHeightPx = Math.floor(contentHeight / scale);

			let renderedHeight = 0;
			let firstPage = true;
			while (renderedHeight < canvas.height) {
				const sliceHeight = Math.min(sliceHeightPx, canvas.height - renderedHeight);

				const sliceCanvas = document.createElement("canvas");
				sliceCanvas.width = canvas.width;
				sliceCanvas.height = sliceHeight;
				const ctx = sliceCanvas.getContext("2d");
				if (!ctx) throw new Error("Could not get canvas context");
				ctx.drawImage(
					canvas,
					0, renderedHeight, canvas.width, sliceHeight,
					0, 0, canvas.width, sliceHeight
				);

				if (!firstPage) pdf.addPage();
				pdf.addImage(
					sliceCanvas.toDataURL("image/jpeg", 0.95),
					"JPEG",
					margin,
					margin,
					contentWidth,
					sliceHeight * scale
				);

				for (const link of links) {
					const top = Math.max(link.yPx, renderedHeight);
					const bottom = Math.min(link.yPx + link.hPx, renderedHeight + sliceHeight);
					if (bottom <= top) continue; // doesn't fall on this page

					pdf.link(
						margin + link.xPx * scale,
						margin + (top - renderedHeight) * scale,
						link.wPx * scale,
						(bottom - top) * scale,
						{ url: link.url }
					);
				}

				renderedHeight += sliceHeight;
				firstPage = false;
			}

			const arrayBuffer = pdf.output("arraybuffer");
			const pdfPath = file.path.replace(/\.md$/i, ".pdf");
			const existing = this.app.vault.getAbstractFileByPath(pdfPath);
			if (existing instanceof TFile) {
				await this.app.vault.modifyBinary(existing, arrayBuffer);
			} else {
				await this.app.vault.createBinary(pdfPath, arrayBuffer);
			}

			notice.hide();
			new Notice(`Exported to ${pdfPath}`);
		} catch (err) {
			console.error("md-to-pdf export failed", err);
			notice.hide();
			new Notice(`PDF export failed: ${(err as Error).message}`);
		} finally {
			container.remove();
		}
	}
}

function collectLinks(container: HTMLElement, file: TFile, app: App): LinkRect[] {
	const containerRect = container.getBoundingClientRect();
	const links: LinkRect[] = [];

	for (const a of Array.from(container.querySelectorAll("a"))) {
		const url = resolveLinkUrl(a as HTMLAnchorElement, file, app);
		if (!url) continue;

		const rect = a.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) continue;

		links.push({
			xPx: (rect.left - containerRect.left) * RENDER_SCALE,
			yPx: (rect.top - containerRect.top) * RENDER_SCALE,
			wPx: rect.width * RENDER_SCALE,
			hPx: rect.height * RENDER_SCALE,
			url,
		});
	}

	return links;
}

// Wikilinks (and markdown links that resolve to a note in the vault) get an
// obsidian:// deep link so clicking them reopens the target note. Anything
// else that's already a complete URI — https, mailto, tel, or even a
// hand-written obsidian:// action link — passes through untouched: it's not
// a vault-relative path to resolve, it's already the destination.
function resolveLinkUrl(a: HTMLAnchorElement, file: TFile, app: App): string | null {
	const rawHref = a.getAttribute("href");
	const dataHref = a.dataset["href"];

	// data-href is set only for links Obsidian recognizes as internal
	// (wikilinks, and markdown links pointing at a file inside the vault) —
	// it holds the raw, unencoded link target to resolve against the vault.
	if (dataHref) {
		let linktext = dataHref.split("#")[0]; // drop #heading / ^blockref suffix
		try {
			linktext = decodeURIComponent(linktext);
		} catch {
			// already decoded — use as-is
		}
		if (!linktext) return null;

		const dest = app.metadataCache.getFirstLinkpathDest(linktext, file.path);
		if (!dest) return null;

		const vault = encodeURIComponent(app.vault.getName());
		const path = encodeURIComponent(dest.path.replace(/\.md$/i, ""));
		return `obsidian://open?vault=${vault}&file=${path}`;
	}

	// No data-href means this anchor's href is already a real, complete URL —
	// whatever its scheme (https:, mailto:, obsidian:, etc.) — so use it as-is.
	if (rawHref && /^[a-z][a-z0-9+.-]*:/i.test(rawHref)) return rawHref;

	return null;
}

function waitForImages(container: HTMLElement): Promise<void> {
	const images = Array.from(container.querySelectorAll("img"));
	if (images.length === 0) return Promise.resolve();

	return Promise.all(
		images.map(
			(img) =>
				new Promise<void>((resolve) => {
					if (img.complete) {
						resolve();
						return;
					}
					const done = () => {
						img.removeEventListener("load", done);
						img.removeEventListener("error", done);
						resolve();
					};
					img.addEventListener("load", done);
					img.addEventListener("error", done);
					// don't let one broken image hang the whole export
					setTimeout(done, 8000);
				})
		)
	).then(() => undefined);
}

function isBlankCanvas(canvas: HTMLCanvasElement): boolean {
	const ctx = canvas.getContext("2d");
	if (!ctx) return true;

	// Sample a grid of points rather than the whole canvas (which can be
	// multiple megapixels) — enough to catch an all-white/blank capture
	// without a noticeable performance hit.
	const cols = 20;
	const rows = 20;
	for (let i = 0; i < cols; i++) {
		for (let j = 0; j < rows; j++) {
			const x = Math.floor((canvas.width * i) / cols);
			const y = Math.floor((canvas.height * j) / rows);
			const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
			if (a > 0 && (r < 250 || g < 250 || b < 250)) return false;
		}
	}
	return true;
}
