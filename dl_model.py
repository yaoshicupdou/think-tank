import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('192.168.1.5', username='zer', password='0000', timeout=10)

def run(cmd):
    i, o, e = c.exec_command(cmd)
    return (o.read().decode() + e.read().decode()).strip()

# Clean partial downloads
run('rm -rf /home/zer/models/*')
run('pkill -f dl_ 2>/dev/null; sleep 1')

# Use sentence-transformers with HF mirror
script = """import os, sys
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'
# Also try setting huggingface_hub endpoint
os.environ['HF_HUB_ENDPOINT'] = 'https://hf-mirror.com'

print('Downloading BAAI/bge-m3 via sentence-transformers...', flush=True)
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('BAAI/bge-m3', cache_folder='/home/zer/models')
print('SUCCESS', flush=True)
# Quick test
emb = model.encode('test')
print(f'Test embedding shape: {emb.shape}', flush=True)
"""
run(f"cat > /tmp/dl_st.py << 'PYEOF'\n{script}\nPYEOF")

print("Starting download (this will take 5-10 minutes for 2GB)...")
run('nohup python3 /tmp/dl_st.py > /home/zer/dl_model.log 2>&1 &')
print("PID:", run("ps aux | grep dl_st | grep -v grep | awk '{print $2}'"))
print("Monitor: tail -f /home/zer/dl_model.log")
print("\nCheck progress in a few minutes.")
c.close()
