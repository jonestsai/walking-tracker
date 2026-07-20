const { withDangerousMod, withInfoPlist, withXcodeProject } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const alwaysLocationDescription = "During an active Walk, WalkingAtlas uses your precise location in the background, including while your phone is locked, to continue unlocking tiles.";

const privacyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryUserDefaults</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict>
    <dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryFileTimestamp</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>0A2A.1</string><string>3B52.1</string><string>C617.1</string></array></dict>
    <dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategoryDiskSpace</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>E174.1</string><string>85F4.1</string></array></dict>
    <dict><key>NSPrivacyAccessedAPIType</key><string>NSPrivacyAccessedAPICategorySystemBootTime</string><key>NSPrivacyAccessedAPITypeReasons</key><array><string>35F9.1</string></array></dict>
  </array>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict><key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypePreciseLocation</string><key>NSPrivacyCollectedDataTypeLinked</key><true/><key>NSPrivacyCollectedDataTypeTracking</key><false/><key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array></dict>
    <dict><key>NSPrivacyCollectedDataType</key><string>NSPrivacyCollectedDataTypeUserID</string><key>NSPrivacyCollectedDataTypeLinked</key><true/><key>NSPrivacyCollectedDataTypeTracking</key><false/><key>NSPrivacyCollectedDataTypePurposes</key><array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array></dict>
  </array>
  <key>NSPrivacyTracking</key><false/>
</dict>
</plist>
`;

const locationAccuracySwift = `import CoreLocation
import React

@objc(LocationAccuracyModule)
class LocationAccuracyModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc func isPreciseLocationEnabled(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let locationManager = CLLocationManager()
    resolve(locationManager.accuracyAuthorization == .fullAccuracy)
  }
}
`;

const locationAccuracyObjectiveC = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LocationAccuracyModule, NSObject)
RCT_EXTERN_METHOD(isPreciseLocationEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
`;

function hasFileReference(project, relativePath) {
  return Object.values(project.pbxFileReferenceSection())
    .some((reference) => reference && reference.path === relativePath);
}

module.exports = function withAppReviewPrivacy(config) {
  config = withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSLocationAlwaysUsageDescription = alwaysLocationDescription;
    modConfig.modResults.NSLocationAlwaysAndWhenInUseUsageDescription = alwaysLocationDescription;
    modConfig.modResults.UIBackgroundModes = [...new Set([...(modConfig.modResults.UIBackgroundModes ?? []), "location"])]
      .filter((mode) => mode !== "fetch");
    return modConfig;
  });

  config = withDangerousMod(config, ["ios", async (modConfig) => {
    const sourceRoot = path.join(modConfig.modRequest.platformProjectRoot, modConfig.modRequest.projectName);
    fs.writeFileSync(path.join(sourceRoot, "PrivacyInfo.xcprivacy"), privacyManifest);
    fs.writeFileSync(path.join(sourceRoot, "LocationAccuracyModule.swift"), locationAccuracySwift);
    fs.writeFileSync(path.join(sourceRoot, "LocationAccuracyModule.m"), locationAccuracyObjectiveC);
    return modConfig;
  }]);

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const target = project.getFirstTarget();
    for (const file of ["WalkingAtlas/LocationAccuracyModule.swift", "WalkingAtlas/LocationAccuracyModule.m"]) {
      if (!hasFileReference(project, file)) project.addSourceFile(file, { target: target.uuid });
    }
    return modConfig;
  });
};
