#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LocationAccuracyModule, NSObject)

RCT_EXTERN_METHOD(isPreciseLocationEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
