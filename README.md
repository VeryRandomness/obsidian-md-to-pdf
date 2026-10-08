# MD to PDF Export

Turn any Obsidian note into a nicely styled PDF with one click. Works on desktop and mobile.

## Install (about 2 minutes)

You don't need a GitHub account. You do need [Obsidian](https://obsidian.md) installed and a vault open.

**Step 1: install the helper plugin (one time only)**

1. In Obsidian, click the **gear icon** (bottom-left) to open **Settings**.
2. Click **Community plugins**. If you see a button that says **Turn on community plugins**, click it.
3. Click **Browse**, search for **BRAT**, click it, then click **Install**, then **Enable**.

**Step 2: add this plugin**

1. Open the Obsidian **Command palette** (press `Ctrl+P`, or `Cmd+P` on a Mac).
2. Type **BRAT: Add a beta plugin for testing** and press Enter.
3. Paste this exactly, then click **Add Plugin**:

   ```
   VeryRandomness/obsidian-md-to-pdf
   ```

4. When it says it's installed, go to **Settings → Community plugins** and switch **MD to PDF Export** on.

That's it.

## How to use it

1. Open the note you want to export.
2. Click the **file-output icon** in the left ribbon, or open the Command palette and run **Export current note to PDF**.
3. Wait a few seconds while it says "Rendering PDF…". The PDF is then saved or offered for download.

## Updates

Updates install themselves. Each time you open Obsidian, the plugin checks for a newer version and installs it, then shows a short message. To check right away, open the Command palette and run **MD to PDF Export: Check for update now**.

## Installing without BRAT (manual)

1. Go to the [Releases page](https://github.com/VeryRandomness/obsidian-md-to-pdf/releases/latest) and download `main.js`, `manifest.json` and `styles.css` (if listed).
2. In Obsidian, open **Settings → Community plugins** and click the **folder icon** next to "Installed plugins".
3. Create a new folder named `md-to-pdf` and put the downloaded files inside it.
4. Restart Obsidian, then switch the plugin on under **Settings → Community plugins**.

## Something not working?

[Open an issue](https://github.com/VeryRandomness/obsidian-md-to-pdf/issues) or message Chris.
