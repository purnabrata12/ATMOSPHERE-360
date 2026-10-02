"""Mock upstream providers; no real weather-service internet needed for these tests."""
import pytest
from werkzeug.security import generate_password_hash
from backend import app as module


@pytest.fixture
def client(tmp_path):
    test_app = module.create_app({
        'TESTING': True,
        'SECRET_KEY': 'test-only-secret',
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///' + str(tmp_path / 'tests.sqlite'),
        'SEARCH_LOG_RETENTION_DAYS': 30,
    })
    with test_app.app_context():
        module.db.session.add(module.AdminUser(username='owner',
            password_hash=generate_password_hash('ThisIsATestPassword123')))
        module.db.session.commit()
    return test_app.test_client()


def test_site_and_health(client):
    assert client.get('/').status_code == 200
    assert client.get('/admin').status_code == 200
    assert client.get('/api/health').json['status'] == 'ok'


def test_validate_coordinates(client):
    assert client.get('/api/weather?lat=999&lon=4').status_code == 400
    assert client.get('/api/air?lat=1&lon=NaN').status_code == 400
    assert client.get('/api/reverse?lat=no&lon=5').status_code == 400


def test_provider_contract_mock(client, monkeypatch):
    def mock_fetch(url, params=None, ttl=300):
        if 'geocoding' in url:
            return {'results': [{'name': 'Dehradun', 'country': 'India',
                'admin1': 'Uttarakhand', 'latitude': 30.3165, 'longitude': 78.0322}]}
        if 'air-quality' in url:
            return {'current': {'us_aqi': 45}, 'hourly': {'time': [], 'us_aqi': []}}
        if 'weather-maps' in url:
            return {'host': 'https://tilecache.rainviewer.com', 'generated': 1,
                    'radar': {'past': [{'time': 1, 'path': '/v2/radar/1'}]}}
        return {'current': {'temperature_2m': 22}, 'hourly': {'time': []}, 'daily': {'time': []}}
    monkeypatch.setattr(module, 'fetch_json', mock_fetch)
    assert client.get('/api/geocode?q=Dehradun').json['results'][0]['country'] == 'India'
    assert client.get('/api/weather?lat=30.3&lon=78.0').json['forecast']['current']['temperature_2m'] == 22
    assert client.get('/api/air?lat=30.3&lon=78.0').json['air']['current']['us_aqi'] == 45
    assert len(client.get('/api/radar').json['frames']) == 1


def test_consent_and_protected_dashboard(client):
    payload = {'search_type': 'manual', 'searched_location': 'Delhi, India',
               'latitude': 28.6139, 'longitude': 77.2090, 'search_status': 'success'}
    assert client.post('/api/track', json=payload).json['logged'] is False
    assert client.get('/api/admin/stats').status_code == 401
    assert client.post('/api/consent', json={'choice': 'yes'}).status_code == 200
    assert client.post('/api/track', json=payload).json['logged'] is True
    assert client.post('/api/track', json={**payload, 'search_type': 'automatic'}).status_code == 400
    assert client.post('/api/admin/login', json={'username': 'owner', 'password': 'wrong'}).status_code == 401
    logged_in = client.post('/api/admin/login', json={'username': 'owner',
                  'password': 'ThisIsATestPassword123'})
    assert logged_in.status_code == 200
    token = logged_in.json['csrf_token']
    stats = client.get('/api/admin/stats').json
    assert stats['total'] == 1
    assert stats['records'][0]['searched_location'] == 'Delhi, India'
    assert client.post('/api/admin/purge', json={}).status_code == 403
    assert client.post('/api/admin/purge', json={}, headers={'X-CSRF-Token': token}).status_code == 200
    assert client.post('/api/admin/logout', json={}, headers={'X-CSRF-Token': token}).status_code == 200
    assert client.get('/api/admin/stats').status_code == 401
