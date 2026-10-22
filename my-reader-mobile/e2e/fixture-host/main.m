#import <UIKit/UIKit.h>

@interface FixtureDelegate : UIResponder <UIApplicationDelegate>
@property(strong, nonatomic) UIWindow *window;
@end

@implementation FixtureDelegate
- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  NSFileManager *files = NSFileManager.defaultManager;
  NSURL *documents = [files URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
  NSString *folder = [NSBundle.mainBundle objectForInfoDictionaryKey:@"FixtureFolder"];
  NSURL *source = [[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"FixtureData"]
      URLByAppendingPathComponent:folder];
  NSURL *destination = [documents URLByAppendingPathComponent:folder];
  NSError *coordinationError = nil;
  __block NSError *copyError = nil;
  NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
  [coordinator coordinateWritingItemAtURL:destination options:0 error:&coordinationError
      byAccessor:^(NSURL *url) {
        [files copyItemAtURL:source toURL:url error:&copyError];
      }];
  NSError *error = coordinationError ?: copyError;
  NSString *status = error ? error.localizedDescription : @"Fixtures ready";
  [status writeToURL:[documents URLByAppendingPathComponent:error ? @".failed" : @".ready"]
      atomically:YES encoding:NSUTF8StringEncoding error:nil];

  self.window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
  UIViewController *controller = [UIViewController new];
  UILabel *label = [[UILabel alloc] initWithFrame:self.window.bounds];
  label.text = status;
  label.textAlignment = NSTextAlignmentCenter;
  label.numberOfLines = 0;
  controller.view = label;
  self.window.rootViewController = controller;
  [self.window makeKeyAndVisible];
  return YES;
}
@end

int main(int argc, char *argv[]) {
  @autoreleasepool {
    return UIApplicationMain(argc, argv, nil, NSStringFromClass(FixtureDelegate.class));
  }
}
