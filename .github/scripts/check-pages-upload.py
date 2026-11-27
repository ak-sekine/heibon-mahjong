"""Compare the uploaded Pages artifact's tar payload with the staged site."""
import hashlib
import os
import sys
import tarfile
import zipfile
from pathlib import Path


def checked(root, archive):
    expected = {}
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            if (Path(directory) / name).is_symlink():
                raise ValueError('Symlink in staged site')
        for name in files:
            item = Path(directory) / name
            expected[item.relative_to(root).as_posix()] = hashlib.sha256(item.read_bytes()).hexdigest()
    if not expected:
        raise ValueError('Empty staged site')
    actual = {}
    size = 0
    with zipfile.ZipFile(archive) as outer:
        entries = outer.infolist()
        if len(entries) != 1 or entries[0].filename != 'artifact.tar' or entries[0].file_size > 256 * 1024 * 1024:
            raise ValueError('Invalid Pages ZIP layout')
        with outer.open(entries[0]) as blob, tarfile.open(fileobj=blob, mode='r|*') as tar:
            for member in tar:
                name = member.name.removeprefix('./').rstrip('/')
                if name in ('', '.') and member.isdir():
                    continue
                parts = name.split('/')
                if name.startswith('/') or any(part in ('', '.', '..') for part in parts):
                    raise ValueError('Unsafe Pages archive path')
                if member.isdir():
                    continue
                if not member.isfile() or name in actual or len(actual) >= 10000:
                    raise ValueError('Unsafe Pages archive member')
                size += member.size
                if size > 256 * 1024 * 1024:
                    raise ValueError('Pages archive too large')
                file = tar.extractfile(member)
                digest = hashlib.sha256()
                for chunk in iter(lambda: file.read(65536), b''):
                    digest.update(chunk)
                actual[name] = digest.hexdigest()
    if actual != expected:
        raise ValueError('Uploaded Pages files differ from staged site')


if __name__ == '__main__':
    checked(Path(sys.argv[2]), Path(sys.argv[1]))
