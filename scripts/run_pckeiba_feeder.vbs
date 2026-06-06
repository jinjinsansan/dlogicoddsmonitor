' PC-KEIBA feeder を非表示ウィンドウで起動(毎分タスクのコンソール点滅を防ぐ)
CreateObject("WScript.Shell").Run "cmd /c ""E:\dev\Cusor\dlogic-odds-monitor\scripts\run_pckeiba_feeder.bat""", 0, False
