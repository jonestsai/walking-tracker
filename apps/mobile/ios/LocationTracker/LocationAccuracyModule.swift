import CoreLocation
import React

@objc(LocationAccuracyModule)
class LocationAccuracyModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc
  func isPreciseLocationEnabled(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let locationManager = CLLocationManager()
    resolve(locationManager.accuracyAuthorization == .fullAccuracy)
  }
}
