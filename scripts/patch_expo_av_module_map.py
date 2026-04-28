from pathlib import Path
import sys


PODSPEC = Path("node_modules/expo-av/ios/EXAV.podspec")
MODULEMAP = Path("node_modules/expo-av/ios/EXAV/module.modulemap")
MODULEMAP_LINE = "  s.module_map = 'EXAV/module.modulemap'\n"
MODULEMAP_CONTENT = """module EXAV {
  umbrella header "EXAV.h"
  export *
  module * { export * }
}
"""


def main() -> int:
    if not PODSPEC.exists():
        print(f"FATAL: missing {PODSPEC}")
        return 1

    content = PODSPEC.read_text(encoding="utf-8")
    if "s.module_map = 'EXAV/module.modulemap'" not in content:
        needle = '    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20"\n  }\n'
        replacement = '    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20"\n  }\n' + MODULEMAP_LINE
        if needle not in content:
            print("FATAL: could not find pod_target_xcconfig block in EXAV.podspec")
            return 1
        PODSPEC.write_text(content.replace(needle, replacement, 1), encoding="utf-8")
        print("OK: patched EXAV.podspec with explicit module_map")
    else:
        print("OK: EXAV.podspec already patched")

    if not MODULEMAP.exists() or MODULEMAP.read_text(encoding="utf-8") != MODULEMAP_CONTENT:
        MODULEMAP.write_text(MODULEMAP_CONTENT, encoding="utf-8")
        print("OK: wrote EXAV/module.modulemap")
    else:
        print("OK: EXAV/module.modulemap already present")

    return 0


if __name__ == "__main__":
    sys.exit(main())
