"""Atmosphere 360: Flask backend / REST API / optional MySQL analytics."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from threading import Lock
import getpass
import os
import re
import secrets
import time

import click
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session, send_from_directory
from flask_sqlalchemy import SQLAlchemy
import requests
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
db = SQLAlchemy()
CACHE = {}
CACHE_LOCK = Lock()
REVERSE_LOCK = Lock()
REVERSE_LAST = [0.0]
USER_AGENT = 'Atmosphere360-Educational/1.0 (Open-Meteo weather app)'


class AdminUser(db.Model):
    __tablename__ = 'admin_users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)


class SearchLog(db.Model):
    __tablename__ = 'search_logs'
    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False)
    searched_location = db.Column(db.String(160), nullable=False)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    search_type = db.Column(db.String(16), nullable=False)
    search_status = db.Column(db.String(16), nullable=False)
    searched_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


def fetch_json(url, params=None, ttl=300):
    """Fetch with small in-process TTL cache; never cache exceptions."""
    key = (url, tuple(sorted((str(k), str(v)) for k, v in (params or {}).items())))
    with CACHE_LOCK:
        result = CACHE.get(key)
        if result and result[0] > time.monotonic():
            return result[1]
    response = requests.get(url, params=params, timeout=13,
                            headers={'User-Agent': USER_AGENT})
    response.raise_for_status()
    data = response.json()
    if isinstance(data, dict) and data.get('error'):
        raise ValueError(data.get('reason', 'Weather provider reported an error'))
    with CACHE_LOCK:
        if len(CACHE) > 350:
            CACHE.clear()
        CACHE[key] = (time.monotonic() + ttl, data)
    return data


def coordinates():
    try:
        lat = float(request.args.get('lat', ''))
        lon = float(request.args.get('lon', ''))
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError()
        return lat, lon
    except (ValueError, TypeError):
        return None


def fail(message, code=400):
    return jsonify({'error': message}), code


def upstream_error(exc):
    # Avoid disclosing upstream URL, credentials and internal traces.
    return fail('Weather service temporarily unavailable. Please try again.', 502)


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not session.get('admin_id'):
            return fail('Authentication required', 401)
        return view(*args, **kwargs)
    return wrapper


def require_csrf():
    return secrets.compare_digest(str(request.headers.get('X-CSRF-Token', '')),
                                  str(session.get('csrf_token', 'missing')))


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=os.getenv('FLASK_SECRET_KEY') or secrets.token_hex(32),
        SQLALCHEMY_DATABASE_URI=os.getenv('DATABASE_URL') or
            'sqlite:///' + str(ROOT / 'atmosphere360.db'),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',
        JSON_SORT_KEYS=False,
        MAX_CONTENT_LENGTH=16384,
        SEARCH_LOG_RETENTION_DAYS=int(os.getenv('SEARCH_LOG_RETENTION_DAYS', '30')),
    )
    if test_config:
        app.config.update(test_config)
    db.init_app(app)
    with app.app_context():
        db.create_all()

    @app.after_request
    def security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/')
    def home():
        return send_from_directory(ROOT / 'frontend', 'index.html')

    @app.get('/admin')
    def admin():
        return send_from_directory(ROOT / 'frontend', 'admin.html')

    @app.get('/css/<path:name>')
    def style(name):
        return send_from_directory(ROOT / 'frontend' / 'css', name)

    @app.get('/js/<path:name>')
    def script(name):
        return send_from_directory(ROOT / 'frontend' / 'js', name)

    @app.get('/assets/<path:name>')
    def asset(name):
        return send_from_directory(ROOT / 'frontend' / 'assets', name)

    @app.get('/api/health')
    def health():
        return jsonify({'status': 'ok', 'application': 'Atmosphere 360'})

    @app.get('/api/geocode')
    def geocode():
        term = request.args.get('q', '').strip()
        if len(term) < 2 or len(term) > 100:
            return fail('Enter at least 2 characters (maximum 100).')
        try:
            data = fetch_json('https://geocoding-api.open-meteo.com/v1/search',
                              {'name': term, 'count': 8, 'language': 'en', 'format': 'json'}, ttl=3600)
            return jsonify({'results': [
                {'name': v.get('name', ''), 'admin1': v.get('admin1', ''),
                 'country': v.get('country', ''), 'latitude': v.get('latitude'),
                 'longitude': v.get('longitude'), 'timezone': v.get('timezone', '')}
                for v in data.get('results', [])]})
        except (requests.RequestException, ValueError) as exc:
            return upstream_error(exc)

    @app.get('/api/reverse')
    def reverse():
        position = coordinates()
        if not position:
            return fail('Valid latitude and longitude required.')
        lat, lon = position
        # Public Nominatim must be used sparingly; this endpoint is called only on a user click.
        try:
            contact = os.getenv('NOMINATIM_CONTACT', '').strip()
            with REVERSE_LOCK:
                delay = max(0.0, 1.1 - (time.monotonic() - REVERSE_LAST[0]))
                if delay:
                    time.sleep(delay)  # Public Nominatim: no more than one request per second.
                REVERSE_LAST[0] = time.monotonic()
            response = requests.get('https://nominatim.openstreetmap.org/reverse',
                       params={
                                'lat': lat,
                                'lon': lon,
                                'format': 'jsonv2',
                                'zoom': 10,
                                'accept-language': 'en'
                               },
                       headers={'User-Agent': f'Atmosphere360/1.0 ({contact or "educational demo"})'},
                       timeout=10)
            response.raise_for_status()
            address = response.json().get('address', {})
            
# Prefer a recognisable city or settlement name.
            name = next(
                    (
                            address.get(key)
                            for key in (
                                    'city',
                                    'town',
                                    'village',
                                    'hamlet',
                                    'locality'
                                )
                                if address.get(key)
                                and len(address.get(key)) <= 45
                            ),
                            None
                        )

# If no suitable city is available, retain coordinates.
            if not name:
                ns = 'N' if lat >= 0 else 'S'
                ew = 'E' if lon >= 0 else 'W'

                name = (
                    f'Near {abs(lat):.2f}°{ns}, '
                    f'{abs(lon):.2f}°{ew}'
                )

            return jsonify({'name': name, 'region': address.get('state', ''),
                            'country': address.get('country', '')})
        except (requests.RequestException, ValueError):
            # Coordinates are still enough for the Open-Meteo weather endpoint.
            return jsonify({'name': f'{lat:.2f}, {lon:.2f}', 'region': '', 'country': ''})

    @app.get('/api/weather')
    def weather():
        position = coordinates()
        if not position:
            return fail('Valid latitude and longitude required.')
        lat, lon = position
        params = {
            'latitude': lat, 'longitude': lon, 'timezone': 'auto', 'forecast_days': 16,
            'current': ','.join([
                'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
                'precipitation', 'rain', 'weather_code', 'cloud_cover', 'pressure_msl',
                'wind_speed_10m', 'wind_direction_10m']),
            'hourly': ','.join([
                'temperature_2m', 'relative_humidity_2m', 'dew_point_2m',
                'precipitation_probability', 'precipitation', 'weather_code', 'visibility',
                'cloud_cover', 'uv_index', 'wind_speed_10m', 'wind_direction_10m', 'is_day']),
            'daily': ','.join([
                'weather_code', 'temperature_2m_max', 'temperature_2m_min',
                'sunrise', 'sunset', 'precipitation_sum', 'precipitation_probability_max',
                'wind_speed_10m_max', 'uv_index_max']),
            'minutely_15': 'precipitation',
        }
        try:
            data = fetch_json('https://api.open-meteo.com/v1/forecast', params, ttl=600)
            return jsonify({'source': 'Open-Meteo forecast model', 'forecast': data})
        except (requests.RequestException, ValueError) as exc:
            return upstream_error(exc)

    @app.get('/api/air')
    def air():
        position = coordinates()
        if not position:
            return fail('Valid latitude and longitude required.')
        lat, lon = position
        vars_ = 'us_aqi,european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide'
        try:
            data = fetch_json('https://air-quality-api.open-meteo.com/v1/air-quality',
                              {'latitude': lat, 'longitude': lon, 'timezone': 'auto',
                               'current': vars_, 'hourly': vars_, 'forecast_days': 5}, ttl=1200)
            return jsonify({'source': 'Open-Meteo / CAMS model', 'air': data})
        except (requests.RequestException, ValueError) as exc:
            return upstream_error(exc)

    @app.get('/api/radar')
    def radar():
        try:
            data = fetch_json('https://api.rainviewer.com/public/weather-maps.json', ttl=600)
            host = data.get('host', '')
            if host != 'https://tilecache.rainviewer.com':
                return fail('Radar provider returned an unexpected tile host.', 502)
            frames = data.get('radar', {}).get('past', [])[-12:]
            return jsonify({'host': host, 'generated': data.get('generated'),
                'frames': [{'time': int(f['time']), 'path': str(f['path'])}
                  for f in frames if re.fullmatch(r'/v2/radar/\d+', str(f.get('path', '')))],
                'max_zoom': 7, 'source': 'RainViewer past radar (not future prediction)'})
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            return upstream_error(exc)

    @app.post('/api/consent')
    def consent():
        data = request.get_json(silent=True) or {}
        choice = data.get('choice')
        if choice not in ('yes', 'no'):
            return fail('Expected choice yes or no.')
        result = jsonify({'saved': True, 'consent': choice})
        result.set_cookie('analytics_consent', choice, max_age=180 * 86400,
                          secure=request.is_secure, httponly=True, samesite='Lax')
        return result

    @app.post('/api/track')
    def track():
        if request.cookies.get('analytics_consent') != 'yes':
            return jsonify({'logged': False, 'reason': 'Consent not given'})
        data = request.get_json(silent=True) or {}
        kind = data.get('search_type', '')
        if kind not in ('manual', 'globe'):
            return fail('Only deliberate manual and globe searches can be logged.')
        name = str(data.get('searched_location', '')).strip()[:160]
        if not name:
            return fail('Location required.')
        status = str(data.get('search_status', 'success'))
        if status not in ('success', 'failure'):
            return fail('Invalid search status.')
        # Do NOT trust arbitrary X-Forwarded-For: configure ProxyFix explicitly for a trusted deployment.
        address = request.remote_addr or 'unknown'
        if len(address) > 45:
            address = 'unknown'
        try:
            lat = round(float(data['latitude']), 1) if kind == 'manual' and 'latitude' in data else None
            lon = round(float(data['longitude']), 1) if kind == 'manual' and 'longitude' in data else None
            if lat is not None and not (-90 <= lat <= 90):
                lat = None
            if lon is not None and not (-180 <= lon <= 180):
                lon = None
        except (ValueError, TypeError):
            lat = lon = None
        record = SearchLog(ip_address=address, searched_location=name,
                           latitude=lat, longitude=lon, search_type=kind,
                           search_status=status)
        db.session.add(record)
        db.session.commit()
        return jsonify({'logged': True})

    # Prevent repeated guessing in single-process development; use a shared rate limiter in production.
    failures = {}

    @app.post('/api/admin/login')
    def admin_login():
        data = request.get_json(silent=True) or {}
        username = str(data.get('username', ''))[:80]
        password = str(data.get('password', ''))
        source = request.remote_addr or 'unknown'
        recent = [t for t in failures.get(source, []) if t > time.monotonic() - 600]
        if len(recent) >= 6:
            return fail('Too many login attempts. Try again later.', 429)
        user = db.session.query(AdminUser).filter_by(username=username).first()
        if not user or not check_password_hash(user.password_hash, password):
            recent.append(time.monotonic())
            failures[source] = recent
            return fail('Invalid username or password.', 401)
        failures.pop(source, None)
        session.clear()
        session['admin_id'] = user.id
        session['csrf_token'] = secrets.token_urlsafe(32)
        return jsonify({'logged_in': True, 'username': user.username,
                        'csrf_token': session['csrf_token']})

    @app.get('/api/admin/session')
    @admin_required
    def admin_session():
        return jsonify({'logged_in': True, 'csrf_token': session['csrf_token']})

    @app.post('/api/admin/logout')
    @admin_required
    def admin_logout():
        if not require_csrf():
            return fail('Invalid CSRF token', 403)
        session.clear()
        return jsonify({'logged_out': True})

    @app.get('/api/admin/stats')
    @admin_required
    def admin_stats():
        from_date = request.args.get('from', '')
        to_date = request.args.get('to', '')
        q = request.args.get('q', '').strip()[:80]
        records = SearchLog.query
        try:
            if from_date:
                records = records.filter(SearchLog.searched_at >= datetime.strptime(from_date, '%Y-%m-%d'))
            if to_date:
                records = records.filter(SearchLog.searched_at < datetime.strptime(to_date, '%Y-%m-%d') + timedelta(days=1))
        except ValueError:
            return fail('Date must be YYYY-MM-DD.')
        if q:
            records = records.filter(SearchLog.searched_location.ilike(f'%{q}%'))
        recent = records.order_by(SearchLog.searched_at.desc()).limit(150).all()
        top = records.with_entities(SearchLog.searched_location, func.count(SearchLog.id)).group_by(
            SearchLog.searched_location).order_by(func.count(SearchLog.id).desc()).limit(6).all()
        days = records.with_entities(func.date(SearchLog.searched_at), func.count(SearchLog.id)).group_by(
            func.date(SearchLog.searched_at)).order_by(func.date(SearchLog.searched_at).desc()).limit(30).all()
        return jsonify({'total': records.count(), 'top': [{'location': x, 'count': y} for x, y in top],
            'daily': [{'date': str(x), 'count': y} for x, y in reversed(days)],
            'records': [{'id': row.id, 'ip_address': row.ip_address,
                'searched_location': row.searched_location, 'search_type': row.search_type,
                'search_status': row.search_status, 'searched_at': row.searched_at.isoformat() + 'Z'}
                for row in recent], 'retention_days': app.config['SEARCH_LOG_RETENTION_DAYS']})

    @app.post('/api/admin/purge')
    @admin_required
    def purge():
        if not require_csrf():
            return fail('Invalid CSRF token', 403)
        cutoff = datetime.utcnow() - timedelta(days=app.config['SEARCH_LOG_RETENTION_DAYS'])
        count = SearchLog.query.filter(SearchLog.searched_at < cutoff).delete()
        db.session.commit()
        return jsonify({'deleted': count})

    @app.cli.command('create-admin')
    @click.option('--username', prompt='Admin username', default='admin')
    def create_admin(username):
        """Create / reset a local administrator securely without default credentials."""
        if not re.fullmatch(r'[A-Za-z0-9_.-]{3,80}', username):
            raise click.BadParameter('Use 3-80 letters, numbers, _, . or -')
        password = getpass.getpass('New admin password (at least 12 characters): ')
        if len(password) < 12:
            raise click.ClickException('Password must contain at least 12 characters.')
        verify = getpass.getpass('Confirm admin password: ')
        if password != verify:
            raise click.ClickException('Passwords did not match.')
        entry = AdminUser.query.filter_by(username=username).first()
        if entry:
            entry.password_hash = generate_password_hash(password)
        else:
            db.session.add(AdminUser(username=username, password_hash=generate_password_hash(password)))
        db.session.commit()
        click.echo('Administrator saved.')

    return app


app = create_app()

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', '5000')), debug=False)
