"""Best-effort metrics helpers for the Browser UI CI suite."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
import time


def enabled():
    return os.environ.get('BROWSER_UI_METRICS') == '1'


def warn_metrics(error):
    _warn(error)


_write_lock = threading.Lock()
_warning_lock = threading.Lock()
_warned = False


def _warn(error):
    global _warned
    with _warning_lock:
        if not _warned:
            _warned = True
            try:
                print(f'::warning title=Browser UI metrics unavailable::measurement skipped ({type(error).__name__})', flush=True)
            except Exception:
                pass


def _metrics_path(name):
    directory = Path(os.environ.get('BROWSER_UI_METRICS_DIR', '/tmp/browser-ui-metrics'))
    directory.mkdir(parents=True, exist_ok=True)
    return directory / name


def record_event(event):
    if not enabled():
        return
    try:
        record = {
            'timestamp_utc': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'elapsed_seconds': round(time.monotonic() - _elapsed_origin(), 3),
            'scenario': os.environ.get('HEIBON_BROWSER_SCENARIO', Path(os.sys.argv[0]).stem),
            'browser': os.environ.get('HEIBON_BROWSER'),
            **event,
        }
        with _write_lock:
            with _metrics_path('browser-events.jsonl').open('a', encoding='utf-8') as output:
                output.write(json.dumps(record, separators=(',', ':'), ensure_ascii=False) + '\n')
    except Exception as error:  # Metrics must never alter the test result.
        _warn(error)


_METRICS_START = time.monotonic()


def _elapsed_origin():
    try:
        return float(os.environ.get('BROWSER_UI_METRICS_RUN_START_MONOTONIC', _METRICS_START))
    except ValueError:
        return _METRICS_START


def _timed_call_disabled(_name, function, *args, **kwargs):
    return function(*args, **kwargs)


def _timed_call_enabled(name, function, *args, **kwargs):
    try:
        started = time.monotonic()
        started_utc = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    except Exception as error:
        _warn(error)
        return function(*args, **kwargs)
    outcome = 'success'
    try:
        return function(*args, **kwargs)
    except BaseException:
        outcome = 'exception'
        raise
    finally:
        try:
            ended = time.monotonic()
            ended_utc = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
            record_event({
                'operation': name,
                'start_utc': started_utc,
                'end_utc': ended_utc,
                'duration_seconds': round(ended - started, 3),
                'outcome': outcome,
            })
        except Exception as error:
            _warn(error)


# Read the opt-in once per test process. Disabled calls only forward the original
# Playwright operation and do not inspect clocks, create files, or serialize data.
timed_call = _timed_call_enabled if enabled() else _timed_call_disabled


def _read_text(path):
    try:
        return Path(path).read_text(encoding='utf-8').strip()
    except (OSError, UnicodeError):
        return None


def _host_cpu_counters():
    content = _read_text('/proc/stat')
    if not content:
        return None
    fields = content.splitlines()[0].split()
    if fields[0] != 'cpu':
        return None
    values = [int(value) for value in fields[1:]]
    # guest and guest_nice are already included in user and nice.
    return sum(values[:8]), values[3] + (values[4] if len(values) > 4 else 0)


def _pressure(path):
    content = _read_text(path)
    if content is None:
        return None
    result = {}
    for line in content.splitlines():
        fields = line.split()
        if fields and fields[0] in ('some', 'full'):
            row = {}
            for value in fields[1:]:
                key, separator, item = value.partition('=')
                if separator:
                    row[key] = float(item) if key.startswith('avg') else int(item)
            result[fields[0]] = row
    return result or None


def _cgroup_files():
    content = _read_text('/proc/self/cgroup')
    if content is None:
        return None
    for line in content.splitlines():
        hierarchy, controllers, path = line.split(':', 2)
        if hierarchy == '0' and not controllers:
            root = Path('/sys/fs/cgroup') / path.lstrip('/')
            return root
    return None


def _parse_quantity(value):
    if value is None or value == 'max':
        return None
    try:
        return int(value)
    except ValueError:
        return None


class ResourceSampler:
    """Sample Linux host and cgroup resources in a stoppable in-process thread."""

    def __init__(self, interval_seconds=5):
        self.interval_seconds = interval_seconds
        self.started = time.monotonic()
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, name='browser-ui-resource-metrics', daemon=True)
        self.previous_host_cpu = None
        self.previous_cgroup_cpu = None
        self.cgroup = _cgroup_files()

    def start(self):
        if enabled():
            self.thread.start()

    def stop(self):
        try:
            if self.thread.is_alive():
                self.stop_event.set()
                self.thread.join(timeout=self.interval_seconds + 1)
                if self.thread.is_alive():
                    _warn(RuntimeError('resource sampler did not stop promptly'))
        except Exception as error:
            _warn(error)

    def _sample(self):
        now = time.monotonic()
        host = _host_cpu_counters()
        host_cpu_percent = None
        if host is not None and self.previous_host_cpu is not None:
            total_delta = host[0] - self.previous_host_cpu[0]
            idle_delta = host[1] - self.previous_host_cpu[1]
            if total_delta > 0:
                host_cpu_percent = round(max(0, total_delta - idle_delta) * 100 / total_delta, 2)
        self.previous_host_cpu = host

        mem = {}
        meminfo = _read_text('/proc/meminfo')
        if meminfo:
            for line in meminfo.splitlines():
                key, _, value = line.partition(':')
                parts = value.strip().split()
                if parts and key in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree'):
                    mem[key] = int(parts[0]) * 1024

        cgroup_cpu_usec = cgroup_cpu_percent = None
        cpu_quota_cores, cpu_quota_status = self._quota_details()
        memory_current = memory_limit = swap_current = swap_limit = None
        if self.cgroup:
            cpu_stat = _read_text(self.cgroup / 'cpu.stat')
            if cpu_stat:
                cpu_values = dict(line.split() for line in cpu_stat.splitlines() if len(line.split()) == 2)
                cgroup_cpu_usec = _parse_quantity(cpu_values.get('usage_usec'))
                if cgroup_cpu_usec is not None and self.previous_cgroup_cpu is not None:
                    elapsed = now - self.previous_cgroup_cpu[1]
                    if elapsed > 0:
                        cores = cpu_quota_cores or os.cpu_count() or 1
                        cgroup_cpu_percent = round((cgroup_cpu_usec - self.previous_cgroup_cpu[0]) / 1_000_000 / elapsed / cores * 100, 2)
                self.previous_cgroup_cpu = (cgroup_cpu_usec, now)
            memory_current = _parse_quantity(_read_text(self.cgroup / 'memory.current'))
            memory_limit = _parse_quantity(_read_text(self.cgroup / 'memory.max'))
            swap_current = _parse_quantity(_read_text(self.cgroup / 'memory.swap.current'))
            swap_limit = _parse_quantity(_read_text(self.cgroup / 'memory.swap.max'))

        try:
            process_count = sum(entry.name.isdecimal() for entry in Path('/proc').iterdir())
        except OSError:
            process_count = None

        return {
            'timestamp_utc': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
            'elapsed_seconds': round(now - self.started, 3),
            'host_cpu_percent': host_cpu_percent,
            'cgroup_cpu_percent': cgroup_cpu_percent,
            'cgroup_cpu_usage_usec': cgroup_cpu_usec,
            'logical_cpu_count': os.cpu_count(),
            'cpu_quota_cores': cpu_quota_cores,
            'cpu_quota_status': cpu_quota_status,
            'memory_used_bytes': mem.get('MemTotal', 0) - mem['MemAvailable'] if 'MemAvailable' in mem and 'MemTotal' in mem else None,
            'memory_available_bytes': mem.get('MemAvailable'),
            'memory_cgroup_current_bytes': memory_current,
            'memory_cgroup_limit_bytes': memory_limit,
            'swap_used_bytes': mem.get('SwapTotal', 0) - mem['SwapFree'] if 'SwapTotal' in mem and 'SwapFree' in mem else None,
            'swap_cgroup_current_bytes': swap_current,
            'swap_cgroup_limit_bytes': swap_limit,
            'cpu_pressure': _pressure('/proc/pressure/cpu'),
            'memory_pressure': _pressure('/proc/pressure/memory'),
            'io_pressure': _pressure('/proc/pressure/io'),
            'process_count': process_count,
        }

    def _quota_details(self):
        if not self.cgroup:
            return None, None
        content = _read_text(self.cgroup / 'cpu.max')
        if not content:
            return None, 'unavailable'
        quota, period = content.split()[:2]
        if quota == 'max':
            return None, 'unlimited'
        try:
            return round(int(quota) / int(period), 3), 'limited'
        except (ValueError, ZeroDivisionError):
            return None, 'unavailable'

    def _run(self):
        while not self.stop_event.is_set():
            try:
                record = self._sample()
                with _write_lock:
                    with _metrics_path('runner-resources.jsonl').open('a', encoding='utf-8') as output:
                        output.write(json.dumps(record, separators=(',', ':')) + '\n')
            except Exception as error:  # Resource collection is optional diagnostics.
                _warn(error)
            self.stop_event.wait(self.interval_seconds)
