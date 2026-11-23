"""Side sessions the desktop app started from one session: usage, active time, link.

python3 sessions.py <parent cli session id> [--live] [local_… ids]  ->  JSON list on stdout.
--live adds every other chat on this machine that is working now or was active in the last
LIVE_MS (Marc: the pane tracks the whole build, not the one session it sits in).
python3 sessions.py --prior <cli session id>  ->  the CLI ids that desktop session had before, oldest first.
Extra ids are sessions a build's jobs name: listed even when another session started them.
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
# ponytail: a fixed 20 min window for "recent" chats; make it a setting if it shows too much or too little.
LIVE_MS = 20 * 60 * 1000
BUSY_MS = 10 * 60 * 1000


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


def main(parent_cli, extra=(), live=False):
    try:
        cache = json.load(open(CACHE))
    except (OSError, ValueError):
        cache = {}
    metas = {f: open(f, errors='replace').read() for f in glob.glob(os.path.join(APP, '*', '*', 'local_*.json'))}
    parent = next((json.loads(t).get('sessionId') for t in metas.values()
                   if parent_cli and parent_cli in t and json.loads(t).get('cliSessionId') == parent_cli), None)
    rows = []
    extra = set(extra)
    now = time.time() * 1000
    for text in metas.values() if parent or extra or live else []:
        if not (live or (parent and parent in text) or any(x in text for x in extra)):
            continue
        d = json.loads(text)
        spawned = d.get('spawnedFrom') or {}
        is_child = (parent and spawned.get('sessionId') == parent) or d.get('sessionId') in extra
        active_at = max(d.get('lastActivityAt') or 0, d.get('lastTurnEdgeAt') or 0)
        # Marc: the app leaves "a turn is open" set on chats dormant for days, so it counts only
        # with recent activity behind it; that stale flag kept old rows "running" in the pane.
        busy = (d.get('latestUserFrameAt') or 0) > (d.get('lastTurnEdgeAt') or 0) and now - active_at < BUSY_MS
        if not is_child and not (live and d.get('sessionId') != parent and not d.get('isArchived') and now - active_at < LIVE_MS):
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
            'cli': cli,
            'isOther': not is_child,
            'name': spawned.get('name') or '',
            'title': d.get('title') or '',
            'link': 'claude://claude.ai/epitaxy/' + (d.get('sessionId') or ''),
            'model': d.get('model') or '',
            'effort': d.get('effort') or '',
            'running': busy or time.time() - newest < 45,
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


def prior(cli):
    for f in glob.glob(os.path.join(APP, '*', '*', 'local_*.json')):
        text = open(f, errors='replace').read()
        if cli not in text:
            continue
        d = json.loads(text)
        if d.get('cliSessionId') == cli:
            json.dump(d.get('priorCliSessionIds') or [], sys.stdout)
            return
    json.dump([], sys.stdout)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == '--prior':
        prior(sys.argv[2])
    else:
        rest = [a for a in sys.argv[2:] if a != '--live']
        main(sys.argv[1] if len(sys.argv) > 1 else '', rest, '--live' in sys.argv[2:])
