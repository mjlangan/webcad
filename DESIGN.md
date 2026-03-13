# WebCAD — Design Document

## Overview

A web-based 3D CAD application targeting hobbyists and makers. The primary use cases are:
- Modifying and remixing existing STL files (e.g. files downloaded from Printables/Thingiverse)
- Designing parts for 3D printing
- Visualizing and prototyping simple mechanical assemblies
- Learning 3D modeling without installing desktop software

The guiding principle is **approachability over completeness**: the tool should feel intuitive to someone who has never used CAD before, while still providing enough precision for practical use.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| UI framework | React + TypeScript | Component model maps well to panels, toolbars, and dialogs |
| 3D rendering | Three.js | Mature WebGL abstraction; large ecosystem |
| CSG operations | `three-bvh-csg` | GPU-friendly boolean ops built on Three.js geometry |
| State management | Zustand | Lightweight; avoids Redux boilerplate for scene state |
| Build tool | Vite | Fast HMR; native ESM |
| Styling | Ant Design (antd) | Component library; inline styles for layout, antd tokens for theming |

---

## Core Features

### Viewport
- Perspective and orthographic cameras
- Orbit (rotate), pan, zoom via mouse/trackpad
- Camera preset buttons: Front, Back, Left, Right, Top, Bottom, Home
- World-space grid on the XZ plane
- Axis indicator (gizmo) in the corner
- Selection highlight on hover and click

### Primitives
- Box, Sphere, Cylinder, Cone, Torus
- Placed at world origin by default
- Editable parameters (radius, width, height, segments, etc.)

### Transform Tools
- Move (translate along axis or plane)
- Rotate (around axis)
- Scale (uniform and per-axis)
- On-canvas transform gizmo (similar to Blender/Unity handles)
- Numeric input fields for precise values

### Scene Tree
- Hierarchical list of all objects
- Rename, hide/show, lock, delete objects
- Single and multi-select
- Trees of CSG parent/child groups (collapse/expand)
- General-purpose group/ungroup with transform inheritance (Phase 7.5)

### Reference Planes (Workplane)

A reference plane defines the surface on which new objects are placed and dragged. The default workplane is the world XZ plane (Y=0). The user can set a new workplane by clicking any face on any object in the scene.

**Placement mode**
- A dedicated toolbar button enters workplane placement mode; normal selection and manipulation are suspended while it is active
- As the mouse moves over an object, the hovered face is highlighted and a semi-transparent ghost plane quad follows the cursor, oriented to the face normal at the hit point
- A single click commits the workplane; Escape or right-click cancels without changing it
- "Reset Workplane" returns to the world default (XZ at Y=0, up = world +Y)
- Setting a workplane is an undoable action (stored in the command history)

**Face normal detection**
- Flat faces (box, cylinder cap, cone base): the triangle normal is used directly — unambiguous
- Curved faces (cylinder body, sphere, cone lateral): the interpolated surface normal at the exact raycast hit point is used; the workplane is tangent to the surface at that point
- The workplane orientation around its normal is resolved with a standard tangent frame: `tangentX = cross(normal, worldUp)`, `tangentZ = cross(normal, tangentX)`, with a pole fallback when `|dot(normal, worldUp)| > 0.999` (use world X as the reference vector instead)

**Visualization**
- The active workplane is rendered as a colored grid (distinct from the gray world grid, which remains visible)
- Local X and Z axis lines are drawn through the workplane origin in red and green
- Both the world grid and workplane grid are visible simultaneously when a non-default workplane is active

**Object placement on the workplane**
- New objects are oriented so their local Y-axis aligns with the workplane normal (they grow perpendicularly out of the face)
- Their position is offset along the normal by half their bounding-box height so they sit flush on the surface
- The move tool constrains dragging to the workplane's XZ plane by default; the vertical handle moves along the workplane normal instead of world Y

**Constraints and limitations**
- Only one workplane is active at a time; setting a new one replaces the previous
- Changing the workplane never affects the transforms of existing objects
- On curved surfaces the workplane origin is the exact floating-point raycast hit — there is no snapping to a feature, which is an intentional precision tradeoff

