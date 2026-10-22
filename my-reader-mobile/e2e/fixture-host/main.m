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
  NSURL *source = [[[NSBundle.mainBundle.resourceURL URLByAppendingPathComponent:@"FixtureData"]
      URLByAppendingPathComponent:folder] URLByAppendingPathComponent:@"Fixtures"];
  NSURL *destination = [[documents URLByAppendingPathComponent:folder]
      URLByAppendingPathComponent:@"Fixtures"];
  NSError *error = nil;
  [files createDirectoryAtURL:destination withIntermediateDirectories:YES attributes:nil error:&error];
  NSFileCoordinator *coordinator = [[NSFileCoordinator alloc] initWithFilePresenter:nil];
  NSArray<NSURL *> *sources = error ? nil : [files contentsOfDirectoryAtURL:source
      includingPropertiesForKeys:nil options:0 error:&error];
  for (NSURL *file in sources) {
    NSData *data = [NSData dataWithContentsOfURL:file options:0 error:&error];
    if (error) break;
    NSError *coordinationError = nil;
    __block NSError *writeError = nil;
    // Publish each document through its own coordinated write. Directory-level
    // copies do not coordinate the individual files with the Files provider.
    [coordinator coordinateWritingItemAtURL:[destination URLByAppendingPathComponent:file.lastPathComponent]
        options:0 error:&coordinationError byAccessor:^(NSURL *url) {
          [data writeToURL:url options:NSDataWritingAtomic error:&writeError];
        }];
    error = coordinationError ?: writeError;
    if (error) break;
  }
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
