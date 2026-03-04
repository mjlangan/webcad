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
| Styling | CSS Modules or Tailwind | TBD based on UI complexity |

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
- Group/ungroup objects

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
- Non-destructive: source objects are preserved and hidden until the user confirms
- Result becomes a new mesh

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

### Import
- STL
- OBJ

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
  │     └── material: { color, opacity, ... }
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

### Phase 1 — Foundation
**Goal:** A working 3D viewport with a single selectable box you can move around.

- [ ] Vite + React + TypeScript project scaffold
- [ ] Three.js canvas integrated into a React component
- [ ] Orbit controls (pan, orbit, zoom)
- [ ] Grid and axis gizmo
- [ ] Place a single Box primitive
- [ ] Click to select (raycasting), highlight on selection
- [ ] Zustand store with one SceneNode
- [ ] Basic transform gizmo (translate only)

### Phase 2 — Primitives, Scene Tree, and STL Import
**Goal:** Add all primitive types, a usable scene panel, and STL import — enabling the core workflow of loading and modifying an existing STL.

- [ ] All primitive types: Sphere, Cylinder, Cone, Torus
- [ ] "Add primitive" menu in toolbar
- [ ] Scene tree panel: list objects, rename, hide/show, delete
- [ ] Properties panel: edit primitive parameters and transform numerically
- [ ] Camera preset buttons
- [ ] STL import (binary and ASCII) via `three/examples/jsm/loaders/STLLoader`
- [ ] Imported mesh appears as a SceneNode; can be selected, transformed, and combined with primitives

### Phase 3 — Transforms and Undo/Redo
**Goal:** Full transform toolset with reliable undo.

- [ ] Rotate and Scale gizmo handles
- [ ] Axis-constrained dragging (X, Y, Z and XY, XZ, YZ planes)
- [ ] Command pattern implementation
- [ ] Undo/redo stack (Ctrl+Z / Ctrl+Shift+Z)
- [ ] Multi-select (Shift+click, box select)
- [ ] Group / ungroup

### Phase 4 — Reference Planes (Workplane)
**Goal:** Users can set a reference plane on any face, and new objects spawn oriented to that plane.

- [ ] `workplane` field added to Zustand store with world-default identity value
- [ ] `computeTangentFrame(normal)` utility with pole-fallback (when `|dot(normal, worldUp)| > 0.999`, use world X as reference)
- [ ] Workplane placement mode: toolbar button toggles mode, suspending normal selection
- [ ] Ghost plane mesh (semi-transparent `PlaneGeometry`) that follows the cursor during placement mode, oriented to the raycasted face normal
- [ ] Face highlight on hover during placement mode
- [ ] Click to commit: `SetWorkplaneCommand` pushed to undo stack (stores previous + next workplane)
- [ ] Escape / right-click cancels placement mode without changing workplane
- [ ] "Reset Workplane" button restores world default
- [ ] Active workplane rendered as a distinctly-colored `GridHelper` child of a transformed `Object3D`; world grid stays visible simultaneously
- [ ] Red/green local X/Z axis lines drawn through workplane origin
- [ ] New primitives and imported STLs placed at workplane, rotated so local Y aligns with workplane normal, offset by half bounding-box height
- [ ] Move tool drag plane switches from world XZ to `THREE.Plane` constructed from workplane normal + origin when workplane is non-default

### Phase 5 — Boolean Operations
**Goal:** Users can subtract and combine shapes without blocking the UI.

- [ ] CSG Web Worker: accepts `CSG_OPERATION` messages with transferable `ArrayBuffer` meshes, returns `CSG_RESULT` or `CSG_ERROR`
- [ ] Worker instantiated once on startup; restarted automatically on unhandled crash
- [ ] Integrate `three-bvh-csg` inside the worker (confirm it runs without `window`/DOM dependencies)
- [ ] Union, Subtract, Intersect operations on two selected objects
- [ ] Non-destructive preview before commit: source objects hidden, result shown; commit or discard
- [ ] Toolbar and affected objects disabled while operation is in flight; progress indicator shown over viewport
- [ ] Cancel button terminates and restarts the worker, leaving source objects unchanged
- [ ] Result appears as new mesh in scene tree

### Phase 6 — Materials and Appearance
**Goal:** Objects can be colored and styled.

- [ ] Color picker in properties panel
- [ ] Opacity slider
- [ ] Wireframe mode toggle
- [ ] Basic ambient + directional lighting setup (good defaults, no UI needed yet)

### Phase 7 — Save/Open, Export, and Remaining Import
**Goal:** Users can persist their work to disk and get geometry in and out.

- [ ] `.webcad` save: serialize Zustand store + fetch all IndexedDB buffers → base64-embed → download as file *(note: base64 encoding inflates binary mesh size by ~33%; acceptable tradeoff for hobbyist file sizes)*
- [ ] `.webcad` open: parse file, decode mesh buffers into IndexedDB, load scene graph into store; warn if session has unsaved changes
- [ ] Export to STL (binary)
- [ ] Export to OBJ
- [ ] Export to glTF/GLB
- [ ] Import OBJ
- [ ] "Export all" and "Export selection" options

### Phase 8 — Polish and UX
**Goal:** Feels good to use, not just functional.

- [ ] Keyboard shortcuts (G=grab/move, R=rotate, S=scale, X/Y/Z=constrain axis, Del=delete, F=focus selection)
- [ ] Snap to grid (configurable increment)
- [ ] Snap to object vertices/edges
- [ ] Measurement overlay (distance between two points)
- [ ] Better empty state / onboarding experience
- [ ] Performance: LOD or instancing for large scenes

---

## Open Questions

1. **Sketch + Extrude**: Do we want a 2D sketch/extrude workflow (like Tinkercad's hole system, or a lite Fusion 360 sketch)? This is the most requested feature in similar tools but significantly increases complexity. Defer to Phase 8+.

2. ~~**Persistence**: Should the scene auto-save to `localStorage`?~~ **Resolved**: yes, using localStorage for metadata + transforms and IndexedDB for binary mesh buffers. See the Persistence section in Architecture.

3. ~~**File format (native)**: Should we define a `.webcad` JSON format for saving/loading full scenes, or rely on glTF for round-trips?~~ **Resolved**: use `.webcad` as the native project format (JSON + base64-embedded mesh buffers). glTF/STL/OBJ are export-only. See the Persistence section in Architecture.

4. ~~**CSG performance**: `three-bvh-csg` performs operations synchronously on the main thread. For complex meshes this will block. A Web Worker offload may be needed in Phase 4.~~ **Resolved**: CSG operations run in a dedicated Web Worker with a transferable `ArrayBuffer` message protocol. See the CSG Web Worker section in Architecture.
