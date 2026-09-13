import json
import os
import urllib.request
import urllib.error

base=os.environ.get('CI_HUB_BASE','http://127.0.0.1:18000').rstrip('/')
email='admin@test.local'
password=os.environ['CI_TEST_PASSWORD']

def call(path, method='GET', payload=None, token=None):
    data=None if payload is None else json.dumps(payload).encode()
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=10) as r:
            body=r.read().decode()
            return r.status, json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body=e.read().decode()
        try: parsed=json.loads(body)
        except: parsed={'raw':body}
        return e.code, parsed

status, login=call('/api/auth/login','POST',{'email':email,'password':password})
assert status==200, login
token=login['token']

status, rows=call('/api/oauth-apps',token=token)
assert status==200 and isinstance(rows,list), rows
keys={r['key'] for r in rows}
assert {'google','microsoft','github','slack','notion','dropbox','atlassian'} <= keys

secret='ci-super-secret-do-not-return'
status, saved=call('/api/oauth/github/app-config','PUT',{'client_id':'ci-client-123456789','client_secret':secret},token)
assert status==200, saved
assert saved['configured'] is True and saved['source']=='vault'
assert saved['secret_returned'] is False
assert secret not in json.dumps(saved)

status, got=call('/api/oauth/github/app-config',token=token)
assert status==200 and got['configured'] is True and got['source']=='vault', got
assert secret not in json.dumps(got)

status, catalog=call('/api/connections/catalog',token=token)
assert status==200, catalog
gh=next(x for x in catalog if x['key']=='github')
assert gh['configured'] is True

status, deleted=call('/api/oauth/github/app-config','DELETE',token=token)
assert status==200, deleted
assert deleted['source'] in {'none','environment'}

print('OAUTH_APP_CREDENTIAL_MANAGER_E2E_OK')
