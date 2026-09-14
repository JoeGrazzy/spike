#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
BIN="$HOME/bin"
mkdir -p "$BIN"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
install -m 755 "$SCRIPT_DIR/run" "$BIN/run"
install -m 755 "$SCRIPT_DIR/cp" "$BIN/cp"
if ! grep -Fq 'export PATH="$HOME/bin:$PATH"' "$HOME/.bashrc" 2>/dev/null; then
  printf '\nexport PATH="$HOME/bin:$PATH"\n' >> "$HOME/.bashrc"
fi
export PATH="$HOME/bin:$PATH"
echo "Installed run and cp commands."
echo "run = upload /storage/emulated/0/Download/Spike to GitHub (including deletions)."
echo "cp  = copy current GitHub files to /storage/emulated/0/Download/Spike."
echo "IMPORTANT: cp will NOT empty Spike when GitHub is empty."
echo "If storage access is not enabled, run: termux-setup-storage"
echo "Then run: source ~/.bashrc"
echo "GitHub push may require your Git authentication."
