import SwiftUI

@main struct AgentOneCompanionApp: App {
    @StateObject private var health = HealthSyncManager()
    @StateObject private var location = LocationSyncManager()
    var body: some Scene { WindowGroup { ContentView().environmentObject(health).environmentObject(location) } }
}

struct ContentView: View {
    @EnvironmentObject var health: HealthSyncManager
    @EnvironmentObject var location: LocationSyncManager
    @State private var baseURL = "https://guenni.mwart.solutions"
    @State private var code = ""
    @State private var state = "Noch nicht gekoppelt"
    var body: some View {
        NavigationStack { Form {
            Section("AgentOne verbinden") { TextField("Instanz-URL", text: $baseURL).textInputAutocapitalization(.never).keyboardType(.URL); TextField("Pairing-Code", text: $code).keyboardType(.numberPad); Button("Sicher koppeln") { Task { do { try await AgentOneAPI.shared.pair(baseURL: baseURL, code: code, deviceName: UIDevice.current.name); state = "Verbunden" } catch { state = "Kopplung fehlgeschlagen" } } }; Text(state) }
            Section("Automatische Sensoren") { Button("Apple Health dauerhaft aktivieren") { Task { await health.activate() } }; Text(health.status).font(.caption); Button("Standort-Zeitachse aktivieren") { location.activate() }; Text(location.status).font(.caption) }
            Section("Datenschutz") { Text("Nur freigegebene Tagessummen und wichtige Standortänderungen. Standortpunkte werden nach 30 Tagen gelöscht. Berechtigungen bleiben in iOS widerrufbar.").font(.caption) }
        }.navigationTitle("AgentOne Companion") }
    }
}
