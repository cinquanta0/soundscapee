import re, sys

PBXPROJ = 'ios/Pods/Pods.xcodeproj/project.pbxproj'

with open(PBXPROJ, 'r', encoding='utf-8') as f:
    content = f.read()

# ── Debug: mostra le righe attorno a "Generate updates resources" ──────────────
lines = content.split('\n')
print("=== CONTEXT in pbxproj ===")
for i, line in enumerate(lines):
    if 'Generate updates' in line or ('shellScript' in line and i > 0 and
       any('Generate updates' in lines[j] for j in range(max(0,i-30), i))):
        print(f"  L{i+1}: {line[:120]}")
print("==========================")

# ── Metodo 1: nome esplicito, gestisce stringhe con escape (\") ──────────────
pat1 = re.compile(
    r'(name = "Generate updates resources for expo-updates";'
    r'.*?shellScript = ")'
    r'(?:[^"\\]|\\.)*'
    r'(")',
    re.DOTALL
)
m1 = pat1.search(content)
if m1:
    modified = pat1.sub(r'\1exit 0;\2', content)
    with open(PBXPROJ, 'w', encoding='utf-8') as f:
        f.write(modified)
    print("OK: patched by name")
    sys.exit(0)

print("Metodo 1 non trovato")

# ── Metodo 2: UUID noto 46EB2E00036F80 ────────────────────────────────────────
pat2 = re.compile(
    r'(46EB2E00036F80.*?shellScript = ")'
    r'(?:[^"\\]|\\.)*'
    r'(")',
    re.DOTALL
)
m2 = pat2.search(content)
if m2:
    modified = pat2.sub(r'\1exit 0;\2', content)
    with open(PBXPROJ, 'w', encoding='utf-8') as f:
        f.write(modified)
    print("OK: patched by UUID")
    sys.exit(0)

print("Metodo 2 non trovato")

# ── Metodo 3: qualsiasi shellScript nel blocco EXUpdates ─────────────────────
# Trova il blocco della target EXUpdates e sostituisce tutti i shellScript
pat3 = re.compile(
    r'(\/\* Generate updates resources for expo-updates \*\/[^{]*\{[^}]*shellScript = ")'
    r'(?:[^"\\]|\\.)*'
    r'(")',
    re.DOTALL
)
m3 = pat3.search(content)
if m3:
    modified = pat3.sub(r'\1exit 0;\2', content)
    with open(PBXPROJ, 'w', encoding='utf-8') as f:
        f.write(modified)
    print("OK: patched by comment marker")
    sys.exit(0)

print("Metodo 3 non trovato")

# ── Metodo 4: grep grezzo per UUID da log Codemagic ───────────────────────────
# Cerca qualsiasi UUID seguito (entro 50 righe) da shellScript
# e stampa contesto per debug
print("=== TUTTI I shellScript nel file ===")
for i, line in enumerate(lines):
    if 'shellScript' in line:
        ctx_start = max(0, i-5)
        ctx_end = min(len(lines), i+2)
        print(f"--- shellScript a L{i+1} ---")
        for j in range(ctx_start, ctx_end):
            print(f"  L{j+1}: {lines[j][:150]}")
print("=====================================")
print("FATAL: impossibile patchare - guarda il debug sopra e aggiorna il regex")
sys.exit(1)
