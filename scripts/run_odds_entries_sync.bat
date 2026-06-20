@echo off
REM オッズ急変ボード用 出馬表エントリ同期(ローカルでnetkeiba取得→VPS同期→board再生成)。
REM タスクスケジューラ用。VPSはnetkeibaブロックのため、このPCで馬名取得を肩代わりする。
set PYTHONUTF8=1
set PY="C:\Users\USER\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\python.exe"
%PY% "E:\dev\Cusor\dlogic-odds-monitor\scripts\sync_odds_entries.py" >> "E:\dev\Cusor\dlogic-odds-monitor\logs\odds_entries_sync.log" 2>&1
