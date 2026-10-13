#!/usr/bin/env python3
"""Validate original writing against private feed candidates, then atomically update public JSON."""
import argparse,collections,datetime as dt,json,math,os,sys
from pathlib import Path
from fetch import TOPICS,parse_date
ROOT=Path(__file__).resolve().parents[1]
def finalise(candidates,written,previous,now):
 byid={x['id']:x for x in candidates['candidates']};decisions=written.get('decisions',{})
 if set(decisions)!=set(byid):raise ValueError('Every candidate needs an explicit publish/skip decision')
 new=[];seen=set()
 for story in written['stories']:
  id=story['id'];origin=byid.get(id)
  if not origin or decisions[id]!='publish' or id in seen:raise ValueError('Unmatched or duplicate story')
  seen.add(id)
  if story['published']!=origin['published']:raise ValueError('Publisher date cannot be rewritten')
  if story['topic'] not in TOPICS:raise ValueError('Invalid topic')
  if not 1<=len(story['bullets'])<=4:raise ValueError('Need 1-4 grounded bullets')
  if not 4<=len(story['headline'])<=150 or any(not 4<=len(b)<=230 for b in story['bullets']):raise ValueError('Writing exceeds readable slide limits')
  if not any('\u0900'<=c<='\u097f' for c in story['headline']):raise ValueError('Expected Devanagari-mix Hinglish')
  permitted={s['url'] for x in byid.values() for s in x['sources']};enabled={x['id'] for x in json.loads((ROOT/'feeds.json').read_text())}
  for s in story['sources']:
   if s['url'] not in permitted or s['feed_id'] not in enabled:raise ValueError('Source not in current enabled feed candidates')
  age=(now-parse_date(story['published'])).total_seconds()
  if 0<=age<86400:new.append(story)
 old=previous.get('stories',[]);merged={s['id']:s for s in old if parse_date(s['published']) and 0<=(now-parse_date(s['published'])).total_seconds()<86400}
 merged.update({s['id']:s for s in new});stories=sorted(merged.values(),key=lambda s:s['published'],reverse=True)
 oldids={s['id'] for s in old};ids=set(merged);counts=dict(collections.Counter(s['topic'] for s in stories));active=len(counts)
 stats=dict(at=now.isoformat(),feed_checked_at=candidates['checked_at'],items_read=candidates['items_read'],candidates=len(byid),written=len(new),added=len(ids-oldids),dropped=len(oldids-ids),total=len(stories),counts={t:counts.get(t,0) for t in TOPICS},fetch_seconds=candidates['elapsed_seconds'],rejected=candidates['rejected'],editorial_skipped=sum(d=='skip' for d in decisions.values()))
 if not any(f['status']=='ok' for f in candidates['feeds']):raise ValueError('All feeds failed; retain last good edition')
 return dict(schema_version=1,title='News for Adults',updated_at=now.isoformat(),schedule=dict(active=False,window_ist='08:00-22:00',planned_interval_minutes='60-120'),duration_seconds=14,topics=TOPICS,stories=stories,metadata=dict(refreshes=([stats]+previous.get('metadata',{}).get('refreshes',[]))[:3],topic_counts=stats['counts'],topic_gap_minutes={t:min(60,max(5,math.ceil(14*active*counts.get(t,0)/60))) for t in TOPICS},gap_is_metadata_only=True,feeds=candidates['feeds'],sources=sorted({s['name'] for story in stories for s in story['sources']}),summary_notice='Own-word feed-based summaries, not original reporting. Publisher timestamps determine the 24-hour window.'))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--candidates',required=True);p.add_argument('--written',required=True);p.add_argument('--out',default=str(ROOT/'data/news.json'));a=p.parse_args();out=Path(a.out)
 previous=json.loads(out.read_text()) if out.exists() else {};data=finalise(json.loads(Path(a.candidates).read_text()),json.loads(Path(a.written).read_text()),previous,dt.datetime.now(dt.timezone.utc));out.parent.mkdir(parents=True,exist_ok=True)
 tmp=out.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2));os.replace(tmp,out);print(json.dumps(data['metadata']['refreshes'][0],ensure_ascii=False))
