@echo off
rem Makes see-through cut-outs for every portrait that does not have one yet (about 20 seconds each).
cd /d "%~dp0"
python make_cutouts.py
pause
