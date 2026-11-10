# AgentOne Companion · native iOS source

This is the native path for automatic Apple Health and significant-location
sync. A browser/PWA cannot access HealthKit or run reliable background location.

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
