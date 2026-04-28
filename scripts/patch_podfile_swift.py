import sys
import re

PODFILE = 'ios/Podfile'

with open(PODFILE, 'r', encoding='utf-8') as f:
    content = f.read()

if 'SWIFT_STRICT_CONCURRENCY' in content:
    print("Podfile already patched, skipping")
    sys.exit(0)

injection = (
    "  # Keep Pod Swift settings explicit for Xcode 16.2 archive builds\n"
    "  installer.pods_project.targets.each do |target|\n"
    "    target.build_configurations.each do |config|\n"
    "      config.build_settings['SWIFT_VERSION'] = '5'\n"
    "      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n"
    "      if target.name == 'EASClient'\n"
    "        config.build_settings['DEFINES_MODULE'] = 'YES'\n"
    "      end\n"
    "    end\n"
    "  end\n"
)

pat = re.compile(r'(post_install do \|installer\|[^\n]*\n)')
m = pat.search(content)
if not m:
    print("FATAL: post_install block not found in Podfile")
    sys.exit(1)

patched = pat.sub(lambda x: x.group(0) + injection, content, count=1)

with open(PODFILE, 'w', encoding='utf-8') as f:
    f.write(patched)

print("OK: Swift 5 compatibility injected and EASClient keeps DEFINES_MODULE=YES without overriding module maps")
