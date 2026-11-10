# Release 123 – SideStore und OpenClaw Plugins

## iPhone Companion

- **Jetzt in SideStore installieren** öffnet SideStore über dessen offizielles
  URL-Schema und übergibt Günnis HTTPS-IPA-Adresse direkt.
- **IPA in Dateien speichern** bleibt als Fallback für AltStore, SideStore und
  Sideloadly verfügbar.
- Apple-Zugangsdaten werden ausschließlich in der gewählten Sideload-App
  eingegeben und niemals an AgentOne übertragen.

## OpenClaw Plugins

- Installation und Aktivierung erfolgen ausschließlich über Günnis
  authentifizierte OpenClaw-WebGUI.
- Für den Installationsvorgang wird die gezielte Günni-Identität temporär mit
  `operator.admin` ausgestattet; die Geräte-Auto-Freigabe erhält keinen
  Admin-Scope.
- Nach Installation und Runtime-Test wird der temporäre Admin-Scope wieder
  entfernt. Das installierte Plugin bleibt persistent im Günni-Gateway.
