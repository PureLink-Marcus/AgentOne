import Foundation

struct PairResponse: Decodable { struct Device: Decodable { let deviceToken: String }; let device: Device }

actor AgentOneAPI {
    static let shared = AgentOneAPI()
    private let tokenAccount = "device-token"
    private let baseAccount = "base-url"

    var configured: Bool { KeychainStore.get(account: tokenAccount) != nil && KeychainStore.get(account: baseAccount) != nil }

    func pair(baseURL: String, code: String, deviceName: String) async throws {
        guard let base = URL(string: baseURL), base.scheme == "https" else { throw URLError(.badURL) }
        var request = URLRequest(url: base.appending(path: "/agentone/companion/confirm"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": code, "deviceName": deviceName])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else { throw URLError(.userAuthenticationRequired) }
        let payload = try JSONDecoder().decode(PairResponse.self, from: data)
        try KeychainStore.set(payload.device.deviceToken, account: tokenAccount)
        try KeychainStore.set(base.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), account: baseAccount)
    }

    func ingest(kind: String, data: [String: Any]) async throws {
        guard let token = KeychainStore.get(account: tokenAccount), let baseValue = KeychainStore.get(account: baseAccount), let base = URL(string: baseValue) else { throw URLError(.userAuthenticationRequired) }
        var request = URLRequest(url: base.appending(path: "/agentone/companion/ingest"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(token, forHTTPHeaderField: "X-AgentOne-Device-Token")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["kind": kind, "data": data])
        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else { throw URLError(.cannotParseResponse) }
    }
}