### Boolean Operations (CSG)
- Union, Subtract, Intersect
- Non-destructive preview before commit: source objects hidden, result shown; commit or discard
- On commit, source objects become hidden children of the result node in the scene tree
- Editing a child (transform or geometry) silently re-runs the boolean in the background (~150 ms debounce)
- Deleting the parent releases and unhides its children; this is fully undoable
- Children cannot be independently deleted while parented (delete the parent first)
- If a background recompute fails, the result is blanked (invisible) and an error badge appears on the node in the scene tree; fixing the child geometry clears the error

### Materials
- Assign flat color or simple phong material to objects
- Opacity control
- Wireframe toggle per object

### Undo / Redo
- Full command history for all state-changing operations
- Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z

### Save / Open
- `.webcad` — native project format; preserves full scene state including primitive parameters, workplane, node names, visibility, materials, and embedded mesh buffers
- "Save" writes a `.webcad` file to disk; "Open" loads one, replacing the current session (with an unsaved-changes warning)

### Export
- STL (binary) — primary output for 3D printing
- OBJ — broad compatibility
- glTF/GLB — web-native, preserves materials
- 3MF — widely supported by slicers (PrusaSlicer, Bambu Studio, Cura); preserves object names and per-object color when present

### Import
- STL
- OBJ
- 3MF — multi-object scenes import as individual nodes; object names from the XML are used as node names

---

## Out of Scope (v1)

The following features are deferred to avoid over-engineering the initial build:

- Parametric/constraint-based modeling (e.g. Fusion 360-style sketches)
- Assembly joints and simulation
- STEP / IGES file support
- Textures and PBR materials
- Multi-user / collaboration
- Cloud save / account system
- Mobile touch support

These can be revisited once the core loop is solid.

---

## Architecture

### Scene Graph

The canonical scene state lives in a Zustand store, not directly in Three.js. Three.js objects are derived/synced from this store. This keeps the UI reactive and makes undo/redo straightforward.

```
ZustandStore (source of truth)
  ├── SceneNode[]
  │     ├── id, name, visible, locked
  │     ├── transform: { position, rotation, scale }
  │     ├── geometry: PrimitiveParams | MeshData
  │     ├── material: { color, opacity, ... }
  │     ├── parentId: string | null       (non-null = child of a CSG result or general group)
  │     ├── childIds: string[]            (non-empty = this is a CSG result or general group node)
  │     ├── csgOperation: 'union' | 'subtract' | 'intersect' | null
  │     └── csgError: string | null       (set when background recompute fails)
  └── workplane: { origin: Vector3, normal: Vector3, tangentX: Vector3 }
        (identity default = XZ plane, normal = world +Y)

Three.js Scene (derived)
  └── Synced on store change via useEffect / subscription
```

### Command Pattern for Undo/Redo

Every user action that mutates the store is wrapped in a `Command` object with `execute()` and `undo()` methods. A history stack in the store manages this.

### Persistence

The scene auto-saves to the browser on every change. Storage is split across two APIs to stay within limits:

- **localStorage** — scene metadata and node transforms only: `{ version, timestamp, nodes: SceneNode[] }` where `SceneNode.geometry` for imported meshes stores only an `{ type: 'imported', meshId: string }` reference, not the raw geometry
- **IndexedDB** — binary STL/mesh buffers, keyed by `meshId`; written once on import and read back on load

The save payload is wrapped in a version envelope:

```
{
  version: 1,
  savedAt: <ISO timestamp>,
  data: { nodes: [...], workplane: {...} }
}
```

**`.webcad` file format**

The `.webcad` file uses the same envelope, extended with embedded mesh buffers so the file is fully self-contained:

```
{
  version: 1,
  savedAt: <ISO timestamp>,
  data: {
    nodes: [...],       // SceneNode[] — imported mesh nodes carry geometry: { type: 'imported', meshId }
    workplane: {...},
    meshes: {           // meshId → base64-encoded binary STL buffer
      "<meshId>": "<base64>",
      ...
    }
  }
}
```

On "Save", all IndexedDB buffers referenced by the scene are fetched, base64-encoded, and written inline. On "Open", the buffers are decoded and written back into IndexedDB before the scene is loaded.

**Failure modes and mitigations**

