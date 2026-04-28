import re
import sys

PODFILE = "ios/Podfile"
DISABLE_UPDATES_SCRIPT = "$expo_updates_create_updates_resources = false\n"
EXAV_FRAMEWORK_PATCH = """pre_install do |installer|
  installer.pod_targets.each do |pod|
    next unless pod.name == 'EXAV'

    def pod.build_type
      Pod::BuildType.static_framework
    end
  end
end

"""


with open(PODFILE, "r", encoding="utf-8") as f:
    content = f.read()

updated = content
changes = []

if "$expo_updates_create_updates_resources" not in updated:
    updated = DISABLE_UPDATES_SCRIPT + updated
    changes.append("disabled expo-updates resource generation")

if "next unless pod.name == 'EXAV'" not in updated:
    updated = EXAV_FRAMEWORK_PATCH + updated
    changes.append("forced EXAV to build as framework")

if "SWIFT_STRICT_CONCURRENCY" not in updated:
    injection = (
        "  # Keep Pod Swift settings explicit for Xcode 16.2 archive builds\n"
        "  installer.pods_project.targets.each do |target|\n"
        "    target.build_configurations.each do |config|\n"
        "      config.build_settings['SWIFT_STRICT_CONCURRENCY'] = 'minimal'\n"
        "      config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'\n"
        "      config.build_settings['_EXPERIMENTAL_SWIFT_EXPLICIT_MODULES'] = 'NO'\n"
        "    end\n"
        "  end\n"
    )

    pat = re.compile(r"(post_install do \|installer\|[^\n]*\n)")
    if not pat.search(updated):
        print("FATAL: post_install block not found in Podfile")
        sys.exit(1)

    updated = pat.sub(lambda m: m.group(1) + injection, updated, count=1)
    changes.append("set Swift build settings")

if updated == content:
    print("Podfile already patched, skipping")
    sys.exit(0)

with open(PODFILE, "w", encoding="utf-8") as f:
    f.write(updated)

print("OK: " + ", ".join(changes))
