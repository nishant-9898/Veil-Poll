import os
import random
import subprocess
from datetime import datetime, timedelta

def run(cmd):
    subprocess.run(cmd, shell=True, check=True)

def get_files():
    result = subprocess.run("git ls-files --others --exclude-standard", shell=True, capture_output=True, text=True)
    return [f for f in result.stdout.split('\n') if f]

files = get_files()
# Group files slightly logically by directory if possible, or just shuffle. 
# Let's sort them to keep directory structures somewhat together.
files.sort()

num_commits = 15
if len(files) < num_commits:
    num_commits = len(files)

chunks = []
if num_commits > 0:
    chunk_size = max(1, len(files) // num_commits)
    for i in range(0, len(files), chunk_size):
        chunks.append(files[i:i + chunk_size])
    
    if len(chunks) > num_commits:
        extra = []
        for c in chunks[num_commits - 1:]:
            extra.extend(c)
        chunks = chunks[:num_commits - 1] + [extra]

now = datetime.now()
timestamps = []
for _ in range(len(chunks)):
    # random time in last 7 days
    random_minutes = random.randint(0, 7 * 24 * 60)
    ts = now - timedelta(minutes=random_minutes)
    timestamps.append(ts)

timestamps.sort()

for i, chunk in enumerate(chunks):
    if not chunk:
        continue
    for f in chunk:
        run(f'git add "{f}"')
    
    ts_str = timestamps[i].strftime("%Y-%m-%dT%H:%M:%S")
    
    # Create a reasonable commit message
    if len(chunk) == 1:
        msg = f"Add {os.path.basename(chunk[0])}"
    else:
        dirs = set(os.path.dirname(f) for f in chunk)
        if len(dirs) == 1 and list(dirs)[0]:
            msg = f"Add files in {list(dirs)[0]}"
        else:
            msg = f"Add {len(chunk)} files including {os.path.basename(chunk[0])}"
    
    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = ts_str
    env["GIT_COMMITTER_DATE"] = ts_str
    
    subprocess.run(['git', 'commit', '-m', msg], env=env, check=True)
    print(f"Committed chunk {i+1}/{len(chunks)} at {ts_str}")
