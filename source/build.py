import json, pathlib, sys, subprocess
root = pathlib.Path('/home/claude/cb')
subprocess.run(['node', str(root/'build_bm.js')], check=True)
t = (root/'template.v3.html').read_text(); c = (root/'app.css').read_text()
i = t.index('<style>') + 7; j = t.index('</style>'); t = t[:i] + '\n' + c + t[j:]
(root/'template.html').write_text(t)
engine = (root/'engine.js').read_text(); app = (root/'app.js').read_text()
for name, src in (('engine', engine), ('app', app)):
    for bad in ('</script', '<!--', '<script'):
        if bad in src.lower(): sys.exit(f'{name} contains {bad}')
href = (root/'bookmark.href.txt').read_text()
app = app.replace('__BOOKMARK__', json.dumps(href).replace('<', '\\u003c').replace('>', '\\u003e'))
out = t.replace('/*ENGINE*/', engine).replace('/*APP*/', app)
low = out.lower(); assert low.count('</script') == low.count('<script')
pathlib.Path('/mnt/user-data/outputs/copy-backup/index.html').write_text(out)
print('built page', round(len(out)/1024), 'KB')
