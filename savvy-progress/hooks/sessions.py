"""Side sessions the desktop app started from one session: usage, active time, link.

python3 sessions.py <parent cli session id>  ->  JSON list on stdout.
The desktop app keeps one metadata file per session; each names its CLI
transcript, whose assistant entries carry the token usage.
"""
import calendar
import glob
import json
import os
import sys
import time

APP = os.path.expanduser('~/Library/Application Support/Claude/claude-code-sessions')
PROJECTS = os.path.expanduser('~/.claude/projects')
CACHE = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'savvy-progress-sessions.json')
# ponytail: gaps over 5 min count as idle (waiting on Marc, scheduled check-ins); sum per turn if this misleads.
IDLE_MS = 5 * 60 * 1000


def ms(ts):
    return calendar.timegm(time.strptime(ts[:19], '%Y-%m-%dT%H:%M:%S')) * 1000


def scan(path):
    """Usage per model as [input, output, cache read, cache write 5m, cache write 1h], plus timings."""
    seen, models, stamps, context = set(), {}, [], 0
    for line in open(path, encoding='utf-8', errors='replace'):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('timestamp'):
            stamps.append(ms(d['timestamp']))
        m = d.get('message') if d.get('type') == 'assistant' else None
        u = isinstance(m, dict) and m.get('usage')
        # One reply is written once per content block, each carrying the same usage.
        if not u or m.get('id') in seen:
            continue
        seen.add(m.get('id'))
        w1h = (u.get('cache_creation') or {}).get('ephemeral_1h_input_tokens', 0) or 0
        row = models.setdefault(m.get('model') or '', [0, 0, 0, 0, 0])
        for i, v in enumerate([u.get('input_tokens'), u.get('output_tokens'), u.get('cache_read_input_tokens'),
                               (u.get('cache_creation_input_tokens') or 0) - w1h, w1h]):
            row[i] += v or 0
        context = sum(u.get(k) or 0 for k in
                      ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens'))
    stamps.sort()
    active = sum(b - a for a, b in zip(stamps, stamps[1:]) if b - a < IDLE_MS)
    return {'models': models, 'activeMs': active, 'context': context, 'requests': len(seen),
            'first': stamps[0] if stamps else 0, 'last': stamps[-1] if stamps else 0}


def main(parent_cli):
    try:
        cache = json.load(open(CACHE))
    except (OSError, ValueError):
        cache = {}
    metas = {f: open(f, errors='replace').read() for f in glob.glob(os.path.join(APP, '*', '*', 'local_*.json'))}
    parent = next((json.loads(t).get('sessionId') for t in metas.values()
                   if parent_cli and parent_cli in t and json.loads(t).get('cliSessionId') == parent_cli), None)
    rows = []
    for text in metas.values() if parent else []:
        if parent not in text:
            continue
        d = json.loads(text)
        spawned = d.get('spawnedFrom') or {}
        if spawned.get('sessionId') != parent:
            continue
        cli = d.get('cliSessionId') or ''
        main_files = glob.glob(os.path.join(PROJECTS, '*', cli + '.jsonl'))
        # The session's own subagents, when it ran any: their tokens count, their time ran inside the main one's.
        sub_files = glob.glob(os.path.join(PROJECTS, '*', cli, '**', '*.jsonl'), recursive=True)
        scans, newest = [], 0
        for p in main_files + sub_files:
            mt = os.path.getmtime(p)
            newest = max(newest, mt)
            hit = cache.get(p)
            if not hit or hit['mtime'] != mt:
                hit = cache[p] = {'mtime': mt, 'scan': scan(p)}
            scans.append(hit['scan'])
        models = {}
        for s in scans:
            for model, row in s['models'].items():
                models[model] = [a + b for a, b in zip(models.get(model, [0] * 5), row)]
        own = scans[0] if main_files else {'activeMs': 0, 'context': 0, 'first': 0, 'last': 0}
        rows.append({
            'id': d.get('sessionId'),
            'name': spawned.get('name') or '',
            'title': d.get('title') or '',
            'link': 'claude://claude.ai/epitaxy/' + (d.get('sessionId') or ''),
            'model': d.get('model') or '',
            'effort': d.get('effort') or '',
            'running': d.get('latestUserFrameAt', 0) > d.get('lastTurnEdgeAt', 0) or time.time() - newest < 45,
            'state': (d.get('postTurnSummary') or {}).get('status_category') or '',
            'createdAt': d.get('createdAt') or own['first'],
            'lastAt': own['last'],
            'activeMs': own['activeMs'],
            'context': own['context'],
            'requests': sum(s['requests'] for s in scans),
            'models': models,
        })
    try:
        json.dump(cache, open(CACHE, 'w'))
    except OSError:
        pass
    json.dump(rows, sys.stdout)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '')