| Scenario | Mitigation |
|---|---|
| Corrupt or unparseable JSON | Wrap `JSON.parse` in try/catch; on failure, discard saved state and show a recovery notification |
| Schema version mismatch after app update | Check `version` field on load; if unrecognized, discard and notify — no silent migration |
| Crash loop (bad state crashes the app on every load) | Set `webcad_initializing = true` in `sessionStorage` at startup, clear it after successful init; if flag is already set on load, skip restore and start fresh |
| `QuotaExceededError` (localStorage full) | Catch the error on every `setItem` call; notify the user and suggest exporting to file |
| Two tabs open simultaneously | Listen for the `storage` event; if the key changes from another context, warn the user that edits from another tab will overwrite this session |
| Write thrash during drag/transform | Debounce saves 500 ms after the last store change; skip writes while any transform interaction is active |

### CSG Web Worker

Boolean operations run in a dedicated Web Worker to keep the main thread (and therefore the UI) unblocked during computation.

**Message protocol**

```
// Main → Worker
{ type: 'CSG_OPERATION', payload: { operation: 'union' | 'subtract' | 'intersect', meshA: ArrayBuffer, meshB: ArrayBuffer } }

// Worker → Main (success)
{ type: 'CSG_RESULT', payload: { result: ArrayBuffer } }

// Worker → Main (failure)
{ type: 'CSG_ERROR', payload: { message: string } }
```

Meshes are transferred as `ArrayBuffer` (STL binary) using [transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects) to avoid the cost of structured cloning large geometry data.

**UI state during computation**

While a CSG operation is in flight:
- The toolbar and affected objects are disabled
- A progress indicator is shown over the viewport
- The operation can be cancelled (worker is terminated and restarted; source objects remain unchanged)

**Worker lifecycle**

The worker is instantiated once on app startup and reused across operations. If it crashes (unhandled error), it is restarted before the next operation, and the user is shown an error notification.

### Component Layout

```
App
├── Toolbar          (top bar: file, tools, primitives)
├── Viewport         (Three.js canvas, fills remaining space)
│   └── TransformGizmo
├── ScenePanel       (left: scene tree)
└── PropertiesPanel  (right: selected object properties)
```

---

## Iterative Implementation Plan

### Phase 1 — Foundation ✅
**Goal:** A working 3D viewport with a single selectable box you can move around.

- [x] Vite + React + TypeScript project scaffold
- [x] Three.js canvas integrated into a React component
- [x] Orbit controls (pan, orbit, zoom)
- [x] Grid and axis gizmo
- [x] Place a single Box primitive
- [x] Click to select (raycasting), highlight on selection
- [x] Zustand store with one SceneNode
- [x] Basic transform gizmo (translate only)

### Phase 2 — Primitives, Scene Tree, and STL Import ✅
**Goal:** Add all primitive types, a usable scene panel, and STL import — enabling the core workflow of loading and modifying an existing STL.

- [x] All primitive types: Sphere, Cylinder, Cone, Torus
- [x] "Add primitive" menu in toolbar
- [x] Scene tree panel: list objects, rename, hide/show, delete
- [x] Properties panel: edit primitive parameters and transform numerically
- [x] Camera preset buttons
- [x] STL import (binary and ASCII) via `three/examples/jsm/loaders/STLLoader`
- [x] Imported mesh appears as a SceneNode; can be selected, transformed, and combined with primitives

### Phase 3 — Transforms and Undo/Redo ✅
**Goal:** Full transform toolset with reliable undo.

- [x] Rotate and Scale gizmo handles
- [x] Axis-constrained dragging (X, Y, Z and XY, XZ, YZ planes)
- [x] Command pattern implementation
- [x] Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z)
- [x] Multi-select (Shift+click, box select)

### Phase 4 — Reference Planes (Workplane)
**Goal:** Users can set a reference plane on any face, and new objects spawn oriented to that plane.

- [x] `workplane` field added to Zustand store with world-default identity value
- [x] `computeTangentFrame(normal)` utility with pole-fallback (when `|dot(normal, worldUp)| > 0.999`, use world X as reference)
- [x] Workplane placement mode: toolbar button toggles mode, suspending normal selection
- [x] Ghost plane mesh (semi-transparent `PlaneGeometry`) that follows the cursor during placement mode, oriented to the raycasted face normal
- [x] Face highlight on hover during placement mode
- [x] Click to commit: `SetWorkplaneCommand` pushed to undo stack (stores previous + next workplane)
- [x] Escape / right-click cancels placement mode without changing workplane
- [x] "Reset Workplane" button restores world default
- [x] Active workplane rendered as a distinctly-colored `GridHelper` child of a transformed `Object3D`; world grid stays visible simultaneously
- [x] Red/green local X/Z axis lines drawn through workplane origin
- [x] New primitives and imported STLs placed at workplane, rotated so local Y aligns with workplane normal, offset by half bounding-box height
- [x] Move tool drag plane switches from world XZ to `THREE.Plane` constructed from workplane normal + origin when workplane is non-default

