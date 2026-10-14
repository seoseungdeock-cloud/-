# 웹 빌드를 파일 하나짜리 미리보기 페이지로 묶습니다 (claude.ai 아티팩트 게시용).
# 사용:
#   1) app.json 의 expo.web.output 을 잠시 "single" 로 바꾸고
#      EXPO_PUBLIC_SUPABASE_URL= npx expo export --platform web --output-dir /tmp/webapp
#      (서버 주소를 비워 미리보기는 기기 안 예시 데이터로 동작하게 합니다. 아티팩트 페이지는 외부 서버에 접속하지 못함)
#   2) python3 scripts/build-web-preview.py /tmp/webapp preview.html
import base64, glob, os, re, sys

root, out = sys.argv[1], sys.argv[2]
js = open(glob.glob(os.path.join(root, '_expo/static/js/web/*.js'))[0], encoding='utf-8').read()
MIME = {'.otf': 'font/otf', '.ttf': 'font/ttf', '.png': 'image/png'}


def inline(m):
    f = os.path.join(root, m.group(1).lstrip('/'))
    if not os.path.exists(f):
        return m.group(0)
    data = base64.b64encode(open(f, 'rb').read()).decode()
    return '"data:%s;base64,%s"' % (MIME.get(os.path.splitext(f)[1], 'application/octet-stream'), data)


js = re.sub(r'"(/assets/[^"]+)"', inline, js).replace('</script', '<\\/script')
page = f'''<title>라잇나우 통합앱</title>
<style>
:root {{ --bg: #FFFFFF; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #101317; color-scheme: dark }} }}
:root[data-theme="dark"] {{ --bg: #101317; color-scheme: dark }}
html, body {{ height: 100%; }}
body {{ background: var(--bg); overflow: hidden; }}
#root {{ display: flex; height: 100%; flex: 1; }}
</style>
<div id="root"></div>
<script>try{{if(location.pathname!=='/'){{history.replaceState(null,'','/')}}}}catch(e){{}}</script>
<script>{js}</script>
'''
open(out, 'w', encoding='utf-8').write(page)
print('저장:', out, round(os.path.getsize(out) / 1e6, 1), 'MB')
