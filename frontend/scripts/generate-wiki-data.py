#!/usr/bin/env python3
"""Generate wiki-data.json from ~/wiki for the Don's Dashboard."""
import os, re, json
from datetime import datetime

WIKI_DIR = os.path.expanduser("~/wiki")

def build_wiki_data():
    pages = []
    for root, dirs, files in os.walk(WIKI_DIR):
        dirs[:] = [d for d in dirs if d not in ('raw', '_archive', '_meta', 'comparisons', 'queries')]
        for fname in files:
            if not fname.endswith('.md') or fname in ('SCHEMA.md', 'index.md', 'log.md'):
                continue
            filepath = os.path.join(root, fname)
            relpath = os.path.relpath(filepath, WIKI_DIR)
            category = relpath.split('/')[0]
            with open(filepath, 'r') as f:
                content = f.read()
            meta = {}
            if content.startswith('---'):
                end = content.find('---', 3)
                if end > 0:
                    for line in content[3:end].strip().split('\n'):
                        if ':' in line:
                            k, v = line.split(':', 1)
                            meta[k.strip()] = v.strip().strip('"')
            wikilinks = re.findall(r'\[\[(.+?)\]\]', content)
            word_count = len(content.split())
            pages.append({
                'name': fname.replace('.md', ''),
                'category': category,
                'title': meta.get('title', fname.replace('.md', '').replace('-', ' ').title()),
                'type': meta.get('type', 'unknown'),
                'tags': meta.get('tags', '[]'),
                'created': meta.get('created', ''),
                'updated': meta.get('updated', ''),
                'wordCount': word_count,
                'links': wikilinks,
            })

    link_graph = {p['name']: p['links'] for p in pages}
    all_targets = set()
    for links in link_graph.values():
        all_targets.update(links)
    orphans = [p['name'] for p in pages if p['name'] not in all_targets and p['name'] != 'bakon']

    transcript_dir = os.path.join(WIKI_DIR, 'raw', 'transcripts')
    t_count = len([f for f in os.listdir(transcript_dir) if f.endswith('.md')]) if os.path.exists(transcript_dir) else 0
    t_size = sum(os.path.getsize(os.path.join(transcript_dir, f)) for f in os.listdir(transcript_dir) if f.endswith('.md')) if os.path.exists(transcript_dir) else 0

    log_entries = []
    log_path = os.path.join(WIKI_DIR, 'log.md')
    if os.path.exists(log_path):
        with open(log_path) as f:
            log_entries = [l.strip().lstrip('# ') for l in f if l.startswith('## [')]

    categories = {}
    for p in pages:
        categories[p['category']] = categories.get(p['category'], 0) + 1

    return {
        'generated': datetime.now().isoformat(),
        'stats': {
            'totalPages': len(pages),
            'transcriptCount': t_count,
            'transcriptSizeMB': round(t_size / 1024 / 1024, 1),
            'totalWords': sum(p['wordCount'] for p in pages),
            'orphanCount': len(orphans),
            'categories': categories,
        },
        'pages': pages,
        'linkGraph': link_graph,
        'orphans': orphans,
        'recentActivity': log_entries[-10:],
    }

if __name__ == '__main__':
    data = build_wiki_data()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, '..', 'public', 'wiki-data.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Generated: {out_path} ({len(json.dumps(data))} bytes)")
