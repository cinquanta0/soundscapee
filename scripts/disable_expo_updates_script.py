import re, sys

PBXPROJ = 'ios/Pods/Pods.xcodeproj/project.pbxproj'

with open(PBXPROJ, 'r', encoding='utf-8') as f:
    content = f.read()

modified = re.sub(
    r'(name = "Generate updates resources for expo-updates";.*?shellScript = ")[^"]*(")',
    r'\1exit 0;\2',
    content,
    flags=re.DOTALL
)

with open(PBXPROJ, 'w', encoding='utf-8') as f:
    f.write(modified)

if modified != content:
    print("OK: expo-updates generate script neutralized")
else:
    print("WARN: pattern not found - trying fallback with UUID")
    # Fallback: cerca per UUID noto (46EB2E00036F80) - consistente tra build
    modified2 = re.sub(
        r'(/\* Generate updates resources for expo-updates \*/,?\s*\n[^;]*shellScript = ")[^"]*(")',
        r'\1exit 0;\2',
        content,
        flags=re.DOTALL
    )
    with open(PBXPROJ, 'w', encoding='utf-8') as f:
        f.write(modified2)
    print("OK: fallback applied" if modified2 != content else "ERROR: could not patch - build may fail")
    sys.exit(0 if modified2 != content else 1)
