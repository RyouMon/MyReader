#!/usr/bin/env python3
"""Export native compiler coverage without replacing the platform test runners."""

import argparse
import copy
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def prepare_swift(project):
    def scheme(name):
        matches = sorted(project.glob(f"xcuserdata/*/xcschemes/{name}.xcscheme"))
        if not matches:
            raise ValueError(f"{name} scheme missing; run pod install first")
        return ET.parse(matches[0])

    tree = scheme("Readium-Unit-Tests")
    action = tree.getroot().find("TestAction")
    if action is None:
        raise ValueError("Readium-Unit-Tests has no TestAction")
    action.set("codeCoverageEnabled", "YES")
    action.set("onlyGenerateCoverageForSpecifiedTargets", "YES")
    for existing in action.findall("CodeCoverageTargets"):
        action.remove(existing)
    targets = ET.SubElement(action, "CodeCoverageTargets")
    for name in ("Readium", "ExpoSharing"):
        reference = scheme(name).find(".//BuildableReference")
        if reference is None:
            raise ValueError(f"{name} scheme has no buildable target")
        targets.append(copy.deepcopy(reference))
    destination = project / "xcshareddata/xcschemes/Reader-Coverage.xcscheme"
    destination.parent.mkdir(parents=True, exist_ok=True)
    tree.write(destination, encoding="utf-8", xml_declaration=True)
    return destination


def jacoco(report, sources, output):
    files = {}
    for source in sources:
        for file in Path(source).rglob("*"):
            if file.suffix not in (".kt", ".java"):
                continue
            package = re.search(r"^package\s+([\w.]+)", file.read_text(), re.MULTILINE)
            if package:
                key = package[1].replace(".", "/") + "/" + file.name
                if key in files:
                    raise ValueError(f"Ambiguous JaCoCo source: {key}")
                files[key] = file.resolve()
    records = []
    for package in ET.parse(report).getroot().findall("package"):
        for source in package.findall("sourcefile"):
            key = package.get("name") + "/" + source.get("name")
            if key not in files:
                # Kotlin may inline dependency code into the caller's package.
                # Only sources from the explicitly supplied roots are exported.
                continue
            lines = source.findall("line")
            if not lines:
                continue
            records.append("SF:" + str(files[key]))
            covered = 0
            for line in lines:
                number, hits = int(line.get("nr")), int(line.get("ci"))
                if number < 1 or hits < 0:
                    raise ValueError(f"Invalid JaCoCo line in {key}")
                covered += hits > 0
                records.append(f"DA:{number},{1 if hits else 0}")
            records.extend((f"LF:{len(lines)}", f"LH:{covered}", "end_of_record"))
    if not records:
        raise ValueError("Empty JaCoCo report for the supplied sources")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(records) + "\n")


def swift_llvm(derived_data, simulator, output):
    build = derived_data / "Build"
    profile = build / "ProfileData" / simulator / "Coverage.profdata"
    binary = build / "Products/Debug-iphonesimulator/AppHost-Readium-Unit-Tests.app/PlugIns/Readium-Unit-Tests.xctest/Readium-Unit-Tests"
    if not profile.is_file() or not binary.is_file():
        raise ValueError("Swift coverage profile or instrumented test binary missing")
    # Xcode can omit the xccov archive for selected static-library targets.
    # Export the same compiler counters directly using Apple's LLVM tools.
    report = subprocess.check_output([
        "xcrun", "llvm-cov", "export", "-format=lcov",
        f"-instr-profile={profile}", str(binary),
    ])
    if b"SF:" not in report or b"DA:" not in report:
        raise ValueError("Empty Swift LLVM report")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    swift = sub.add_parser("prepare-swift")
    swift.add_argument("--project", type=Path, default=ROOT / "my-reader-mobile/ios/Pods/Pods.xcodeproj")
    java = sub.add_parser("jacoco")
    java.add_argument("report", type=Path)
    java.add_argument("output", type=Path)
    java.add_argument("sources", nargs="+", type=Path)
    llvm = sub.add_parser("swift-llvm")
    llvm.add_argument("derived_data", type=Path)
    llvm.add_argument("simulator")
    llvm.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.command == "prepare-swift":
        print(prepare_swift(args.project))
    elif args.command == "jacoco":
        jacoco(args.report, args.sources, args.output)
    else:
        swift_llvm(args.derived_data, args.simulator, args.output)
