#!/usr/bin/env python3
"""Manual-only local WebSocket probe; never contacts a published Worker."""
import json
import os
import subprocess

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError, sync_playwright


SERVER = r"""
const http = require('http');
const { WebSocketServer } = require('ws');
const server = http.createServer((_req, res) => { res.writeHead(200); res.end('local probe'); });
const wss = new WebSocketServer({ server });
wss.on('connection', socket => socket.on('message', () => socket.send('ack')));
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
"""


def observe_echo(page):
    before = page.evaluate("window.probe.messages")
    page.evaluate("if (window.probe.socket.readyState === WebSocket.OPEN) window.probe.socket.send('probe')")
    try:
        page.wait_for_function("n => window.probe.messages > n", arg=before, timeout=2000)
        return True
    except PlaywrightTimeoutError:
        return False


def state(page):
    return page.evaluate("""() => ({online: navigator.onLine, readyState: window.probe.socket.readyState,
        events: window.probe.events, messages: window.probe.messages})""")


def fresh_http(page, port):
    return page.evaluate("""async port => {
      try { return (await fetch(`http://127.0.0.1:${port}/`, {cache:'no-store'})).status; }
      catch (_) { return 'failed'; }
    }""", port)


def fresh_websocket(page, port):
    return page.evaluate("""port => new Promise(resolve => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
      const timer = setTimeout(() => { ws.close(); resolve('timeout'); }, 2000);
      ws.addEventListener('open', () => { clearTimeout(timer); ws.close(); resolve('open'); }, {once:true});
      ws.addEventListener('error', () => { clearTimeout(timer); resolve('error'); }, {once:true});
    })""", port)


def main():
    browser_name = os.environ.get('HEIBON_BROWSER', 'chromium')
    assert browser_name in ('chromium', 'webkit')
    server = subprocess.Popen(['node', '-e', SERVER], stdout=subprocess.PIPE, text=True)
    try:
        port = int(server.stdout.readline().strip())
        with sync_playwright() as p:
            browser = getattr(p, browser_name).launch()
            context = browser.new_context()
            try:
                page = context.new_page()
                page.goto(f'http://127.0.0.1:{port}/')
                page.evaluate("""port => {
                  const events = [];
                  const socket = new WebSocket(`ws://127.0.0.1:${port}/`);
                  window.probe = {socket, events, messages: 0};
                  for (const type of ['open', 'close', 'error']) socket.addEventListener(type, () =>
                    events.push({type, atMs: Math.round(performance.now())}));
                  socket.addEventListener('message', () => window.probe.messages++);
                }""", port)
                page.wait_for_function('window.probe.socket.readyState === WebSocket.OPEN', timeout=5000)
                assert observe_echo(page), 'initial local websocket echo failed'
                initial = state(page)
                switched_at = page.evaluate('Math.round(performance.now())')
                context.set_offline(True)
                offline_echo = observe_echo(page)
                offline_http = fresh_http(page, port)
                offline_fresh_socket = fresh_websocket(page, port)
                offline = state(page)
                context.set_offline(False)
                page.wait_for_function('navigator.onLine', timeout=5000)
                restored_echo = observe_echo(page)
                restored_http = fresh_http(page, port)
                restored_fresh_socket = fresh_websocket(page, port)
                restored = state(page)
                print(json.dumps({'browser': browser_name, 'browserVersion': browser.version,
                    'offlineSwitchAtMs': switched_at, 'before': initial, 'offline': offline,
                    'offlineExistingSocketEcho': offline_echo, 'offlineHttp': offline_http,
                    'offlineFreshSocket': offline_fresh_socket, 'afterOnline': restored,
                    'onlineExistingSocketEcho': restored_echo, 'onlineHttp': restored_http,
                    'onlineFreshSocket': restored_fresh_socket}, sort_keys=True), flush=True)
                assert initial['online'] and not offline['online'] and restored['online']
                assert restored_http == 200 and restored_fresh_socket == 'open'
            finally:
                context.set_offline(False)
                context.close()
                browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == '__main__':
    main()