### Phase 5 — Boolean Operations ✅
**Goal:** Users can subtract and combine shapes without blocking the UI.

- [x] CSG Web Worker: accepts `CSG_OPERATION` messages with transferable `ArrayBuffer` meshes, returns `CSG_RESULT` or `CSG_ERROR`
- [x] Worker instantiated once on startup; restarted automatically on unhandled crash
- [x] Integrate `three-bvh-csg` inside the worker (confirm it runs without `window`/DOM dependencies)
- [x] Union, Subtract, Intersect operations on two selected objects
- [x] Non-destructive preview before commit: source objects hidden, result shown; commit or discard
- [x] Toolbar and affected objects disabled while operation is in flight; progress indicator shown over viewport
- [x] Cancel button terminates and restarts the worker, leaving source objects unchanged
- [x] Result appears as new mesh in scene tree

### Phase 5.5 — CSG Parent-Child Groups ✅
**Goal:** Boolean results retain their inputs as hidden children, enabling live re-evaluation when inputs change.

- [x] `SceneNode` extended with `parentId`, `childIds`, `csgOperation`, `csgError` fields
- [x] On commit, source nodes become hidden children of the result node (`CsgAdoptCommand` replaces `CsgCommitCommand`); sources are no longer deleted
- [x] Scene panel renders children indented under their parent with a `└` connector; collapse/expand toggle on parent rows
- [x] Children cannot be deleted independently (lock indicator shown); delete the parent to release them
- [x] Deleting a CSG parent unparents and unhides its children (`removeNode` cascade); fully undoable
- [x] Editing a child (transform or geometry params) silently re-runs the boolean in the background via `useCsgAutoRecompute` hook (150 ms debounce, per-parent in-flight lock)
- [x] Failed recompute: result blanked (empty geometry, node hidden) and `⚠` error badge shown in scene panel with error tooltip; recovers automatically when child is fixed
- [x] Worker contention handled: if the interactive CSG worker is busy when a background recompute fires, the recompute is silently skipped (next child edit will retry)

### Phase 6 — Materials and Appearance
**Goal:** Objects can be colored and styled.

- [x] Color picker in properties panel
- [x] Opacity slider
- [x] Wireframe mode toggle
- [x] Basic ambient + directional lighting setup (good defaults, no UI needed yet)

### Phase 7 — Save/Open, Export, and Remaining Import
**Goal:** Users can persist their work to disk and get geometry in and out.

- [x] `.webcad` save: serialize Zustand store + fetch all IndexedDB buffers → base64-embed → download as file *(note: base64 encoding inflates binary mesh size by ~33%; acceptable tradeoff for hobbyist file sizes)*
- [x] `.webcad` open: parse file, decode mesh buffers into IndexedDB, load scene graph into store; warn if session has unsaved changes
- [x] Export to STL (binary)
- [x] Export to OBJ
- [x] Export to glTF/GLB
- [x] Export to 3MF — use `fflate` for ZIP creation; produce `[Content_Types].xml`, `_rels/.rels`, and `3D/3dmodel.model` (XML); each visible root node becomes an `<object>` with transform baked into vertices; `unit="millimeter"`
- [x] Import OBJ
- [x] Import 3MF — use `fflate` for ZIP extraction; parse `3D/3dmodel.model` with `DOMParser`; each `<object>` in `<resources>` (type `model`, not `support`) becomes a separate `SceneNode` with the object's `name` attribute as the node name; reuse the same centre-and-lift placement logic as STL import
- [x] "Export all" and "Export selection" options

### Phase 7.5 — General-Purpose Groups ✅
**Goal:** Users can organize objects into named groups that move and transform in unison.

