# BAM Config Editor

Standalone admin tool for visually editing the contents of `config.js`. Built to make adding/editing unit types, certifications, missions, and the rest of `BAM_CONFIG` faster and less error-prone than hand-editing the 1,800-line file.

This tool **never writes to `config.js`**. It loads the live config, lets you edit a draft, and emits a copy-paste JS snippet you paste back into `config.js` yourself. Your surrounding comments stay untouched.

---

## Launch

The tool lives in `tools/config-editor/` and is **not part of the shipped game** — `index.html` does not load it.

**Easiest way (with Live Server in VSCode):**

1. Right-click `tools/config-editor/index.html` → `Open with Live Server`.
2. The tool loads `../../config.js` as a global and you're done.

**Alternative:** open `tools/config-editor/index.html` directly in a browser via `file://`. Works fine because everything is client-side.

No backend required. No `npm install`. No build step.

---

## Workflow

1. Pick a tab at the top (Unit Types, Certifications, Missions, etc.).
2. Pick an entry in the left list — or click `+ New` / `⎘ Duplicate` to create one.
3. Edit fields on the right. Validation warnings appear inline (yellow = warning, red = error). Save is never blocked — you own the final paste.
4. Look at the Output pane on the right:
   - **Just this entry** — emits one entry, ready to paste over the existing entry in `config.js`. Use this 90% of the time.
   - **Full section block** — emits the whole section. Useful for big reshuffles.
5. Click **📋 Copy**.
6. Open `config.js`, find the target entry/block, replace it with what's on your clipboard, save.
7. Reload the game to see the change. Done.

If you mess up the draft, click **↺ Revert** to reload from the live `config.js`.

---

## What it covers

Tabs available in v1:

| Tab | Section it edits |
|---|---|
| Unit Types | `BAM_CONFIG.unitTypes` — full seat editor included |
| Certifications | `BAM_CONFIG.certifications` |
| Upgrades | `BAM_CONFIG.upgrades` |
| Missions | `BAM_CONFIG.missions` — including requirement-slot editor |
| Injuries | `BAM_CONFIG.injuryTypes` |
| Hospital Depts | `BAM_CONFIG.hospitalDepartments` |
| Charges | `BAM_CONFIG.chargeTiers` |
| Station Types | `BAM_CONFIG.stationTypeDefs` |
| Ranks | `BAM_CONFIG.rankConfig` (per-service rank ladders) |
| Shifts | `BAM_CONFIG.shiftTemplates` |
| Service Tags | `BAM_CONFIG.serviceTags` |
| Economy | `BAM_CONFIG.economy` |
| Spawn | `BAM_CONFIG.spawn` |
| UI | `BAM_CONFIG.ui` |
| Map | `BAM_CONFIG.map` |
| Tuning | All loose top-level scalars (crewScore*, volunteer*, salary*, etc.) |

Cross-tab references work: add a new cert on the Certifications tab and it shows up immediately in the unit-seat dropdown without reloading.

---

## How the output formatter behaves

- 2-space indent, single quotes, trailing commas — matches `config.js` style.
- Key order follows the schema declaration in `schemas.js`, not draft mutation order. Re-serializing the same entry produces byte-identical output, so diffs stay small.
- `Infinity` is emitted as a literal, not `null`.
- Comments are NEVER emitted by the tool. If you want a comment, write it yourself in `config.js`. This is intentional — the tool stays out of the way of your inline documentation.
- Compact-mode sections (certs, charge tiers, injury types, etc.) emit one entry per line for diff-friendliness.

---

## Adding a new section to the editor

If `config.js` grows a new top-level section, add it to the editor in three steps:

1. Open `tools/config-editor/schemas.js`.
2. Add an entry to `SECTIONS`:

   ```js
   mySection: {
     label: 'My Section',
     kind: 'keyedDict',                 // or 'singleObject' / 'objectArray'
     configPath: 'mySection',
     entryName: 'thing',
     fields: [
       { key: 'label', type: 'string', required: true },
       { key: 'cost',  type: 'number', min: 0 },
       // ...
     ],
   },
   ```

3. (Optional) Add a `validate: (entry, ctx) => [...]` for cross-field rules. Use the validators in `validators.js` as templates.

Reload the page. The new tab appears automatically. No HTML, no CSS, no app.js changes.

### Field types available

| Type | Renders | Output value |
|---|---|---|
| `string` | text input | `'string'` |
| `number` | number input | `123` |
| `boolean` | checkbox | `true` / `false` |
| `select` | dropdown | one of the options |
| `multiSelect` | chips + popup | array of selected values |
| `color` | color picker + hex | `'#ff6b35'` |
| `emoji` | text input + emoji palette | `'🚒'` |
| `stringArray` | chips with free-text add | array of strings |
| `arrayOf` | sub-array of objects | array of objects (uses `itemSchema`) |
| `object` | nested single object | object (uses `itemSchema`) |
| `keyedDict` | dict of named values | object (uses `knownKeys` + `valueField`) |
| `json` | raw textarea fallback | parses JS literal |
| `requirementSlots` | mission-specific union | array of tag-arrays or `{ needs, tags }` |

For dropdowns that depend on other config sections (e.g. cert keys, unit keys), pass `options: ctx => ...` — the function is called with the live draft, so dropdowns stay in sync.

---

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell. Loads `../../config.js` first, then the editor modules. |
| `style.css` | Dark admin theme. No external dependencies. |
| `formatter.js` | Serializes JS values back to `config.js` style. |
| `widgets.js` | Generic input renderers — one per field type. |
| `validators.js` | Per-section cross-field checks. |
| `schemas.js` | **The only file you usually need to edit to extend the tool.** |
| `app.js` | Orchestrator — tabs, lists, draft state, copy/revert. |
| `README.md` | This file. |

---

## Out of scope

- Writing back to `config.js` directly. Would require parsing JS and preserving comments — too fragile.
- Editing player save data, stations, or ESNs. Those live in the runtime DB, not `config.js`.
- Deployment. This is a local dev tool.
- Undo/redo. Revert button is the escape hatch for now.
