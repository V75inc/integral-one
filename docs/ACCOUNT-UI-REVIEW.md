# Account experience review

## Adopted presentation

Signup, returning sign-in, email verification, the signed-out desktop page and
the browser offline-setup portal use a compact single-column account flow.
The original Integral mark sits beside Integral | one. Headings describe the
current step; provider controls, email input and the primary action follow.
Account switching is a quiet text action. Local-data reassurance appears once.
Offline setup and recovery are disclosures, rather than competing primary forms.

The desktop return page no longer uses the two-column promotional layout.
It offers Sign in and Continue offline. Filesystem-protection guidance lives
inside About offline access. The Core implementation remains provider neutral.

Clerk's verification headings and destination remain visible. Error text stays
near the affected field. The online portal shortens long email addresses without
wrapping Sign out, and confirms when a setup code is ready to copy. Where Business
is mentioned, the copy is: “Seamlessly upgrade to Integral Business when you scale.”

## Browser handoff and recovery

During a Google or Microsoft handoff, the desktop explains that completion occurs
in the browser and exposes Restart sign-in. The pinned Clerk Electron SDK has no
individual-flow cancellation API. Restart sign-in deliberately relaunches the
application and disposes its pending SDK callback; local state is preserved.
Slow initial loading offers recovery after 15 seconds. No OAuth validation,
callback matching, account binding or local authority is bypassed.

Google's external consent tab was observed showing Loading after the native app
had already completed sign-in. The application cannot replace Google's page or
close arbitrary browser tabs. A completed test tab was closed, and native restart
recovery was tested against a pending flow. This external browser presentation
is a known limitation, not an unqualified claim that Google never shows a loader.

## Qualification

- Native account window: 560 × 760; compact desktop return: 1280 × 800.
- Browser portal: 390 × 844 and 1280 × 800, including keyboard focus.
- Email verification, incorrect code, corrected code, invalid computer code,
  successful setup and unavailable configuration were reviewed.
- Native OAuth restart restored enabled controls. A signed setup code opened a
  fresh local workspace with the registration service stopped.
- 1,879 composed UI tests pass in 330 files; 34 One Node tests plus three Python
  composition tests, 27 shared-host tests and 14 private-service tests pass.
- All 16 Core guards passed against a temporary index containing the changes.
- Local screenshots and the design evidence record are excluded from public
  source. The design evidence checker passes; actual rendered review supports it.

Production Clerk configuration, domain/DNS/HTTPS deployment, signed installers,
Microsoft consent/return and other desktop operating systems remain release gates.
No source push or deployment is part of this review.

Switching from an email-code step to the other account mode now resets the
form route, preventing a blank Clerk widget. Closing initial signup or quitting
the app is treated as normal cancellation rather than a failed Core boot.
Native closure, restart and account-switching regression checks accompany the
presentation review.

Primary account actions use Core’s dark-theme CTA colors: #ededed background
and #1a1a1a text, with no peach gradient. Native and portal forms share this
presentation.
