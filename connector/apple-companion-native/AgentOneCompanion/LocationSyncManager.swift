import CoreLocation
import Foundation

@MainActor final class LocationSyncManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published private(set) var status = "Nicht aktiviert"
    private let manager = CLLocationManager()
    override init() { super.init(); manager.delegate = self; manager.activityType = .other; manager.pausesLocationUpdatesAutomatically = true }
    func activate() { manager.requestAlwaysAuthorization(); manager.startMonitoringSignificantLocationChanges(); status = "Standort-Zeitachse aktiv" }
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { if manager.authorizationStatus == .authorizedAlways { manager.startMonitoringSignificantLocationChanges(); status = "Standort-Zeitachse aktiv" } else if manager.authorizationStatus == .denied { status = "Standortfreigabe abgelehnt" } }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { guard let location = locations.last else { return }; Task { do { try await AgentOneAPI.shared.ingest(kind: "location", data: ["latitude": location.coordinate.latitude, "longitude": location.coordinate.longitude, "accuracyMeters": location.horizontalAccuracy, "capturedAt": ISO8601DateFormatter().string(from: location.timestamp), "label": "iPhone"]); status = "Zuletzt synchronisiert: \(Date().formatted(date: .omitted, time: .shortened))" } catch { status = "Server-Synchronisierung ausstehend" } } }
}
