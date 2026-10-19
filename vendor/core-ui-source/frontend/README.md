# Integral frontend

The web interface lets people work with the same records, relationships, and authority used by Integral's agents. It is React 18, TypeScript, Vite, and Tailwind with shared UI primitives.

```bash
npm ci
npm run dev
npm run lint:types
npm run test:run
```

The source server runs at port 9006 and proxies API traffic to the backend at 4000. Container and packaged-wheel serving use their own configuration.

`pages/` contains routed experiences; `components/` contains records, views, collaboration, layout, and shared UI; `features/ai-chat/` manages conversation; `context/` coordinates auth and scope; `api/` supplies clients; `views/` defines palette contracts.

Use the shared UI system rather than duplicating typography and surface literals. Named references resolve through authorized APIs. Filters and hidden controls are not access boundaries. Preserve explicit loading, empty, denied, unavailable, and error states.

Auth uses a static canonical outline. The split-square logo geometry has no frame. Review narrow screens and keyboard interaction as well as desktop output.

Read the [user guide](../docs/user-guide/README.md), [view palette](../docs/operational-models/VIEW_PALETTE.md), and [architecture](../docs/product/ARCHITECTURE.md). Browser readback is required for experience claims; a build alone does not establish them.
