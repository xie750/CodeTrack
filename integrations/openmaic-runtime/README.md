# CodeTrack OpenMAIC Runtime Integration

This directory contains the thin integration boundary for running the upstream
OpenMAIC classroom as a separate runtime. CodeTrack should not reimplement the
classroom player in its Vite application.

## Runtime Contract

CodeTrack keeps the existing business flow:

```text
AI 助学生成资源 -> 资源中心 -> 点击 AI讲解课堂资源 -> OpenMAIC runtime 工作区
```

The CodeTrack page at `/self-study/library/classroom/:resourceId` now acts as a
bridge only:

1. It validates the saved `AI_CLASSROOM` resource.
2. It fetches `/api/v1/student/resources/:resourceId/openmaic-export`.
3. It loads `VITE_OPENMAIC_RUNTIME_URL` in an iframe.
4. It sends the export to the runtime with `postMessage`.

## Configure CodeTrack

Set the runtime URL in the frontend environment:

```bash
VITE_OPENMAIC_RUNTIME_URL=http://127.0.0.1:3100/codetrack-bridge
```

If this variable is not set, CodeTrack intentionally refuses to render a fake
classroom.

## Patch OpenMAIC

Apply the files under `overlay/` to the upstream OpenMAIC project root. The
overlay adds a `/codetrack-bridge` route that receives CodeTrack's classroom
export and passes it into OpenMAIC's own `Stage`, store, playback chrome and
action engine.

The bridge is deliberately small: it adapts data shape only. All classroom UI,
playback, canvas, whiteboard, iframe and action execution remain upstream
OpenMAIC code.
