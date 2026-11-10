# AgentOne Companion · native iOS source

This is the native path for automatic Apple Health and significant-location
sync. A browser/PWA cannot access HealthKit or run reliable background location.

## Sideload IPA

The repository workflow **AgentOne Companion IPA** builds an unsigned iPhoneOS
IPA on a macOS runner and publishes it as a GitHub Release asset. AltStore,
SideStore or Sideloadly must re-sign that IPA with the user's own development
profile. See `docs/IPHONE-SIDELOAD.md` for the Windows and iPhone procedure.

An unsigned IPA cannot grant itself HealthKit access. The resulting provisioning
profile must authorize both HealthKit entitlements. If a free sideload profile
does not preserve them, use Xcode automatic signing with a valid team and the
registered iPhone.

## Build

1. Install Xcode and XcodeGen on macOS.
2. Run `xcodegen generate` in this directory.
3. Open `AgentOneCompanion.xcodeproj`.
4. Select your Apple Developer team and a unique bundle identifier.
5. Verify the HealthKit and Background Modes capabilities, then run on a real
   iPhone. HealthKit background delivery does not work in the simulator.
6. In Günni, create a new pairing code with **Health background** and/or
   **Location timeline** selected. Enter the instance URL and code in the app.

The device token is stored in the iOS Keychain with
`AfterFirstUnlockThisDeviceOnly`. HealthKit uploads only daily summaries.
Significant location changes are retained by AgentOne for at most 30 days.
The app never requests an iCloud or Google password.
