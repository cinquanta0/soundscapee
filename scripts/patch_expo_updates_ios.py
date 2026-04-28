from pathlib import Path
import sys

PODSPEC = Path("node_modules/expo-updates/ios/EXUpdates.podspec")
FILE_DOWNLOADER = Path("node_modules/expo-updates/ios/EXUpdates/AppLoader/FileDownloader.swift")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Expected snippet not found for {label}")
    return text.replace(old, new, 1)


def main() -> int:
    podspec = PODSPEC.read_text(encoding="utf-8")
    podspec = replace_once(
        podspec,
        "  s.dependency 'EASClient'\n",
        "",
        "EXUpdates.podspec dependency removal",
    )
    PODSPEC.write_text(podspec, encoding="utf-8")

    downloader = FILE_DOWNLOADER.read_text(encoding="utf-8")
    downloader = replace_once(
        downloader,
        "import Foundation\nimport EASClient\n",
        "import Foundation\n",
        "FileDownloader import removal",
    )
    downloader = replace_once(
        downloader,
        "  // swiftlint:disable:next force_unwrapping\n  private static let ParameterParserSemicolonDelimiter = \";\".utf16.first!\n",
        "  // swiftlint:disable:next force_unwrapping\n  private static let EASClientIDHeaderValue = UUID().uuidString.lowercased()\n  private static let ParameterParserSemicolonDelimiter = \";\".utf16.first!\n",
        "FileDownloader static UUID header value",
    )
    downloader = downloader.replace(
        'request.setValue(EASClientID.uuid().uuidString, forHTTPHeaderField: "EAS-Client-ID")',
        'request.setValue(FileDownloader.EASClientIDHeaderValue, forHTTPHeaderField: "EAS-Client-ID")',
    )
    FILE_DOWNLOADER.write_text(downloader, encoding="utf-8")

    print("OK: patched expo-updates iOS to avoid EASClient module dependency")
    return 0


if __name__ == "__main__":
    sys.exit(main())
