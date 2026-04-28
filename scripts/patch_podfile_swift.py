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
        "      if target.name.start_with?('Pods-')\n"
        "        config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'\n"
        "        config.build_settings['HEADERMAP_USES_VFS'] = 'NO'\n"
        "      end\n"
        "    end\n"
        "  end\n"
    )

    pat = re.compile(r"(post_install do \|installer\|[^\n]*\n)")
    if not pat.search(updated):
        print("FATAL: post_install block not found in Podfile")
        sys.exit(1)

    updated = pat.sub(lambda m: m.group(1) + injection, updated, count=1)
    changes.append("set Swift build settings")

# FIX: EXApplication modulemap not found — force DEFINES_MODULE=YES for all
# EX* and Expo* pods so their modulemaps are generated before ExpoModulesProvider.swift
if "DEFINES_MODULE.*EX" not in updated and "expo_modules_defines_module" not in updated:
    expo_module_fix = (
        "  # Fix: force DEFINES_MODULE for all Expo/EX pods so modulemaps exist\n"
        "  # before ExpoModulesProvider.swift is compiled (avoids 'cannot load\n"
        "  # underlying module for EXApplication' error on Xcode 16.2 archive).\n"
        "  installer.pods_project.targets.each do |target|\n"
        "    if target.name.start_with?('EX') || target.name.start_with?('Expo')\n"
        "      target.build_configurations.each do |config|\n"
        "        config.build_settings['DEFINES_MODULE'] = 'YES'\n"
        "        config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'\n"
        "        config.build_settings['_EXPERIMENTAL_SWIFT_EXPLICIT_MODULES'] = 'NO'\n"
        "      end\n"
        "    end\n"
        "  end\n"
        "  # expo_modules_defines_module flag (sentinel — do not remove)\n"
    )

    pat = re.compile(r"(post_install do \|installer\|[^\n]*\n)")
    if not pat.search(updated):
        print("FATAL: post_install block not found in Podfile (second pass)")
        sys.exit(1)

    updated = pat.sub(lambda m: m.group(1) + expo_module_fix, updated, count=1)
    changes.append("forced DEFINES_MODULE=YES for EX*/Expo* pods")

if updated == content:
    print("Podfile already patched, skipping")
    sys.exit(0)

with open(PODFILE, "w", encoding="utf-8") as f:
    f.write(updated)

print("OK: " + ", ".join(changes))