- [x] `{ type: 'group' }` geometry variant — a null node with a transform but no mesh; `buildGeometry` returns an empty `BufferGeometry` (invisible); `computeWorldMatrix` walks the `parentId` chain to compose world transforms
- [x] Transform inheritance in `useSceneSync`: child world matrix = parent world matrix × child local matrix; decomposed into `mesh.position/quaternion/scale` so TransformControls works normally
- [x] TransformControls and transform store write *local* transforms for group children, *world* transforms for root nodes (`meshTransformToStoreTransform` converts at drag-end)
- [x] `buildWorldGeometry` in `triggerCsg.ts` updated to use `computeWorldMatrix` via parent chain (needed for CSG on grouped objects)
- [x] Group action (Ctrl+G): create a group node at the centroid of selected objects, convert their world transforms to local-relative, reparent them; push `GroupCommand` to undo stack
- [x] Ungroup action: convert children's local transforms back to world, reparent to world root, delete group node; push `UngroupCommand` to undo stack
- [x] Scene panel renders group tree at arbitrary depth (recursive); collapse/expand per node; group children get delete button (not lock icon)
- [x] Click group child in viewport → selects the parent group; gizmo acts on group transform
- [x] Visibility toggle on group propagates to all recursive group children

### Phase 8 — Polish and UX
**Goal:** Feels good to use, not just functional.

- [x] Keyboard shortcuts (G=grab/move, R=rotate, S=scale, Del=delete)
- [x] Keyboard shortcuts (X/Y/Z=constrain axis, F=focus selection)
- [x] Snap to grid (configurable increment)
- [ ] Snap to object vertices/edges
- [ ] Measurement overlay (distance between two points)
- [ ] Better empty state / onboarding experience
  - **Empty state**: when the scene has no nodes, show a centered overlay in the viewport with a short tagline ("Add a shape to get started"), a primary "Add Box" shortcut button, and a "Take the tour →" link
  - **Tour**: use antd `Tour` component; triggered by the link above or a persistent "?" button in the toolbar corner; each step targets a real DOM element via React ref
  - **Tour steps**:
    1. *Welcome* (no target, centered modal card) — name + one-line pitch
    2. *Add shapes* → toolbar Add section — "Click any shape to drop it into the scene"
    3. *Viewport navigation* → canvas — "Left-drag orbits · Right-drag pans · Scroll zooms"
    4. *Transform tools* → toolbar Transform section — "Move (G) · Rotate (R) · Scale (S)"
    5. *Boolean operations* → toolbar Boolean section — "Select two objects to combine, subtract, or intersect them"
    6. *Scene tree* → ScenePanel — "All objects live here; rename, hide, group, or delete them"
    7. *Properties* → PropertiesPanel — "Edit position, rotation, size, and appearance with precise numeric inputs"
    8. *Camera presets* → toolbar View section — "Jump to any standard view; the camera zooms to fit all objects"
  - Tour state persisted in `localStorage` (`webcad_tour_seen`); auto-shown once on first empty load, never again unless reset
  - "Restart tour" option in a future Preferences menu
- [ ] Performance: LOD or instancing for large scenes
- [ ] Preferences menu (control schemes, metric/inch units)
- [x] Duplicate selected object(s): button in the scene tree (and keyboard shortcut Ctrl+D) creates a copy of the selected node(s) offset slightly from the original; duplicated node gets the same geometry, material, and transform with a " (copy)" name suffix; fully undoable
- [ ] Drop to workplane: translate the selected object along the workplane normal until its lowest point touches the workplane surface
- [ ] Drop to workplane (face align): user clicks a face on the selected object; the object is re-oriented and translated so that chosen face lies flush on the workplane
- [x] Adopt antd as the UI component library; migrate all controls to antd components and inline styles (CSS files removed)

### Phase 9 — Edge Selection, Fillet, and Chamfer
**Goal:** Users can select individual edges on any mesh and apply fillet (rounded) or chamfer (angled) operations — the primary use case being smoothing the seam after a boolean union.

#### Edge Selection Mode

