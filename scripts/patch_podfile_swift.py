import sys

PODFILE = 'ios/Podfile'

hook = """
# Disable Swift 6 strict concurrency for all Pods (Xcode 16.2 compatibility)
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'
      config.build_settings['OTHER_SWIFT_FLAGS'] = '$(inherited) -strict-concurrency=minimal'
    end
  end
end
"""

with open(PODFILE, 'r', encoding='utf-8') as f:
    content = f.read()

if 'SWIFT_STRICT_CONCURRENCY' in content:
    print("Podfile already patched, skipping")
    sys.exit(0)

with open(PODFILE, 'a', encoding='utf-8') as f:
    f.write(hook)

print("OK: post_install hook appended to Podfile")
