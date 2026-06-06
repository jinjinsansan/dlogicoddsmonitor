@echo off
REM PC-KEIBA オッズ feeder ランチャー(タスクスケジューラ用)。UTF-8で出力しログ追記。
set PYTHONUTF8=1
set PY="C:\Users\USER\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\python.exe"
%PY% "E:\dev\Cusor\dlogic-odds-monitor\scripts\pckeiba_odds_feeder.py" --verbose >> "E:\dev\Cusor\dlogic-odds-monitor\logs\pckeiba_feeder.log" 2>&1
