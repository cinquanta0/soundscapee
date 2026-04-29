#!/usr/bin/env python3
"""
create_expo_modulemaps.py

Crea manualmente i file .modulemap per tutti i pod EX*/Expo* che non li generano
da soli (perché hanno DEFINES_MODULE=NO nel loro xcconfig).

Questo risolve l'errore:
  module map file '.../EXApplication/EXApplication.modulemap' not found
  cannot load underlying module for 'EXApplication'

Da chiamare DOPO pod install e PRIMA di xcodebuild.
"""

import os
import glob
import subprocess
import sys

# Trova SYMROOT (dove xcodebuild mette i prodotti) tramite xcodebuild -showBuildSettings
# oppure usa il path standard di Codemagic
WORKSPACE = "ios/soundscapemobile.xcworkspace"
SCHEME = "soundscapemobile"

def get_build_products_path():
    """Legge BUILT_PRODUCTS_DIR da xcodebuild -showBuildSettings"""
    try:
        result = subprocess.run(
            [
                "xcodebuild",
                "-workspace", WORKSPACE,
                "-scheme", SCHEME,
                "-configuration", "Release",
                "-destination", "generic/platform=iOS",
                "-showBuildSettings",
            ],
            capture_output=True, text=True, timeout=120
        )
        for line in result.stdout.splitlines():
            if "BUILT_PRODUCTS_DIR" in line:
                return line.split("=", 1)[1].strip()
    except Exception as e:
        print(f"Warning: could not read BUILT_PRODUCTS_DIR: {e}")
    return None


def get_pod_public_headers_path():
    return "ios/Pods/Headers/Public"


def create_modulemap(pod_name, headers_dir, output_dir):
    """Crea un .modulemap minimale per il pod dato"""
    os.makedirs(output_dir, exist_ok=True)
    modulemap_path = os.path.join(output_dir, f"{pod_name}.modulemap")

    if os.path.exists(modulemap_path):
        print(f"  [skip] {pod_name}.modulemap already exists")
        return

    # Raccogli tutti gli header pubblici del pod
    headers = glob.glob(os.path.join(headers_dir, "*.h"))
    header_lines = "\n".join(
        f'  header "{os.path.abspath(h)}"' for h in sorted(headers)
    )

    if not headers:
        # Modulemap vuoto ma valido
        content = f'module {pod_name} {{\n  umbrella header ""\n  export *\n}}\n'
    else:
        content = (
            f"module {pod_name} {{\n"
            f"{header_lines}\n"
            f"  export *\n"
            f"}}\n"
        )

    with open(modulemap_path, "w") as f:
        f.write(content)

    print(f"  [created] {modulemap_path}")


def main():
    headers_root = get_pod_public_headers_path()
    if not os.path.isdir(headers_root):
        print(f"ERROR: {headers_root} not found — run pod install first")
        sys.exit(1)

    # Trova tutti i pod EX* e Expo* con header pubblici
    pods = [
        d for d in os.listdir(headers_root)
        if (d.startswith("EX") or d.startswith("Expo"))
        and os.path.isdir(os.path.join(headers_root, d))
    ]

    if not pods:
        print("No EX*/Expo* pods found in public headers — nothing to do")
        sys.exit(0)

    print(f"Found {len(pods)} EX*/Expo* pods: {', '.join(pods)}")

    # Prova a trovare il BUILT_PRODUCTS_DIR reale
    build_products = get_build_products_path()

    for pod in pods:
        headers_dir = os.path.join(headers_root, pod)

        # 1. Crea il modulemap nella cartella pubblica del pod
        #    (usato da -fmodule-map-file nei riferimenti statici)
        create_modulemap(pod, headers_dir, headers_dir)

        # 2. Se abbiamo il build products path, crea anche lì
        #    (è il path che xcodebuild cerca a runtime)
        if build_products:
            pod_build_dir = os.path.join(build_products, pod)
            create_modulemap(pod, headers_dir, pod_build_dir)

    print("Done — modulemaps created.")


if __name__ == "__main__":
    main()