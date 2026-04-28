import sys
import re

PODFILE = 'ios/Podfile'

with open(PODFILE, 'r', encoding='utf-8') as f:
    content = f.read()

if 'SWIFT_STRICT_CONCURRENCY' in content:
    print("Podfile already patched, skipping")
    sys.exit(0)

injection = (
    "  # Force Swift 5 compatibility mode on all Pods (Xcode 16.2 ships Swift 6 compiler)\n"
    "  installer.pods_project.targets.each do |target|\n"
    "    target.build_configurations.each do |config|\n"
    "      config.build_settings['SWIFT_VERSION'] = '5'\n"
    "      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n"
    "    end\n"
    "  end\n"
)

# Inject immediately after the opening line of the existing post_install block
pat = re.compile(r'(post_install do \|installer\|[^\n]*\n)')
m = pat.search(content)
if not m:
    print("FATAL: post_install block not found in Podfile")
    sys.exit(1)

patched = pat.sub(lambda x: x.group(0) + injection, content, count=1)

with open(PODFILE, 'w', encoding='utf-8') as f:
    f.write(patched)

print("OK: SWIFT_VERSION=5 + SWIFT_STRICT_CONCURRENCY=minimal injected into post_install")
