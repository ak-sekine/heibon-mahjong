"""Extract a checked GitHub Pages artifact into a new directory."""
import re
import stat
import sys
from pathlib import Path
from zipfile import ZipFile

MAX_FILES = 10000
MAX_BYTES = 256 * 1024 * 1024
SAFE_COMPONENT = re.compile(r"[A-Za-z0-9_.@+-]+")


def extract(archive, destination):
    with ZipFile(archive) as source:
        entries = source.infolist()
        if not entries or len(entries) > MAX_FILES or sum(entry.file_size for entry in entries) > MAX_BYTES:
            raise ValueError("Unexpected Pages archive size")
        paths = set()
        for entry in entries:
            name = entry.orig_filename
            parts = name.removesuffix("/").split("/")
            mode = stat.S_IFMT(entry.external_attr >> 16)
            expected_mode = stat.S_IFDIR if entry.is_dir() else stat.S_IFREG
            if (any(part in ("", ".", "..", "__proto__") or not SAFE_COMPONENT.fullmatch(part) for part in parts)
                    or mode not in (0, expected_mode) or entry.flag_bits & 1
                    or tuple(parts) in paths):
                raise ValueError("Unsafe Pages archive entry")
            paths.add(tuple(parts))

        destination.mkdir()
        for entry in entries:
            target = destination.joinpath(*entry.filename.removesuffix("/").split("/"))
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open(entry) as content, target.open("xb") as output:
                    while chunk := content.read(65536):
                        output.write(chunk)


if __name__ == "__main__":
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
