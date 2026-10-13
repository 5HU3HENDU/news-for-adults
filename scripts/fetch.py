#!/usr/bin/env python3
"""Feed-only collection. Nothing here calls an AI or fetches article pages.
Private candidates are written outside the repository by default.
"""
import argparse, collections, concurrent.futures, datetime as dt, email.utils, hashlib, html, json, re, time, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TOPICS=['India','World','Business','IPO','Tech','Sports','Science','Health']
STOP=set('the a an and or of in to for on with as at by from is are new after over says said will has have this that its into'.split())
def clean(x):return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',x or ''))).strip()
def parse_date(x):
 try: d=email.utils.parsedate_to_datetime(x)
 except (ValueError,TypeError):
  try:d=dt.datetime.fromisoformat(x.replace('Z','+00:00'))
  except (ValueError,TypeError):return None
 return d if d.tzinfo else None # never invent the publisher's timezone

def keywords(x):return set(re.findall(r'[^\W_]{3,}',x.lower()))-STOP

def similar(a,b):
 if a['url']==b['url']:return True
 if a['topic']!=b['topic']:return False
 if a['url']==b['url'] or clean(a['title']).lower()==clean(b['title']).lower():return True
 if abs((parse_date(a['published'])-parse_date(b['published'])).total_seconds())>6*3600:return False
 ka,kb=keywords(a['title']),keywords(b['title']);common=ka&kb
 return len(common)>=4 and len(common)/max(1,len(ka|kb))>=.65

def read_feed(f,now):
 start=time.monotonic();rej=collections.Counter();out=[]
 if not f['enabled']:return [],dict(id=f['id'],name=f['name'],url=f['url'],status='disabled',reason=f['disabled_reason'],items=0),rej
 try:
  req=urllib.request.Request(f['url'],headers={'User-Agent':'NewsForAdults/1.0 (RSS reader; feed-only)'})
  with urllib.request.urlopen(req,timeout=25) as r:
   raw=r.read(8_000_001)
   if len(raw)>8_000_000:raise ValueError('feed exceeds 8MB safety limit')
   status=r.status
  root=ET.fromstring(raw);nodes=[n for n in root.iter() if n.tag.split('}')[-1] in ('item','entry')]
  if not nodes:raise ValueError('no RSS/Atom entries')
  for n in nodes:
   p={e.tag.split('}')[-1]:''.join(e.itertext()) for e in n};title=clean(p.get('title'));summary=clean(p.get('description') or p.get('summary') or '')
   url=p.get('link','').strip()
   if not url:
    for link in n:
     if link.tag.split('}')[-1]=='link' and link.get('rel','alternate')=='alternate':url=link.get('href','');break
   date=next((p[k] for k in ['pubDate','published','date'] if p.get(k)),None);d=parse_date(date) if date else None
   if not d:rej['undated']+=1;continue
   age=(now-d).total_seconds()
   if age<0:rej['future']+=1;continue
   if age>=86400:rej['older_than_24h']+=1;continue
   if not title or not url.startswith(('https://','http://')):rej['invalid']+=1;continue
   if '?' in title or '？' in title:rej['question_headline']+=1;continue
   topic=f['topic'];text=(title+' '+summary).lower()
   if re.search(r'\bipo\b|initial public offering|आईपीओ',text):topic='IPO'
   if topic=='Sports' and not re.search(r'cricket|cricketer|\bicc\b|\bbcci\b|\bt20\b|\bodi\b|\bipl\b|ashes|क्रिकेट|बीसीसीआई|टी20',text):rej['not_cricket']+=1;continue
   # These are candidate filters, not editorial approval. Writer must classify every survivor.
   if re.search(r'\b(election|parliament|political|politician|bollywood|celebrity|actor|actress|murder|rape)\b|चुनाव|राजनीति|अभिनेत्री|अभिनेता|हत्या',title.lower()):rej['editorial_keyword']+=1;continue
   out.append(dict(id=hashlib.sha256(url.encode()).hexdigest()[:20],topic=topic,title=title,summary=summary[:1800],url=url,published=d.astimezone(dt.timezone.utc).isoformat(),sources=[dict(name=f['name'],url=url,feed_id=f['id'])]))
  return out,dict(id=f['id'],name=f['name'],url=f['url'],status='ok',http=status,items=len(nodes),eligible=len(out),seconds=round(time.monotonic()-start,2)),rej
 except Exception as e:return [],dict(id=f['id'],name=f['name'],url=f['url'],status='failed',reason=str(e),items=0),rej

def collect(feeds,now):
 items=[];statuses=[];rejected=collections.Counter()
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for out,status,rej in pool.map(lambda f:read_feed(f,now),feeds):items+=out;statuses.append(status);rejected.update(rej)
 clusters=[]
 for item in sorted(items,key=lambda x:x['published'],reverse=True):
  found=next((x for x in clusters if similar(x,item)),None)
  if found:
   known={s['url'] for s in found['sources']};found['sources'] += [s for s in item['sources'] if s['url'] not in known];rejected['duplicate']+=1
  else:clusters.append(item)
 return dict(checked_at=now.isoformat(),candidates=clusters,feeds=statuses,rejected=dict(rejected),items_read=sum(f['items'] for f in statuses),eligible_before_dedupe=len(items))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--out',default='/tmp/news-for-adults-candidates.json');args=p.parse_args();start=time.monotonic()
 result=collect(json.loads((ROOT/'feeds.json').read_text()),dt.datetime.now(dt.timezone.utc));result['elapsed_seconds']=round(time.monotonic()-start,2)
 Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ('candidates','feeds')},ensure_ascii=False));print('Candidates:',len(result['candidates']));print('Failed:',[f['name'] for f in result['feeds'] if f['status']=='failed'])
