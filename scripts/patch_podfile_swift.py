import sys
import re

PODFILE = 'ios/Podfile'

with open(PODFILE, 'r', encoding='utf-8') as f:
    content = f.read()

if 'SWIFT_STRICT_CONCURRENCY' in content:
    print("Podfile already patched, skipping")
    sys.exit(0)

injection = (
    "  # Fix module resolution + Swift 5 compat for Xcode 16.2 archive builds\n"
    "  installer.pods_project.targets.each do |target|\n"
    "    target.build_configurations.each do |config|\n"
    "      config.build_settings['SWIFT_VERSION'] = '5'\n"
    "      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n"
    "      # EASClient modulemap missing in archive intermediates path (Xcode 16 regression)\n"
    "      if target.name == 'EASClient'\n"
    "        config.build_settings['DEFINES_MODULE'] = 'YES'\n"
    "        config.build_settings['MODULEMAP_FILE'] = ''\n"
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

print("OK: EASClient DEFINES_MODULE=YES + Swift 5 compat injected into post_install")
