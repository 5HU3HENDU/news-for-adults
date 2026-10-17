#!/usr/bin/env python3
"""Generate natural narration mp3s for live stories via edge-tts; prune expired ones."""
import asyncio,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
AUDIO=ROOT/'audio'
VOICES=['hi-IN-SwaraNeural','hi-IN-MadhurNeural']  # alternate by story order: female, male, female, ...
RATE='+10%'
CONCURRENCY=6
def story_text(s):
    parts=[s['headline']]+s['bullets']
    return ' '.join(p.strip().rstrip('।.')+'।' for p in parts)
async def gen(sem,sid,text,voice):
    async with sem:
        for attempt in (1,2):
            try:
                import edge_tts
                await edge_tts.Communicate(text,voice=voice,rate=RATE).save(str(AUDIO/f'{sid}.mp3'))
                return sid,True
            except Exception as e:
                err=e
        print('FAIL',sid,err,file=sys.stderr)
        return sid,False
async def main():
    data=json.loads((ROOT/'data/news.json').read_text())
    AUDIO.mkdir(exist_ok=True)
    live={s['id'] for s in data['stories']}
    pruned=0
    for f in AUDIO.glob('*.mp3'):
        if f.stem not in live: f.unlink(); pruned+=1
    sem=asyncio.Semaphore(CONCURRENCY)
    tasks=[gen(sem,s['id'],story_text(s),VOICES[i%2]) for i,s in enumerate(data['stories']) if not (AUDIO/f"{s['id']}.mp3").exists()]
    results=await asyncio.gather(*tasks) if tasks else []
    ok=sum(1 for _,r in results if r)
    print(f'narrations: {ok} generated, {len(tasks)-ok} failed, {pruned} pruned, {len(live)} live stories')
    if ok<len(tasks): sys.exit(1)
if __name__=='__main__':
    asyncio.run(main())
