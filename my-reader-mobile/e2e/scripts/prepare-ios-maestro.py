"""Build an isolated Maestro 2.11 iOS driver with propagated XCTest issues."""
import argparse
import hashlib
import io
import json
import platform
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path

SOURCE_COMMIT = "c8c361be1cc89b2e742f185466a302a22778be6b"
SOURCE_SHA256 = "0b6eff3e892a4ff87b2b1a1e133257fdc50c2cb741578fb90ed965368dd5c3d5"
PATCH_SHA256 = "8a3dd51fb83a4259c9ce9fdbfe9dc701d3bc1a057c6b8a1e35c216c9bd8d50cd"
OFFICIAL_JAR_SHA256 = "5316a3f28d2d50319138f9e2f46bbc817b8fc0e328aa7277ed50375ad291c34e"
SOURCE_URL = (
    "https://codeload.github.com/mobile-dev-inc/Maestro/tar.gz/" + SOURCE_COMMIT
)
RESOURCE_ROOT = "driver-iPhoneSimulator/"
APPS = ("maestro-driver-iosUITests-Runner.app", "maestro-driver-ios.app")


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(path, expected):
    actual = sha256(path)
    if actual != expected:
        raise ValueError(
            f"Checksum mismatch for {path}: expected {expected}, got {actual}"
        )


def extract_sources(archive_path, destination):
    destination = Path(destination)
    count = 0
    with tarfile.open(archive_path, "r:gz") as archive:
        for entry in archive:
            parts = Path(entry.name).parts
            if len(parts) < 3 or parts[1] != "maestro-ios-xctest-runner":
                continue
            target = destination.joinpath(*parts[2:])
            if not target.resolve().is_relative_to(destination.resolve()):
                raise ValueError(f"Unsafe source path: {entry.name}")
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif entry.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(entry) as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output)
                count += 1
            else:
                raise ValueError(f"Unsupported source entry: {entry.name}")
    if count == 0:
        raise ValueError("Archive contains no iOS driver source files")


def application_zip(app):
    app = Path(app)
    if not app.is_dir() or app.is_symlink():
        raise ValueError(f"Missing build product: {app}")
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(app.rglob("*")):
            if path.is_symlink():
                raise ValueError(f"Unexpected symlink in build product: {path}")
            if path.is_file():
                archive.write(path, str(path.relative_to(app.parent)))
    return output.getvalue()