- A dedicated **Edge Select** toolbar button (or shortcut `E`) enters edge-select mode, suspending normal object selection
- Edge-select mode is scoped to one object at a time; entering it auto-selects the currently active object, or prompts to click one
- **Hard edge detection**: pre-compute the dihedral angle between every pair of adjacent triangles; edges where the angle exceeds a configurable threshold (default 30°) are exposed as selectable — this works on all mesh types including imported STL/OBJ and CSG results
- **Hover highlight**: the nearest hard edge to the cursor is highlighted (orange); the edge segment is rendered as a `LineSegments` overlay on top of the mesh
- **Click** to select an edge (turns blue/teal); **Shift+click** to multi-select; **click empty space** to deselect all
- **Escape** or clicking the Edge Select button again exits the mode and clears the selection
- Selected edge indices are stored in the Zustand store as `{ nodeId: string; edgeIndices: number[] }` and cleared on object deselection or mode exit

#### Fillet / Chamfer Operations

- While in edge-select mode with at least one edge selected, the Properties panel shows a **Fillet** and **Chamfer** action section:
  - Numeric input for **radius** (fillet) or **distance** (chamfer), with mm formatting
  - **Preview** button (or live preview after a short debounce): runs the operation in a Web Worker and shows the result mesh overlaid on the original
  - **Apply** commits the result; **Cancel** discards the preview
- **Non-destructive**: on commit the original node becomes a hidden child of the result node — the same parent-child model as CSG; editing the radius re-runs the operation automatically (same `useCsgAutoRecompute`-style debounce hook)
- `SceneNode` is extended with: `filletEdges?: number[]`, `filletRadius?: number`, `chamferEdges?: number[]`, `chamferDistance?: number`
- Failed operations blank the result and show an error badge, same as CSG

#### Implementation (TBD)

The geometry kernel for edge beveling is not yet decided. Leading options:

| Option | Pros | Cons |
|---|---|---|
| `opencascade.js` (WASM) | Proper B-rep fillet/chamfer, handles complex topology | ~30 MB bundle, significant integration work |
| Custom bevel pass (Three.js) | No extra dependencies | Approximate; breaks down on non-convex or complex edges |
| Extend `three-bvh-csg` | Already in use, same worker | Not designed for this; would require significant geometry work |

Decision deferred; the UX and data model above are kernel-agnostic. The operation runs in the existing CSG Web Worker regardless of which kernel is chosen.

### Phase 10 — OpenSCAD Integration (Roadmap)
**Goal:** Power users can write or import OpenSCAD scripts and have the resulting geometry appear as a scene node, bridging the gap between parametric modeling and the direct-modeling workflow.

- [ ] **Script editor**: an in-app code editor panel (e.g. CodeMirror) for writing `.scad` source; syntax highlighting for OpenSCAD
- [ ] **Execution**: run OpenSCAD in a Web Worker via WebAssembly ([OpenSCAD WASM build](https://github.com/openscad/openscad)); the output is a mesh (OFF or STL) that is loaded as a scene node
- [ ] **Import `.scad` files**: drag-and-drop or file picker; treated the same as the script editor workflow
- [ ] **Live recompile**: debounced re-execution on script change; result node updates in place (non-destructive — original script is retained as the node's source)
- [ ] **Parameters panel**: expose OpenSCAD `parameter` annotations as editable fields in the Properties panel (similar to Customizer in the OpenSCAD desktop app)
- [ ] **Round-trip**: edited geometry stays as an OpenSCAD node in the scene tree; boolean operations and transforms can be applied on top of it like any other node

---

## Open Questions

1. **Sketch + Extrude**: Do we want a 2D sketch/extrude workflow (like Tinkercad's hole system, or a lite Fusion 360 sketch)? This is the most requested feature in similar tools but significantly increases complexity. Defer to Phase 8+.

2. ~~**Persistence**: Should the scene auto-save to `localStorage`?~~ **Resolved**: yes, using localStorage for metadata + transforms and IndexedDB for binary mesh buffers. See the Persistence section in Architecture.

3. ~~**File format (native)**: Should we define a `.webcad` JSON format for saving/loading full scenes, or rely on glTF for round-trips?~~ **Resolved**: use `.webcad` as the native project format (JSON + base64-embedded mesh buffers). glTF/STL/OBJ are export-only. See the Persistence section in Architecture.

4. ~~**CSG performance**: `three-bvh-csg` performs operations synchronously on the main thread. For complex meshes this will block. A Web Worker offload may be needed in Phase 4.~~ **Resolved**: CSG operations run in a dedicated Web Worker with a transferable `ArrayBuffer` message protocol. See the CSG Web Worker section in Architecture.
