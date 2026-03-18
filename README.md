# vibero-work

Runtime-level Git workspace for secondary development of a packaged Vibero desktop app.

This repository tracks the unpacked contents of `omni.ja`, which is where most of the shipped app code lives. It is suitable for patching, debugging, repacking, and reinstalling a modified app bundle.

## What This Repository Is

- An unpacked working tree of a shipped `Vibero.app`
- A Git-friendly way to patch runtime files and keep diffs small
- A repack/install workflow for writing a new `omni.ja` back into the app

## What This Repository Is Not

- It is not the original upstream source monorepo
- It does not fully restore every pre-build source artifact
- Some files are still bundled build outputs rather than authoring-time source

## Packaging Model

Vibero is still structurally a Zotero/Gecko desktop application.

- The macOS app bundle contains `Contents/Resources/app/`
- `application.ini` defines the app/XRE metadata and Gecko compatibility
- `omni.ja` is a zip archive containing most runtime resources
- `chrome.manifest` maps `chrome://zotero/...` and `resource://zotero/...` URLs to files inside `omni.ja`
- `hyphenation/` sits beside `omni.ja` as an external resource directory

The practical result is that runtime patching is straightforward: unpack `omni.ja`, edit files, zip it again, and copy it back into the app bundle.

## Unpack Workflow

Prepare a clean workspace from a packaged app:

```bash
mkdir -p <workspace>
cd <workspace>

cp /path/to/Vibero.app/Contents/Resources/app/application.ini .
cp -R /path/to/Vibero.app/Contents/Resources/app/hyphenation .
cp /path/to/Vibero.app/Contents/Resources/app/omni.ja .

mkdir -p omni
unzip -q omni.ja -d omni
git init
```

## Repository Layout

- `omni/`: unpacked runtime files from `omni.ja`
- `application.ini`: app metadata copied from the packaged app
- `hyphenation/`: copied resource directory from the packaged app
- `build/`: generated artifacts such as rebuilt `omni.ja`
- `repack.sh`: rebuild/install helper

## Rebuild

Repack the current `omni/` tree into a fresh archive:

```bash
./repack.sh
```

This writes:

```text
build/omni.ja
```

## Install Back Into The App

Install the rebuilt archive into a target app bundle:

```bash
./repack.sh --install /path/to/Vibero.app
```

Or set the app path once through an environment variable:

```bash
export VIBERO_APP_PATH=/path/to/Vibero.app
./repack.sh --install
```

The script always creates a timestamped backup of the target `omni.ja` before replacing it.

## Launch A Patched App

Normal launch:

```bash
open -na /path/to/Vibero.app
```

Launch with a specific runtime entry and profile:

```bash
open -na /path/to/Vibero.app --args \
  -app /path/to/Vibero.app/Contents/Resources/app/application.ini \
  -profile /path/to/profile
```

## How Vibero Is Layered On Top Of Zotero

This fork keeps Zotero as the desktop application base and adds Vibero-specific modules on top.

### 1. Zotero Remains The Base Application

- App identity and a large part of the runtime still follow Zotero conventions
- Core Gecko/XUL/XPCOM plumbing is preserved
- The `chrome://zotero/...` namespace is still the main application namespace

### 2. Vibero Adds Its Own Modules Into Zotero Startup

Vibero-specific modules are loaded into the Zotero runtime, including:

- `vibeDB`
- `vibeDBSync`
- `vibeDBCloudSync`

These modules extend Zotero rather than living as an external add-on.

### 3. Vibero Stores AI Reading Data In A Separate Database

The fork introduces a dedicated SQLite database layer, `VibeDB`, instead of heavily modifying Zotero's main database.

That database stores paper-specific AI artifacts such as:

- parsed paper records
- markdown content
- section trees
- paragraphs
- points
- sentences
- summary cards
- flash cards

The link back to Zotero is primarily through `item_id`.

### 4. Reader Integration Is Split Across Two Layers

The reader stack has a clear split:

- privileged bridge layer: `chrome/content/zotero/xpcom/reader.js`
- content/UI layer: `resource/reader/reader.js`

The privileged layer can access local files, preferences, XPCOM services, databases, and network requests. The content layer is the visible reading UI and is already a bundled artifact.

### 5. AI And PDF Parsing Are Added As Runtime Services

The main AI-related customizations are layered into:

- `chrome/content/zotero/ai-chat-iframe.html`
- `chrome/content/zotero/xpcom/pdfParsing/`
- `chrome/content/zotero/xpcom/pdfParsing/LLMApi/llmapi.js`

This is where custom provider configuration, chat behavior, PDF parsing, MinerU integration, and summary generation are connected.

### 6. Vibero Overrides Zotero's Update Path

The fork disables Zotero's normal update path and uses Vibero-specific version/update preferences instead.

## Development Findings

The unpacking and debugging work exposed a few practical facts about the project:

- `omni.ja` is a standard zip archive, so unpack/repack is low-friction
- Many files under `chrome/content/zotero/` are still readable source-level runtime code
- Some files under `resource/` are bundled outputs and are less pleasant to modify
- Vibero's AI stack spans multiple layers: UI, reader bridge, local SQLite, remote auth, PDF parsing, and model providers
- Custom model configuration is not the same thing as the PDF parsing backend; those are separate chains
- The fork is intentionally low-coupled to Zotero's main data model by keeping AI reading state in `VibeDB`

## Recommended Secondary Development Workflow

1. Edit files under `omni/`
2. Rebuild with `./repack.sh`
3. Install with `./repack.sh --install /path/to/Vibero.app`
4. Launch the app and verify behavior
5. Commit only the unpacked sources and scripts, not built artifacts

## First Commit In A Fresh Workspace

```bash
git add .
git commit -m "chore: initialize unpacked Vibero workspace"
```