def create_overlay(official, products, destination):
    official, products, destination = map(Path, (official, products, destination))
    if destination.exists():
        raise ValueError(f"Output already exists: {destination}")
    configurations = list(products.glob("*.xctestrun"))
    if len(configurations) != 1:
        raise ValueError("Expected exactly one freshly built xctestrun configuration")
    replacements = {
        RESOURCE_ROOT
        + "Debug-iphonesimulator/"
        + app.replace(".app", ".zip"): application_zip(
            products / "Debug-iphonesimulator" / app
        )
        for app in APPS
    }
    replacements[
        RESOURCE_ROOT + "maestro-driver-ios-config.xctestrun"
    ] = configurations[0].read_bytes()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="maestro-overlay-", dir=destination.parent
    ) as temporary:
        staging = Path(temporary) / "maestro"
        (staging / "lib").mkdir(parents=True)
        shutil.copytree(official / "bin", staging / "bin")
        for library in (official / "lib").iterdir():
            if library.name != "maestro-ios-driver.jar":
                (staging / "lib" / library.name).symlink_to(library.resolve())
        original_jar = official / "lib/maestro-ios-driver.jar"
        new_jar = staging / "lib/maestro-ios-driver.jar"
        with zipfile.ZipFile(original_jar) as source, zipfile.ZipFile(
            new_jar, "w"
        ) as output:
            if len(source.namelist()) != len(set(source.namelist())):
                raise ValueError("Official driver archive contains duplicate entries")
            if not set(replacements).issubset(source.namelist()):
                raise ValueError(
                    "Official driver archive is missing required simulator resources"
                )
            for entry in source.infolist():
                output.writestr(
                    entry, replacements.get(entry.filename, source.read(entry.filename))
                )
        with zipfile.ZipFile(original_jar) as source, zipfile.ZipFile(
            new_jar
        ) as output:
            if source.namelist() != output.namelist():
                raise ValueError("Driver archive entries changed unexpectedly")
            for name in source.namelist():
                expected = replacements.get(name, source.read(name))
                if output.read(name) != expected:
                    raise ValueError(
                        f"Driver archive content verification failed: {name}"
                    )
        proof = {
            "officialJarSha256": sha256(original_jar),
            "modifiedJarSha256": sha256(new_jar),
            "replacedResources": {
                name: hashlib.sha256(data).hexdigest()
                for name, data in replacements.items()
            },
        }
        staging.rename(destination)
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("official_cli", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    if platform.system() != "Darwin":
        raise ValueError("The iOS test driver must be built on macOS")
    if args.output.exists():
        raise ValueError(f"Output already exists: {args.output}")
    patch = (
        Path(__file__).resolve().parent.parent
        / "patches/maestro-2.11.0-xctest-issues.patch"
    )
    verify_checksum(patch, PATCH_SHA256)
    original_jar = args.official_cli / "lib/maestro-ios-driver.jar"
    verify_checksum(original_jar, OFFICIAL_JAR_SHA256)
    args.evidence.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="myreader-maestro-build-") as temporary:
        work = Path(temporary)
        archive = work / "source.tar.gz"
        source = work / "source"
        derived = work / "derived"
        with (args.evidence / "build.log").open("w") as log:

            def run(command, **options):
                subprocess.run(
                    command, check=True, stdout=log, stderr=subprocess.STDOUT, **options
                )

            run(
                [
                    "curl",
                    "--fail",
                    "--silent",
                    "--show-error",
                    "--location",
                    "--retry",
                    "3",
                    "--connect-timeout",
                    "10",
                    "--max-time",
                    "180",
                    "--output",
                    str(archive),
                    SOURCE_URL,
                ],
                timeout=720,
            )
            verify_checksum(archive, SOURCE_SHA256)
            extract_sources(archive, source)
            run(["git", "apply", "-p2", str(patch)], cwd=source, timeout=30)
            run(
                [
                    "xcodebuild",
                    "build-for-testing",
                    "-project",
                    str(source / "maestro-driver-ios.xcodeproj"),
                    "-scheme",
                    "maestro-driver-ios",
                    "-configuration",
                    "Debug",
                    "-derivedDataPath",
                    str(derived),
                    "-destination",
                    "generic/platform=iOS Simulator",
                    "-onlyUsePackageVersionsFromResolvedFile",
                    "-jobs",
                    "2",
                    "ARCHS=" + platform.machine(),
                    "ONLY_ACTIVE_ARCH=YES",
                    "CODE_SIGNING_ALLOWED=YES",
                    "CODE_SIGN_IDENTITY=-",
                    "DEVELOPMENT_TEAM=",
                    "IPHONEOS_DEPLOYMENT_TARGET=15.0",
                ],
                timeout=1200,
            )
            products = derived / "Build/Products"
            for app in APPS:
                run(
                    [
                        "codesign",
                        "--verify",
                        "--deep",
                        "--strict",
                        str(products / "Debug-iphonesimulator" / app),
                    ],
                    timeout=30,
                )
        proof = create_overlay(args.official_cli, products, args.output)
    verify_checksum(original_jar, OFFICIAL_JAR_SHA256)
    proof.update(
        {
            "builderSha256": sha256(__file__),
            "sourceCommit": SOURCE_COMMIT,
            "sourceUrl": SOURCE_URL,
            "sourceSha256": SOURCE_SHA256,
            "patchSha256": PATCH_SHA256,
            "xcode": subprocess.check_output(
                ["xcodebuild", "-version"], text=True
            ).strip(),
            "architecture": platform.machine(),
        }
    )
    (args.evidence / "driver.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(str(args.output / "bin"))


if __name__ == "__main__":
    main()
