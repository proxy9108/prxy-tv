#!/usr/bin/env python3
"""tv-feed: read-only, counts-only feed for the Prxy TV launcher.
The TV talks to this one address and nothing else. Lab numbers come from Prometheus (no names, no addresses);
weather (optional) is fetched here so the TV never contacts the internet. Only listed client addresses are served."""
import json, os, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BIND = os.environ.get('FEED_BIND', '10.20.40.137'); PORT = int(os.environ.get('FEED_PORT', '8081'))
PROM = os.environ.get('PROM_URL', 'http://10.20.40.116:9090')
ALLOW = set(x for x in os.environ.get('FEED_CLIENTS', '10.20.50.117,10.20.40.224').split(',') if x)
WEATHER_CFG = '/etc/tv-feed/weather.json'   # {"lat": 0.0, "lon": 0.0, "label": "City"} - absent = no weather
TTL = 30
NEWS_DIR = '/opt/briefing/out'
_cache = {'t': 0, 'v': None}; _wx = {'t': 0, 'v': None}

def prom(q):
    with urllib.request.urlopen(PROM + '/api/v1/query?' + urllib.parse.urlencode({'query': q}), timeout=4) as r:
        return json.load(r)['data']['result']

def scalar(q, default=0):
    try:
        r = prom(q); return int(round(sum(float(x['value'][1]) for x in r))) if r else default
    except Exception:
        return None

def by_label(q, label):
    try:
        return {x['metric'].get(label, ''): int(float(x['value'][1])) for x in prom(q)}
    except Exception:
        return {}

def lab():
    prob = by_label('prxy_overview_problems', 'level')
    out = {'red': prob.get('red', 0), 'amber': prob.get('amber', 0),
           'blocked': scalar('prxy_fw_blocked_24h'), 'sources': scalar('prxy_fw_blocked_sources_24h'),
           'active': scalar('prxy_devices_active_24h'), 'failedLogins': scalar('prxy_autotrack_failed_logins_24h'),
           'newDevices': sum(by_label('prxy_devices_new', 'kind').values())}
    out['ok'] = out['blocked'] is not None
    return out

def weather():
    if not os.path.exists(WEATHER_CFG):
        return None
    if time.time() - _wx['t'] < 600 and _wx['v']:
        return _wx['v']
    try:
        c = json.load(open(WEATHER_CFG))
        u = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode({
            'latitude': c['lat'], 'longitude': c['lon'], 'timezone': 'auto', 'temperature_unit': 'fahrenheit', 'wind_speed_unit': 'mph',
            'current': 'temperature_2m,apparent_temperature,weather_code,relative_humidity_2m,wind_speed_10m',
            'daily': 'temperature_2m_max,temperature_2m_min,weather_code', 'forecast_days': 5})
        with urllib.request.urlopen(u, timeout=6) as r:
            d = json.load(r)
        cur = d['current']; dl = d['daily']
        _wx.update(t=time.time(), v={'label': c.get('label', ''), 'temp': round(cur['temperature_2m']), 'feels': round(cur['apparent_temperature']),
            'code': cur['weather_code'], 'humidity': cur['relative_humidity_2m'], 'wind': round(cur['wind_speed_10m']),
            'days': [{'date': dl['time'][i], 'hi': round(dl['temperature_2m_max'][i]), 'lo': round(dl['temperature_2m_min'][i]), 'code': dl['weather_code'][i]} for i in range(len(dl['time']))]})
    except Exception:
        pass
    return _wx['v']

def news():
    try:
        n = json.load(open(NEWS_DIR + '/news.json')); n['url'] = '/news/latest.mp4'; return n
    except Exception:
        return None

def feed():
    if time.time() - _cache['t'] > TTL:
        _cache.update(t=time.time(), v={'ts': int(time.time()), 'lab': lab(), 'weather': weather(), 'news': news()})
    return _cache['v']

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.client_address[0] not in ALLOW:
            self.send_response(403); self.end_headers(); return
        path = self.path.split('?')[0]
        if path == '/news/latest.mp4':
            return self.video()
        if path != '/feed':
            self.send_response(404); self.end_headers(); return
        body = json.dumps(feed()).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(body)

    def video(self):  # the daily briefing, with byte ranges so the TV can seek
        f = NEWS_DIR + '/latest.mp4'
        try:
            size = os.path.getsize(f)
        except OSError:
            self.send_response(404); self.end_headers(); return
        start, end = 0, size - 1
        rng = self.headers.get('Range', '')
        if rng.startswith('bytes='):
            a, _, b = rng[6:].partition('-')
            try:
                start = int(a) if a else max(0, size - int(b)); end = int(b) if (a and b) else end
            except ValueError:
                pass
        start = min(start, size - 1); end = min(end, size - 1)
        self.send_response(206 if rng else 200); self.send_header('Content-Type', 'video/mp4'); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1))
        if rng:
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.end_headers()
        try:
            with open(f, 'rb') as fh:
                fh.seek(start); left = end - start + 1
                while left > 0:
                    chunk = fh.read(min(65536, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk); left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *a):  # no access log: nothing about who asked is kept
        pass

if __name__ == '__main__':
    ThreadingHTTPServer((BIND, PORT), H).serve_forever()
