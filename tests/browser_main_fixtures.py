"""Stabilize legacy seat-zero browser fixtures against production seat draws."""
import re


WAIT_SOURCE = re.compile(
    r'wait:\s*\(milliseconds,\s*signal,\s*context\)\s*=>\s*'
    r'waitForTurn\(riverDebugMode\s*\?\s*800\s*:\s*milliseconds,\s*signal,\s*context\)'
)


def fixed_seat_fixture(source, wait_expression=None):
    """Keep seat-zero fixtures deterministic; optionally install a controlled CPU wait."""
    source, count = re.subn(
        r'randomizeSeating:\s*true\b',
        'randomizeSeating: true, random: () => 0.999999',
        source,
        count=1,
    )
    if count != 1:
        raise AssertionError('Expected the main module to enable randomized seating once')

    if wait_expression is not None:
        source, count = WAIT_SOURCE.subn(f'wait: {wait_expression}', source, count=1)
        if count != 1:
            raise AssertionError('Expected the main module to provide the default automatic-turn wait')

    return source
