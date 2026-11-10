import Foundation
import HealthKit

@MainActor final class HealthSyncManager: ObservableObject {
    @Published private(set) var status = "Nicht aktiviert"
    private let store = HKHealthStore()
    private var observers: [HKObserverQuery] = []
    private let types: Set<HKObjectType> = [HKQuantityType(.stepCount), HKQuantityType(.activeEnergyBurned), HKCategoryType(.sleepAnalysis), HKWorkoutType.workoutType()]

    func activate() async {
        guard HKHealthStore.isHealthDataAvailable() else { status = "HealthKit nicht verfügbar"; return }
        do {
            try await store.requestAuthorization(toShare: [], read: types)
            for type in types.compactMap({ $0 as? HKSampleType }) {
                let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, _ in
                    Task { await self?.syncToday(); completion() }
                }
                observers.append(query); store.execute(query)
                try? await store.enableBackgroundDelivery(for: type, frequency: .hourly)
            }
            status = "Automatische Health-Synchronisierung aktiv"
            await syncToday()
        } catch { status = "Health-Freigabe fehlt" }
    }

    func syncToday() async {
        let calendar = Calendar(identifier: .gregorian), start = calendar.startOfDay(for: Date()), end = Date()
        async let steps = quantity(.stepCount, unit: .count(), start: start, end: end)
        async let energy = quantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end)
        async let sleep = sleepMinutes(start: calendar.date(byAdding: .day, value: -1, to: start)!, end: end)
        async let workouts = workoutCount(start: start, end: end)
        do {
            try await AgentOneAPI.shared.ingest(kind: "health", data: ["date": ISO8601DateFormatter().string(from: start), "steps": await steps, "activeEnergyKcal": await energy, "sleepMinutes": await sleep, "workouts": await workouts])
            status = "Zuletzt synchronisiert: \(Date().formatted(date: .omitted, time: .shortened))"
        } catch { status = "Server-Synchronisierung ausstehend" }
    }

    private func quantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date) async -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else { return 0 }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return await withCheckedContinuation { continuation in store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: unit) ?? 0) }) }
    }
    private func sleepMinutes(start: Date, end: Date) async -> Double { guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else { return 0 }; let predicate = HKQuery.predicateForSamples(withStart: start, end: end); return await withCheckedContinuation { continuation in store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: 500, sortDescriptors: nil) { _, samples, _ in continuation.resume(returning: (samples ?? []).reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) } / 60) }) } }
    private func workoutCount(start: Date, end: Date) async -> Int { let predicate = HKQuery.predicateForSamples(withStart: start, end: end); return await withCheckedContinuation { continuation in store.execute(HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: 100, sortDescriptors: nil) { _, samples, _ in continuation.resume(returning: samples?.count ?? 0) }) } }
}
