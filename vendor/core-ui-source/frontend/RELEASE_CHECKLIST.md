# Integral UI — release readiness

Use before tagging a production UI release.

- [ ] `npm run lint:types` passes
- [ ] `npm run test:run` passes
- [ ] `npm run build` passes
- [ ] Smoke: login, signup (personal + org), create org/space/track, invite collaborator, entry with tags; transfer space/track ownership (owner only)
- [ ] Verify API base URL / proxy for target environment
- [ ] Spot-check keyboard: modal Escape, focus in dialogs
- [ ] Optional: swap `lib/telemetry.ts` for real analytics / error reporting
